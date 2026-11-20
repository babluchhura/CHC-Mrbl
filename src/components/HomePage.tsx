import React from 'react';
import { ArrowRight, CalendarCheck, Clock, PhoneCall, ShieldAlert, Stethoscope, UserPlus } from 'lucide-react';
import { AppRoute, PublicOverview } from '../types';

const HERO_IMAGE_URL = '/src/assets/images/hero_muribahal_chc_1795137002067.jpg';
const OPD_IMAGE_URL = '/src/assets/images/about_opd_corridor_1795136926573.jpg';

interface HomePageProps {
  overview: PublicOverview | null;
  loading: boolean;
  onNavigate: (route: AppRoute, options?: { doctorId?: number; departmentId?: number }) => void;
}

function getStatusColorClass(status: string) {
  switch (status) {
    case 'Available':
      return 'text-emerald-700';
    case 'Emergency Duty':
      return 'text-amber-700';
    case 'On Leave':
    case 'Unavailable':
      return 'text-rose-700';
    default:
      return 'text-slate-600';
  }
}

export function HomePage({ overview, loading, onNavigate }: HomePageProps) {
  const settings = overview?.settings;
  const departments = overview?.departments || [];
  const doctors = overview?.doctors || [];
  const holidays = overview?.holidays || [];

  return (
    <div className="space-y-20 pb-8">
      {/* HERO SECTION: Balanced 2-Column Split + Full-Width Institutional Strip */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <p className="text-sm font-medium text-blue-800">
                  Public Healthcare Facility · Muribahal, Balangir District, Odisha
                </p>
                <h1
                  className="font-display font-bold text-slate-900 tracking-tight leading-[1.12]"
                  style={{ fontSize: 'clamp(2.25rem, 3.8vw, 3.4rem)', textWrap: 'balance' }}
                >
                  CHC Muribahal Hospital
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  Accessible outpatient care, verified specialist schedules, and 24 × 7 emergency
                  services for residents of Muribahal and surrounding villages. Register once with
                  your mobile number to book OPD appointments online and track real-time doctor
                  availability.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('appointment')}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
                >
                  <CalendarCheck className="w-4 h-4" />
                  Book Online Appointment
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('patient')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
                >
                  <UserPlus className="w-4 h-4" />
                  Patient Registration
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src={HERO_IMAGE_URL}
                  alt="CHC Muribahal Hospital campus exterior in Muribahal, Odisha"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover lg:h-full"
                />
              </div>
            </div>
          </div>

          {/* Full-width 4-column institutional info strip directly below the hero split */}
          <div className="mt-10 pt-8 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-medium text-slate-500">Outpatient Departments</p>
              <p className="mt-1 text-2xl font-display font-bold text-slate-900 tabular-nums">
                {loading ? '—' : overview?.stats.departmentsCount ?? 8}
              </p>
              <p className="mt-1 text-xs text-slate-600">Active clinical departments</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Verified Doctors Listed</p>
              <p className="mt-1 text-2xl font-display font-bold text-slate-900 tabular-nums">
                {loading ? '—' : overview?.stats.doctorsCount ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {overview?.stats.availableDoctorsCount ?? 0} currently available for OPD
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">OPD Consultation Hours</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                {settings?.opdTimings || 'Mon – Sat · 08:00 AM – 12:00 PM & 04:00 PM – 06:00 PM'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-rose-700">Emergency & Casualty</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                {settings?.emergencyHours || '24 × 7 Emergency & Casualty Open'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Ambulance: <span className="font-mono-tabular font-semibold text-slate-900">108</span> · Emergency:{' '}
                <span className="font-mono-tabular font-semibold text-slate-900">112</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT HOSPITAL SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5">
            <div className="h-full min-h-[260px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <img
                src={OPD_IMAGE_URL}
                alt="Outpatient registration and patient waiting hall at CHC Muribahal Hospital"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="lg:col-span-7 flex flex-col justify-center space-y-5">
            <p className="text-sm font-medium text-blue-800">About CHC Muribahal Hospital</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Structured community healthcare built on transparent access
            </h2>
            <p className="text-slate-600 leading-relaxed">
              CHC Muribahal Hospital serves as the primary referral Community Health Centre for
              Muribahal block in Balangir District, Odisha. Our digital patient portal streamlines
              outpatient registration, prevents queue congestion through verified doctor slot
              schedules, and keeps patients informed of appointment confirmations or schedule
              updates.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Single-Account Mobile Integrity</h3>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  Each registered mobile number links to exactly one verified patient account with a
                  permanent CHC Patient ID, protecting personal medical history.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Live Bookable OPD Slots</h3>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  Only open, non-holiday slots for available doctors appear during booking, with
                  server-side validation preventing double bookings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOSPITAL DEPARTMENTS SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <p className="text-sm font-medium text-blue-800">Clinical Services</p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Hospital Departments
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('departments')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-800 hover:text-blue-900 whitespace-nowrap"
          >
            View all departments
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {departments.map((dept, idx) => (
            <div
              key={dept.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-blue-300 transition-colors"
            >
              <div>
                <p className="text-xs font-mono-tabular text-slate-400">
                  {String(idx + 1).padStart(2, '0')}.
                </p>
                <h3 className="mt-1.5 font-display text-base font-semibold text-slate-900">
                  {dept.name}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{dept.description}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{dept.opdHours}</span>
                <button
                  type="button"
                  onClick={() => onNavigate('appointment', { departmentId: dept.id })}
                  className="font-semibold text-blue-800 hover:underline whitespace-nowrap"
                >
                  Book
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE DOCTOR AVAILABILITY SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <p className="text-sm font-medium text-blue-800">Medical Staff Roster</p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Doctor Availability
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('doctors')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-800 hover:text-blue-900 whitespace-nowrap"
          >
            Full doctor directory
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {doctors.length === 0 ? (
          <div className="mt-8 bg-white border border-slate-200 rounded-xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-base">
                <Stethoscope className="w-5 h-5 text-blue-800" />
                Verified Doctor Roster Managed by Hospital Administration
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                To guarantee clinical accuracy, CHC Muribahal Hospital never publishes placeholder
                or unverified physician profiles. Authorized hospital administrators enter verified
                doctor credentials, live duty status, and bookable weekly time slots directly from
                the secure Admin Panel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="px-4 py-2.5 text-sm font-semibold text-blue-800 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Authorized Admin Login
            </button>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto bg-white border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-slate-50/70">
                  <th className="py-3.5 px-5">Doctor</th>
                  <th className="py-3.5 px-5">Department</th>
                  <th className="py-3.5 px-5">Schedule</th>
                  <th className="py-3.5 px-5">Live Status</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {doctors.slice(0, 6).map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-900">{doc.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {doc.qualification} · {doc.specialization}
                      </p>
                    </td>
                    <td className="py-3.5 px-5 text-slate-700">{doc.departmentName}</td>
                    <td className="py-3.5 px-5 text-slate-600">
                      <p>{doc.availableDays}</p>
                      <p className="text-xs text-slate-500">{doc.availableTime}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`font-semibold text-xs ${getStatusColorClass(doc.availabilityStatus)}`}>
                        {doc.availabilityStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {doc.availabilityStatus === 'Available' || doc.availabilityStatus === 'Emergency Duty' ? (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate('appointment', {
                              doctorId: doc.id,
                              departmentId: doc.departmentId,
                            })
                          }
                          className="text-xs font-semibold text-blue-800 hover:underline whitespace-nowrap"
                        >
                          Book Slot
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Not bookable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {holidays.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Upcoming OPD Holidays:
            </span>
            {holidays.slice(0, 4).map((h, idx) => (
              <span key={h.id}>
                <span className="font-mono-tabular">{h.holidayDate}</span> ({h.title})
                {idx < Math.min(holidays.length, 4) - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* EMERGENCY INFORMATION SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-xl p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-3">
            <div className="inline-flex items-center gap-2 text-rose-300 text-sm font-semibold">
              <ShieldAlert className="w-4 h-4" />
              Emergency & Casualty Information
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              24 × 7 Emergency Care at CHC Muribahal Hospital
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
              Online appointment booking is not required for medical emergencies, accidents,
              obstetric emergencies, snakebites, or acute chest pain. Proceed directly to the
              Casualty & Emergency Wing at Muribahal or dial the official emergency helplines.
            </p>
          </div>
          <div className="lg:col-span-4 space-y-3 border-t lg:border-t-0 lg:border-l border-slate-700 pt-6 lg:pt-0 lg:pl-8">
            <div className="space-y-1">
              <p className="text-xs text-slate-400">Odisha / National Ambulance Helpline</p>
              <p className="font-mono-tabular text-2xl font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-rose-400" />
                108 / 112
              </p>
            </div>
            <div className="space-y-1 pt-2">
              <p className="text-xs text-slate-400">CHC Muribahal Hospital Emergency Desk</p>
              <p className="font-mono-tabular text-sm font-semibold text-slate-100">
                {settings?.emergencyPhone
                  ? settings.emergencyPhone
                  : 'Contact number configurable by Hospital Admin'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300 hover:text-white transition-colors"
            >
              View location & contact details
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
