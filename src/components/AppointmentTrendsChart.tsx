import React, { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppointmentTrendsResponse } from '../types';

interface AppointmentTrendsChartProps {
  data: AppointmentTrendsResponse | null;
  loading?: boolean;
  showDepartmentBreakdown?: boolean;
}

type SeriesMode = 'all' | 'total' | 'status';

interface CustomTooltipProps {
  active?: boolean;
  payload?: {
    name: string;
    value: number;
    color: string;
    payload?: {
      date: string;
      label: string;
    };
  }[];
}

function CustomTrendTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1.5">
      <p className="font-mono-tabular font-semibold text-slate-900 border-b border-slate-100 pb-1">
        {point?.label} ({point?.date})
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono-tabular font-semibold text-slate-900">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppointmentTrendsChart({
  data,
  loading = false,
  showDepartmentBreakdown = false,
}: AppointmentTrendsChartProps) {
  const [seriesMode, setSeriesMode] = useState<SeriesMode>('all');

  if (loading && !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="h-80 flex items-center justify-center text-sm text-slate-500">
          Loading 30-day appointment trend analytics...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
        Appointment trend data is currently unavailable.
      </div>
    );
  }

  const maxDeptCount = Math.max(1, ...data.departmentBreakdown.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        {/* Header & Series Filter */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-xs font-semibold text-blue-800">
              OPD Data Visualization · {data.startDate} to {data.endDate}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
              Daily Appointment Trends (Last 30 Days)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Daily appointment volume tracked across CHC Muribahal Hospital departments and
              statuses.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                { id: 'all', label: 'All Trends' },
                { id: 'total', label: 'Total Volume' },
                { id: 'status', label: 'By Status' },
              ] as { id: SeriesMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSeriesMode(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  seriesMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 30-Day Window Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500">30-Day Total Bookings</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
              {data.summary.total30Days}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500">Daily Average</p>
            <p className="mt-1 font-display text-2xl font-bold text-blue-800 tabular-nums">
              {data.summary.dailyAverage}
              <span className="text-xs font-normal text-slate-500 ml-1">/ day</span>
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500">Confirmed & Completed</p>
            <p className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
              {data.summary.confirmed30Days}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-4 py-3">
            <p className="text-xs text-slate-500">Peak OPD Day</p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              {data.summary.peakDay.count}{' '}
              <span className="text-xs font-mono-tabular font-medium text-slate-500">
                ({data.summary.peakDay.label})
              </span>
            </p>
          </div>
        </div>

        {/* Recharts Line Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data.days}
              margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                minTickGap={22}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTrendTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                height={32}
                wrapperStyle={{ fontSize: '12px' }}
              />

              {(seriesMode === 'all' || seriesMode === 'total') && (
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Appointments"
                  stroke="#1e40af"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: '#1e40af', strokeWidth: 0 }}
                  activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                />
              )}

              {(seriesMode === 'all' || seriesMode === 'status') && (
                <Line
                  type="monotone"
                  dataKey="confirmed"
                  name="Confirmed & Completed"
                  stroke="#047857"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}

              {(seriesMode === 'all' || seriesMode === 'status') && (
                <Line
                  type="monotone"
                  dataKey="pending"
                  name="Pending"
                  stroke="#b45309"
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}

              {(seriesMode === 'all' || seriesMode === 'status') && (
                <Line
                  type="monotone"
                  dataKey="cancelledOrRejected"
                  name="Cancelled / Rejected"
                  stroke="#be123c"
                  strokeWidth={1.75}
                  strokeDasharray="2 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Optional 30-Day Department Volume Breakdown */}
      {showDepartmentBreakdown && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Department Distribution (Last 30 Days)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Share of OPD appointments recorded by department over the 30-day window.
              </p>
            </div>
            <span className="text-xs font-mono-tabular font-semibold text-slate-600">
              {data.summary.total30Days} total
            </span>
          </div>

          {data.departmentBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500">No appointments recorded in the last 30 days.</p>
          ) : (
            <div className="space-y-3">
              {data.departmentBreakdown.map((dept) => {
                const pct = Math.round((dept.count / maxDeptCount) * 100);
                return (
                  <div key={dept.departmentName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{dept.departmentName}</span>
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {dept.count} appointments
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-800 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
