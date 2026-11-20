import crypto from 'crypto';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
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
  otpChallenges,
  patients,
} from './schema.ts';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DEFAULT_DEPARTMENTS = [
  {
    name: 'General Medicine',
    description: 'Outpatient diagnosis, fever clinic, chronic illness follow-up, and primary medical care.',
    opdHours: '08:00 AM - 02:00 PM',
    displayOrder: 1,
  },
  {
    name: 'General Surgery',
    description: 'Minor surgical procedures, wound care, post-operative dressings, and surgical consultations.',
    opdHours: '09:00 AM - 01:00 PM',
    displayOrder: 2,
  },
  {
    name: 'Obstetrics & Gynaecology',
    description: 'Antenatal checkups, maternal healthcare, institutional delivery support, and women’s health.',
    opdHours: '08:30 AM - 02:00 PM',
    displayOrder: 3,
  },
  {
    name: 'Paediatrics',
    description: 'Child health consultations, immunisation guidance, nutrition monitoring, and newborn care.',
    opdHours: '08:30 AM - 01:30 PM',
    displayOrder: 4,
  },
  {
    name: 'Orthopaedics',
    description: 'Bone and joint consultations, fracture stabilization, plaster care, and musculoskeletal triage.',
    opdHours: '09:00 AM - 01:00 PM',
    displayOrder: 5,
  },
  {
    name: 'Dental',
    description: 'Oral health examinations, preventive dentistry, tooth extractions, and basic dental procedures.',
    opdHours: '09:00 AM - 01:00 PM',
    displayOrder: 6,
  },
  {
    name: 'Eye Care',
    description: 'Vision screening, refraction support, conjunctivitis treatment, and cataract referral services.',
    opdHours: '09:00 AM - 01:00 PM',
    displayOrder: 7,
  },
  {
    name: 'Emergency Services',
    description: '24 × 7 casualty triage, acute stabilization, trauma first response, and referral coordination.',
    opdHours: '24 × 7 Open',
    displayOrder: 8,
  },
];

export async function ensureBaseSeedData() {
  try {
    const existingSettings = await db
      .select()
      .from(hospitalSettings)
      .where(eq(hospitalSettings.settingKey, 'primary'))
      .limit(1);

    if (existingSettings.length === 0) {
      await db
        .insert(hospitalSettings)
        .values({
          settingKey: 'primary',
          hospitalName: 'CHC Muribahal Hospital',
          address: 'Community Health Centre, Muribahal, District Balangir, Odisha, India',
          contactPhone: '',
          emergencyPhone: '',
          opdTimings: 'Monday – Saturday: 08:00 AM – 12:00 PM & 04:00 PM – 06:00 PM',
          emergencyHours: '24 × 7 Emergency & Casualty Services Open',
        })
        .onConflictDoNothing({ target: hospitalSettings.settingKey });
    }

    const existingDepts = await db.select({ id: departments.id }).from(departments).limit(1);
    if (existingDepts.length === 0) {
      for (const dept of DEFAULT_DEPARTMENTS) {
        await db
          .insert(departments)
          .values({ ...dept, isActive: true })
          .onConflictDoNothing({ target: departments.name });
      }
    }
  } catch (error) {
    console.error('Base hospital seed failed:', error);
    throw new Error('Unable to initialize hospital master records.', { cause: error });
  }
}

export async function dispatchSmsIfConfigured(
  mobileNumber: string,
  message: string
): Promise<'sent' | 'not_configured' | 'failed'> {
  const providerUrl = process.env.SMS_PROVIDER_URL;
  const apiKey = process.env.SMS_PROVIDER_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'CHCMRB';

  if (!providerUrl || !apiKey) {
    return 'not_configured';
  }

  try {
    const resp = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: mobileNumber,
        sender: senderId,
        message,
      }),
    });
    return resp.ok ? 'sent' : 'failed';
  } catch (error) {
    console.error('SMS provider request failed:', error);
    return 'failed';
  }
}

export async function createPatientNotification(params: {
  patientId: number;
  mobileNumber?: string;
  title: string;
  message: string;
  type: string;
}) {
  try {
    const smsStatus = params.mobileNumber
      ? await dispatchSmsIfConfigured(params.mobileNumber, `${params.title}: ${params.message}`)
      : 'not_configured';

    const [created] = await db
      .insert(notifications)
      .values({
        patientId: params.patientId,
        title: params.title,
        message: params.message,
        type: params.type,
        smsStatus,
        isRead: false,
      })
      .returning();

    return created;
  } catch (error) {
    console.error('Failed to create notification:', error);
    throw new Error('Failed to create notification.', { cause: error });
  }
}

export async function getPublicOverview() {
  try {
    await ensureBaseSeedData();
    const [settingsRow] = await db
      .select()
      .from(hospitalSettings)
      .where(eq(hospitalSettings.settingKey, 'primary'))
      .limit(1);

    const deptRows = await db
      .select()
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(asc(departments.displayOrder), asc(departments.name));

    const doctorRows = await db
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
      .where(eq(doctors.isActive, true))
      .orderBy(asc(doctors.fullName));

    const today = new Date().toISOString().slice(0, 10);
    const holidays = await db
      .select()
      .from(hospitalHolidays)
      .where(gte(hospitalHolidays.holidayDate, today))
      .orderBy(asc(hospitalHolidays.holidayDate));

    const schedules = await db
      .select()
      .from(doctorSchedules)
      .where(eq(doctorSchedules.isActive, true))
      .orderBy(asc(doctorSchedules.dayOfWeek), asc(doctorSchedules.slotLabel));

    const leaves = await db
      .select()
      .from(doctorLeaves)
      .where(gte(doctorLeaves.leaveDate, today))
      .orderBy(asc(doctorLeaves.leaveDate));

    const availableDoctorsCount = doctorRows.filter(
      (d) => d.availabilityStatus === 'Available'
    ).length;

    return {
      settings: settingsRow,
      departments: deptRows,
      doctors: doctorRows.map((doc) => ({
        ...doc,
        schedules: schedules.filter((s) => s.doctorId === doc.id),
        upcomingLeaves: leaves.filter((l) => l.doctorId === doc.id),
      })),
      holidays,
      stats: {
        departmentsCount: deptRows.length,
        doctorsCount: doctorRows.length,
        availableDoctorsCount,
      },
      smsConfigured: Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_API_KEY),
    };
  } catch (error) {
    console.error('Failed to fetch public overview:', error);
    throw new Error('Unable to load hospital directory information.', { cause: error });
  }
}

export async function getBookableSlots(doctorId: number, dateStr: string) {
  try {
    const [doctor] = await db
      .select({
        id: doctors.id,
        fullName: doctors.fullName,
        availabilityStatus: doctors.availabilityStatus,
        isActive: doctors.isActive,
      })
      .from(doctors)
      .where(eq(doctors.id, doctorId))
      .limit(1);

    if (!doctor || !doctor.isActive) {
      return { bookable: false, reason: 'Selected doctor record is not active.', slots: [] };
    }

    if (doctor.availabilityStatus === 'Unavailable' || doctor.availabilityStatus === 'On Leave') {
      return {
        bookable: false,
        reason: `${doctor.fullName} is currently marked as ${doctor.availabilityStatus}.`,
        slots: [],
      };
    }

    const [holiday] = await db
      .select()
      .from(hospitalHolidays)
      .where(eq(hospitalHolidays.holidayDate, dateStr))
      .limit(1);

    if (holiday) {
      return {
        bookable: false,
        reason: `Hospital Holiday on ${dateStr}: ${holiday.title}. Emergency services remain open 24 × 7.`,
        slots: [],
      };
    }

    const [leave] = await db
      .select()
      .from(doctorLeaves)
      .where(and(eq(doctorLeaves.doctorId, doctorId), eq(doctorLeaves.leaveDate, dateStr)))
      .limit(1);

    if (leave) {
      return {
        bookable: false,
        reason: `${doctor.fullName} is on leave on ${dateStr} (${leave.reason}).`,
        slots: [],
      };
    }

    const parsedDate = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      return { bookable: false, reason: 'Invalid appointment date format.', slots: [] };
    }
    const dayOfWeek = DAY_NAMES[parsedDate.getUTCDay()];

    const daySchedules = await db
      .select()
      .from(doctorSchedules)
      .where(
        and(
          eq(doctorSchedules.doctorId, doctorId),
          eq(doctorSchedules.dayOfWeek, dayOfWeek),
          eq(doctorSchedules.isActive, true)
        )
      )
      .orderBy(asc(doctorSchedules.slotLabel));

    if (daySchedules.length === 0) {
      return {
        bookable: false,
        reason: `No OPD appointment slots scheduled for ${doctor.fullName} on ${dayOfWeek}s.`,
        slots: [],
      };
    }

    const activeAppointments = await db
      .select({
        timeSlot: appointments.timeSlot,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctorId, doctorId),
          eq(appointments.appointmentDate, dateStr),
          inArray(appointments.status, ['Pending', 'Confirmed'])
        )
      );

    const bookedBySlot: Record<string, number> = {};
    for (const appt of activeAppointments) {
      bookedBySlot[appt.timeSlot] = (bookedBySlot[appt.timeSlot] || 0) + 1;
    }

    const slots = daySchedules
      .map((s) => {
        const bookedCount = bookedBySlot[s.slotLabel] || 0;
        const remaining = Math.max(0, s.maxAppointments - bookedCount);
        return {
          id: s.id,
          slotLabel: s.slotLabel,
          maxAppointments: s.maxAppointments,
          bookedCount,
          remaining,
          bookable: remaining > 0,
        };
      })
      .filter((s) => s.bookable);

    if (slots.length === 0) {
      return {
        bookable: false,
        reason: `All appointment slots for ${doctor.fullName} on ${dateStr} are currently full.`,
        slots: [],
      };
    }

    return {
      bookable: true,
      dayOfWeek,
      emergencyDutyNotice:
        doctor.availabilityStatus === 'Emergency Duty'
          ? 'Doctor is currently on Emergency Duty; OPD timings may experience priority delays.'
          : null,
      slots,
    };
  } catch (error) {
    console.error('Failed to compute bookable slots:', error);
    throw new Error('Unable to load available appointment slots.', { cause: error });
  }
}

export async function getPatientByUid(userUid: string) {
  try {
    const [row] = await db
      .select()
      .from(patients)
      .where(eq(patients.userUid, userUid))
      .limit(1);
    return row || null;
  } catch (error) {
    console.error('Failed to look up patient by UID:', error);
    throw new Error('Unable to fetch patient profile.', { cause: error });
  }
}

export async function createOtpChallenge(mobileNumber: string, purpose: string) {
  try {
    const smsConfigured = Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_API_KEY);
    if (!smsConfigured) {
      return {
        smsConfigured: false,
        sent: false,
        message:
          'Direct hospital SMS gateway is not configured in server secrets. Use Supabase Phone OTP, Email, or Google Sign-In to authenticate and complete patient registration securely.',
      };
    }

    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = crypto.createHash('sha256').update(`${mobileNumber}:${code}`).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpChallenges).values({
      mobileNumber,
      purpose,
      codeHash,
      expiresAt,
      consumed: false,
    });

    const smsResult = await dispatchSmsIfConfigured(
      mobileNumber,
      `CHC Muribahal Hospital OTP: ${code}. Valid for 10 minutes. Do not share this code.`
    );

    if (smsResult !== 'sent') {
      return {
        smsConfigured: true,
        sent: false,
        message: 'Failed to dispatch SMS OTP through the configured provider.',
      };
    }

    return {
      smsConfigured: true,
      sent: true,
      message: 'OTP sent to your registered mobile number via SMS.',
    };
  } catch (error) {
    console.error('Failed to create OTP challenge:', error);
    throw new Error('Unable to initiate OTP verification.', { cause: error });
  }
}

export async function verifyOtpChallenge(mobileNumber: string, code: string) {
  try {
    const codeHash = crypto.createHash('sha256').update(`${mobileNumber}:${code.trim()}`).digest('hex');
    const now = new Date();
    const [challenge] = await db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.mobileNumber, mobileNumber),
          eq(otpChallenges.codeHash, codeHash),
          eq(otpChallenges.consumed, false)
        )
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (!challenge || challenge.expiresAt < now) {
      return false;
    }

    await db
      .update(otpChallenges)
      .set({ consumed: true })
      .where(eq(otpChallenges.id, challenge.id));

    return true;
  } catch (error) {
    console.error('Failed to verify OTP challenge:', error);
    throw new Error('Unable to verify OTP.', { cause: error });
  }
}

export async function registerPatient(params: {
  userUid: string;
  fullName: string;
  mobileNumber: string;
  mobileVerified: boolean;
  dateOfBirth: string;
  age: number;
  gender: string;
  address: string;
  village: string;
  district: string;
  state: string;
}) {
  try {
    const existingByUid = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.userUid, params.userUid))
      .limit(1);

    if (existingByUid.length > 0) {
      const err: any = new Error('A patient account is already registered for your login.');
      err.statusCode = 409;
      throw err;
    }

    const existingByMobile = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.mobileNumber, params.mobileNumber))
      .limit(1);

    if (existingByMobile.length > 0) {
      const err: any = new Error(
        'This mobile number is already registered with an existing patient account. One mobile number can register only one patient account.'
      );
      err.statusCode = 409;
      throw err;
    }

    const year = new Date().getFullYear();
    const randomSuffix = crypto.randomInt(1000, 9999);
    const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(patients);
    const seq = String((countRes[0]?.count || 0) + 1).padStart(4, '0');
    const patientCode = `CHCM-${year}-${seq}${String(randomSuffix).slice(0, 2)}`;

    const [created] = await db
      .insert(patients)
      .values({
        patientCode,
        userUid: params.userUid,
        fullName: params.fullName,
        mobileNumber: params.mobileNumber,
        mobileVerified: params.mobileVerified,
        dateOfBirth: params.dateOfBirth,
        age: params.age,
        gender: params.gender,
        address: params.address,
        village: params.village,
        district: params.district,
        state: params.state,
      })
      .returning();

    await createPatientNotification({
      patientId: created.id,
      mobileNumber: created.mobileNumber,
      title: 'Patient Registration Successful',
      message: `Welcome to CHC Muribahal Hospital, ${created.fullName}. Your Patient ID is ${created.patientCode}.`,
      type: 'registration',
    });

    return created;
  } catch (error: any) {
    if (error?.statusCode) throw error;
    if (error?.code === '23505') {
      const conflictErr: any = new Error(
        'This mobile number is already registered. One mobile number can register only one patient account.'
      );
      conflictErr.statusCode = 409;
      throw conflictErr;
    }
    console.error('Patient registration failed:', error);
    throw new Error('Unable to register patient account.', { cause: error });
  }
}

export async function bookAppointmentServerSide(params: {
  userUid: string;
  departmentId: number;
  doctorId: number;
  appointmentDate: string;
  timeSlot: string;
  reason: string;
}) {
  try {
    const patient = await getPatientByUid(params.userUid);
    if (!patient) {
      const err: any = new Error('Please complete Patient Registration before booking an appointment.');
      err.statusCode = 400;
      throw err;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (params.appointmentDate < today) {
      const err: any = new Error('Appointments cannot be booked for past dates.');
      err.statusCode = 400;
      throw err;
    }

    const slotData = await getBookableSlots(params.doctorId, params.appointmentDate);
    if (!slotData.bookable) {
      const err: any = new Error(slotData.reason || 'Selected doctor is not available on this date.');
      err.statusCode = 409;
      throw err;
    }

    const matchedSlot = slotData.slots.find((s) => s.slotLabel === params.timeSlot);
    if (!matchedSlot || matchedSlot.remaining <= 0) {
      const err: any = new Error('Selected time slot is no longer available. Please choose another slot.');
      err.statusCode = 409;
      throw err;
    }

    const duplicatePatientSlot = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, patient.id),
          eq(appointments.doctorId, params.doctorId),
          eq(appointments.appointmentDate, params.appointmentDate),
          eq(appointments.timeSlot, params.timeSlot),
          inArray(appointments.status, ['Pending', 'Confirmed'])
        )
      )
      .limit(1);

    if (duplicatePatientSlot.length > 0) {
      const err: any = new Error(
        'You already have an active appointment with this doctor for the selected date and time slot.'
      );
      err.statusCode = 409;
      throw err;
    }

    const [doctorRow] = await db
      .select({
        id: doctors.id,
        fullName: doctors.fullName,
        departmentId: doctors.departmentId,
      })
      .from(doctors)
      .where(eq(doctors.id, params.doctorId))
      .limit(1);

    if (!doctorRow) {
      const err: any = new Error('Selected doctor not found.');
      err.statusCode = 404;
      throw err;
    }

    const dateCompact = params.appointmentDate.replace(/-/g, '');
    const suffix = crypto.randomInt(1000, 9999);
    const appointmentCode = `APT-${dateCompact}-${suffix}`;

    const [created] = await db
      .insert(appointments)
      .values({
        appointmentCode,
        patientId: patient.id,
        departmentId: doctorRow.departmentId,
        doctorId: params.doctorId,
        appointmentDate: params.appointmentDate,
        timeSlot: params.timeSlot,
        reason: params.reason,
        status: 'Pending',
      })
      .returning();

    await createPatientNotification({
      patientId: patient.id,
      mobileNumber: patient.mobileNumber,
      title: 'Appointment Booked (Pending Confirmation)',
      message: `Appointment ${created.appointmentCode} with ${doctorRow.fullName} on ${created.appointmentDate} (${created.timeSlot}) has been submitted.`,
      type: 'booking',
    });

    return {
      ...created,
      doctorName: doctorRow.fullName,
      patientName: patient.fullName,
      patientCode: patient.patientCode,
    };
  } catch (error: any) {
    if (error?.statusCode) throw error;
    console.error('Appointment booking failed:', error);
    throw new Error('Unable to process appointment booking.', { cause: error });
  }
}

export async function getAdminDashboardMetrics() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [patientCount] = await db.select({ count: sql<number>`count(*)::int` }).from(patients);
    const allAppts = await db
      .select({ status: appointments.status, appointmentDate: appointments.appointmentDate })
      .from(appointments);
    const allDocs = await db
      .select({ availabilityStatus: doctors.availabilityStatus, isActive: doctors.isActive })
      .from(doctors)
      .where(eq(doctors.isActive, true));
    const [newMessages] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactMessages)
      .where(eq(contactMessages.status, 'New'));

    return {
      totalPatients: patientCount?.count || 0,
      totalAppointments: allAppts.length,
      todayAppointments: allAppts.filter((a) => a.appointmentDate === today).length,
      pendingAppointments: allAppts.filter((a) => a.status === 'Pending').length,
      confirmedAppointments: allAppts.filter((a) => a.status === 'Confirmed').length,
      totalDoctors: allDocs.length,
      availableDoctors: allDocs.filter((d) => d.availabilityStatus === 'Available').length,
      unavailableDoctors: allDocs.filter((d) => d.availabilityStatus !== 'Available').length,
      unreadMessages: newMessages?.count || 0,
    };
  } catch (error) {
    console.error('Failed to compute admin metrics:', error);
    throw new Error('Unable to load hospital dashboard metrics.', { cause: error });
  }
}

export async function getAppointmentTrends30Days() {
  try {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    const days: {
      date: string;
      label: string;
      total: number;
      confirmed: number;
      pending: number;
      cancelledOrRejected: number;
    }[] = [];

    const dayIndex = new Map<string, number>();
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    for (let offset = 29; offset >= 0; offset -= 1) {
      const d = new Date(todayUtc.getTime() - offset * 24 * 60 * 60 * 1000);
      const iso = d.toISOString().slice(0, 10);
      const label = `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`;
      dayIndex.set(iso, days.length);
      days.push({
        date: iso,
        label,
        total: 0,
        confirmed: 0,
        pending: 0,
        cancelledOrRejected: 0,
      });
    }

    const startDate = days[0].date;
    const endDate = days[days.length - 1].date;

    const rows = await db
      .select({
        appointmentDate: appointments.appointmentDate,
        status: appointments.status,
        departmentName: departments.name,
      })
      .from(appointments)
      .innerJoin(departments, eq(appointments.departmentId, departments.id))
      .where(and(gte(appointments.appointmentDate, startDate), lte(appointments.appointmentDate, endDate)));

    const deptCounts = new Map<string, number>();

    for (const row of rows) {
      const idx = dayIndex.get(row.appointmentDate);
      if (idx === undefined) continue;
      const bucket = days[idx];
      bucket.total += 1;
      if (row.status === 'Confirmed' || row.status === 'Completed') {
        bucket.confirmed += 1;
      } else if (row.status === 'Pending') {
        bucket.pending += 1;
      } else if (row.status === 'Cancelled' || row.status === 'Rejected') {
        bucket.cancelledOrRejected += 1;
      }

      deptCounts.set(row.departmentName, (deptCounts.get(row.departmentName) || 0) + 1);
    }

    const total30Days = days.reduce((sum, item) => sum + item.total, 0);
    const confirmed30Days = days.reduce((sum, item) => sum + item.confirmed, 0);
    const pending30Days = days.reduce((sum, item) => sum + item.pending, 0);
    const cancelled30Days = days.reduce((sum, item) => sum + item.cancelledOrRejected, 0);

    let peakDay = { date: days[0].date, label: days[0].label, count: 0 };
    for (const item of days) {
      if (item.total >= peakDay.count) {
        peakDay = { date: item.date, label: item.label, count: item.total };
      }
    }

    const departmentBreakdown = Array.from(deptCounts.entries())
      .map(([departmentName, count]) => ({ departmentName, count }))
      .sort((a, b) => b.count - a.count);

    return {
      startDate,
      endDate,
      days,
      summary: {
        total30Days,
        confirmed30Days,
        pending30Days,
        cancelled30Days,
        dailyAverage: Number((total30Days / 30).toFixed(1)),
        peakDay,
      },
      departmentBreakdown,
    };
  } catch (error) {
    console.error('Failed to compute 30-day appointment trends:', error);
    throw new Error('Unable to load 30-day appointment trends.', { cause: error });
  }
}

export async function searchAdminPatients(query?: string) {
  try {
    const q = query?.trim();
    const rows = q
      ? await db
          .select()
          .from(patients)
          .where(
            or(
              ilike(patients.fullName, `%${q}%`),
              ilike(patients.mobileNumber, `%${q}%`),
              ilike(patients.patientCode, `%${q}%`),
              ilike(patients.village, `%${q}%`)
            )
          )
          .orderBy(desc(patients.createdAt))
      : await db.select().from(patients).orderBy(desc(patients.createdAt));

    return rows;
  } catch (error) {
    console.error('Failed to fetch admin patients:', error);
    throw new Error('Unable to load registered patients.', { cause: error });
  }
}

export async function listAllAppointmentsForAdmin(filters: {
  status?: string;
  date?: string;
  doctorId?: number;
}) {
  try {
    const conditions = [];
    if (filters.status && filters.status !== 'All') {
      conditions.push(eq(appointments.status, filters.status));
    }
    if (filters.date) {
      conditions.push(eq(appointments.appointmentDate, filters.date));
    }
    if (filters.doctorId) {
      conditions.push(eq(appointments.doctorId, filters.doctorId));
    }

    const baseQuery = db
      .select({
        id: appointments.id,
        appointmentCode: appointments.appointmentCode,
        appointmentDate: appointments.appointmentDate,
        timeSlot: appointments.timeSlot,
        reason: appointments.reason,
        status: appointments.status,
        adminNotes: appointments.adminNotes,
        createdAt: appointments.createdAt,
        patientId: patients.id,
        patientCode: patients.patientCode,
        patientName: patients.fullName,
        patientMobile: patients.mobileNumber,
        patientVillage: patients.village,
        doctorId: doctors.id,
        doctorName: doctors.fullName,
        departmentId: departments.id,
        departmentName: departments.name,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(doctors, eq(appointments.doctorId, doctors.id))
      .innerJoin(departments, eq(appointments.departmentId, departments.id));

    const rows =
      conditions.length > 0
        ? await baseQuery
            .where(and(...conditions))
            .orderBy(desc(appointments.appointmentDate), desc(appointments.createdAt))
        : await baseQuery.orderBy(desc(appointments.appointmentDate), desc(appointments.createdAt));

    return rows;
  } catch (error) {
    console.error('Failed to list appointments:', error);
    throw new Error('Unable to load appointments.', { cause: error });
  }
}

export async function listAdmins() {
  try {
    return await db.select().from(admins).orderBy(asc(admins.email));
  } catch (error) {
    console.error('Failed to list admins:', error);
    throw new Error('Unable to load authorized administrators.', { cause: error });
  }
}
