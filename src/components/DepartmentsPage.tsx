import React from 'react';
import { ArrowRight } from 'lucide-react';
import { AppRoute, Department, Doctor } from '../types';

interface DepartmentsPageProps {
  departments: Department[];
  doctors: Doctor[];
  loading: boolean;
  onNavigate: (route: AppRoute, options?: { departmentId?: number }) => void;
}

export function DepartmentsPage({
  departments,
  doctors,
  loading,
  onNavigate,
}: DepartmentsPageProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-sm font-medium text-blue-800">Clinical Specialties</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 tracking-tight">
          Hospital Departments
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl">
          Verified public healthcare departments operating at CHC Muribahal Hospital, Muribahal,
          Odisha. All department details and OPD hours are managed directly by hospital
          administration.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {departments.map((dept, index) => {
            const deptDoctors = doctors.filter((d) => d.departmentId === dept.id);
            const availableCount = deptDoctors.filter(
              (d) => d.availabilityStatus === 'Available'
            ).length;

            return (
              <article
                key={dept.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono-tabular">
                      Department {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{dept.opdHours}</span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-bold text-slate-900">
                    {dept.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{dept.description}</p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-slate-600 tabular-nums">
                    {deptDoctors.length} verified doctor{deptDoctors.length === 1 ? '' : 's'} ·{' '}
                    {availableCount} available
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('appointment', { departmentId: dept.id })}
                    className="inline-flex items-center gap-1 font-semibold text-blue-800 hover:text-blue-900 whitespace-nowrap"
                  >
                    Book in {dept.name}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
