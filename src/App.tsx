import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { apiFetch } from './lib/api';
import { AppRoute, PublicOverview } from './types';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './components/HomePage';
import { DoctorsPage } from './components/DoctorsPage';
import { DepartmentsPage } from './components/DepartmentsPage';
import { AppointmentBookingPage } from './components/AppointmentBookingPage';
import { PatientPortalPage } from './components/PatientPortalPage';
import { ContactPage } from './components/ContactPage';
import { AdminPanelPage } from './components/AdminPanelPage';

function routeFromPath(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  if (clean === '/doctors') return 'doctors';
  if (clean === '/departments') return 'departments';
  if (clean === '/appointment' || clean === '/appointments') return 'appointment';
  if (clean === '/patient' || clean === '/patient-dashboard') return 'patient';
  if (clean === '/contact') return 'contact';
  if (clean === '/admin') return 'admin';
  return 'home';
}

function pathFromRoute(route: AppRoute): string {
  switch (route) {
    case 'doctors':
      return '/doctors';
    case 'departments':
      return '/departments';
    case 'appointment':
      return '/appointment';
    case 'patient':
      return '/patient';
    case 'contact':
      return '/contact';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

function HospitalShell() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const [preselectDeptId, setPreselectDeptId] = useState<number | undefined>(undefined);
  const [preselectDoctorId, setPreselectDoctorId] = useState<number | undefined>(undefined);

  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setOverviewError(null);
      const data = await apiFetch<PublicOverview>('/api/public/overview');
      setOverview(data);
    } catch (err: any) {
      setOverviewError(err.message || 'Unable to load hospital directory.');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(routeFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const navigate = useCallback(
    (nextRoute: AppRoute, options?: { doctorId?: number; departmentId?: number }) => {
      setPreselectDeptId(options?.departmentId);
      setPreselectDoctorId(options?.doctorId);
      setRoute(nextRoute);
      const nextPath = pathFromRoute(nextRoute);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Navbar currentRoute={route} onNavigate={navigate} />

      {overviewError && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800 flex items-center justify-between gap-4">
            <span>{overviewError}</span>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="text-xs font-semibold underline whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {route === 'home' && (
          <HomePage overview={overview} loading={overviewLoading} onNavigate={navigate} />
        )}
        {route === 'doctors' && (
          <DoctorsPage
            doctors={overview?.doctors || []}
            departments={overview?.departments || []}
            loading={overviewLoading}
            onNavigate={navigate}
          />
        )}
        {route === 'departments' && (
          <DepartmentsPage
            departments={overview?.departments || []}
            doctors={overview?.doctors || []}
            loading={overviewLoading}
            onNavigate={navigate}
          />
        )}
        {route === 'appointment' && (
          <AppointmentBookingPage
            departments={overview?.departments || []}
            doctors={overview?.doctors || []}
            initialDepartmentId={preselectDeptId}
            initialDoctorId={preselectDoctorId}
            onNavigate={navigate}
          />
        )}
        {route === 'patient' && (
          <PatientPortalPage doctors={overview?.doctors || []} onNavigate={navigate} />
        )}
        {route === 'contact' && <ContactPage settings={overview?.settings || null} />}
        {route === 'admin' && (
          <AdminPanelPage
            hospitalSettings={overview?.settings || null}
            onDataChanged={() => void loadOverview()}
          />
        )}
      </main>

      <Footer settings={overview?.settings || null} onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HospitalShell />
    </AuthProvider>
  );
}
