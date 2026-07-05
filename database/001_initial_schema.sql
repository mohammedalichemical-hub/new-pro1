-- ============================================================
-- نظام حجز مواعيد عيادة أسنان - المخطط الأساسي (المرحلة الأولى)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE appointment_status AS ENUM (
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'rescheduled'
);

CREATE TABLE doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- ساعات الدوام كـ JSON: {"sun":["09:00","17:00"], "mon":["09:00","17:00"], ...}
  working_hours JSONB NOT NULL DEFAULT '{}',
  slot_duration_minutes INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  -- رقم الواتساب هو المفتاح الأساسي للتعرف على المريض عبر البوت
  whatsapp_number TEXT NOT NULL UNIQUE,
  phone TEXT,
  birth_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patients_whatsapp ON patients(whatsapp_number);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  service_id UUID REFERENCES services(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp | manual
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_doctor_time ON appointments(doctor_id, start_time);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);

-- منع تداخل مواعيد نفس الطبيب على مستوى قاعدة البيانات
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT NOT NULL,
  direction TEXT NOT NULL, -- inbound | outbound
  message_text TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_number ON whatsapp_messages(whatsapp_number);

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_doctors_updated_at BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- بيانات تجريبية للبدء
INSERT INTO doctors (full_name, specialty, working_hours, slot_duration_minutes)
VALUES ('د. أحمد الدوري', 'طب أسنان عام',
  '{"sun":["09:00","17:00"],"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],"thu":["09:00","14:00"]}',
  30);

INSERT INTO services (name_ar, name_en, price, duration_minutes) VALUES
  ('تنظيف أسنان', 'Cleaning', 25000, 30),
  ('حشوة', 'Filling', 35000, 45),
  ('خلع سن', 'Extraction', 30000, 30),
  ('تقويم - جلسة متابعة', 'Braces Follow-up', 20000, 20);
