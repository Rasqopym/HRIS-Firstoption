-- ============================================================
-- Firstoption HRIS — Attendance Multi-Branch, Geofencing & Field Work
-- ============================================================

-- 1. Extend company_settings with Work Hours, Multi-Branch Locations & Field Policy
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS work_start_time VARCHAR(10) DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS work_end_time VARCHAR(10) DEFAULT '17:00',
ADD COLUMN IF NOT EXISTS grace_period_minutes INT DEFAULT 15,
ADD COLUMN IF NOT EXISTS enable_lateness_tracking BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS enable_geofencing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allow_field_work BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS office_locations JSONB DEFAULT '[{"id":"loc-1","name":"Main Office","lat":6.5244,"lng":3.3792,"radius_meters":100,"is_active":true}]'::jsonb,
ADD COLUMN IF NOT EXISTS office_lat DOUBLE PRECISION DEFAULT 6.5244,
ADD COLUMN IF NOT EXISTS office_lng DOUBLE PRECISION DEFAULT 3.3792,
ADD COLUMN IF NOT EXISTS office_radius_meters INT DEFAULT 100,
ADD COLUMN IF NOT EXISTS office_address_label VARCHAR(255) DEFAULT 'Main Office';

-- 2. Extend attendance_records with clock-in/out timestamps, work mode & field details
ALTER TABLE attendance_records
ADD COLUMN IF NOT EXISTS clock_in_time VARCHAR(30),
ADD COLUMN IF NOT EXISTS clock_out_time VARCHAR(30),
ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS clock_in_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS clock_in_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS clock_in_distance_meters INT,
ADD COLUMN IF NOT EXISTS matched_location_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS work_mode VARCHAR(50) DEFAULT 'office', -- 'office' | 'field' | 'remote'
ADD COLUMN IF NOT EXISTS field_client_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS field_notes TEXT,
ADD COLUMN IF NOT EXISTS site_visits JSONB DEFAULT '[]'::jsonb;
