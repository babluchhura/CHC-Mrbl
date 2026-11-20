import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Calendar,
  CalendarOff,
  Download,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Stethoscope,
  Trash2,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedCsv, uploadAuthenticatedFormData } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AppointmentTrendsChart } from './AppointmentTrendsChart';
import {
  AdminAppointmentRow,
  AdminDashboardMetrics,
  AppointmentTrendsResponse,
  AuthorizedAdminRow,
  ContactMessageRow,
  Department,
  Doctor,
  HospitalHoliday,
  HospitalSettings,
  PatientDocument,
  PatientProfile,
} from '../types';

type AdminSection =
  | 'overview'
  | 'analytics'
  | 'appointments'
  | 'patients'
  | 'doctors'
  | 'departments'
  | 'holidays'
  | 'notifications'
  | 'messages'
  | 'settings';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const AVAILABILITY_STATUSES = ['Available', 'Unavailable', 'On Leave', 'Emergency Duty'];

const DOCUMENT_CATEGORIES = [
  'Prescription',
  'Lab Report',
  'ID Proof',
  'Discharge Summary',
  'Vaccination Record',
  'Other',
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function triggerSignedUrlDownload(signedUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = signedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface AdminPanelPageProps {
  hospitalSettings: HospitalSettings | null;
  onDataChanged: () => void;
}

export function AdminPanelPage({ hospitalSettings, onDataChanged }: AdminPanelPageProps) {
  const {
    session,
    authLoading,
    authError,
    clearAuthError,
    supabaseConfigured,
    enabledProviders,
    signInWithEmail,
    signInWithGoogle,
    signOutUser,
  } = useAuth();

  // Admin Supabase Email/Password Login Form State (NO public signup)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginBusy, setAdminLoginBusy] = useState(false);

  const [section, setSection] = useState<AdminSection>('overview');
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [appointmentTrends, setAppointmentTrends] = useState<AppointmentTrendsResponse | null>(null);
  const [appointments, setAppointments] = useState<AdminAppointmentRow[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [holidays, setHolidays] = useState<HospitalHoliday[]>([]);
  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [authorizedAdmins, setAuthorizedAdmins] = useState<AuthorizedAdminRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [apptStatusFilter, setApptStatusFilter] = useState('All');
  const [apptDateFilter, setApptDateFilter] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientDetail, setSelectedPatientDetail] = useState<{
    patient: PatientProfile;
    appointments: {
      id: number;
      appointmentCode: string;
      appointmentDate: string;
      timeSlot: string;
      reason: string;
      status: string;
      doctorName: string;
      departmentName: string;
    }[];
    documents: PatientDocument[];
  } | null>(null);

  // Admin document upload for selected patient (Supabase Storage)
  const [adminDocTitle, setAdminDocTitle] = useState('');
  const [adminDocCategory, setAdminDocCategory] = useState('Lab Report');
  const [adminDocFile, setAdminDocFile] = useState<File | null>(null);
  const [adminDocUploading, setAdminDocUploading] = useState(false);
  const adminDocFileInputRef = useRef<HTMLInputElement | null>(null);

  // Doctor photo upload state (Supabase Storage)
  const [photoUploading, setPhotoUploading] = useState(false);
  const doctorPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<AdminAppointmentRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');

  // Doctor add/edit form
  const [editingDoctorId, setEditingDoctorId] = useState<number | null>(null);
  const [doctorForm, setDoctorForm] = useState({
    fullName: '',
    qualification: '',
    specialization: '',
    departmentId: '',
    experienceYears: '0',
    availableDays: 'Mon,Tue,Wed,Thu,Fri,Sat',
    availableTime: '09:00 AM - 01:00 PM',
    consultationInfo: 'OPD Consultation — Government Public Health Service',
    availabilityStatus: 'Available',
    photoUrl: '',
  });
  const [scheduleDoctorId, setScheduleDoctorId] = useState<number | null>(null);
  const [newSlotDay, setNewSlotDay] = useState('Monday');
  const [newSlotLabel, setNewSlotLabel] = useState('09:00 AM - 09:30 AM');
  const [newSlotMax, setNewSlotMax] = useState('5');
  const [newLeaveDate, setNewLeaveDate] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('Authorized Leave');

  // Department form
  const [deptForm, setDeptForm] = useState({
    id: null as number | null,
    name: '',
    description: '',
    opdHours: '08:00 AM - 02:00 PM',
    isActive: true,
    displayOrder: 10,
  });

  // Holiday form
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayTitle, setHolidayTitle] = useState('');

  // Notification form
  const [notifForm, setNotifForm] = useState({
    broadcastAll: false,
    patientId: '',
    title: '',
    message: '',
  });

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    hospitalName: hospitalSettings?.hospitalName || 'CHC Muribahal Hospital',
    address:
      hospitalSettings?.address ||
      'Community Health Centre, Muribahal, District Balangir, Odisha, India',
    contactPhone: hospitalSettings?.contactPhone || '',
    emergencyPhone: hospitalSettings?.emergencyPhone || '',
    opdTimings:
      hospitalSettings?.opdTimings ||
      'Monday – Saturday: 08:00 AM – 12:00 PM & 04:00 PM – 06:00 PM',
    emergencyHours:
      hospitalSettings?.emergencyHours || '24 × 7 Emergency & Casualty Services Open',
  });

  // New authorized admin form
  const [newAdminForm, setNewAdminForm] = useState({
    email: '',
    fullName: '',
    designation: 'Hospital Administrator',
  });

  useEffect(() => {
    if (hospitalSettings) {
      setSettingsForm({
        hospitalName: hospitalSettings.hospitalName,
        address: hospitalSettings.address,
        contactPhone: hospitalSettings.contactPhone,
        emergencyPhone: hospitalSettings.emergencyPhone,
        opdTimings: hospitalSettings.opdTimings,
        emergencyHours: hospitalSettings.emergencyHours,
      });
    }
  }, [hospitalSettings]);

  const clearAlerts = () => {
    setFeedback(null);
    setErrorMsg(null);
  };

  const loadAllAdminData = useCallback(async () => {
    if (!session?.isAdmin) return;
    setLoading(true);
    try {
      const [m, trends, appts, pats, docs, depts, hols, msgs, adm] = await Promise.all([
        apiFetch<AdminDashboardMetrics>('/api/admin/dashboard', { requireAuth: true }),
        apiFetch<AppointmentTrendsResponse>('/api/admin/analytics/appointment-trends', {
          requireAuth: true,
        }),
        apiFetch<AdminAppointmentRow[]>(
          `/api/admin/appointments?status=${encodeURIComponent(apptStatusFilter)}${
            apptDateFilter ? `&date=${encodeURIComponent(apptDateFilter)}` : ''
          }`,
          { requireAuth: true }
        ),
        apiFetch<PatientProfile[]>(
          `/api/admin/patients${patientSearch ? `?q=${encodeURIComponent(patientSearch)}` : ''}`,
          { requireAuth: true }
        ),
        apiFetch<Doctor[]>('/api/admin/doctors', { requireAuth: true }),
        apiFetch<Department[]>('/api/admin/departments', { requireAuth: true }),
        apiFetch<HospitalHoliday[]>('/api/admin/holidays', { requireAuth: true }),
        apiFetch<ContactMessageRow[]>('/api/admin/messages', { requireAuth: true }),
        apiFetch<AuthorizedAdminRow[]>('/api/admin/authorized-admins', { requireAuth: true }),
      ]);
      setMetrics(m);
      setAppointmentTrends(trends);
      setAppointments(appts);
      setPatients(pats);
      setDoctors(docs);
      setDepartments(depts);
      setHolidays(hols);
      setMessages(msgs);
      setAuthorizedAdmins(adm);
      if (!doctorForm.departmentId && depts.length > 0) {
        setDoctorForm((prev) => ({ ...prev, departmentId: String(depts[0].id) }));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load hospital administration data.');
    } finally {
      setLoading(false);
    }
  }, [session?.isAdmin, apptStatusFilter, apptDateFilter, patientSearch]);

  useEffect(() => {
    void loadAllAdminData();
  }, [loadAllAdminData]);

  // =========================================================================
  // AUTHENTICATION / AUTHORIZATION GATE (NO PUBLIC ADMIN SIGNUP)
  // =========================================================================
  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-sm text-slate-600">
        Verifying administrator credentials...
      </div>
    );
  }

  if (!session) {
    const handleAdminEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      clearAuthError();
      setAdminLoginBusy(true);
      await signInWithEmail(adminEmail, adminPassword);
      setAdminLoginBusy(false);
    };

    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Lock className="w-5 h-5 text-blue-800" />
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Authorized Hospital Admin Login
            </h1>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            This restricted administration portal is exclusively for pre-authorized CHC Muribahal
            Hospital officials authenticated via Supabase Auth. Public admin signup and
            self-registration are permanently disabled.
          </p>

          {!supabaseConfigured && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              Supabase Project <code className="font-mono">wlxkanjneaxpnnlkpnqc</code> (
              <code className="font-mono">https://wlxkanjneaxpnnlkpnqc.supabase.co</code>) is
              linked. Add <code className="font-mono">SUPABASE_ANON_KEY</code> and{' '}
              <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in AI Studio Secrets to
              enable administrator sign-in and file uploads.
            </div>
          )}

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
              {authError}
            </div>
          )}

          <form onSubmit={handleAdminEmailLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Authorized Official Email
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@chcmuribahal.gov.in"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter official password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
            <button
              type="submit"
              disabled={adminLoginBusy || !supabaseConfigured}
              className="w-full px-5 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors"
            >
              {adminLoginBusy ? 'Verifying Credentials...' : 'Sign In via Supabase Auth'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 space-y-3">
            {enabledProviders.google && (
              <button
                type="button"
                disabled={!supabaseConfigured}
                onClick={() => void signInWithGoogle()}
                className="w-full px-5 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
              >
                Sign In with Authorized Google Account (Supabase OAuth)
              </button>
            )}
            <p className="text-xs text-slate-500">
              Admin role verification is enforced server-side on every request. No administrator
              credentials or passwords are stored in client-side code.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!session.isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white border border-rose-200 rounded-xl p-8 space-y-4">
          <div className="flex items-center gap-2.5 text-rose-800">
            <ShieldAlert className="w-5 h-5" />
            <h1 className="font-display text-xl font-bold">Administrator Access Denied</h1>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            The signed-in account (<span className="font-medium">{session.email}</span>) is not on
            the authorized CHC Muribahal Hospital administrators list. Public admin account creation
            is disabled for security.
          </p>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            Sign Out & Switch Account
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ADMIN MUTATION HANDLERS
  // =========================================================================
  const handleAppointmentStatus = async (id: number, status: string, adminNotes?: string) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        requireAuth: true,
        body: JSON.stringify({ status, adminNotes }),
      });
      setFeedback(`Appointment updated to ${status} and patient notified.`);
      await loadAllAdminData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update appointment.');
    }
  };

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    clearAlerts();
    try {
      await apiFetch(`/api/admin/appointments/${rescheduleTarget.id}`, {
        method: 'PATCH',
        requireAuth: true,
        body: JSON.stringify({
          appointmentDate: rescheduleDate,
          timeSlot: rescheduleSlot,
          status: 'Confirmed',
          adminNotes: rescheduleNotes,
        }),
      });
      setRescheduleTarget(null);
      setFeedback('Appointment rescheduled and patient notified.');
      await loadAllAdminData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to reschedule appointment.');
    }
  };

  const handleExportCsv = async () => {
    clearAlerts();
    try {
      const query = `?status=${encodeURIComponent(apptStatusFilter)}${
        apptDateFilter ? `&date=${encodeURIComponent(apptDateFilter)}` : ''
      }`;
      await downloadAuthenticatedCsv(
        `/api/admin/appointments/export${query}`,
        `chc-muribahal-appointments-${new Date().toISOString().slice(0, 10)}.csv`
      );
      setFeedback('Appointment CSV report exported.');
    } catch (err: any) {
      setErrorMsg(err.message || 'CSV export failed.');
    }
  };

  const handleViewPatientDetail = async (id: number) => {
    clearAlerts();
    try {
      const detail = await apiFetch<typeof selectedPatientDetail>(`/api/admin/patients/${id}`, {
        requireAuth: true,
      });
      setSelectedPatientDetail(detail);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to load patient profile.');
    }
  };

  const handleUploadPatientDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientDetail || !adminDocFile) {
      setErrorMsg('Please select a PDF or image file to upload.');
      return;
    }
    clearAlerts();
    setAdminDocUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', adminDocFile);
      formData.append('title', adminDocTitle.trim() || adminDocFile.name);
      formData.append('category', adminDocCategory);
      await uploadAuthenticatedFormData<PatientDocument>(
        `/api/admin/patients/${selectedPatientDetail.patient.id}/documents`,
        formData
      );
      setAdminDocTitle('');
      setAdminDocFile(null);
      if (adminDocFileInputRef.current) adminDocFileInputRef.current.value = '';
      setFeedback('Medical document uploaded to Supabase Storage and patient notified.');
      await handleViewPatientDetail(selectedPatientDetail.patient.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to upload patient document.');
    } finally {
      setAdminDocUploading(false);
    }
  };

  const handleAdminDownloadDocument = async (docId: number) => {
    clearAlerts();
    try {
      const res = await apiFetch<{ signedUrl: string; fileName: string }>(
        `/api/admin/documents/${docId}/download`,
        { requireAuth: true }
      );
      triggerSignedUrlDownload(res.signedUrl, res.fileName);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to generate signed download link.');
    }
  };

  const handleAdminDeleteDocument = async (docId: number) => {
    if (!selectedPatientDetail) return;
    clearAlerts();
    try {
      await apiFetch(`/api/admin/documents/${docId}`, {
        method: 'DELETE',
        requireAuth: true,
      });
      setFeedback('Document removed from Supabase Storage.');
      await handleViewPatientDetail(selectedPatientDetail.patient.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to delete patient document.');
    }
  };

  const handleDoctorPhotoUpload = async (file: File | null) => {
    if (!file) return;
    clearAlerts();
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAuthenticatedFormData<{ photoUrl: string }>(
        '/api/admin/storage/doctor-photo',
        formData
      );
      setDoctorForm((prev) => ({ ...prev, photoUrl: res.photoUrl }));
      setFeedback('Doctor photo uploaded to Supabase Storage.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to upload doctor photo.');
    } finally {
      setPhotoUploading(false);
      if (doctorPhotoInputRef.current) doctorPhotoInputRef.current.value = '';
    }
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      if (editingDoctorId) {
        await apiFetch(`/api/admin/doctors/${editingDoctorId}`, {
          method: 'PUT',
          requireAuth: true,
          body: JSON.stringify({
            ...doctorForm,
            departmentId: Number(doctorForm.departmentId),
            experienceYears: Number(doctorForm.experienceYears) || 0,
          }),
        });
        setFeedback('Doctor record updated.');
      } else {
        await apiFetch('/api/admin/doctors', {
          method: 'POST',
          requireAuth: true,
          body: JSON.stringify({
            ...doctorForm,
            departmentId: Number(doctorForm.departmentId),
            experienceYears: Number(doctorForm.experienceYears) || 0,
          }),
        });
        setFeedback('Verified doctor added with default weekly OPD slots.');
      }
      setEditingDoctorId(null);
      setDoctorForm({
        fullName: '',
        qualification: '',
        specialization: '',
        departmentId: departments[0] ? String(departments[0].id) : '',
        experienceYears: '0',
        availableDays: 'Mon,Tue,Wed,Thu,Fri,Sat',
        availableTime: '09:00 AM - 01:00 PM',
        consultationInfo: 'OPD Consultation — Government Public Health Service',
        availabilityStatus: 'Available',
        photoUrl: '',
      });
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save doctor record.');
    }
  };

  const handleQuickDoctorStatus = async (doc: Doctor, nextStatus: string) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/doctors/${doc.id}`, {
        method: 'PUT',
        requireAuth: true,
        body: JSON.stringify({ availabilityStatus: nextStatus }),
      });
      setFeedback(`${doc.fullName} status changed to ${nextStatus}.`);
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to change doctor status.');
    }
  };

  const handleDeleteDoctor = async (id: number) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/doctors/${id}`, { method: 'DELETE', requireAuth: true });
      setFeedback('Doctor removed.');
      if (scheduleDoctorId === id) setScheduleDoctorId(null);
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to delete doctor.');
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleDoctorId) return;
    clearAlerts();
    try {
      await apiFetch(`/api/admin/doctors/${scheduleDoctorId}/schedules`, {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          dayOfWeek: newSlotDay,
          slotLabel: newSlotLabel,
          maxAppointments: Number(newSlotMax) || 5,
        }),
      });
      setFeedback('Weekly time slot added.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to add schedule slot.');
    }
  };

  const handleDeleteSlot = async (slotId: number) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/schedules/${slotId}`, { method: 'DELETE', requireAuth: true });
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to delete slot.');
    }
  };

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleDoctorId || !newLeaveDate) return;
    clearAlerts();
    try {
      await apiFetch(`/api/admin/doctors/${scheduleDoctorId}/leaves`, {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({ leaveDate: newLeaveDate, reason: newLeaveReason }),
      });
      setNewLeaveDate('');
      setFeedback('Doctor leave date added.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to add leave date.');
    }
  };

  const handleDeleteLeave = async (leaveId: number) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/leaves/${leaveId}`, { method: 'DELETE', requireAuth: true });
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to remove leave date.');
    }
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      if (deptForm.id) {
        await apiFetch(`/api/admin/departments/${deptForm.id}`, {
          method: 'PUT',
          requireAuth: true,
          body: JSON.stringify(deptForm),
        });
        setFeedback('Department updated.');
      } else {
        await apiFetch('/api/admin/departments', {
          method: 'POST',
          requireAuth: true,
          body: JSON.stringify(deptForm),
        });
        setFeedback('Department created.');
      }
      setDeptForm({
        id: null,
        name: '',
        description: '',
        opdHours: '08:00 AM - 02:00 PM',
        isActive: true,
        displayOrder: 10,
      });
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to save department.');
    }
  };

  const handleDeleteDepartment = async (id: number) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/departments/${id}`, { method: 'DELETE', requireAuth: true });
      setFeedback('Department deleted.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to delete department.');
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      await apiFetch('/api/admin/holidays', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({ holidayDate, title: holidayTitle }),
      });
      setHolidayDate('');
      setHolidayTitle('');
      setFeedback('Hospital holiday scheduled.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to add holiday.');
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/holidays/${id}`, { method: 'DELETE', requireAuth: true });
      await loadAllAdminData();
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to remove holiday.');
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      const res = await apiFetch<{ sentCount: number }>('/api/admin/notifications/send', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          broadcastAll: notifForm.broadcastAll,
          patientId: notifForm.broadcastAll ? undefined : Number(notifForm.patientId),
          title: notifForm.title,
          message: notifForm.message,
        }),
      });
      setFeedback(`Notification sent to ${res.sentCount} patient account(s).`);
      setNotifForm({ broadcastAll: false, patientId: '', title: '', message: '' });
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to send notification.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        requireAuth: true,
        body: JSON.stringify(settingsForm),
      });
      setFeedback('Hospital settings updated.');
      onDataChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to update hospital settings.');
    }
  };

  const handleAddAuthorizedAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    try {
      await apiFetch('/api/admin/authorized-admins', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify(newAdminForm),
      });
      setNewAdminForm({ email: '', fullName: '', designation: 'Hospital Administrator' });
      setFeedback('Authorized administrator added.');
      await loadAllAdminData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to add administrator.');
    }
  };

  const handleRemoveAdmin = async (id: number) => {
    clearAlerts();
    try {
      await apiFetch(`/api/admin/authorized-admins/${id}`, { method: 'DELETE', requireAuth: true });
      setFeedback('Administrator access revoked.');
      await loadAllAdminData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to revoke administrator.');
    }
  };

  const selectedScheduleDoctor = doctors.find((d) => d.id === scheduleDoctorId) || null;

  const SIDEBAR_ITEMS: {
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'overview', label: 'Dashboard Overview', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics & Trends', icon: TrendingUp },
    { id: 'appointments', label: 'Appointments', icon: Calendar, count: metrics?.totalAppointments },
    { id: 'patients', label: 'Registered Patients', icon: Users, count: metrics?.totalPatients },
    { id: 'doctors', label: 'Doctors & Schedules', icon: Stethoscope, count: metrics?.totalDoctors },
    { id: 'departments', label: 'Departments', icon: Building2, count: departments.length },
    { id: 'holidays', label: 'Holidays', icon: CalendarOff, count: holidays.length },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'messages', label: 'Contact Inquiries', icon: Mail, count: metrics?.unreadMessages },
    { id: 'settings', label: 'Hospital Settings', icon: Settings },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar Navigation (256px equivalent on desktop) */}
        <aside className="lg:col-span-3 xl:col-span-2 bg-white border border-slate-200 rounded-xl p-4 space-y-5">
          <div className="pb-4 border-b border-slate-200">
            <p className="text-xs font-semibold text-blue-800">Authorized Admin</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">
              {session.displayName || 'Hospital Administrator'}
            </p>
            <p className="text-xs text-slate-500 truncate">{session.email}</p>
          </div>

          <nav className="space-y-1" aria-label="Admin sections">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    clearAlerts();
                    setSection(item.id);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left ${
                    active
                      ? 'bg-blue-800 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && (
                    <span
                      className={`text-xs font-mono-tabular shrink-0 ${
                        active ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              Secure Logout
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="lg:col-span-9 xl:col-span-10 space-y-6">
          {/* Top Breadcrumb Bar */}
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">
                CHC Muribahal Administration /{' '}
                <span className="text-slate-900 font-medium capitalize">{section}</span>
              </p>
              <h1 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                {SIDEBAR_ITEMS.find((i) => i.id === section)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleExportCsv()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export Appointments CSV
              </button>
            </div>
          </div>

          {feedback && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
              {feedback}
            </div>
          )}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
              {errorMsg}
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 1: OVERVIEW (All 8 Required KPIs)                      */}
          {/* ============================================================== */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Registered Patients', value: metrics?.totalPatients ?? 0 },
                  { label: 'Total Appointments', value: metrics?.totalAppointments ?? 0 },
                  { label: "Today's Appointments", value: metrics?.todayAppointments ?? 0 },
                  { label: 'Pending Appointments', value: metrics?.pendingAppointments ?? 0 },
                  { label: 'Confirmed Appointments', value: metrics?.confirmedAppointments ?? 0 },
                  { label: 'Total Doctors', value: metrics?.totalDoctors ?? 0 },
                  { label: 'Available Doctors', value: metrics?.availableDoctors ?? 0 },
                  { label: 'Unavailable Doctors', value: metrics?.unavailableDoctors ?? 0 },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-white border border-slate-200 rounded-xl p-5"
                  >
                    <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                    <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                      {loading && !metrics ? '—' : kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* 30-Day Daily Appointment Trends Line Chart (Recharts) */}
              <AppointmentTrendsChart data={appointmentTrends} loading={loading} />

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Recent Appointment Requests
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('appointments')}
                    className="text-xs font-semibold text-blue-800 hover:underline"
                  >
                    Manage all appointments
                  </button>
                </div>
                {appointments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No patient appointments have been booked yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          <th className="py-3 px-5">ID</th>
                          <th className="py-3 px-5">Patient</th>
                          <th className="py-3 px-5">Doctor</th>
                          <th className="py-3 px-5">Date & Slot</th>
                          <th className="py-3 px-5">Status</th>
                          <th className="py-3 px-5 text-right">Quick Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {appointments.slice(0, 8).map((a) => (
                          <tr key={a.id}>
                            <td className="py-3 px-5 font-mono-tabular text-xs font-semibold text-slate-900">
                              {a.appointmentCode}
                            </td>
                            <td className="py-3 px-5">
                              <p className="font-medium text-slate-900">{a.patientName}</p>
                              <p className="text-xs font-mono-tabular text-slate-500">
                                {a.patientMobile}
                              </p>
                            </td>
                            <td className="py-3 px-5 text-slate-700">{a.doctorName}</td>
                            <td className="py-3 px-5 font-mono-tabular text-xs text-slate-700">
                              {a.appointmentDate} · {a.timeSlot}
                            </td>
                            <td className="py-3 px-5 text-xs font-semibold text-slate-800">
                              {a.status}
                            </td>
                            <td className="py-3 px-5 text-right space-x-3 whitespace-nowrap">
                              {a.status === 'Pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleAppointmentStatus(a.id, 'Confirmed')}
                                    className="text-xs font-semibold text-emerald-700 hover:underline"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleAppointmentStatus(a.id, 'Rejected')}
                                    className="text-xs font-semibold text-rose-700 hover:underline"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Live Doctor Duty & Availability Quick Control */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Live Doctor Duty Roster ({doctors.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('doctors')}
                    className="text-xs font-semibold text-blue-800 hover:underline"
                  >
                    Manage doctors & schedules
                  </button>
                </div>
                {doctors.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No doctors added yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          <th className="py-3 px-5">Doctor</th>
                          <th className="py-3 px-5">Department</th>
                          <th className="py-3 px-5">OPD Hours</th>
                          <th className="py-3 px-5 text-right">Live Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {doctors.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60">
                            <td className="py-3 px-5">
                              <p className="font-medium text-slate-900">{doc.fullName}</p>
                              <p className="text-xs text-slate-500">{doc.qualification}</p>
                            </td>
                            <td className="py-3 px-5 text-slate-700">{doc.departmentName}</td>
                            <td className="py-3 px-5 font-mono-tabular text-xs text-slate-600">
                              {doc.availableTime}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <select
                                value={doc.availabilityStatus}
                                onChange={(e) => void handleQuickDoctorStatus(doc, e.target.value)}
                                className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-md bg-white"
                              >
                                {AVAILABILITY_STATUSES.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bottom 2-Column Operations Summary: Recent Patients + Inquiries & Holidays */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Recent Registered Patients
                    </h2>
                    <button
                      type="button"
                      onClick={() => setSection('patients')}
                      className="text-xs font-semibold text-blue-800 hover:underline"
                    >
                      View all ({patients.length})
                    </button>
                  </div>
                  {patients.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No patients registered yet.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {patients.slice(0, 5).map((p) => (
                        <li
                          key={p.id}
                          className="px-6 py-3.5 flex items-center justify-between gap-4 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{p.fullName}</p>
                            <p className="text-xs text-slate-500">
                              <span className="font-mono-tabular text-blue-800 font-semibold">
                                {p.patientCode}
                              </span>{' '}
                              · {p.village}, {p.district} ·{' '}
                              <span className="font-mono-tabular">{p.mobileNumber}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSection('patients');
                              void handleViewPatientDetail(p.id);
                            }}
                            className="text-xs font-semibold text-blue-800 hover:underline whitespace-nowrap"
                          >
                            Inspect
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Recent Contact Inquiries
                      </h2>
                      <button
                        type="button"
                        onClick={() => setSection('messages')}
                        className="text-xs font-semibold text-blue-800 hover:underline"
                      >
                        View all ({messages.length})
                      </button>
                    </div>
                    {messages.length === 0 ? (
                      <div className="p-6 text-sm text-slate-500">No inquiries received yet.</div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {messages.slice(0, 3).map((m) => (
                          <li key={m.id} className="px-6 py-3.5 space-y-0.5 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-slate-900 truncate">{m.subject}</p>
                              <span className="text-xs font-semibold text-slate-600 shrink-0">
                                {m.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              {m.senderName} ·{' '}
                              <span className="font-mono-tabular">{m.mobileNumber}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Upcoming Hospital Holidays
                      </h2>
                      <button
                        type="button"
                        onClick={() => setSection('holidays')}
                        className="text-xs font-semibold text-blue-800 hover:underline"
                      >
                        Manage ({holidays.length})
                      </button>
                    </div>
                    {holidays.length === 0 ? (
                      <div className="p-6 text-sm text-slate-500">No holidays scheduled.</div>
                    ) : (
                      <ul className="divide-y divide-slate-100 text-xs">
                        {holidays.slice(0, 4).map((h) => (
                          <li
                            key={h.id}
                            className="px-6 py-2.5 flex items-center justify-between gap-4"
                          >
                            <span className="font-medium text-slate-900">{h.title}</span>
                            <span className="font-mono-tabular text-slate-500 shrink-0">
                              {h.holidayDate}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 1B: DATA VISUALIZATION — ANALYTICS & 30-DAY TRENDS     */}
          {/* ============================================================== */}
          {section === 'analytics' && (
            <AppointmentTrendsChart
              data={appointmentTrends}
              loading={loading}
              showDepartmentBreakdown
            />
          )}

          {/* ============================================================== */}
          {/* SECTION 2: APPOINTMENTS MANAGEMENT                             */}
          {/* ============================================================== */}
          {section === 'appointments' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {['All', 'Pending', 'Confirmed', 'Completed', 'Rejected', 'Cancelled'].map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setApptStatusFilter(st)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                          apptStatusFilter === st
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={apptDateFilter}
                    onChange={(e) => setApptDateFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                  />
                  {apptDateFilter && (
                    <button
                      type="button"
                      onClick={() => setApptDateFilter('')}
                      className="text-xs font-semibold text-blue-800 hover:underline"
                    >
                      Clear Date
                    </button>
                  )}
                </div>
              </div>

              {rescheduleTarget && (
                <form
                  onSubmit={handleConfirmReschedule}
                  className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Reschedule Appointment {rescheduleTarget.appointmentCode} (
                      {rescheduleTarget.patientName})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setRescheduleTarget(null)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        New Date
                      </label>
                      <input
                        type="date"
                        required
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        New Time Slot
                      </label>
                      <input
                        type="text"
                        required
                        value={rescheduleSlot}
                        onChange={(e) => setRescheduleSlot(e.target.value)}
                        placeholder="e.g. 10:00 AM - 10:30 AM"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Admin Note (Sent to Patient)
                      </label>
                      <input
                        type="text"
                        value={rescheduleNotes}
                        onChange={(e) => setRescheduleNotes(e.target.value)}
                        placeholder="Reason for rescheduling"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                  >
                    Confirm Reschedule & Notify Patient
                  </button>
                </form>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {appointments.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No appointments match the current filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          <th className="py-3 px-4">Appointment ID</th>
                          <th className="py-3 px-4">Patient</th>
                          <th className="py-3 px-4">Doctor & Dept</th>
                          <th className="py-3 px-4">Date & Time</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Manage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {appointments.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-slate-900">
                              {a.appointmentCode}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-slate-900">{a.patientName}</p>
                              <p className="text-xs font-mono-tabular text-slate-500">
                                {a.patientCode} · {a.patientMobile}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-slate-900">{a.doctorName}</p>
                              <p className="text-xs text-slate-500">{a.departmentName}</p>
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-xs text-slate-700">
                              <p>{a.appointmentDate}</p>
                              <p className="text-slate-500">{a.timeSlot}</p>
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-slate-800">
                              {a.status}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2.5 whitespace-nowrap text-xs font-semibold">
                              {a.status !== 'Confirmed' && (
                                <button
                                  type="button"
                                  onClick={() => void handleAppointmentStatus(a.id, 'Confirmed')}
                                  className="text-emerald-700 hover:underline"
                                >
                                  Approve
                                </button>
                              )}
                              {a.status !== 'Completed' && a.status === 'Confirmed' && (
                                <button
                                  type="button"
                                  onClick={() => void handleAppointmentStatus(a.id, 'Completed')}
                                  className="text-blue-800 hover:underline"
                                >
                                  Complete
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleTarget(a);
                                  setRescheduleDate(a.appointmentDate);
                                  setRescheduleSlot(a.timeSlot);
                                  setRescheduleNotes(a.adminNotes || '');
                                }}
                                className="text-slate-700 hover:underline"
                              >
                                Reschedule
                              </button>
                              {a.status !== 'Rejected' && (
                                <button
                                  type="button"
                                  onClick={() => void handleAppointmentStatus(a.id, 'Rejected')}
                                  className="text-rose-700 hover:underline"
                                >
                                  Reject
                                </button>
                              )}
                              {a.status !== 'Cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => void handleAppointmentStatus(a.id, 'Cancelled')}
                                  className="text-slate-500 hover:underline"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 3: REGISTERED PATIENTS                                 */}
          {/* ============================================================== */}
          {section === 'patients' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search registered patients by full name, 10-digit mobile number, Patient ID, or village..."
                  className="flex-1 text-sm focus:outline-none"
                />
              </div>

              {selectedPatientDetail && (
                <div className="bg-white border border-blue-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200">
                    <div>
                      <p className="text-xs font-mono-tabular font-semibold text-blue-800">
                        {selectedPatientDetail.patient.patientCode}
                      </p>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {selectedPatientDetail.patient.fullName}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Mobile: {selectedPatientDetail.patient.mobileNumber} ·{' '}
                        {selectedPatientDetail.patient.gender},{' '}
                        {selectedPatientDetail.patient.age} yrs (DOB:{' '}
                        {selectedPatientDetail.patient.dateOfBirth})
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {selectedPatientDetail.patient.address},{' '}
                        {selectedPatientDetail.patient.village},{' '}
                        {selectedPatientDetail.patient.district},{' '}
                        {selectedPatientDetail.patient.state}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPatientDetail(null)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Close Profile
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Appointment History ({selectedPatientDetail.appointments.length})
                    </p>
                    {selectedPatientDetail.appointments.length === 0 ? (
                      <p className="text-xs text-slate-500">No appointments booked yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 text-xs">
                        {selectedPatientDetail.appointments.map((a) => (
                          <li key={a.id} className="py-2 flex items-center justify-between gap-4">
                            <span>
                              <strong className="font-mono-tabular">{a.appointmentCode}</strong> ·{' '}
                              {a.appointmentDate} ({a.timeSlot}) · {a.doctorName} ({a.departmentName})
                            </span>
                            <span className="font-semibold text-slate-800">{a.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Authorized Medical Documents (Supabase Storage) */}
                  <div className="pt-4 border-t border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <FileText className="w-4 h-4 text-blue-800" />
                        Medical Documents in Supabase Storage (
                        {selectedPatientDetail.documents?.length || 0})
                      </p>
                      {!session.storageConfigured && (
                        <span className="text-xs text-amber-800">
                          Set SUPABASE_SERVICE_ROLE_KEY to upload/download
                        </span>
                      )}
                    </div>

                    <form
                      onSubmit={handleUploadPatientDocument}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3"
                    >
                      <input
                        type="text"
                        required
                        value={adminDocTitle}
                        onChange={(e) => setAdminDocTitle(e.target.value)}
                        placeholder="Document title (e.g. CBC Lab Report)"
                        className="sm:col-span-4 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                      <select
                        value={adminDocCategory}
                        onChange={(e) => setAdminDocCategory(e.target.value)}
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      >
                        {DOCUMENT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <input
                        ref={adminDocFileInputRef}
                        type="file"
                        required
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={(e) => setAdminDocFile(e.target.files?.[0] || null)}
                        className="sm:col-span-3 text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-800"
                      />
                      <button
                        type="submit"
                        disabled={adminDocUploading || !session.storageConfigured}
                        className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-md"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {adminDocUploading ? 'Uploading...' : 'Upload'}
                      </button>
                    </form>

                    {(selectedPatientDetail.documents || []).length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No medical documents uploaded for this patient yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 text-xs">
                        {(selectedPatientDetail.documents || []).map((doc) => (
                          <li
                            key={doc.id}
                            className="py-2 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">{doc.title}</span> ·{' '}
                              <span className="text-blue-800 font-medium">{doc.category}</span> ·{' '}
                              <span className="font-mono-tabular text-slate-500">
                                {formatFileSize(doc.fileSize)}
                              </span>{' '}
                              ·{' '}
                              <span className="text-slate-500">
                                {doc.uploadedByRole === 'admin' ? 'Hospital Admin' : 'Patient'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 font-semibold">
                              <button
                                type="button"
                                onClick={() => void handleAdminDownloadDocument(doc.id)}
                                className="inline-flex items-center gap-1 text-blue-800 hover:underline"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleAdminDeleteDocument(doc.id)}
                                className="inline-flex items-center gap-1 text-rose-700 hover:underline"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {patients.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No registered patients found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          <th className="py-3 px-4">Patient ID</th>
                          <th className="py-3 px-4">Full Name</th>
                          <th className="py-3 px-4">Mobile Number</th>
                          <th className="py-3 px-4">Age / Gender</th>
                          <th className="py-3 px-4">Village / District</th>
                          <th className="py-3 px-4 text-right">Profile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {patients.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-blue-800">
                              {p.patientCode}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900">{p.fullName}</td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">
                              {p.mobileNumber}
                            </td>
                            <td className="py-3 px-4 text-slate-600 tabular-nums">
                              {p.age} yrs · {p.gender}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {p.village}, {p.district}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => void handleViewPatientDetail(p.id)}
                                className="text-xs font-semibold text-blue-800 hover:underline"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 4: DOCTORS & LIVE AVAILABILITY SCHEDULES               */}
          {/* ============================================================== */}
          {section === 'doctors' && (
            <div className="space-y-8">
              <form
                onSubmit={handleSaveDoctor}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    {editingDoctorId ? 'Edit Verified Doctor Record' : 'Add Verified Doctor'}
                  </h2>
                  {editingDoctorId && (
                    <button
                      type="button"
                      onClick={() => setEditingDoctorId(null)}
                      className="text-xs font-semibold text-slate-600 hover:underline"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Doctor Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={doctorForm.fullName}
                      onChange={(e) => setDoctorForm({ ...doctorForm, fullName: e.target.value })}
                      placeholder="e.g. Dr. Full Name"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Qualification *
                    </label>
                    <input
                      type="text"
                      required
                      value={doctorForm.qualification}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, qualification: e.target.value })
                      }
                      placeholder="e.g. MBBS, MD"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Specialization *
                    </label>
                    <input
                      type="text"
                      required
                      value={doctorForm.specialization}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, specialization: e.target.value })
                      }
                      placeholder="e.g. General Medicine"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Department *
                    </label>
                    <select
                      required
                      value={doctorForm.departmentId}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, departmentId: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Select department...</option>
                      {departments.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Experience (Years)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={doctorForm.experienceYears}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, experienceYears: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Availability Status
                    </label>
                    <select
                      value={doctorForm.availabilityStatus}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, availabilityStatus: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {AVAILABILITY_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Available Days (comma-separated) *
                    </label>
                    <input
                      type="text"
                      required
                      value={doctorForm.availableDays}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, availableDays: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Available Time *
                    </label>
                    <input
                      type="text"
                      required
                      value={doctorForm.availableTime}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, availableTime: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Doctor Photo (Supabase Storage)
                    </label>
                    <div className="flex items-center gap-3">
                      {doctorForm.photoUrl && (
                        <img
                          src={doctorForm.photoUrl}
                          alt="Doctor preview"
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      )}
                      <div className="flex-1 space-y-1.5">
                        <input
                          ref={doctorPhotoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={photoUploading || !session.storageConfigured}
                          onChange={(e) =>
                            void handleDoctorPhotoUpload(e.target.files?.[0] || null)
                          }
                          className="w-full text-xs text-slate-600 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-800 hover:file:bg-blue-100 disabled:opacity-50"
                        />
                        {photoUploading && (
                          <p className="text-[11px] text-blue-800">
                            Uploading photo to Supabase Storage...
                          </p>
                        )}
                        {doctorForm.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setDoctorForm({ ...doctorForm, photoUrl: '' })}
                            className="text-[11px] font-semibold text-rose-700 hover:underline"
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Consultation Information
                    </label>
                    <input
                      type="text"
                      value={doctorForm.consultationInfo}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, consultationInfo: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  {editingDoctorId ? 'Update Doctor' : 'Save Verified Doctor'}
                </button>
              </form>

              {/* Doctor Roster Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Registered Hospital Doctors ({doctors.length})
                  </h2>
                </div>
                {doctors.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No doctors added yet. Use the form above to add verified CHC Muribahal doctors.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          <th className="py-3 px-4">Doctor</th>
                          <th className="py-3 px-4">Department</th>
                          <th className="py-3 px-4">Live Status</th>
                          <th className="py-3 px-4">Slots</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {doctors.map((doc) => (
                          <tr key={doc.id}>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-slate-900">{doc.fullName}</p>
                              <p className="text-xs text-slate-500">
                                {doc.qualification} · {doc.specialization}
                              </p>
                            </td>
                            <td className="py-3 px-4 text-slate-700">{doc.departmentName}</td>
                            <td className="py-3 px-4">
                              <select
                                value={doc.availabilityStatus}
                                onChange={(e) => void handleQuickDoctorStatus(doc, e.target.value)}
                                className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-md bg-white"
                              >
                                {AVAILABILITY_STATUSES.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                              {doc.schedules?.length || 0} slots · {doc.leaves?.length || 0} leaves
                            </td>
                            <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => setScheduleDoctorId(doc.id)}
                                className="text-blue-800 hover:underline"
                              >
                                Slots & Leaves
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDoctorId(doc.id);
                                  setDoctorForm({
                                    fullName: doc.fullName,
                                    qualification: doc.qualification,
                                    specialization: doc.specialization,
                                    departmentId: String(doc.departmentId),
                                    experienceYears: String(doc.experienceYears),
                                    availableDays: doc.availableDays,
                                    availableTime: doc.availableTime,
                                    consultationInfo: doc.consultationInfo,
                                    availabilityStatus: doc.availabilityStatus,
                                    photoUrl: doc.photoUrl || '',
                                  });
                                }}
                                className="text-slate-700 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteDoctor(doc.id)}
                                className="text-rose-700 hover:underline"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Schedule & Leave Manager Drawer */}
              {selectedScheduleDoctor && (
                <div className="bg-white border border-blue-200 rounded-xl p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold text-blue-800">
                        Weekly Slot & Leave Management
                      </p>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {selectedScheduleDoctor.fullName}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScheduleDoctorId(null)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Add Time Slot */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-900">Weekly Appointment Slots</h4>
                      <form onSubmit={handleAddSlot} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={newSlotDay}
                          onChange={(e) => setNewSlotDay(e.target.value)}
                          className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          {DAYS_OF_WEEK.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          required
                          value={newSlotLabel}
                          onChange={(e) => setNewSlotLabel(e.target.value)}
                          placeholder="09:00 AM - 09:30 AM"
                          className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={newSlotMax}
                            onChange={(e) => setNewSlotMax(e.target.value)}
                            title="Max appointments per slot"
                            className="w-16 px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                          />
                          <button
                            type="submit"
                            className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                          >
                            Add
                          </button>
                        </div>
                      </form>

                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                        {(selectedScheduleDoctor.schedules || []).length === 0 ? (
                          <p className="p-4 text-xs text-slate-500">No slots configured yet.</p>
                        ) : (
                          (selectedScheduleDoctor.schedules || []).map((s) => (
                            <div
                              key={s.id}
                              className="px-3 py-2 flex items-center justify-between text-xs"
                            >
                              <span>
                                <strong>{s.dayOfWeek}</strong> ·{' '}
                                <span className="font-mono-tabular">{s.slotLabel}</span> · Max{' '}
                                <span className="font-mono-tabular">{s.maxAppointments}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDeleteSlot(s.id)}
                                className="text-rose-700 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Doctor Leave Dates */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-900">Doctor Leave Dates</h4>
                      <form onSubmit={handleAddLeave} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="date"
                          required
                          value={newLeaveDate}
                          onChange={(e) => setNewLeaveDate(e.target.value)}
                          className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                        />
                        <input
                          type="text"
                          value={newLeaveReason}
                          onChange={(e) => setNewLeaveReason(e.target.value)}
                          placeholder="Reason"
                          className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <button
                          type="submit"
                          className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                        >
                          Add Leave Date
                        </button>
                      </form>

                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                        {(selectedScheduleDoctor.leaves || []).length === 0 ? (
                          <p className="p-4 text-xs text-slate-500">No leave dates recorded.</p>
                        ) : (
                          (selectedScheduleDoctor.leaves || []).map((l) => (
                            <div
                              key={l.id}
                              className="px-3 py-2 flex items-center justify-between text-xs"
                            >
                              <span>
                                <strong className="font-mono-tabular">{l.leaveDate}</strong> ·{' '}
                                {l.reason}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLeave(l.id)}
                                className="text-rose-700 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 5: DEPARTMENTS MANAGEMENT                              */}
          {/* ============================================================== */}
          {section === 'departments' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveDepartment}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-slate-900">
                    {deptForm.id ? 'Edit Department' : 'Add Hospital Department'}
                  </h2>
                  {deptForm.id && (
                    <button
                      type="button"
                      onClick={() =>
                        setDeptForm({
                          id: null,
                          name: '',
                          description: '',
                          opdHours: '08:00 AM - 02:00 PM',
                          isActive: true,
                          displayOrder: 10,
                        })
                      }
                      className="text-xs font-semibold text-slate-600 hover:underline"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Department Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={deptForm.name}
                      onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      OPD Hours
                    </label>
                    <input
                      type="text"
                      value={deptForm.opdHours}
                      onChange={(e) => setDeptForm({ ...deptForm, opdHours: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Clinical Scope / Description *
                    </label>
                    <input
                      type="text"
                      required
                      value={deptForm.description}
                      onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  {deptForm.id ? 'Update Department' : 'Create Department'}
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {departments.map((d) => (
                  <div
                    key={d.id}
                    className="px-6 py-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">
                        {d.name}{' '}
                        <span className="text-xs font-normal text-slate-500">· {d.opdHours}</span>
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">{d.description}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() =>
                          setDeptForm({
                            id: d.id,
                            name: d.name,
                            description: d.description,
                            opdHours: d.opdHours,
                            isActive: d.isActive,
                            displayOrder: d.displayOrder,
                          })
                        }
                        className="text-blue-800 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDepartment(d.id)}
                        className="text-rose-700 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 6: HOSPITAL HOLIDAYS                                   */}
          {/* ============================================================== */}
          {section === 'holidays' && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddHoliday}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-end gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Holiday Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Holiday Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={holidayTitle}
                    onChange={(e) => setHolidayTitle(e.target.value)}
                    placeholder="e.g. Republic Day / Utkal Divas"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  Add Holiday
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {holidays.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No hospital holidays configured.
                  </div>
                ) : (
                  holidays.map((h) => (
                    <div key={h.id} className="px-6 py-3.5 flex items-center justify-between text-sm">
                      <span>
                        <strong className="font-mono-tabular text-slate-900">{h.holidayDate}</strong>{' '}
                        · {h.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteHoliday(h.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 7: SEND PATIENT NOTIFICATIONS                          */}
          {/* ============================================================== */}
          {section === 'notifications' && (
            <form
              onSubmit={handleSendNotification}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-2xl"
            >
              <h2 className="font-display text-base font-bold text-slate-900">
                Send Patient Notification
              </h2>
              <div className="flex items-center gap-2">
                <input
                  id="broadcast-all"
                  type="checkbox"
                  checked={notifForm.broadcastAll}
                  onChange={(e) =>
                    setNotifForm({ ...notifForm, broadcastAll: e.target.checked })
                  }
                />
                <label htmlFor="broadcast-all" className="text-sm text-slate-700">
                  Broadcast announcement to all registered patients ({patients.length})
                </label>
              </div>

              {!notifForm.broadcastAll && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Select Registered Patient *
                  </label>
                  <select
                    required
                    value={notifForm.patientId}
                    onChange={(e) => setNotifForm({ ...notifForm, patientId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Choose patient...</option>
                    {patients.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.fullName} ({p.patientCode} · {p.mobileNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notification Subject *
                </label>
                <input
                  type="text"
                  required
                  value={notifForm.title}
                  onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                  placeholder="e.g. Vaccination Camp Notice or OPD Schedule Update"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message *
                </label>
                <textarea
                  required
                  rows={4}
                  value={notifForm.message}
                  onChange={(e) => setNotifForm({ ...notifForm, message: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
              >
                Send Notification
              </button>
            </form>
          )}

          {/* ============================================================== */}
          {/* SECTION 8: CONTACT INQUIRIES                                   */}
          {/* ============================================================== */}
          {section === 'messages' && (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {messages.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No contact inquiries received yet.
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="p-6 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{m.subject}</p>
                        <p className="text-xs text-slate-500">
                          From {m.senderName} ·{' '}
                          <span className="font-mono-tabular">{m.mobileNumber}</span> ·{' '}
                          {new Date(m.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-700">{m.status}</span>
                        {m.status !== 'Resolved' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/messages/${m.id}`, {
                                method: 'PATCH',
                                requireAuth: true,
                                body: JSON.stringify({ status: 'Resolved' }),
                              });
                              await loadAllAdminData();
                            }}
                            className="text-xs font-semibold text-blue-800 hover:underline"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{m.message}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 9: HOSPITAL SETTINGS & AUTHORIZED ADMINS               */}
          {/* ============================================================== */}
          {section === 'settings' && (
            <div className="space-y-8">
              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-3xl"
              >
                <h2 className="font-display text-base font-bold text-slate-900">
                  CHC Muribahal Hospital Contact & Timings Configuration
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Hospital Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsForm.hospitalName}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, hospitalName: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Official Hospital Address
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsForm.address}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, address: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Official Hospital Contact Number
                    </label>
                    <input
                      type="text"
                      value={settingsForm.contactPhone}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, contactPhone: e.target.value })
                      }
                      placeholder="Enter verified hospital phone"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Emergency / Casualty Desk Phone
                    </label>
                    <input
                      type="text"
                      value={settingsForm.emergencyPhone}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, emergencyPhone: e.target.value })
                      }
                      placeholder="Enter verified emergency desk phone"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      OPD Consultation Timings
                    </label>
                    <input
                      type="text"
                      value={settingsForm.opdTimings}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, opdTimings: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Emergency Hours Notice
                    </label>
                    <input
                      type="text"
                      value={settingsForm.emergencyHours}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, emergencyHours: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  Save Hospital Settings
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-3xl">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Authorized Hospital Administrators
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Only email accounts listed here (and configured in server secrets) can access
                    the Admin Panel. Public admin signup is disabled.
                  </p>
                </div>

                <form onSubmit={handleAddAuthorizedAdmin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="email"
                    required
                    value={newAdminForm.email}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                    placeholder="admin@email.com"
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    value={newAdminForm.fullName}
                    onChange={(e) => setNewAdminForm({ ...newAdminForm, fullName: e.target.value })}
                    placeholder="Official Full Name"
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Authorize Admin
                  </button>
                </form>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {authorizedAdmins.map((adm) => (
                    <div
                      key={adm.id}
                      className="px-4 py-3 flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{adm.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {adm.email} · {adm.designation}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveAdmin(adm.id)}
                        className="text-xs font-semibold text-rose-700 hover:underline"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
