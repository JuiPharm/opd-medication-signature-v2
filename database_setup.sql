-- =========================================
-- OPD Medication Signature v2.0 - Database Setup
-- =========================================

-- 1. Create Transactions Table
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    hn TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    staff_name TEXT,
    receiver_type TEXT NOT NULL,
    signature_url TEXT,
    service_date DATE NOT NULL,
    device_id TEXT,
    status TEXT DEFAULT 'COMPLETED',
    drive_archive_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Staff Users Table
CREATE TABLE public.staff_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pin TEXT NOT NULL,
    role TEXT DEFAULT 'STAFF', -- 'ADMIN' or 'STAFF'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert a default admin user (PIN: 123456)
INSERT INTO public.staff_users (staff_id, name, pin, role) 
VALUES ('admin', 'System Admin', '123456', 'ADMIN');

-- 3. Storage Setup (Create the signatures bucket)
-- Note: You can also create this manually in the Supabase Dashboard
INSERT INTO storage.buckets (id, name, public) 
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Allow Public Access to the signatures bucket (so anon users can upload and view)
CREATE POLICY "Public Access" 
ON storage.objects FOR ALL 
USING ( bucket_id = 'signatures' );

-- 4. Disable Row Level Security (for simple custom PIN auth without Supabase JWT)
-- WARNING: In a production environment with public internet access, 
-- you should configure RLS properly. We disable it here because we are
-- using a custom PIN logic managed by the application.
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users DISABLE ROW LEVEL SECURITY;
