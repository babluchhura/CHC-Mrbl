import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('patient'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  designation: text('designation').notNull().default('Hospital Administrator'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const patients = pgTable('patients', {
  id: serial('id').primaryKey(),
  patientCode: text('patient_code').notNull().unique(),
  userUid: text('user_uid').notNull().unique(),
  fullName: text('full_name').notNull(),
  mobileNumber: text('mobile_number').notNull().unique(),
  mobileVerified: boolean('mobile_verified').notNull().default(false),
  dateOfBirth: text('date_of_birth').notNull(),
  age: integer('age').notNull(),
  gender: text('gender').notNull(),
  address: text('address').notNull(),
  village: text('village').notNull(),
  district: text('district').notNull().default('Balangir'),
  state: text('state').notNull().default('Odisha'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const otpChallenges = pgTable('otp_challenges', {
  id: serial('id').primaryKey(),
  mobileNumber: text('mobile_number').notNull(),
  purpose: text('purpose').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumed: boolean('consumed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  opdHours: text('opd_hours').notNull().default('08:00 AM - 02:00 PM'),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const doctors = pgTable('doctors', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  qualification: text('qualification').notNull(),
  specialization: text('specialization').notNull(),
  departmentId: integer('department_id')
    .references(() => departments.id, { onDelete: 'restrict' })
    .notNull(),
  experienceYears: integer('experience_years').notNull().default(0),
  availableDays: text('available_days').notNull(),
  availableTime: text('available_time').notNull(),
  consultationInfo: text('consultation_info')
    .notNull()
    .default('OPD Consultation — Public Healthcare Services'),
  availabilityStatus: text('availability_status').notNull().default('Available'),
  photoUrl: text('photo_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const doctorSchedules = pgTable('doctor_schedules', {
  id: serial('id').primaryKey(),
  doctorId: integer('doctor_id')
    .references(() => doctors.id, { onDelete: 'cascade' })
    .notNull(),
  dayOfWeek: text('day_of_week').notNull(),
  slotLabel: text('slot_label').notNull(),
  maxAppointments: integer('max_appointments').notNull().default(5),
  isActive: boolean('is_active').notNull().default(true),
});

export const doctorLeaves = pgTable('doctor_leaves', {
  id: serial('id').primaryKey(),
  doctorId: integer('doctor_id')
    .references(() => doctors.id, { onDelete: 'cascade' })
    .notNull(),
  leaveDate: text('leave_date').notNull(),
  reason: text('reason').notNull().default('Authorized Leave'),
});

export const hospitalHolidays = pgTable('hospital_holidays', {
  id: serial('id').primaryKey(),
  holidayDate: text('holiday_date').notNull().unique(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  appointmentCode: text('appointment_code').notNull().unique(),
  patientId: integer('patient_id')
    .references(() => patients.id, { onDelete: 'cascade' })
    .notNull(),
  departmentId: integer('department_id')
    .references(() => departments.id, { onDelete: 'restrict' })
    .notNull(),
  doctorId: integer('doctor_id')
    .references(() => doctors.id, { onDelete: 'restrict' })
    .notNull(),
  appointmentDate: text('appointment_date').notNull(),
  timeSlot: text('time_slot').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('Pending'),
  adminNotes: text('admin_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .references(() => patients.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('info'),
  isRead: boolean('is_read').notNull().default(false),
  smsStatus: text('sms_status').notNull().default('not_configured'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const contactMessages = pgTable('contact_messages', {
  id: serial('id').primaryKey(),
  senderName: text('sender_name').notNull(),
  mobileNumber: text('mobile_number').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('New'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const hospitalSettings = pgTable('hospital_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  hospitalName: text('hospital_name').notNull().default('CHC Muribahal Hospital'),
  address: text('address')
    .notNull()
    .default('Community Health Centre, Muribahal, District Balangir, Odisha, India'),
  contactPhone: text('contact_phone').notNull().default(''),
  emergencyPhone: text('emergency_phone').notNull().default(''),
  opdTimings: text('opd_timings')
    .notNull()
    .default('Monday – Saturday: 08:00 AM – 12:00 PM & 04:00 PM – 06:00 PM'),
  emergencyHours: text('emergency_hours')
    .notNull()
    .default('24 × 7 Emergency & Casualty Services Open'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const patientDocuments = pgTable('patient_documents', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .references(() => patients.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  category: text('category').notNull().default('Lab Report'),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storageBucket: text('storage_bucket').notNull(),
  storagePath: text('storage_path').notNull().unique(),
  uploadedByRole: text('uploaded_by_role').notNull().default('patient'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const departmentsRelations = relations(departments, ({ many }) => ({
  doctors: many(doctors),
  appointments: many(appointments),
}));

export const doctorsRelations = relations(doctors, ({ one, many }) => ({
  department: one(departments, {
    fields: [doctors.departmentId],
    references: [departments.id],
  }),
  schedules: many(doctorSchedules),
  leaves: many(doctorLeaves),
  appointments: many(appointments),
}));

export const patientsRelations = relations(patients, ({ many }) => ({
  appointments: many(appointments),
  notifications: many(notifications),
  documents: many(patientDocuments),
}));

export const patientDocumentsRelations = relations(patientDocuments, ({ one }) => ({
  patient: one(patients, {
    fields: [patientDocuments.patientId],
    references: [patients.id],
  }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  patient: one(patients, {
    fields: [appointments.patientId],
    references: [patients.id],
  }),
  department: one(departments, {
    fields: [appointments.departmentId],
    references: [departments.id],
  }),
  doctor: one(doctors, {
    fields: [appointments.doctorId],
    references: [doctors.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  patient: one(patients, {
    fields: [notifications.patientId],
    references: [patients.id],
  }),
}));
