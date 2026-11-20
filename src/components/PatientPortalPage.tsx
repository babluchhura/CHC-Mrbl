import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCheck,
  Download,
  FileText,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Upload,
  User,
  UserPlus,
} from 'lucide-react';
import { apiFetch, uploadAuthenticatedFormData } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  AppRoute,
  Doctor,
  PatientAppointment,
  PatientDocument,
  PatientNotification,
  PatientProfile,
} from '../types';

interface PatientPortalPageProps {
  doctors: Doctor[];
  onNavigate: (route: AppRoute, options?: { doctorId?: number; departmentId?: number }) => void;
}

type AuthTab = 'phone' | 'email' | 'signup' | 'reset';
type DashboardTab = 'upcoming' | 'history' | 'documents' | 'notifications' | 'doctors' | 'profile';

const DOCUMENT_CATEGORIES = [
  'Prescription',
  'Lab Report',
  'ID Proof',
  'Discharge Summary',
  'Vaccination Record',
  'Other',
];

function statusColor(status: string) {
  switch (status) {
    case 'Confirmed':
    case 'Completed':
      return 'text-emerald-700';
    case 'Pending':
      return 'text-amber-700';
    case 'Rejected':
    case 'Cancelled':
      return 'text-rose-700';
    default:
      return 'text-slate-600';
  }
}

function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extract10DigitPhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
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

export function PatientPortalPage({ doctors, onNavigate }: PatientPortalPageProps) {
  const {
    session,
    authLoading,
    authError,
    clearAuthError,
    supabaseConfigured,
    enabledProviders,
    signInWithEmail,
    signUpWithEmail,
    sendPhoneOtp,
    verifyPhoneOtp,
    signInWithGoogle,
    sendPasswordReset,
    signOutUser,
    refreshSession,
  } = useAuth();

  // Supabase Auth UI state (unauthenticated screen) — default to Email Login (enabled out of the box)
  const [authTab, setAuthTab] = useState<AuthTab>('email');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Phone OTP login state
  const [phoneMobile, setPhoneMobile] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  // Email login / signup / reset state
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [signupFullName, setSignupFullName] = useState('');

  // Recovery / mobile lookup state (unauthenticated screen)
  const [lookupMobile, setLookupMobile] = useState('');
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Registration form state
  const [regForm, setRegForm] = useState({
    fullName: '',
    mobileNumber: '',
    otpCode: '',
    dateOfBirth: '',
    age: '',
    gender: 'Male',
    address: '',
    village: '',
    district: 'Balangir',
    state: 'Odisha',
  });
  const [otpSentMsg, setOtpSentMsg] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Dashboard state
  const [tab, setTab] = useState<DashboardTab>('upcoming');
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [notifications, setNotifications] = useState<PatientNotification[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Document upload state (Supabase Storage)
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('Prescription');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  // Profile edit state
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    dateOfBirth: '',
    age: 0,
    gender: 'Male',
    address: '',
    village: '',
    district: 'Balangir',
    state: 'Odisha',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (session?.displayName && !regForm.fullName) {
      setRegForm((prev) => ({ ...prev, fullName: session.displayName }));
    }
  }, [session?.displayName, regForm.fullName]);

  useEffect(() => {
    const verifiedPhone = extract10DigitPhone(session?.phone);
    if (verifiedPhone && !regForm.mobileNumber) {
      setRegForm((prev) => ({ ...prev, mobileNumber: verifiedPhone }));
    }
  }, [session?.phone, regForm.mobileNumber]);

  useEffect(() => {
    if (session?.patient) {
      setProfileForm({
        fullName: session.patient.fullName,
        dateOfBirth: session.patient.dateOfBirth,
        age: session.patient.age,
        gender: session.patient.gender,
        address: session.patient.address,
        village: session.patient.village,
        district: session.patient.district,
        state: session.patient.state,
      });
    }
  }, [session?.patient]);

  const loadDashboardData = useCallback(async () => {
    if (!session?.patient) return;
    setDashLoading(true);
    try {
      const [appts, notifs, docs] = await Promise.all([
        apiFetch<PatientAppointment[]>('/api/patients/appointments', { requireAuth: true }),
        apiFetch<PatientNotification[]>('/api/patients/notifications', { requireAuth: true }),
        apiFetch<PatientDocument[]>('/api/patients/documents', { requireAuth: true }),
      ]);
      setAppointments(appts);
      setNotifications(notifs);
      setDocuments(docs);
    } catch (err: any) {
      setActionErr(err.message || 'Unable to load dashboard records.');
    } finally {
      setDashLoading(false);
    }
  }, [session?.patient]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // =========================================================================
  // SUPABASE AUTH HANDLERS
  // =========================================================================
  const switchAuthTab = (next: AuthTab) => {
    setAuthTab(next);
    setAuthNotice(null);
    clearAuthError();
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    clearAuthError();
    const digits = phoneMobile.replace(/\D/g, '');
    if (digits.length !== 10) {
      setAuthNotice('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setAuthBusy(true);
    const ok = await sendPhoneOtp(digits);
    setAuthBusy(false);
    if (ok) {
      setPhoneOtpSent(true);
      setAuthNotice(`A 6-digit SMS OTP has been sent to +91 ${digits} via Supabase Auth.`);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    clearAuthError();
    const digits = phoneMobile.replace(/\D/g, '');
    if (digits.length !== 10 || phoneOtpCode.trim().length < 6) {
      setAuthNotice('Enter both your 10-digit mobile number and the 6-digit SMS OTP.');
      return;
    }
    setAuthBusy(true);
    await verifyPhoneOtp(digits, phoneOtpCode);
    setAuthBusy(false);
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    clearAuthError();
    setAuthBusy(true);
    await signInWithEmail(emailInput, passwordInput);
    setAuthBusy(false);
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    clearAuthError();
    if (passwordInput.length < 6) {
      setAuthNotice('Password must be at least 6 characters long.');
      return;
    }
    setAuthBusy(true);
    const res = await signUpWithEmail(emailInput, passwordInput, signupFullName);
    setAuthBusy(false);
    if (res.ok && res.needsEmailConfirmation) {
      setAuthNotice(
        'Account created. Please check your email inbox and click the Supabase confirmation link before signing in.'
      );
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice(null);
    clearAuthError();
    if (!emailInput.trim()) {
      setAuthNotice('Enter your registered email address.');
      return;
    }
    setAuthBusy(true);
    const ok = await sendPasswordReset(emailInput);
    setAuthBusy(false);
    if (ok) {
      setAuthNotice(
        'Password recovery link sent via Supabase Auth. Check your email inbox to reset your password.'
      );
    }
  };

  const handleMobileRecoveryLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupMessage(null);
    const digits = lookupMobile.replace(/\D/g, '');
    if (digits.length !== 10) {
      setLookupMessage('Please enter a valid 10-digit mobile number.');
      return;
    }
    setLookupLoading(true);
    try {
      const res = await apiFetch<{ registered: boolean; smsConfigured: boolean }>(
        '/api/public/mobile-status',
        {
          method: 'POST',
          body: JSON.stringify({ mobileNumber: digits }),
        }
      );
      if (res.registered) {
        setLookupMessage(
          'An account is registered with this mobile number. Please sign in using Supabase Mobile OTP, Email & Password, or linked Google account. Use Forgot Password if you need email recovery.'
        );
      } else {
        setLookupMessage(
          'No patient account is registered with this mobile number yet. Sign in or create an account via Supabase Auth to complete new Patient Registration.'
        );
      }
    } catch (err: any) {
      setLookupMessage(err.message || 'Unable to check registration status.');
    } finally {
      setLookupLoading(false);
    }
  };

  // =========================================================================
  // REGISTRATION & DASHBOARD HANDLERS
  // =========================================================================
  const handleRequestOtp = async () => {
    setRegError(null);
    setOtpSentMsg(null);
    const digits = regForm.mobileNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      setRegError('Enter a valid 10-digit mobile number before requesting OTP.');
      return;
    }
    setOtpBusy(true);
    try {
      const res = await apiFetch<{ smsConfigured: boolean; sent: boolean; message: string }>(
        '/api/auth/request-otp',
        {
          method: 'POST',
          requireAuth: true,
          body: JSON.stringify({ mobileNumber: digits, purpose: 'registration' }),
        }
      );
      setOtpSentMsg(res.message);
    } catch (err: any) {
      setRegError(err.message || 'Unable to request OTP.');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    const digits = regForm.mobileNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      setRegError('Mobile number must be exactly 10 digits.');
      return;
    }

    setRegBusy(true);
    try {
      await apiFetch<PatientProfile>('/api/patients/register', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          ...regForm,
          mobileNumber: digits,
          age: Number(regForm.age) || calcAgeFromDob(regForm.dateOfBirth),
        }),
      });
      await refreshSession();
      setActionMsg(
        'Patient registration completed successfully. Your CHC Patient ID has been generated.'
      );
    } catch (err: any) {
      setRegError(err.message || 'Registration failed.');
    } finally {
      setRegBusy(false);
    }
  };

  const handleCancelAppointment = async (apptId: number) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiFetch(`/api/patients/appointments/${apptId}/cancel`, {
        method: 'PATCH',
        requireAuth: true,
      });
      setActionMsg('Appointment cancelled successfully.');
      await loadDashboardData();
      await refreshSession();
    } catch (err: any) {
      setActionErr(err.message || 'Unable to cancel appointment.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/patients/notifications/read-all', {
        method: 'POST',
        requireAuth: true,
      });
      await loadDashboardData();
      await refreshSession();
    } catch {
      // Ignore silent failure
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    if (!docFile) {
      setActionErr('Please select a PDF or image file (max 10 MB) to upload.');
      return;
    }
    setDocUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', docFile);
      formData.append('title', docTitle.trim() || docFile.name);
      formData.append('category', docCategory);

      await uploadAuthenticatedFormData<PatientDocument>('/api/patients/documents', formData);
      setDocTitle('');
      setDocFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
      setActionMsg('Document uploaded securely to Supabase Storage.');
      await loadDashboardData();
    } catch (err: any) {
      setActionErr(err.message || 'Unable to upload document.');
    } finally {
      setDocUploading(false);
    }
  };

  const handleDownloadDocument = async (docId: number) => {
    setActionErr(null);
    try {
      const res = await apiFetch<{ signedUrl: string; fileName: string }>(
        `/api/patients/documents/${docId}/download`,
        { requireAuth: true }
      );
      triggerSignedUrlDownload(res.signedUrl, res.fileName);
    } catch (err: any) {
      setActionErr(err.message || 'Unable to generate secure download link.');
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiFetch(`/api/patients/documents/${docId}`, {
        method: 'DELETE',
        requireAuth: true,
      });
      setActionMsg('Document permanently deleted from Supabase Storage.');
      await loadDashboardData();
    } catch (err: any) {
      setActionErr(err.message || 'Unable to delete document.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      await apiFetch('/api/patients/profile', {
        method: 'PUT',
        requireAuth: true,
        body: JSON.stringify(profileForm),
      });
      await refreshSession();
      setActionMsg('Patient profile updated successfully.');
    } catch (err: any) {
      setActionErr(err.message || 'Unable to update patient profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-sm text-slate-600">
        Verifying your Supabase session...
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: UNAUTHENTICATED PATIENT LOGIN & ACCOUNT RECOVERY (SUPABASE AUTH)
  // =========================================================================
  if (!session) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium text-blue-800">CHC Muribahal Patient Portal</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 tracking-tight">
            Patient Login & Registration
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Sign in with Supabase Authentication (Mobile SMS OTP, Email & Password, or Google) to
            access your appointments, private medical documents, and booking notifications. One
            mobile number can register only one patient account.
          </p>
        </div>

        {!supabaseConfigured && (
          <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-sm text-amber-950">
            <p className="font-semibold">
              Supabase Project Linked (<code className="font-mono">wlxkanjneaxpnnlkpnqc</code>) — API
              Keys Needed
            </p>
            <p className="text-xs leading-relaxed text-amber-900">
              Connected to{' '}
              <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">
                https://wlxkanjneaxpnnlkpnqc.supabase.co
              </code>
              . Add{' '}
              <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">SUPABASE_ANON_KEY</code>{' '}
              and{' '}
              <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{' '}
              from Supabase Project Settings → API Keys into AI Studio Secrets to activate live
              sign-in and document storage.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2.5 text-slate-900 font-display font-semibold text-lg">
              <ShieldCheck className="w-5 h-5 text-blue-800" />
              Supabase Patient Authentication
            </div>

            {/* Segmented Auth Mode Switcher */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'email', label: 'Email Login', icon: Mail },
                  { id: 'signup', label: 'Create Account', icon: UserPlus },
                  { id: 'phone', label: 'Mobile OTP', icon: Phone },
                  { id: 'reset', label: 'Forgot Password', icon: KeyRound },
                ] as { id: AuthTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => switchAuthTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      authTab === t.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {authError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
                {authError}
              </div>
            )}

            {authNotice && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                {authNotice}
              </div>
            )}

            {/* TAB 1: MOBILE SMS OTP */}
            {authTab === 'phone' && (
              !enabledProviders.phone ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-sm">
                  <p className="font-semibold text-slate-900">
                    Mobile SMS OTP Provider Not Enabled Yet
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    To activate SMS OTP sign-in, enable <strong>Phone</strong> with an SMS gateway
                    (Twilio / MessageBird / Vonage) in Supabase Dashboard → Authentication →
                    Providers. Until then, you can sign in or register immediately using Email &
                    Password.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchAuthTab('email')}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                  >
                    Use Email Login (Ready Now)
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={phoneOtpSent ? handleVerifyPhoneOtp : handleSendPhoneOtp}
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="patient-phone-otp"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Registered 10-Digit Mobile Number
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 text-sm font-mono-tabular text-slate-600 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg">
                        +91
                      </span>
                      <input
                        id="patient-phone-otp"
                        type="tel"
                        required
                        maxLength={10}
                        value={phoneMobile}
                        onChange={(e) => setPhoneMobile(e.target.value.replace(/\D/g, ''))}
                        placeholder="10-digit mobile number"
                        className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-r-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  </div>

                  {phoneOtpSent && (
                    <div>
                      <label
                        htmlFor="patient-otp-code"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        6-Digit SMS OTP Code
                      </label>
                      <input
                        id="patient-otp-code"
                        type="text"
                        required
                        maxLength={6}
                        value={phoneOtpCode}
                        onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 6-digit OTP"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={authBusy || !supabaseConfigured}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg transition-colors"
                    >
                      {authBusy
                        ? 'Please wait...'
                        : phoneOtpSent
                          ? 'Verify OTP & Sign In'
                          : 'Send SMS OTP'}
                    </button>
                    {phoneOtpSent && (
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={(e) => void handleSendPhoneOtp(e)}
                        className="text-xs font-semibold text-blue-800 hover:underline"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                </form>
              )
            )}

            {/* TAB 2: EMAIL & PASSWORD LOGIN */}
            {authTab === 'email' && (
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authBusy || !supabaseConfigured}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg transition-colors"
                >
                  {authBusy ? 'Signing In...' : 'Sign In with Email'}
                </button>
              </form>
            )}

            {/* TAB 3: CREATE NEW PATIENT AUTH ACCOUNT */}
            {authTab === 'signup' && (
              <form onSubmit={handleEmailSignUp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={signupFullName}
                    onChange={(e) => setSignupFullName(e.target.value)}
                    placeholder="Patient's full legal name"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Create Password (min. 6 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Choose a strong password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authBusy || !supabaseConfigured}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg transition-colors"
                >
                  {authBusy ? 'Creating Account...' : 'Create Patient Account'}
                </button>
              </form>
            )}

            {/* TAB 4: FORGOT PASSWORD RECOVERY */}
            {authTab === 'reset' && (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter the email address associated with your CHC Muribahal Patient account.
                  Supabase Authentication will send a secure password recovery link.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Registered Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authBusy || !supabaseConfigured}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg transition-colors"
                >
                  {authBusy ? 'Sending Link...' : 'Send Password Recovery Link'}
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-slate-200 space-y-3">
              {enabledProviders.google && (
                <button
                  type="button"
                  disabled={!supabaseConfigured}
                  onClick={() => void signInWithGoogle()}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Continue with Google (Supabase OAuth)
                </button>
              )}
              <div className="text-xs text-slate-500 space-y-1">
                <p>
                  New patients will complete one-time Patient Registration immediately after
                  sign-in to receive their permanent CHC Patient ID.
                </p>
                <p>Hospital administrators must use the separate Authorized Admin Login portal.</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-base">
              <KeyRound className="w-4 h-4 text-blue-800" />
              Check Mobile Registration Status
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Verify whether a 10-digit mobile number is already registered with CHC Muribahal
              Hospital without exposing any personal details.
            </p>
            <form onSubmit={handleMobileRecoveryLookup} className="space-y-3">
              <div>
                <label
                  htmlFor="lookup-mobile"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  10-Digit Mobile Number
                </label>
                <input
                  id="lookup-mobile"
                  type="tel"
                  maxLength={10}
                  value={lookupMobile}
                  onChange={(e) => setLookupMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 10-digit mobile number"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <button
                type="submit"
                disabled={lookupLoading}
                className="w-full px-4 py-2 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                {lookupLoading ? 'Checking...' : 'Check Mobile Registration Status'}
              </button>
            </form>
            {lookupMessage && (
              <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
                {lookupMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: SIGNED IN, NEEDS PATIENT REGISTRATION
  // =========================================================================
  if (!session.patient) {
    const verifiedSessionPhone = extract10DigitPhone(session.phone);
    const phoneAlreadyVerifiedBySupabase =
      Boolean(verifiedSessionPhone) && verifiedSessionPhone === regForm.mobileNumber;

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="border-b border-slate-200 pb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-800">One-Time Patient Enrollment</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 tracking-tight">
              Patient Registration
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in via Supabase as{' '}
              <span className="font-medium text-slate-900">
                {session.email || session.phone || 'Authenticated User'}
              </span>
              . Complete your verified patient record below to receive your unique Patient ID.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        <form
          onSubmit={handleRegisterSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-800 mb-1.5">
                Patient Full Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={regForm.fullName}
                onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                placeholder="Enter patient's full legal name"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5">
                Mobile Number (Unique per Patient) <span className="text-rose-600">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={regForm.mobileNumber}
                  onChange={(e) =>
                    setRegForm({ ...regForm, mobileNumber: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="10-digit mobile number"
                  className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
                {session.smsConfigured && !phoneAlreadyVerifiedBySupabase && (
                  <button
                    type="button"
                    disabled={otpBusy}
                    onClick={() => void handleRequestOtp()}
                    className="px-3.5 py-2.5 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg whitespace-nowrap"
                  >
                    {otpBusy ? 'Sending...' : 'Send SMS OTP'}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Strict rule: One mobile number can register only one patient account.
              </p>
            </div>

            {phoneAlreadyVerifiedBySupabase ? (
              <div className="flex flex-col justify-center bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs text-emerald-900">
                <span className="font-semibold">Mobile Verified via Supabase Phone OTP</span>
                <span className="mt-0.5">
                  Your 10-digit mobile number has already been verified during sign-in.
                </span>
              </div>
            ) : session.smsConfigured ? (
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  SMS OTP Verification Code <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={regForm.otpCode}
                  onChange={(e) =>
                    setRegForm({ ...regForm, otpCode: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="Enter 6-digit SMS OTP"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            ) : (
              <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  Identity Verified via Supabase Auth
                </span>
                <span className="mt-0.5">
                  Your account is verified through Supabase Auth. Additional SMS OTP verification
                  also activates if hospital SMS gateway secrets are configured.
                </span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5">
                Date of Birth <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={regForm.dateOfBirth}
                onChange={(e) => {
                  const dob = e.target.value;
                  setRegForm({
                    ...regForm,
                    dateOfBirth: dob,
                    age: String(calcAgeFromDob(dob)),
                  });
                }}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Age (Years) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={130}
                  value={regForm.age}
                  onChange={(e) => setRegForm({ ...regForm, age: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Gender <span className="text-rose-600">*</span>
                </label>
                <select
                  value={regForm.gender}
                  onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-800 mb-1.5">
                Residential Address <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={regForm.address}
                onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                placeholder="House/Street, Ward, Gram Panchayat, Post Office"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5">
                Village / Town <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={regForm.village}
                onChange={(e) => setRegForm({ ...regForm, village: e.target.value })}
                placeholder="e.g. Muribahal"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  District <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regForm.district}
                  onChange={(e) => setRegForm({ ...regForm, district: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  State <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regForm.state}
                  onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>
          </div>

          {otpSentMsg && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
              {otpSentMsg}
            </div>
          )}

          {regError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
              {regError}
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Your permanent CHC Muribahal Patient ID will be generated automatically upon
              registration.
            </p>
            <button
              type="submit"
              disabled={regBusy}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg"
            >
              <UserPlus className="w-4 h-4" />
              {regBusy ? 'Registering...' : 'Complete Patient Registration'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: AUTHENTICATED PATIENT DASHBOARD
  // =========================================================================
  const patient = session.patient;
  const activeAppointments = appointments.filter((a) =>
    ['Pending', 'Confirmed'].includes(a.status)
  );
  const historyAppointments = appointments.filter((a) =>
    ['Completed', 'Cancelled', 'Rejected'].includes(a.status)
  );
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Patient Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <p className="text-xs font-mono-tabular text-blue-800 font-semibold">
            Patient ID: {patient.patientCode} · Mobile: {patient.mobileNumber}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            {patient.fullName}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {patient.village}, {patient.district}, {patient.state} · {patient.gender},{' '}
            <span className="tabular-nums">{patient.age} yrs</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('appointment')}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap"
          >
            Book New Appointment
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      {/* Dashboard Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        {(
          [
            {
              id: 'upcoming',
              label: `My Appointments (${activeAppointments.length})`,
              icon: Calendar,
            },
            { id: 'history', label: `History (${historyAppointments.length})`, icon: Calendar },
            { id: 'documents', label: `My Documents (${documents.length})`, icon: FileText },
            { id: 'notifications', label: `Notifications (${unreadNotifs})`, icon: Bell },
            { id: 'doctors', label: 'Doctor Info', icon: Stethoscope },
            { id: 'profile', label: 'Patient Profile', icon: User },
          ] as {
            id: DashboardTab;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
          }[]
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActionErr(null);
                setActionMsg(null);
                setTab(item.id);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {actionMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
          {actionMsg}
        </div>
      )}
      {actionErr && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
          {actionErr}
        </div>
      )}

      {/* TAB: MY APPOINTMENTS */}
      {tab === 'upcoming' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Active Appointments
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {activeAppointments.length} active
            </span>
          </div>

          {dashLoading ? (
            <div className="p-6 text-sm text-slate-500">Loading appointments...</div>
          ) : activeAppointments.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800">No upcoming appointments booked</p>
              <p className="text-xs text-slate-500">
                Book an OPD slot online to see your confirmed appointment schedule here.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('appointment')}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
              >
                Book Appointment
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-5">Appointment ID</th>
                    <th className="py-3 px-5">Doctor & Department</th>
                    <th className="py-3 px-5">Date & Slot</th>
                    <th className="py-3 px-5">Reason</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {activeAppointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-5 font-mono-tabular font-semibold text-slate-900">
                        {appt.appointmentCode}
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-slate-900">{appt.doctorName}</p>
                        <p className="text-xs text-slate-500">{appt.departmentName}</p>
                      </td>
                      <td className="py-3.5 px-5 font-mono-tabular text-slate-800">
                        <p>{appt.appointmentDate}</p>
                        <p className="text-xs text-slate-500">{appt.timeSlot}</p>
                      </td>
                      <td className="py-3.5 px-5 text-slate-600 max-w-xs truncate">
                        {appt.reason}
                        {appt.adminNotes && (
                          <p className="text-xs text-blue-800 mt-0.5">Note: {appt.adminNotes}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-xs font-semibold ${statusColor(appt.status)}`}>
                          {appt.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleCancelAppointment(appt.id)}
                          className="text-xs font-semibold text-rose-700 hover:underline whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: APPOINTMENT HISTORY */}
      {tab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Appointment History
            </h2>
          </div>
          {historyAppointments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Completed, cancelled, or past appointments will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-5">Appointment ID</th>
                    <th className="py-3 px-5">Doctor & Department</th>
                    <th className="py-3 px-5">Date & Slot</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {historyAppointments.map((appt) => (
                    <tr key={appt.id}>
                      <td className="py-3.5 px-5 font-mono-tabular font-medium text-slate-800">
                        {appt.appointmentCode}
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-slate-900">{appt.doctorName}</p>
                        <p className="text-xs text-slate-500">{appt.departmentName}</p>
                      </td>
                      <td className="py-3.5 px-5 font-mono-tabular text-slate-700">
                        {appt.appointmentDate} · {appt.timeSlot}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-xs font-semibold ${statusColor(appt.status)}`}>
                          {appt.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-600">
                        {appt.adminNotes || appt.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: AUTHORIZED MEDICAL DOCUMENTS (SUPABASE STORAGE) */}
      {tab === 'documents' && (
        <div className="space-y-6">
          {!session.storageConfigured && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
              Supabase Storage service credentials (<code className="font-mono">SUPABASE_URL</code>{' '}
              and <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>) must be configured
              in AI Studio Secrets before uploading or downloading files.
            </div>
          )}

          <form
            onSubmit={handleUploadDocument}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Upload Medical Document (Private Supabase Storage)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Upload prescriptions, lab reports, discharge summaries, or ID proof (PDF, JPG, PNG,
                WebP — max 10 MB). Files are stored privately in Supabase Storage and accessed only
                via time-limited signed URLs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Blood Test Report — May"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Select File (PDF / Image) *
                </label>
                <input
                  ref={docFileInputRef}
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-800 hover:file:bg-blue-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={docUploading || !session.storageConfigured}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg"
            >
              <Upload className="w-4 h-4" />
              {docUploading ? 'Uploading to Supabase...' : 'Upload Document'}
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                My Private Medical Documents
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {documents.length} file(s)
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No medical documents uploaded yet. Prescriptions and lab reports uploaded by you or
                CHC Muribahal Hospital will appear here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-5">Document Title</th>
                      <th className="py-3 px-5">Category</th>
                      <th className="py-3 px-5">File & Size</th>
                      <th className="py-3 px-5">Uploaded By</th>
                      <th className="py-3 px-5">Date</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-5 font-medium text-slate-900">{doc.title}</td>
                        <td className="py-3.5 px-5 text-xs font-semibold text-blue-800">
                          {doc.category}
                        </td>
                        <td className="py-3.5 px-5 text-xs text-slate-600">
                          <p className="truncate max-w-[200px]">{doc.fileName}</p>
                          <p className="font-mono-tabular text-slate-400">
                            {formatFileSize(doc.fileSize)}
                          </p>
                        </td>
                        <td className="py-3.5 px-5 text-xs text-slate-700 capitalize">
                          {doc.uploadedByRole === 'admin' ? 'Hospital Admin' : 'Patient'}
                        </td>
                        <td className="py-3.5 px-5 font-mono-tabular text-xs text-slate-500">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-5 text-right space-x-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void handleDownloadDocument(doc.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 hover:underline"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteDocument(doc.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* TAB: NOTIFICATIONS */}
      {tab === 'notifications' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Patient Notifications
            </h2>
            {unreadNotifs > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 hover:underline"
              >
                <CheckCheck className="w-4 h-4" />
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-6 py-4 ${n.isRead ? 'bg-white' : 'bg-blue-50/40'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <span className="text-xs font-mono-tabular text-slate-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* TAB: DOCTOR INFORMATION */}
      {tab === 'doctors' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              CHC Muribahal Verified Doctors
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('doctors')}
              className="text-xs font-semibold text-blue-800 hover:underline"
            >
              Open Full Directory
            </button>
          </div>
          {doctors.length === 0 ? (
            <p className="text-sm text-slate-600">
              No verified doctor records have been added by hospital administrators yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {doctors.map((doc) => (
                <div
                  key={doc.id}
                  className="py-3.5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{doc.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {doc.qualification} · {doc.departmentName} · {doc.availableDays} (
                      {doc.availableTime})
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-slate-700">
                      {doc.availabilityStatus}
                    </span>
                    {(doc.availabilityStatus === 'Available' ||
                      doc.availabilityStatus === 'Emergency Duty') && (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate('appointment', {
                            doctorId: doc.id,
                            departmentId: doc.departmentId,
                          })
                        }
                        className="text-xs font-semibold text-blue-800 hover:underline"
                      >
                        Book
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: PATIENT PROFILE */}
      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 max-w-3xl"
        >
          <div className="pb-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Patient Profile Details
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Patient ID{' '}
              <span className="font-mono-tabular font-semibold">{patient.patientCode}</span> ·
              Registered Mobile{' '}
              <span className="font-mono-tabular font-semibold">{patient.mobileNumber}</span>{' '}
              (locked to account)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={profileForm.dateOfBirth}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    dateOfBirth: e.target.value,
                    age: calcAgeFromDob(e.target.value),
                  })
                }
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                <input
                  type="number"
                  required
                  value={profileForm.age}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, age: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                <select
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
              <input
                type="text"
                required
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Village</label>
              <input
                type="text"
                required
                value={profileForm.village}
                onChange={(e) => setProfileForm({ ...profileForm, village: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">District</label>
                <input
                  type="text"
                  required
                  value={profileForm.district}
                  onChange={(e) => setProfileForm({ ...profileForm, district: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  required
                  value={profileForm.state}
                  onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={profileSaving}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg"
          >
            {profileSaving ? 'Saving Changes...' : 'Save Profile'}
          </button>
        </form>
      )}
    </div>
  );
}
