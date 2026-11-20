import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  admins,
  appointments,
  contactMessages,
  departments,
  doctorLeaves,
  doctors,
  doctorSchedules,
  hospitalHolidays,
  hospitalSettings,
  notifications,
  patientDocuments,
  patients,
} from './src/db/schema.ts';
import {
  bookAppointmentServerSide,
  createOtpChallenge,
  createPatientNotification,
  ensureBaseSeedData,
  getAdminDashboardMetrics,
  getAppointmentTrends30Days,
  getBookableSlots,
  getPatientByUid,
  getPublicOverview,
  listAdmins,
  listAllAppointmentsForAdmin,
  registerPatient,
  searchAdminPatients,
  verifyOtpChallenge,
} from './src/db/repository.ts';
import { AuthRequest, requireAdmin, requireAuth } from './src/middleware/auth.ts';
import {
  createSignedDocumentUrl,
  DOCTOR_PHOTOS_BUCKET,
  getSupabaseEnabledProviders,
  getSupabasePublicConfig,
  PATIENT_DOCUMENTS_BUCKET,
  removeFromSupabaseStorage,
  uploadToSupabaseStorage,
} from './src/lib/supabase-admin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_DOC_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const doctorPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, or WEBP images are allowed for doctor photos (max 5 MB).'));
    }
  },
});

const patientDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, PNG, or WEBP files are allowed (max 10 MB).'));
    }
  },
});

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function sanitizeCsvCell(val: unknown): string {
  const raw = String(val ?? '');
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // =========================================================================
  // PUBLIC SUPABASE RUNTIME CONFIG (Public URL + Anon Key ONLY — Never Secrets)
  // =========================================================================
  app.get('/api/config/supabase', async (_req, res) => {
    const config = getSupabasePublicConfig();
    const providers = await getSupabaseEnabledProviders();
    res.json({ ...config, providers });
  });

  // =========================================================================
  // PUBLIC HOSPITAL ENDPOINTS (Zero patient PII exposed)
  // =========================================================================
  app.get('/api/public/overview', async (_req, res) => {
    try {
      const data = await getPublicOverview();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to load hospital overview.' });
    }
  });

  app.get('/api/public/availability', async (req, res) => {
    try {
      const doctorId = Number(req.query.doctorId);
      const dateStr = String(req.query.date || '');
      if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res
          .status(400)
          .json({ error: 'Valid doctorId and date (YYYY-MM-DD) are required.' });
      }
      const data = await getBookableSlots(doctorId, dateStr);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to check availability.' });
    }
  });

  app.post('/api/public/contact', async (req, res) => {
    try {
      const { senderName, mobileNumber, subject, message } = req.body || {};
      const cleanMobile = String(mobileNumber || '').replace(/\D/g, '');
      if (
        !senderName?.trim() ||
        cleanMobile.length !== 10 ||
        !subject?.trim() ||
        !message?.trim()
      ) {
        return res.status(400).json({
          error: 'Please enter your full name, 10-digit mobile number, subject, and message.',
        });
      }
      const [saved] = await db
        .insert(contactMessages)
        .values({
          senderName: senderName.trim().slice(0, 120),
          mobileNumber: cleanMobile,
          subject: subject.trim().slice(0, 160),
          message: message.trim().slice(0, 2000),
          status: 'New',
        })
        .returning();
      res
        .status(201)
        .json({ id: saved.id, message: 'Your inquiry has been submitted to CHC Muribahal Hospital.' });
    } catch (error) {
      console.error('Contact form submission failed:', error);
      res.status(500).json({ error: 'Unable to submit contact inquiry. Please try again.' });
    }
  });

  // Privacy-preserving mobile check for recovery/login guidance (returns NO patient PII)
  app.post('/api/public/mobile-status', async (req, res) => {
    try {
      const cleanMobile = String(req.body?.mobileNumber || '').replace(/\D/g, '');
      if (cleanMobile.length !== 10) {
        return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
      }
      const existing = await db
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.mobileNumber, cleanMobile))
        .limit(1);

      res.json({
        registered: existing.length > 0,
        smsConfigured: Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_API_KEY),
      });
    } catch (error) {
      console.error('Mobile status check failed:', error);
      res.status(500).json({ error: 'Unable to verify mobile registration status.' });
    }
  });

  // =========================================================================
  // AUTH & PATIENT ENDPOINTS (Supabase Auth Access Token Required)
  // =========================================================================
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const patient = await getPatientByUid(uid);
      let unreadCount = 0;
      if (patient) {
        const unreadRows = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.patientId, patient.id), eq(notifications.isRead, false)));
        unreadCount = unreadRows.length;
      }

      const supaCfg = getSupabasePublicConfig();

      res.json({
        uid,
        email: req.user!.email || '',
        phone: req.user!.phone || '',
        displayName: req.user!.name || req.dbUser?.displayName || '',
        role: req.isAdmin ? 'admin' : 'patient',
        isAdmin: Boolean(req.isAdmin),
        patient,
        unreadNotifications: unreadCount,
        smsConfigured: Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_API_KEY),
        storageConfigured: supaCfg.storageConfigured,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to load account session.' });
    }
  });

  app.post('/api/auth/request-otp', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cleanMobile = String(req.body?.mobileNumber || '').replace(/\D/g, '');
      const purpose = String(req.body?.purpose || 'registration');
      if (cleanMobile.length !== 10) {
        return res
          .status(400)
          .json({ error: 'Please provide a valid 10-digit Indian mobile number.' });
      }

      if (purpose === 'registration') {
        const duplicate = await db
          .select({ id: patients.id })
          .from(patients)
          .where(eq(patients.mobileNumber, cleanMobile))
          .limit(1);
        if (duplicate.length > 0) {
          return res.status(409).json({
            error:
              'This mobile number is already linked to an existing patient account. One mobile number can register only one patient account.',
          });
        }
      }

      const result = await createOtpChallenge(cleanMobile, purpose);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to request OTP.' });
    }
  });

  app.post('/api/patients/register', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        fullName,
        mobileNumber,
        otpCode,
        dateOfBirth,
        age,
        gender,
        address,
        village,
        district,
        state,
      } = req.body || {};

      const cleanMobile = String(mobileNumber || '').replace(/\D/g, '');
      if (
        !fullName?.trim() ||
        cleanMobile.length !== 10 ||
        !dateOfBirth?.trim() ||
        !gender?.trim() ||
        !address?.trim() ||
        !village?.trim() ||
        !district?.trim() ||
        !state?.trim()
      ) {
        return res.status(400).json({
          error:
            'All required patient registration fields must be completed with a 10-digit mobile number.',
        });
      }

      const parsedAge = Number(age);
      if (Number.isNaN(parsedAge) || parsedAge < 0 || parsedAge > 130) {
        return res.status(400).json({ error: 'Please provide a valid age or date of birth.' });
      }

      // If authenticated directly via Supabase Phone OTP matching this number, mark mobileVerified = true
      const supaPhoneDigits = (req.user?.phone || '').replace(/\D/g, '').slice(-10);
      let mobileVerified = supaPhoneDigits === cleanMobile && Boolean(req.user?.supabaseUser.phone_confirmed_at);

      const smsConfigured = Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_API_KEY);
      if (smsConfigured && !mobileVerified) {
        if (!otpCode?.trim()) {
          return res
            .status(400)
            .json({ error: 'SMS OTP verification code is required to complete registration.' });
        }
        const ok = await verifyOtpChallenge(cleanMobile, String(otpCode));
        if (!ok) {
          return res
            .status(400)
            .json({ error: 'Invalid or expired SMS OTP code. Please request a new OTP.' });
        }
        mobileVerified = true;
      }

      const created = await registerPatient({
        userUid: req.user!.uid,
        fullName: fullName.trim().slice(0, 120),
        mobileNumber: cleanMobile,
        mobileVerified,
        dateOfBirth: dateOfBirth.trim(),
        age: Math.floor(parsedAge),
        gender: gender.trim(),
        address: address.trim().slice(0, 300),
        village: village.trim().slice(0, 120),
        district: district.trim().slice(0, 100),
        state: state.trim().slice(0, 100),
      });

      res.status(201).json(created);
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json({ error: error.message || 'Patient registration failed.' });
    }
  });

  app.put('/api/patients/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) {
        return res.status(404).json({ error: 'Patient profile not found.' });
      }

      const { fullName, dateOfBirth, age, gender, address, village, district, state } = req.body || {};
      if (
        !fullName?.trim() ||
        !dateOfBirth?.trim() ||
        !gender?.trim() ||
        !address?.trim() ||
        !village?.trim()
      ) {
        return res.status(400).json({ error: 'All profile fields are required.' });
      }

      const [updated] = await db
        .update(patients)
        .set({
          fullName: fullName.trim().slice(0, 120),
          dateOfBirth: dateOfBirth.trim(),
          age: Math.max(0, Math.min(130, Math.floor(Number(age) || patient.age))),
          gender: gender.trim(),
          address: address.trim().slice(0, 300),
          village: village.trim().slice(0, 120),
          district: (district || patient.district).trim().slice(0, 100),
          state: (state || patient.state).trim().slice(0, 100),
          updatedAt: new Date(),
        })
        .where(eq(patients.id, patient.id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Profile update failed:', error);
      res.status(500).json({ error: 'Unable to update patient profile.' });
    }
  });

  app.get('/api/patients/appointments', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.json([]);

      const rows = await db
        .select({
          id: appointments.id,
          appointmentCode: appointments.appointmentCode,
          appointmentDate: appointments.appointmentDate,
          timeSlot: appointments.timeSlot,
          reason: appointments.reason,
          status: appointments.status,
          adminNotes: appointments.adminNotes,
          createdAt: appointments.createdAt,
          doctorId: doctors.id,
          doctorName: doctors.fullName,
          doctorQualification: doctors.qualification,
          doctorStatus: doctors.availabilityStatus,
          departmentId: departments.id,
          departmentName: departments.name,
        })
        .from(appointments)
        .innerJoin(doctors, eq(appointments.doctorId, doctors.id))
        .innerJoin(departments, eq(appointments.departmentId, departments.id))
        .where(eq(appointments.patientId, patient.id))
        .orderBy(desc(appointments.appointmentDate), desc(appointments.createdAt));

      res.json(rows);
    } catch (error) {
      console.error('Patient appointments fetch failed:', error);
      res.status(500).json({ error: 'Unable to fetch your appointments.' });
    }
  });

  app.post('/api/patients/appointments', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { departmentId, doctorId, appointmentDate, timeSlot, reason } = req.body || {};
      if (!doctorId || !appointmentDate || !timeSlot || !reason?.trim()) {
        return res.status(400).json({
          error:
            'Department, doctor, appointment date, time slot, and reason for visit are required.',
        });
      }

      const created = await bookAppointmentServerSide({
        userUid: req.user!.uid,
        departmentId: Number(departmentId),
        doctorId: Number(doctorId),
        appointmentDate: String(appointmentDate),
        timeSlot: String(timeSlot),
        reason: String(reason).trim().slice(0, 500),
      });

      res.status(201).json(created);
    } catch (error: any) {
      res
        .status(error.statusCode || 500)
        .json({ error: error.message || 'Unable to book appointment.' });
    }
  });

  app.patch('/api/patients/appointments/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.status(404).json({ error: 'Patient profile not found.' });
      const apptId = Number(req.params.id);
      const [appt] = await db
        .select()
        .from(appointments)
        .where(and(eq(appointments.id, apptId), eq(appointments.patientId, patient.id)))
        .limit(1);

      if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
      if (!['Pending', 'Confirmed'].includes(appt.status)) {
        return res
          .status(400)
          .json({ error: `Appointments in "${appt.status}" status cannot be cancelled.` });
      }

      const [updated] = await db
        .update(appointments)
        .set({ status: 'Cancelled', updatedAt: new Date() })
        .where(eq(appointments.id, appt.id))
        .returning();

      await createPatientNotification({
        patientId: patient.id,
        mobileNumber: patient.mobileNumber,
        title: 'Appointment Cancelled',
        message: `Your appointment ${appt.appointmentCode} on ${appt.appointmentDate} (${appt.timeSlot}) has been cancelled.`,
        type: 'cancelled',
      });

      res.json(updated);
    } catch (error) {
      console.error('Patient appointment cancellation failed:', error);
      res.status(500).json({ error: 'Unable to cancel appointment.' });
    }
  });

  app.get('/api/patients/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.json([]);
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.patientId, patient.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Unable to load notifications.' });
    }
  });

  app.post('/api/patients/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.json({ ok: true });
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.patientId, patient.id));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Unable to mark notifications as read.' });
    }
  });

  // =========================================================================
  // PATIENT AUTHORIZED DOCUMENTS (SUPABASE STORAGE — PRIVATE SIGNED URLs)
  // =========================================================================
  app.get('/api/patients/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.json([]);
      const docs = await db
        .select()
        .from(patientDocuments)
        .where(eq(patientDocuments.patientId, patient.id))
        .orderBy(desc(patientDocuments.createdAt));
      res.json(docs);
    } catch (error) {
      console.error('Fetch patient documents failed:', error);
      res.status(500).json({ error: 'Unable to load your uploaded documents.' });
    }
  });

  app.post('/api/patients/documents', requireAuth, (req: AuthRequest, res) => {
    patientDocumentUpload.single('file')(req, res, async (uploadErr: any) => {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message || 'Invalid file upload.' });
      }
      try {
        const patient = await getPatientByUid(req.user!.uid);
        if (!patient) {
          return res.status(400).json({ error: 'Complete Patient Registration before uploading documents.' });
        }
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: 'Please select a PDF or image file to upload.' });
        }

        const title = String(req.body?.title || file.originalname).trim().slice(0, 140);
        const category = String(req.body?.category || 'Lab Report').trim().slice(0, 60);
        const safeName = sanitizeFileName(file.originalname);
        const storagePath = `${patient.patientCode}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

        await uploadToSupabaseStorage({
          bucket: PATIENT_DOCUMENTS_BUCKET,
          path: storagePath,
          buffer: file.buffer,
          contentType: file.mimetype,
          isPublic: false,
        });

        const [saved] = await db
          .insert(patientDocuments)
          .values({
            patientId: patient.id,
            title,
            category,
            fileName: file.originalname.slice(0, 180),
            mimeType: file.mimetype,
            fileSize: file.size,
            storageBucket: PATIENT_DOCUMENTS_BUCKET,
            storagePath,
            uploadedByRole: 'patient',
          })
          .returning();

        res.status(201).json(saved);
      } catch (error: any) {
        console.error('Patient document upload failed:', error);
        res.status(500).json({ error: error.message || 'Unable to upload document to Supabase Storage.' });
      }
    });
  });

  app.get('/api/patients/documents/:id/download', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.status(404).json({ error: 'Patient profile not found.' });
      const docId = Number(req.params.id);
      const [docRow] = await db
        .select()
        .from(patientDocuments)
        .where(and(eq(patientDocuments.id, docId), eq(patientDocuments.patientId, patient.id)))
        .limit(1);

      if (!docRow) return res.status(404).json({ error: 'Document not found.' });

      const signedUrl = await createSignedDocumentUrl(docRow.storageBucket, docRow.storagePath, 120);
      res.json({ signedUrl, fileName: docRow.fileName });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to generate secure download link.' });
    }
  });

  app.delete('/api/patients/documents/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const patient = await getPatientByUid(req.user!.uid);
      if (!patient) return res.status(404).json({ error: 'Patient profile not found.' });
      const docId = Number(req.params.id);
      const [docRow] = await db
        .select()
        .from(patientDocuments)
        .where(and(eq(patientDocuments.id, docId), eq(patientDocuments.patientId, patient.id)))
        .limit(1);

      if (!docRow) return res.status(404).json({ error: 'Document not found.' });

      await removeFromSupabaseStorage(docRow.storageBucket, docRow.storagePath);
      await db.delete(patientDocuments).where(eq(patientDocuments.id, docRow.id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to delete document.' });
    }
  });

  // =========================================================================
  // AUTHORIZED ADMIN ENDPOINTS (Server-Authoritative RBAC)
  // =========================================================================
  app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
    try {
      await ensureBaseSeedData();
      const metrics = await getAdminDashboardMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to load admin dashboard.' });
    }
  });

  app.get('/api/admin/analytics/appointment-trends', requireAdmin, async (_req, res) => {
    try {
      const trends = await getAppointmentTrends30Days();
      res.json(trends);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to load appointment trends.' });
    }
  });

  app.post('/api/admin/storage/doctor-photo', requireAdmin, (req: AuthRequest, res) => {
    doctorPhotoUpload.single('file')(req, res, async (uploadErr: any) => {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message || 'Invalid image upload.' });
      }
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: 'Please select a doctor photo image file.' });
        }
        const safeName = sanitizeFileName(file.originalname);
        const storagePath = `doctors/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
        const { publicUrl } = await uploadToSupabaseStorage({
          bucket: DOCTOR_PHOTOS_BUCKET,
          path: storagePath,
          buffer: file.buffer,
          contentType: file.mimetype,
          isPublic: true,
        });
        res.status(201).json({ photoUrl: publicUrl, storagePath, bucket: DOCTOR_PHOTOS_BUCKET });
      } catch (error: any) {
        console.error('Doctor photo upload failed:', error);
        res.status(500).json({
          error: error.message || 'Unable to upload doctor photo to Supabase Storage.',
        });
      }
    });
  });

  app.get('/api/admin/patients', requireAdmin, async (req, res) => {
    try {
      const rows = await searchAdminPatients(String(req.query.q || ''));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to load patients.' });
    }
  });

  app.get('/api/admin/patients/:id', requireAdmin, async (req, res) => {
    try {
      const patientId = Number(req.params.id);
      const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
      if (!patient) return res.status(404).json({ error: 'Patient not found.' });

      const history = await db
        .select({
          id: appointments.id,
          appointmentCode: appointments.appointmentCode,
          appointmentDate: appointments.appointmentDate,
          timeSlot: appointments.timeSlot,
          reason: appointments.reason,
          status: appointments.status,
          doctorName: doctors.fullName,
          departmentName: departments.name,
        })
        .from(appointments)
        .innerJoin(doctors, eq(appointments.doctorId, doctors.id))
        .innerJoin(departments, eq(appointments.departmentId, departments.id))
        .where(eq(appointments.patientId, patientId))
        .orderBy(desc(appointments.appointmentDate));

      const docs = await db
        .select()
        .from(patientDocuments)
        .where(eq(patientDocuments.patientId, patientId))
        .orderBy(desc(patientDocuments.createdAt));

      res.json({ patient, appointments: history, documents: docs });
    } catch (error) {
      console.error('Admin patient detail failed:', error);
      res.status(500).json({ error: 'Unable to fetch patient details.' });
    }
  });

  app.post('/api/admin/patients/:id/documents', requireAdmin, (req: AuthRequest, res) => {
    patientDocumentUpload.single('file')(req, res, async (uploadErr: any) => {
      if (uploadErr) {
        return res.status(400).json({ error: uploadErr.message || 'Invalid file upload.' });
      }
      try {
        const patientId = Number(req.params.id);
        const [patient] = await db
          .select()
          .from(patients)
          .where(eq(patients.id, patientId))
          .limit(1);
        if (!patient) return res.status(404).json({ error: 'Patient not found.' });

        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Please attach a document file.' });

        const title = String(req.body?.title || file.originalname).trim().slice(0, 140);
        const category = String(req.body?.category || 'Lab Report').trim().slice(0, 60);
        const safeName = sanitizeFileName(file.originalname);
        const storagePath = `${patient.patientCode}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

        await uploadToSupabaseStorage({
          bucket: PATIENT_DOCUMENTS_BUCKET,
          path: storagePath,
          buffer: file.buffer,
          contentType: file.mimetype,
          isPublic: false,
        });

        const [saved] = await db
          .insert(patientDocuments)
          .values({
            patientId: patient.id,
            title,
            category,
            fileName: file.originalname.slice(0, 180),
            mimeType: file.mimetype,
            fileSize: file.size,
            storageBucket: PATIENT_DOCUMENTS_BUCKET,
            storagePath,
            uploadedByRole: 'admin',
          })
          .returning();

        await createPatientNotification({
          patientId: patient.id,
          mobileNumber: patient.mobileNumber,
          title: 'New Medical Document Uploaded',
          message: `CHC Muribahal Hospital uploaded "${title}" (${category}) to your secure Patient Documents vault.`,
          type: 'admin_notice',
        });

        res.status(201).json(saved);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Unable to upload patient document.' });
      }
    });
  });

  app.get('/api/admin/documents/:id/download', requireAdmin, async (req, res) => {
    try {
      const docId = Number(req.params.id);
      const [docRow] = await db
        .select()
        .from(patientDocuments)
        .where(eq(patientDocuments.id, docId))
        .limit(1);
      if (!docRow) return res.status(404).json({ error: 'Document not found.' });
      const signedUrl = await createSignedDocumentUrl(docRow.storageBucket, docRow.storagePath, 120);
      res.json({ signedUrl, fileName: docRow.fileName });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to generate signed download link.' });
    }
  });

  app.delete('/api/admin/documents/:id', requireAdmin, async (req, res) => {
    try {
      const docId = Number(req.params.id);
      const [docRow] = await db
        .select()
        .from(patientDocuments)
        .where(eq(patientDocuments.id, docId))
        .limit(1);
      if (!docRow) return res.status(404).json({ error: 'Document not found.' });
      await removeFromSupabaseStorage(docRow.storageBucket, docRow.storagePath);
      await db.delete(patientDocuments).where(eq(patientDocuments.id, docRow.id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to delete document.' });
    }
  });

  // Admin Departments CRUD
  app.get('/api/admin/departments', requireAdmin, async (_req, res) => {
    try {
      await ensureBaseSeedData();
      const rows = await db
        .select()
        .from(departments)
        .orderBy(asc(departments.displayOrder), asc(departments.name));
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Unable to fetch departments.' });
    }
  });

  app.post('/api/admin/departments', requireAdmin, async (req, res) => {
    try {
      const { name, description, opdHours, displayOrder } = req.body || {};
      if (!name?.trim() || !description?.trim()) {
        return res.status(400).json({ error: 'Department name and description are required.' });
      }
      const [created] = await db
        .insert(departments)
        .values({
          name: name.trim().slice(0, 100),
          description: description.trim().slice(0, 400),
          opdHours: (opdHours || '08:00 AM - 02:00 PM').trim().slice(0, 80),
          displayOrder: Number(displayOrder) || 10,
          isActive: true,
        })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A department with this name already exists.' });
      }
      res.status(500).json({ error: 'Unable to create department.' });
    }
  });

  app.put('/api/admin/departments/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description, opdHours, isActive, displayOrder } = req.body || {};
      const [updated] = await db
        .update(departments)
        .set({
          name: name?.trim(),
          description: description?.trim(),
          opdHours: opdHours?.trim(),
          isActive: typeof isActive === 'boolean' ? isActive : true,
          displayOrder: typeof displayOrder === 'number' ? displayOrder : 0,
        })
        .where(eq(departments.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Department not found.' });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Unable to update department.' });
    }
  });

  app.delete('/api/admin/departments/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(departments).where(eq(departments.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      if (error?.code === '23503') {
        return res.status(409).json({
          error:
            'Cannot delete a department that has assigned doctors or appointments. Deactivate it instead.',
        });
      }
      res.status(500).json({ error: 'Unable to delete department.' });
    }
  });

  // Admin Doctors CRUD + Schedules & Leaves
  app.get('/api/admin/doctors', requireAdmin, async (_req, res) => {
    try {
      const docRows = await db
        .select({
          id: doctors.id,
          fullName: doctors.fullName,
          qualification: doctors.qualification,
          specialization: doctors.specialization,
          departmentId: doctors.departmentId,
          departmentName: departments.name,
          experienceYears: doctors.experienceYears,
          availableDays: doctors.availableDays,
          availableTime: doctors.availableTime,
          consultationInfo: doctors.consultationInfo,
          availabilityStatus: doctors.availabilityStatus,
          photoUrl: doctors.photoUrl,
          isActive: doctors.isActive,
        })
        .from(doctors)
        .innerJoin(departments, eq(doctors.departmentId, departments.id))
        .orderBy(asc(doctors.fullName));

      const schedRows = await db
        .select()
        .from(doctorSchedules)
        .orderBy(asc(doctorSchedules.dayOfWeek), asc(doctorSchedules.slotLabel));
      const leaveRows = await db.select().from(doctorLeaves).orderBy(asc(doctorLeaves.leaveDate));

      res.json(
        docRows.map((d) => ({
          ...d,
          schedules: schedRows.filter((s) => s.doctorId === d.id),
          leaves: leaveRows.filter((l) => l.doctorId === d.id),
        }))
      );
    } catch (error) {
      res.status(500).json({ error: 'Unable to load doctors.' });
    }
  });

  app.post('/api/admin/doctors', requireAdmin, async (req, res) => {
    try {
      const {
        fullName,
        qualification,
        specialization,
        departmentId,
        experienceYears,
        availableDays,
        availableTime,
        consultationInfo,
        availabilityStatus,
        photoUrl,
        defaultSlots,
      } = req.body || {};

      if (
        !fullName?.trim() ||
        !qualification?.trim() ||
        !specialization?.trim() ||
        !departmentId ||
        !availableDays?.trim() ||
        !availableTime?.trim()
      ) {
        return res.status(400).json({ error: 'All required doctor fields must be provided.' });
      }

      const [created] = await db
        .insert(doctors)
        .values({
          fullName: fullName.trim().slice(0, 120),
          qualification: qualification.trim().slice(0, 160),
          specialization: specialization.trim().slice(0, 160),
          departmentId: Number(departmentId),
          experienceYears: Math.max(0, Number(experienceYears) || 0),
          availableDays: availableDays.trim(),
          availableTime: availableTime.trim(),
          consultationInfo: (
            consultationInfo || 'OPD Consultation — Government Public Health Service'
          ).trim(),
          availabilityStatus: availabilityStatus || 'Available',
          photoUrl: photoUrl?.trim() || null,
          isActive: true,
        })
        .returning();

      const slotsList: string[] =
        Array.isArray(defaultSlots) && defaultSlots.length > 0
          ? defaultSlots
          : [
              '09:00 AM - 09:30 AM',
              '09:30 AM - 10:00 AM',
              '10:00 AM - 10:30 AM',
              '10:30 AM - 11:00 AM',
              '11:00 AM - 11:30 AM',
            ];

      const dayMap: Record<string, string> = {
        mon: 'Monday',
        monday: 'Monday',
        tue: 'Tuesday',
        tuesday: 'Tuesday',
        wed: 'Wednesday',
        wednesday: 'Wednesday',
        thu: 'Thursday',
        thursday: 'Thursday',
        fri: 'Friday',
        friday: 'Friday',
        sat: 'Saturday',
        saturday: 'Saturday',
        sun: 'Sunday',
        sunday: 'Sunday',
      };

      const parsedDays = availableDays
        .split(',')
        .map((d: string) => dayMap[d.trim().toLowerCase()])
        .filter(Boolean);

      for (const dayName of parsedDays) {
        for (const slotLabel of slotsList) {
          await db.insert(doctorSchedules).values({
            doctorId: created.id,
            dayOfWeek: dayName,
            slotLabel: slotLabel.trim(),
            maxAppointments: 5,
            isActive: true,
          });
        }
      }

      res.status(201).json(created);
    } catch (error) {
      console.error('Create doctor failed:', error);
      res.status(500).json({ error: 'Unable to add doctor record.' });
    }
  });

  app.put('/api/admin/doctors/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(doctors).where(eq(doctors.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Doctor not found.' });

      const {
        fullName,
        qualification,
        specialization,
        departmentId,
        experienceYears,
        availableDays,
        availableTime,
        consultationInfo,
        availabilityStatus,
        photoUrl,
        isActive,
      } = req.body || {};

      const [updated] = await db
        .update(doctors)
        .set({
          fullName: fullName?.trim() || existing.fullName,
          qualification: qualification?.trim() || existing.qualification,
          specialization: specialization?.trim() || existing.specialization,
          departmentId: Number(departmentId) || existing.departmentId,
          experienceYears:
            experienceYears !== undefined
              ? Math.max(0, Number(experienceYears) || 0)
              : existing.experienceYears,
          availableDays: availableDays?.trim() || existing.availableDays,
          availableTime: availableTime?.trim() || existing.availableTime,
          consultationInfo: consultationInfo?.trim() || existing.consultationInfo,
          availabilityStatus: availabilityStatus || existing.availabilityStatus,
          photoUrl: photoUrl !== undefined ? photoUrl?.trim() || null : existing.photoUrl,
          isActive: typeof isActive === 'boolean' ? isActive : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(doctors.id, id))
        .returning();

      if (availabilityStatus && availabilityStatus !== existing.availabilityStatus) {
        const today = new Date().toISOString().slice(0, 10);
        const affected = await db
          .select({
            patientId: patients.id,
            mobileNumber: patients.mobileNumber,
            appointmentCode: appointments.appointmentCode,
            appointmentDate: appointments.appointmentDate,
          })
          .from(appointments)
          .innerJoin(patients, eq(appointments.patientId, patients.id))
          .where(
            and(
              eq(appointments.doctorId, id),
              gte(appointments.appointmentDate, today),
              inArray(appointments.status, ['Pending', 'Confirmed'])
            )
          );

        for (const row of affected) {
          await createPatientNotification({
            patientId: row.patientId,
            mobileNumber: row.mobileNumber,
            title: 'Doctor Availability Update',
            message: `${updated.fullName} status changed to "${updated.availabilityStatus}". Please check your appointment ${row.appointmentCode} scheduled for ${row.appointmentDate}.`,
            type: 'doctor_update',
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error('Update doctor failed:', error);
      res.status(500).json({ error: 'Unable to update doctor record.' });
    }
  });

  app.delete('/api/admin/doctors/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(doctors).where(eq(doctors.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      if (error?.code === '23503') {
        return res.status(409).json({
          error:
            'This doctor has existing appointment records. Mark them Unavailable or Inactive instead of deleting.',
        });
      }
      res.status(500).json({ error: 'Unable to delete doctor.' });
    }
  });

  app.post('/api/admin/doctors/:id/schedules', requireAdmin, async (req, res) => {
    try {
      const doctorId = Number(req.params.id);
      const { dayOfWeek, slotLabel, maxAppointments } = req.body || {};
      if (!dayOfWeek || !slotLabel?.trim()) {
        return res.status(400).json({ error: 'Day of week and time slot label are required.' });
      }
      const [created] = await db
        .insert(doctorSchedules)
        .values({
          doctorId,
          dayOfWeek,
          slotLabel: slotLabel.trim(),
          maxAppointments: Math.max(1, Math.min(50, Number(maxAppointments) || 5)),
          isActive: true,
        })
        .returning();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Unable to add time slot.' });
    }
  });

  app.delete('/api/admin/schedules/:scheduleId', requireAdmin, async (req, res) => {
    try {
      await db
        .delete(doctorSchedules)
        .where(eq(doctorSchedules.id, Number(req.params.scheduleId)));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Unable to delete schedule slot.' });
    }
  });

  app.post('/api/admin/doctors/:id/leaves', requireAdmin, async (req, res) => {
    try {
      const doctorId = Number(req.params.id);
      const { leaveDate, reason } = req.body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(leaveDate || ''))) {
        return res.status(400).json({ error: 'Valid leave date (YYYY-MM-DD) is required.' });
      }
      const [created] = await db
        .insert(doctorLeaves)
        .values({
          doctorId,
          leaveDate,
          reason: (reason || 'Authorized Leave').trim(),
        })
        .returning();
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ error: 'Unable to add leave date.' });
    }
  });

  app.delete('/api/admin/leaves/:leaveId', requireAdmin, async (req, res) => {
    try {
      await db.delete(doctorLeaves).where(eq(doctorLeaves.id, Number(req.params.leaveId)));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Unable to remove leave date.' });
    }
  });

  // Admin Holidays
  app.get('/api/admin/holidays', requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(hospitalHolidays)
        .orderBy(asc(hospitalHolidays.holidayDate));
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Unable to load hospital holidays.' });
    }
  });

  app.post('/api/admin/holidays', requireAdmin, async (req, res) => {
    try {
      const { holidayDate, title } = req.body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(holidayDate || '')) || !title?.trim()) {
        return res.status(400).json({ error: 'Valid date and holiday title are required.' });
      }
      const [created] = await db
        .insert(hospitalHolidays)
        .values({ holidayDate, title: title.trim().slice(0, 140) })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A holiday is already configured for this date.' });
      }
      res.status(500).json({ error: 'Unable to add holiday.' });
    }
  });

  app.delete('/api/admin/holidays/:id', requireAdmin, async (req, res) => {
    try {
      await db.delete(hospitalHolidays).where(eq(hospitalHolidays.id, Number(req.params.id)));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Unable to delete holiday.' });
    }
  });

  // Admin Appointments Management + CSV Export
  app.get('/api/admin/appointments', requireAdmin, async (req, res) => {
    try {
      const rows = await listAllAppointmentsForAdmin({
        status: req.query.status ? String(req.query.status) : undefined,
        date: req.query.date ? String(req.query.date) : undefined,
        doctorId: req.query.doctorId ? Number(req.query.doctorId) : undefined,
      });
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Unable to load appointments.' });
    }
  });

  app.get('/api/admin/appointments/export', requireAdmin, async (req, res) => {
    try {
      const rows = await listAllAppointmentsForAdmin({
        status: req.query.status ? String(req.query.status) : undefined,
        date: req.query.date ? String(req.query.date) : undefined,
      });
      const headers = [
        'Appointment ID',
        'Date',
        'Time Slot',
        'Status',
        'Patient ID',
        'Patient Name',
        'Mobile Number',
        'Village',
        'Department',
        'Doctor',
        'Reason for Visit',
        'Admin Notes',
      ];
      const lines = [
        headers.map(sanitizeCsvCell).join(','),
        ...rows.map((r) =>
          [
            r.appointmentCode,
            r.appointmentDate,
            r.timeSlot,
            r.status,
            r.patientCode,
            r.patientName,
            r.patientMobile,
            r.patientVillage,
            r.departmentName,
            r.doctorName,
            r.reason,
            r.adminNotes || '',
          ]
            .map(sanitizeCsvCell)
            .join(',')
        ),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="chc-muribahal-appointments-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(lines.join('\n'));
    } catch (error) {
      res.status(500).json({ error: 'Unable to export appointment report.' });
    }
  });

  app.patch('/api/admin/appointments/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, appointmentDate, timeSlot, adminNotes } = req.body || {};

      const [existing] = await db
        .select({
          id: appointments.id,
          appointmentCode: appointments.appointmentCode,
          patientId: appointments.patientId,
          doctorId: appointments.doctorId,
          appointmentDate: appointments.appointmentDate,
          timeSlot: appointments.timeSlot,
          status: appointments.status,
          patientMobile: patients.mobileNumber,
          doctorName: doctors.fullName,
        })
        .from(appointments)
        .innerJoin(patients, eq(appointments.patientId, patients.id))
        .innerJoin(doctors, eq(appointments.doctorId, doctors.id))
        .where(eq(appointments.id, id))
        .limit(1);

      if (!existing) return res.status(404).json({ error: 'Appointment not found.' });

      const nextDate = appointmentDate || existing.appointmentDate;
      const nextSlot = timeSlot || existing.timeSlot;
      const nextStatus = status || existing.status;
      const isRescheduled =
        nextDate !== existing.appointmentDate || nextSlot !== existing.timeSlot;

      const [updated] = await db
        .update(appointments)
        .set({
          status: nextStatus,
          appointmentDate: nextDate,
          timeSlot: nextSlot,
          adminNotes: adminNotes !== undefined ? String(adminNotes).slice(0, 400) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, id))
        .returning();

      let title = 'Appointment Updated';
      let type = 'info';
      let message = `Your appointment ${existing.appointmentCode} with ${existing.doctorName} was updated.`;

      if (isRescheduled) {
        title = 'Appointment Rescheduled';
        type = 'rescheduled';
        message = `Your appointment ${existing.appointmentCode} with ${existing.doctorName} has been rescheduled to ${nextDate} (${nextSlot}). Status: ${nextStatus}.`;
      } else if (nextStatus === 'Confirmed') {
        title = 'Appointment Confirmed';
        type = 'confirmed';
        message = `Your appointment ${existing.appointmentCode} with ${existing.doctorName} on ${nextDate} (${nextSlot}) is Confirmed.`;
      } else if (nextStatus === 'Rejected') {
        title = 'Appointment Rejected';
        type = 'rejected';
        message = `Your appointment ${existing.appointmentCode} on ${nextDate} (${nextSlot}) could not be approved.${adminNotes ? ` Note: ${adminNotes}` : ''}`;
      } else if (nextStatus === 'Cancelled') {
        title = 'Appointment Cancelled by Hospital';
        type = 'cancelled';
        message = `Your appointment ${existing.appointmentCode} on ${nextDate} (${nextSlot}) was cancelled.${adminNotes ? ` Note: ${adminNotes}` : ''}`;
      } else if (nextStatus === 'Completed') {
        title = 'Appointment Completed';
        type = 'confirmed';
        message = `Your visit ${existing.appointmentCode} with ${existing.doctorName} on ${nextDate} has been marked completed.`;
      }

      await createPatientNotification({
        patientId: existing.patientId,
        mobileNumber: existing.patientMobile,
        title,
        message,
        type,
      });

      res.json(updated);
    } catch (error) {
      console.error('Admin update appointment failed:', error);
      res.status(500).json({ error: 'Unable to update appointment.' });
    }
  });

  // Admin Send Notification
  app.post('/api/admin/notifications/send', requireAdmin, async (req, res) => {
    try {
      const { patientId, broadcastAll, title, message } = req.body || {};
      if (!title?.trim() || !message?.trim()) {
        return res.status(400).json({ error: 'Notification title and message are required.' });
      }

      if (broadcastAll) {
        const allPatients = await db
          .select({ id: patients.id, mobileNumber: patients.mobileNumber })
          .from(patients);
        for (const p of allPatients) {
          await createPatientNotification({
            patientId: p.id,
            mobileNumber: p.mobileNumber,
            title: title.trim().slice(0, 140),
            message: message.trim().slice(0, 600),
            type: 'admin_notice',
          });
        }
        return res.json({ sentCount: allPatients.length });
      }

      const [target] = await db
        .select({ id: patients.id, mobileNumber: patients.mobileNumber })
        .from(patients)
        .where(eq(patients.id, Number(patientId)))
        .limit(1);

      if (!target) return res.status(404).json({ error: 'Target patient not found.' });

      await createPatientNotification({
        patientId: target.id,
        mobileNumber: target.mobileNumber,
        title: title.trim().slice(0, 140),
        message: message.trim().slice(0, 600),
        type: 'admin_notice',
      });

      res.json({ sentCount: 1 });
    } catch (error) {
      res.status(500).json({ error: 'Unable to send notification.' });
    }
  });

  // Admin Contact Messages & Hospital Settings & Authorized Admins
  app.get('/api/admin/messages', requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(contactMessages)
        .orderBy(desc(contactMessages.createdAt));
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Unable to load contact inquiries.' });
    }
  });

  app.patch('/api/admin/messages/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [updated] = await db
        .update(contactMessages)
        .set({ status: String(req.body?.status || 'Resolved') })
        .where(eq(contactMessages.id, id))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Unable to update message status.' });
    }
  });

  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
      await ensureBaseSeedData();
      const { hospitalName, address, contactPhone, emergencyPhone, opdTimings, emergencyHours } =
        req.body || {};
      const [updated] = await db
        .update(hospitalSettings)
        .set({
          hospitalName: (hospitalName || 'CHC Muribahal Hospital').trim().slice(0, 140),
          address: (
            address || 'Community Health Centre, Muribahal, District Balangir, Odisha, India'
          )
            .trim()
            .slice(0, 300),
          contactPhone: String(contactPhone || '').trim().slice(0, 40),
          emergencyPhone: String(emergencyPhone || '').trim().slice(0, 40),
          opdTimings: (opdTimings || '').trim().slice(0, 200),
          emergencyHours: (emergencyHours || '').trim().slice(0, 200),
          updatedAt: new Date(),
        })
        .where(eq(hospitalSettings.settingKey, 'primary'))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Unable to update hospital settings.' });
    }
  });

  app.get('/api/admin/authorized-admins', requireAdmin, async (_req, res) => {
    try {
      const rows = await listAdmins();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Unable to load authorized admins.' });
    }
  });

  app.post('/api/admin/authorized-admins', requireAdmin, async (req, res) => {
    try {
      const { email, fullName, designation } = req.body || {};
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || !normalized.includes('@') || !fullName?.trim()) {
        return res.status(400).json({ error: 'Valid email and full name are required.' });
      }
      const [created] = await db
        .insert(admins)
        .values({
          email: normalized,
          fullName: fullName.trim().slice(0, 120),
          designation: (designation || 'Hospital Administrator').trim().slice(0, 120),
          isActive: true,
        })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'This administrator email is already authorized.' });
      }
      res.status(500).json({ error: 'Unable to add authorized administrator.' });
    }
  });

  app.delete('/api/admin/authorized-admins/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [row] = await db.select().from(admins).where(eq(admins.id, id)).limit(1);
      if (!row) return res.status(404).json({ error: 'Admin record not found.' });
      if (row.email.toLowerCase() === (req.user?.email || '').toLowerCase()) {
        return res
          .status(400)
          .json({ error: 'You cannot revoke your own active administrator session.' });
      }
      await db.delete(admins).where(eq(admins.id, id));
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Unable to remove administrator.' });
    }
  });

  // =========================================================================
  // VITE / STATIC FRONTEND SERVING
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CHC Muribahal Hospital Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
