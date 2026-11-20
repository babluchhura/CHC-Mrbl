import React, { useState } from 'react';
import { Clock, MapPin, Phone, Send, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { HospitalSettings } from '../types';
import { HospitalMap } from './HospitalMap';

interface ContactPageProps {
  settings: HospitalSettings | null;
}

export function ContactPage({ settings }: ContactPageProps) {
  const [form, setForm] = useState({
    senderName: '',
    mobileNumber: '',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hospitalName = settings?.hospitalName || 'CHC Muribahal Hospital';
  const address =
    settings?.address || 'Community Health Centre, Muribahal, District Balangir, Odisha, India';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSuccessMsg(res.message);
      setForm({ senderName: '', mobileNumber: '', subject: '', message: '' });
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to submit message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-sm font-medium text-blue-800">Hospital Location & Helpdesk</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-slate-900 tracking-tight">
          Contact CHC Muribahal Hospital
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl">
          CHC Muribahal Hospital, Muribahal, Odisha, India. Use the inquiry form below for general
          administration or outpatient scheduling questions.
        </p>
      </div>

      {/* Contact Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="w-4 h-4 text-blue-800" />
            Hospital Address
          </div>
          <p className="text-sm font-medium text-slate-900">{hospitalName}</p>
          <p className="text-sm text-slate-600 leading-relaxed">{address}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Phone className="w-4 h-4 text-blue-800" />
            Hospital Contact Number
          </div>
          <p className="font-mono-tabular text-base font-semibold text-slate-900">
            {settings?.contactPhone
              ? settings.contactPhone
              : 'To be configured by Hospital Admin'}
          </p>
          <div className="pt-1 flex items-start gap-2 text-xs text-slate-600">
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
            <span>
              {settings?.opdTimings ||
                'Monday – Saturday: 08:00 AM – 12:00 PM & 04:00 PM – 06:00 PM'}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
            <ShieldAlert className="w-4 h-4 text-rose-700" />
            Emergency Contact Information
          </div>
          <p className="text-sm text-slate-700">
            {settings?.emergencyHours || '24 × 7 Emergency & Casualty Services Open'}
          </p>
          <p className="text-xs text-slate-600">
            National Ambulance: <span className="font-mono-tabular font-semibold text-slate-900">108</span> ·
            Emergency: <span className="font-mono-tabular font-semibold text-slate-900">112</span>
          </p>
          {settings?.emergencyPhone && (
            <p className="text-xs text-slate-700">
              Hospital Casualty Desk:{' '}
              <span className="font-mono-tabular font-semibold text-slate-900">
                {settings.emergencyPhone}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Map + Contact Form Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Google Maps Location — Muribahal, Odisha
          </h2>
          <HospitalMap hospitalName={hospitalName} fallbackAddress={address} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Send an Inquiry</h2>
            <p className="text-xs text-slate-500 mt-1">
              Messages are delivered directly to the CHC Muribahal Hospital administrative inbox.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.senderName}
              onChange={(e) => setForm({ ...form, senderName: e.target.value })}
              placeholder="Your full name"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              10-Digit Mobile Number *
            </label>
            <input
              type="tel"
              required
              maxLength={10}
              value={form.mobileNumber}
              onChange={(e) =>
                setForm({ ...form, mobileNumber: e.target.value.replace(/\D/g, '') })
              }
              placeholder="10-digit mobile number"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject *</label>
            <input
              type="text"
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="e.g. OPD schedule question or certificate inquiry"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Message *</label>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Write your question or feedback..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 rounded-lg"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit Inquiry'}
          </button>
        </form>
      </div>
    </div>
  );
}
