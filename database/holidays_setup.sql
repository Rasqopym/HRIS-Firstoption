-- ============================================================
-- Firstoption HRIS — Public Holidays Configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS public_holidays (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  holiday_date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert statutory default holidays if not present
INSERT INTO public_holidays (id, name, holiday_date, is_recurring, description)
VALUES 
  ('hol-new-year', 'New Year''s Day', '2026-01-01', TRUE, 'Statutory national holiday'),
  ('hol-workers-day', 'Workers'' Day', '2026-05-01', TRUE, 'International Workers Day'),
  ('hol-democracy-day', 'Democracy Day', '2026-06-12', TRUE, 'National Democracy Day'),
  ('hol-independence-day', 'Independence Day', '2026-10-01', TRUE, 'National Independence Day'),
  ('hol-christmas', 'Christmas Day', '2026-12-25', TRUE, 'Christmas Day celebration'),
  ('hol-boxing-day', 'Boxing Day', '2026-12-26', TRUE, 'Boxing Day statutory holiday')
ON CONFLICT (id) DO NOTHING;

-- Extend company_settings with custom_holidays JSONB cache
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS custom_holidays JSONB DEFAULT '[]'::jsonb;
