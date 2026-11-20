import React from 'react';
import { AppRoute, HospitalSettings } from '../types';

interface FooterProps {
  settings: HospitalSettings | null;
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ settings, onNavigate }: FooterProps) {
  const go = (route: AppRoute) => {
    onNavigate(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-slate-800">
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-blue-400"
              >
                <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
                <path d="M12 6.5V17.5M6.5 12H17.5" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="square" />
              </svg>
              <span className="font-display text-lg font-bold text-white tracking-tight">
                {settings?.hospitalName || 'CHC Muribahal Hospital'}
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              Community Health Centre serving Muribahal block and surrounding gram panchayats in
              Balangir District, Odisha, India with outpatient consultations, maternal and child
              care, and round-the-clock emergency support.
            </p>
            <p className="text-sm text-slate-400">
              {settings?.address || 'Community Health Centre, Muribahal, District Balangir, Odisha, India'}
            </p>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h3 className="text-sm font-semibold text-white tracking-wide">Patient Services</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button type="button" onClick={() => go('appointment')} className="hover:text-white transition-colors">
                  Book Online Appointment
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('patient')} className="hover:text-white transition-colors">
                  Patient Registration & Login
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('doctors')} className="hover:text-white transition-colors">
                  Doctors & Live Availability
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('departments')} className="hover:text-white transition-colors">
                  Hospital Departments
                </button>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-3">
            <h3 className="text-sm font-semibold text-white tracking-wide">Timings & Administration</h3>
            <div className="text-sm text-slate-400 space-y-1.5">
              <p>
                <span className="text-slate-200 font-medium">OPD: </span>
                {settings?.opdTimings || 'Monday – Saturday: 08:00 AM – 12:00 PM & 04:00 PM – 06:00 PM'}
              </p>
              <p>
                <span className="text-slate-200 font-medium">Emergency: </span>
                {settings?.emergencyHours || '24 × 7 Emergency & Casualty Services Open'}
              </p>
              <p>
                <span className="text-slate-200 font-medium">National Helplines: </span>
                <span className="font-mono-tabular text-slate-200">108</span> (Ambulance) ·{' '}
                <span className="font-mono-tabular text-slate-200">112</span> (Emergency)
              </p>
            </div>
            <div className="pt-2 flex items-center gap-5 text-sm">
              <button type="button" onClick={() => go('contact')} className="text-blue-300 hover:text-white transition-colors">
                Contact & Directions
              </button>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <button type="button" onClick={() => go('admin')} className="text-slate-300 hover:text-white transition-colors">
                Authorized Admin Login
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} CHC Muribahal Hospital, Muribahal, Odisha, India. All rights reserved.</p>
          <p>Patient medical information is strictly protected and accessible only to authorized accounts.</p>
        </div>
      </div>
    </footer>
  );
}
