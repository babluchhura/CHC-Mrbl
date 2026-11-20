import React, { useMemo, useState } from 'react';
import { CalendarCheck, Search, Stethoscope } from 'lucide-react';
import { AppRoute, Department, Doctor } from '../types';

interface DoctorsPageProps {
  doctors: Doctor[];
  departments: Department[];
  loading: boolean;
  onNavigate: (route: AppRoute, options?: { doctorId?: number; departmentId?: number }) => void;
}

const STATUS_FILTERS = ['All', 'Available', 'Emergency Duty', 'On Leave', 'Unavailable'];

function statusTextStyle(status: string) {
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

export function DoctorsPage({ doctors, departments, loading, onNavigate }: DoctorsPageProps) {
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (deptId !== 'all' && String(doc.departmentId) !== deptId) return false;
      if (statusFilter !== 'All' && doc.availabilityStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        doc.fullName.toLowerCase().includes(q) ||
        doc.specialization.toLowerCase().includes(q) ||
        doc.qualification.toLowerCase().includes(q) ||
        doc.departmentName.toLowerCase().includes(q)
      );
    });
  }, [doctors, search, deptId, statusFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-slate-200 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-800">Medical Staff Directory</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 tracking-tight">
            Doctors & Live Availability
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Browse verified physicians at CHC Muribahal Hospital, inspect weekly OPD schedules and
            live duty statuses, and book open slots directly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('appointment')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto"
        >
          <CalendarCheck className="w-4 h-4" />
          Book Appointment
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search doctor name, specialization, qualification..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            aria-label="Filter by department"
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Doctors List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-56 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : doctors.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Stethoscope className="w-8 h-8 text-blue-800 mx-auto" />
          <h2 className="font-display text-lg font-semibold text-slate-900">
            No Verified Doctor Profiles Published Yet
          </h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
            CHC Muribahal Hospital only lists verified medical officers entered by authorized
            hospital administrators. Authorized administrators can add doctors, schedules, and OPD
            slots inside the Admin Panel.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              Go to Admin Panel
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="text-base font-semibold text-slate-900">No doctors match your filters</p>
          <p className="text-sm text-slate-600">Try clearing your search query or changing the status filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setDeptId('all');
              setStatusFilter('All');
            }}
            className="mt-2 text-sm font-semibold text-blue-800 hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((doc) => {
            const initials = doc.fullName
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join('');
            const isBookable =
              doc.availabilityStatus === 'Available' || doc.availabilityStatus === 'Emergency Duty';

            return (
              <article
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    {doc.photoUrl ? (
                      <img
                        src={doc.photoUrl}
                        alt={doc.fullName}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-blue-50 border border-blue-100 text-blue-900 font-display font-bold text-lg flex items-center justify-center shrink-0">
                        {initials || 'DR'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-display text-lg font-bold text-slate-900">
                          {doc.fullName}
                        </h2>
                        <span className={`text-xs font-semibold ${statusTextStyle(doc.availabilityStatus)}`}>
                          {doc.availabilityStatus}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-0.5">{doc.qualification}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {doc.specialization} · {doc.departmentName} ·{' '}
                        <span className="tabular-nums">{doc.experienceYears} yrs experience</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Available Days</p>
                      <p className="font-medium text-slate-800 mt-0.5">{doc.availableDays}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">OPD Hours</p>
                      <p className="font-medium text-slate-800 mt-0.5">{doc.availableTime}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{doc.consultationInfo}</p>

                  {doc.upcomingLeaves && doc.upcomingLeaves.length > 0 && (
                    <p className="text-xs text-rose-700">
                      Scheduled Leave:{' '}
                      {doc.upcomingLeaves.map((l) => `${l.leaveDate} (${l.reason})`).join(' · ')}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 tabular-nums">
                    {doc.schedules?.length || 0} configured weekly slots
                  </span>
                  {isBookable ? (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate('appointment', {
                          doctorId: doc.id,
                          departmentId: doc.departmentId,
                        })
                      }
                      className="px-4 py-2 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Book Appointment
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-slate-500">
                      Bookings paused ({doc.availabilityStatus})
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
