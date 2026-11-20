import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock, Printer, ShieldCheck, UserCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  AppRoute,
  AvailabilityResponse,
  Department,
  Doctor,
} from '../types';

interface AppointmentBookingPageProps {
  departments: Department[];
  doctors: Doctor[];
  initialDepartmentId?: number;
  initialDoctorId?: number;
  onNavigate: (route: AppRoute) => void;
}

interface BookingConfirmation {
  id: number;
  appointmentCode: string;
  appointmentDate: string;
  timeSlot: string;
  status: string;
  doctorName: string;
  patientName: string;
  patientCode: string;
  reason: string;
}

export function AppointmentBookingPage({
  departments,
  doctors,
  initialDepartmentId,
  initialDoctorId,
  onNavigate,
}: AppointmentBookingPageProps) {
  const {
    session,
    authLoading,
    supabaseConfigured,
    enabledProviders,
    signInWithGoogle,
    refreshSession,
  } = useAuth();

  const [departmentId, setDepartmentId] = useState<string>(
    initialDepartmentId ? String(initialDepartmentId) : ''
  );
  const [doctorId, setDoctorId] = useState<string>(initialDoctorId ? String(initialDoctorId) : '');
  const [appointmentDate, setAppointmentDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  useEffect(() => {
    if (initialDepartmentId) setDepartmentId(String(initialDepartmentId));
    if (initialDoctorId) setDoctorId(String(initialDoctorId));
  }, [initialDepartmentId, initialDoctorId]);

  const filteredDoctors = useMemo(() => {
    if (!departmentId) return doctors;
    return doctors.filter((d) => String(d.departmentId) === departmentId);
  }, [doctors, departmentId]);

  useEffect(() => {
    if (!doctorId || !appointmentDate) {
      setAvailability(null);
      setSelectedSlot('');
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot('');
    setErrorMsg(null);

    apiFetch<AvailabilityResponse>(
      `/api/public/availability?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(appointmentDate)}`
    )
      .then((res) => {
        if (!cancelled) {
          setAvailability(res);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setAvailability({
            bookable: false,
            reason: err.message || 'Unable to load available slots.',
            slots: [],
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doctorId, appointmentDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorId || !appointmentDate || !selectedSlot || !reason.trim()) {
      setErrorMsg('Please select a doctor, appointment date, open time slot, and enter your reason for visit.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const result = await apiFetch<BookingConfirmation>('/api/patients/appointments', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          departmentId: Number(departmentId) || undefined,
          doctorId: Number(doctorId),
          appointmentDate,
          timeSlot: selectedSlot,
          reason: reason.trim(),
        }),
      });
      setConfirmation(result);
      await refreshSession();
    } catch (err: any) {
      setErrorMsg(err.message || 'Appointment booking failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const todayMin = new Date().toISOString().slice(0, 10);

  if (confirmation) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="flex items-start gap-4 pb-6 border-b border-slate-200">
            <CheckCircle2 className="w-8 h-8 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-emerald-700">Appointment Recorded</p>
              <h1 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
                Online Appointment Confirmation
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                CHC Muribahal Hospital, Muribahal, Odisha. Please bring your Patient ID and
                Appointment ID to the OPD registration counter.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Appointment ID</dt>
              <dd className="font-mono-tabular font-semibold text-slate-900 text-base mt-0.5">
                {confirmation.appointmentCode}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Appointment Status</dt>
              <dd className="font-semibold text-amber-700 mt-0.5">{confirmation.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Patient Name & ID</dt>
              <dd className="font-medium text-slate-900 mt-0.5">
                {confirmation.patientName} ·{' '}
                <span className="font-mono-tabular text-slate-600">{confirmation.patientCode}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Consulting Doctor</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{confirmation.doctorName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Appointment Date</dt>
              <dd className="font-mono-tabular font-medium text-slate-900 mt-0.5">
                {confirmation.appointmentDate}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Time Slot</dt>
              <dd className="font-mono-tabular font-medium text-slate-900 mt-0.5">
                {confirmation.timeSlot}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Reason for Visit</dt>
              <dd className="text-slate-800 mt-0.5">{confirmation.reason}</dd>
            </div>
          </dl>

          <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Printer className="w-4 h-4" />
              Print Slip
            </button>
            <button
              type="button"
              onClick={() => onNavigate('patient')}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              View My Appointments
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmation(null);
                setReason('');
                setSelectedSlot('');
              }}
              className="px-4 py-2.5 text-sm font-medium text-blue-800 hover:underline"
            >
              Book Another Appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-sm font-medium text-blue-800">Outpatient Department Booking</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 tracking-tight">
          Book Online Appointment
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Select a department, verified doctor, date, and currently open time slot. Server-side
          validation ensures slots cannot be double-booked.
        </p>
      </div>

      {authLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-600">
          Checking patient authentication status...
        </div>
      ) : !session ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <div className="flex items-center gap-2.5 text-slate-900 font-display font-semibold text-lg">
            <ShieldCheck className="w-5 h-5 text-blue-800" />
            Patient Sign-In Required
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
            To protect patient medical records and prevent unauthorized bookings, please sign in via
            Supabase Authentication (Mobile SMS OTP, Email & Password, or Google) before booking an
            OPD slot.
          </p>
          {!supabaseConfigured && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 max-w-xl">
              Supabase Project <code className="font-mono">wlxkanjneaxpnnlkpnqc</code> is linked.
              Add <code className="font-mono">SUPABASE_ANON_KEY</code> and{' '}
              <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in AI Studio Secrets to
              enable patient login.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('patient')}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              Sign In / Register in Patient Portal
            </button>
            {enabledProviders.google && (
              <button
                type="button"
                disabled={!supabaseConfigured}
                onClick={() => void signInWithGoogle()}
                className="px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg"
              >
                Continue with Google (Supabase)
              </button>
            )}
          </div>
        </div>
      ) : !session.patient ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <div className="flex items-center gap-2.5 text-slate-900 font-display font-semibold text-lg">
            <UserCheck className="w-5 h-5 text-blue-800" />
            Complete Patient Registration First
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
            You are signed in as{' '}
            <span className="font-medium text-slate-900">
              {session.email || session.phone || 'Authenticated User'}
            </span>
            , but you have not completed your CHC Muribahal Hospital Patient Registration yet.
            Register once with your unique mobile number to generate your permanent Patient ID.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('patient')}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
          >
            Complete Patient Registration
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          {/* Auto-filled Verified Patient Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-6 border-b border-slate-200 text-sm">
            <div>
              <p className="text-xs text-slate-500">Patient Full Name</p>
              <p className="font-semibold text-slate-900 mt-0.5">{session.patient.fullName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Registered Mobile Number</p>
              <p className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                {session.patient.mobileNumber}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Patient ID</p>
              <p className="font-mono-tabular font-semibold text-blue-800 mt-0.5">
                {session.patient.patientCode}
              </p>
            </div>
          </div>

          {doctors.length === 0 ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
              No verified doctors have been published in the hospital schedule yet. Hospital
              administrators must add verified doctors and weekly OPD slots before online booking
              slots become available.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="dept-select" className="block text-sm font-medium text-slate-800 mb-1.5">
                    Select Department
                  </label>
                  <select
                    id="dept-select"
                    value={departmentId}
                    onChange={(e) => {
                      setDepartmentId(e.target.value);
                      setDoctorId('');
                      setSelectedSlot('');
                    }}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={String(dept.id)}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="doctor-select" className="block text-sm font-medium text-slate-800 mb-1.5">
                    Select Doctor <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="doctor-select"
                    required
                    value={doctorId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDoctorId(val);
                      const doc = doctors.find((d) => String(d.id) === val);
                      if (doc) setDepartmentId(String(doc.departmentId));
                    }}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
                  >
                    <option value="">Choose a doctor...</option>
                    {filteredDoctors.map((doc) => (
                      <option key={doc.id} value={String(doc.id)}>
                        {doc.fullName} — {doc.departmentName} ({doc.availabilityStatus})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="appt-date" className="block text-sm font-medium text-slate-800 mb-1.5">
                    Select Appointment Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="appt-date"
                    type="date"
                    required
                    min={todayMin}
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              {/* Dynamic Available Time Slots */}
              <div className="space-y-2.5">
                <label className="block text-sm font-medium text-slate-800">
                  Available Time Slots <span className="text-rose-600">*</span>
                </label>

                {!doctorId ? (
                  <p className="text-sm text-slate-500">
                    Select a doctor and appointment date to view live bookable OPD slots.
                  </p>
                ) : slotsLoading ? (
                  <p className="text-sm text-slate-600">Checking live schedule and remaining slot capacity...</p>
                ) : availability && !availability.bookable ? (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
                    {availability.reason}
                  </div>
                ) : availability && availability.slots.length > 0 ? (
                  <div className="space-y-3">
                    {availability.emergencyDutyNotice && (
                      <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {availability.emergencyDutyNotice}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {availability.slots.map((slot) => {
                        const selected = selectedSlot === slot.slotLabel;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setSelectedSlot(slot.slotLabel)}
                            className={`text-left p-3.5 rounded-lg border transition-colors ${
                              selected
                                ? 'bg-blue-800 border-blue-800 text-white'
                                : 'bg-white border-slate-300 text-slate-900 hover:border-blue-500'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-mono-tabular text-sm font-semibold">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              {slot.slotLabel}
                            </div>
                            <p
                              className={`text-xs mt-1 tabular-nums ${
                                selected ? 'text-blue-100' : 'text-slate-500'
                              }`}
                            >
                              {slot.remaining} of {slot.maxAppointments} slots open
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <label htmlFor="visit-reason" className="block text-sm font-medium text-slate-800 mb-1.5">
                  Reason for Visit / Primary Symptoms <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="visit-reason"
                  required
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Briefly describe your symptoms or consultation purpose..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              {errorMsg && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
                  {errorMsg}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Bookings receive a unique Appointment ID and require hospital confirmation.
                </p>
                <button
                  type="submit"
                  disabled={submitting || !selectedSlot}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
                >
                  <CalendarCheck className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Appointment'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
