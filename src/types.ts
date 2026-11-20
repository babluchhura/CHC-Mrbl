export interface HospitalSettings {
  id: number;
  settingKey: string;
  hospitalName: string;
  address: string;
  contactPhone: string;
  emergencyPhone: string;
  opdTimings: string;
  emergencyHours: string;
}

export interface Department {
  id: number;
  name: string;
  description: string;
  opdHours: string;
  isActive: boolean;
  displayOrder: number;
}

export interface DoctorSchedule {
  id: number;
  doctorId: number;
  dayOfWeek: string;
  slotLabel: string;
  maxAppointments: number;
  isActive: boolean;
}

export interface DoctorLeave {
  id: number;
  doctorId: number;
  leaveDate: string;
  reason: string;
}

export interface Doctor {
  id: number;
  fullName: string;
  qualification: string;
  specialization: string;
  departmentId: number;
  departmentName: string;
  experienceYears: number;
  availableDays: string;
  availableTime: string;
  consultationInfo: string;
  availabilityStatus: 'Available' | 'Unavailable' | 'On Leave' | 'Emergency Duty' | string;
  photoUrl: string | null;
  isActive: boolean;
  schedules?: DoctorSchedule[];
  upcomingLeaves?: DoctorLeave[];
  leaves?: DoctorLeave[];
}

export interface HospitalHoliday {
  id: number;
  holidayDate: string;
  title: string;
}

export interface PublicOverview {
  settings: HospitalSettings;
  departments: Department[];
  doctors: Doctor[];
  holidays: HospitalHoliday[];
  stats: {
    departmentsCount: number;
    doctorsCount: number;
    availableDoctorsCount: number;
  };
  smsConfigured: boolean;
}

export interface PatientProfile {
  id: number;
  patientCode: string;
  userUid: string;
  fullName: string;
  mobileNumber: string;
  mobileVerified: boolean;
  dateOfBirth: string;
  age: number;
  gender: string;
  address: string;
  village: string;
  district: string;
  state: string;
  createdAt: string;
}

export interface PatientDocument {
  id: number;
  patientId: number;
  title: string;
  category: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageBucket: string;
  storagePath: string;
  uploadedByRole: string;
  createdAt: string;
}

export interface SessionInfo {
  uid: string;
  email: string;
  phone: string;
  displayName: string;
  role: 'admin' | 'patient';
  isAdmin: boolean;
  patient: PatientProfile | null;
  unreadNotifications: number;
  smsConfigured: boolean;
  storageConfigured: boolean;
}

export interface BookableSlot {
  id: number;
  slotLabel: string;
  maxAppointments: number;
  bookedCount: number;
  remaining: number;
  bookable: boolean;
}

export interface AvailabilityResponse {
  bookable: boolean;
  reason?: string;
  dayOfWeek?: string;
  emergencyDutyNotice?: string | null;
  slots: BookableSlot[];
}

export interface PatientAppointment {
  id: number;
  appointmentCode: string;
  appointmentDate: string;
  timeSlot: string;
  reason: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Completed' | 'Cancelled' | string;
  adminNotes: string | null;
  createdAt: string;
  doctorId: number;
  doctorName: string;
  doctorQualification: string;
  doctorStatus: string;
  departmentId: number;
  departmentName: string;
}

export interface PatientNotification {
  id: number;
  patientId: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  smsStatus: string;
  createdAt: string;
}

export interface AdminDashboardMetrics {
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  totalDoctors: number;
  availableDoctors: number;
  unavailableDoctors: number;
  unreadMessages: number;
}

export interface DailyAppointmentTrendPoint {
  date: string;
  label: string;
  total: number;
  confirmed: number;
  pending: number;
  cancelledOrRejected: number;
}

export interface AppointmentTrendsResponse {
  startDate: string;
  endDate: string;
  days: DailyAppointmentTrendPoint[];
  summary: {
    total30Days: number;
    confirmed30Days: number;
    pending30Days: number;
    cancelled30Days: number;
    dailyAverage: number;
    peakDay: {
      date: string;
      label: string;
      count: number;
    };
  };
  departmentBreakdown: {
    departmentName: string;
    count: number;
  }[];
}

export interface AdminAppointmentRow {
  id: number;
  appointmentCode: string;
  appointmentDate: string;
  timeSlot: string;
  reason: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  patientId: number;
  patientCode: string;
  patientName: string;
  patientMobile: string;
  patientVillage: string;
  doctorId: number;
  doctorName: string;
  departmentId: number;
  departmentName: string;
}

export interface ContactMessageRow {
  id: number;
  senderName: string;
  mobileNumber: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface AuthorizedAdminRow {
  id: number;
  email: string;
  fullName: string;
  designation: string;
  isActive: boolean;
  createdAt: string;
}

export type AppRoute =
  | 'home'
  | 'doctors'
  | 'departments'
  | 'appointment'
  | 'patient'
  | 'contact'
  | 'admin';
