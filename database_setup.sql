-- =========================================
-- OPD Medication Signature v2.1 - Multi-account / Pending Signature Setup
-- Safe to run more than once in Supabase SQL Editor.
-- SECURITY NOTE: Browser roles use RPC only. Patient/staff tables are not exposed directly.
-- =========================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.accounts (account_code, name, status)
VALUES ('default', 'Default Account', 'ACTIVE')
ON CONFLICT (account_code) DO UPDATE
SET name = EXCLUDED.name,
    status = EXCLUDED.status;

CREATE TABLE IF NOT EXISTS public.staff_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.accounts(id),
    staff_id TEXT NOT NULL,
    name TEXT NOT NULL,
    pin TEXT,
    pin_hash TEXT,
    role TEXT DEFAULT 'STAFF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.accounts(id),
    staff_user_id UUID NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.accounts(id),
    hn TEXT NOT NULL,
    vn TEXT,
    patient_first_name TEXT,
    patient_last_name TEXT,
    staff_id TEXT NOT NULL,
    staff_name TEXT,
    receiver_type TEXT NOT NULL,
    signature_url TEXT,
    service_date DATE NOT NULL,
    device_id TEXT,
    status TEXT DEFAULT 'COMPLETED',
    drive_archive_url TEXT,
    is_duplicate_confirmed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.signature_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id),
    hn TEXT NOT NULL,
    vn TEXT,
    patient_first_name TEXT,
    patient_last_name TEXT,
    receiver_type TEXT DEFAULT 'PATIENT',
    status TEXT DEFAULT 'PENDING',
    created_by_staff_user_id UUID REFERENCES public.staff_users(id),
    created_by_staff_id TEXT,
    created_by_staff_name TEXT,
    assigned_device_id TEXT,
    signature_url TEXT,
    signed_at TIMESTAMPTZ,
    completed_transaction_id UUID REFERENCES public.transactions(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.accounts(id),
    staff_user_id UUID REFERENCES public.staff_users(id),
    staff_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id);
ALTER TABLE public.staff_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.staff_users ALTER COLUMN pin DROP NOT NULL;
ALTER TABLE public.staff_sessions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS vn TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS patient_first_name TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS patient_last_name TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_duplicate_confirmed BOOLEAN DEFAULT FALSE;

UPDATE public.staff_users
SET account_id = (SELECT id FROM public.accounts WHERE account_code = 'default')
WHERE account_id IS NULL;

UPDATE public.staff_sessions ss
SET account_id = su.account_id
FROM public.staff_users su
WHERE ss.staff_user_id = su.id
  AND ss.account_id IS NULL;

UPDATE public.transactions
SET account_id = (SELECT id FROM public.accounts WHERE account_code = 'default')
WHERE account_id IS NULL;

ALTER TABLE public.staff_users ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.staff_sessions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN account_id SET NOT NULL;

ALTER TABLE public.staff_users DROP CONSTRAINT IF EXISTS staff_users_staff_id_key;
DROP INDEX IF EXISTS public.staff_users_staff_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_account_staff_uidx
ON public.staff_users(account_id, staff_id);

-- Seed/update default admin. Change this PIN after first login.
INSERT INTO public.staff_users (account_id, staff_id, name, pin, pin_hash, role)
VALUES (
    (SELECT id FROM public.accounts WHERE account_code = 'default'),
    'admin',
    'System Admin',
    NULL,
    crypt('123456', gen_salt('bf')),
    'ADMIN'
)
ON CONFLICT (account_id, staff_id) DO UPDATE
SET name = EXCLUDED.name,
    pin = NULL,
    pin_hash = EXCLUDED.pin_hash,
    role = 'ADMIN';

UPDATE public.staff_users
SET pin_hash = crypt(pin, gen_salt('bf')),
    pin = NULL
WHERE pin_hash IS NULL
  AND pin IS NOT NULL
  AND pin <> '';

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

REVOKE ALL ON public.accounts FROM anon, authenticated;
REVOKE ALL ON public.staff_users FROM anon, authenticated;
REVOKE ALL ON public.staff_sessions FROM anon, authenticated;
REVOKE ALL ON public.transactions FROM anon, authenticated;
REVOKE ALL ON public.signature_requests FROM anon, authenticated;
REVOKE ALL ON public.audit_logs FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct browser access to accounts" ON public.accounts;
CREATE POLICY "No direct browser access to accounts" ON public.accounts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No direct browser access to staff_users" ON public.staff_users;
CREATE POLICY "No direct browser access to staff_users" ON public.staff_users FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No direct browser access to staff_sessions" ON public.staff_sessions;
CREATE POLICY "No direct browser access to staff_sessions" ON public.staff_sessions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No direct browser access to transactions" ON public.transactions;
CREATE POLICY "No direct browser access to transactions" ON public.transactions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No direct browser access to signature_requests" ON public.signature_requests;
CREATE POLICY "No direct browser access to signature_requests" ON public.signature_requests FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No direct browser access to audit_logs" ON public.audit_logs;
CREATE POLICY "No direct browser access to audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- SECURITY NOTE: The bucket remains public for backward compatibility. Object names are UUID-based and never include HN.
DROP POLICY IF EXISTS "Public signatures access" ON storage.objects;
DROP POLICY IF EXISTS "Public signatures select" ON storage.objects;
DROP POLICY IF EXISTS "Public signatures insert" ON storage.objects;
CREATE POLICY "Public signatures select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'signatures');
CREATE POLICY "Public signatures insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'signatures');

-- Drop functions whose return signatures changed in v2.1 before recreating them.
DROP FUNCTION IF EXISTS public.require_staff_session(TEXT);
DROP FUNCTION IF EXISTS public.login_staff(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.login_staff(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.list_transactions(TEXT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.list_staff(TEXT);

CREATE OR REPLACE FUNCTION public.hash_session_token(p_token TEXT)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.write_audit(
    p_account_id UUID,
    p_staff_user_id UUID,
    p_staff_id TEXT,
    p_action TEXT,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    INSERT INTO public.audit_logs(account_id, staff_user_id, staff_id, action, entity_type, entity_id, details)
    VALUES (p_account_id, p_staff_user_id, p_staff_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details, '{}'::JSONB));
END;
$$;

CREATE OR REPLACE FUNCTION public.require_staff_session(p_session_token TEXT)
RETURNS TABLE (
    staff_user_id UUID,
    staff_id TEXT,
    staff_name TEXT,
    role TEXT,
    account_id UUID,
    account_code TEXT,
    account_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    DELETE FROM public.staff_sessions WHERE expires_at < NOW();

    RETURN QUERY
    SELECT su.id, su.staff_id, su.name, su.role, a.id, a.account_code, a.name
    FROM public.staff_sessions ss
    JOIN public.staff_users su ON su.id = ss.staff_user_id AND su.account_id = ss.account_id
    JOIN public.accounts a ON a.id = su.account_id
    WHERE ss.token_hash = public.hash_session_token(p_session_token)
      AND ss.expires_at > NOW()
      AND a.status = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session expired or invalid';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.login_staff(p_staff_id TEXT, p_pin TEXT, p_account_code TEXT DEFAULT 'default')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_staff public.staff_users%ROWTYPE;
    v_account public.accounts%ROWTYPE;
    v_token TEXT;
BEGIN
    SELECT * INTO v_account
    FROM public.accounts
    WHERE account_code = COALESCE(NULLIF(trim(p_account_code), ''), 'default')
      AND status = 'ACTIVE'
    LIMIT 1;

    IF v_account.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ไม่พบ account หรือ account ถูกปิดใช้งาน');
    END IF;

    SELECT * INTO v_staff
    FROM public.staff_users
    WHERE account_id = v_account.id
      AND staff_id = trim(p_staff_id)
    LIMIT 1;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'รหัสเจ้าหน้าที่หรือ PIN ไม่ถูกต้อง');
    END IF;

    IF v_staff.pin_hash IS NULL AND v_staff.pin IS NOT NULL AND v_staff.pin = trim(p_pin) THEN
        UPDATE public.staff_users
        SET pin_hash = crypt(trim(p_pin), gen_salt('bf')),
            pin = NULL
        WHERE id = v_staff.id
        RETURNING * INTO v_staff;
    END IF;

    IF v_staff.pin_hash IS NULL OR crypt(trim(p_pin), v_staff.pin_hash) <> v_staff.pin_hash THEN
        RETURN jsonb_build_object('ok', false, 'message', 'รหัสเจ้าหน้าที่หรือ PIN ไม่ถูกต้อง');
    END IF;

    v_token := replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '');

    INSERT INTO public.staff_sessions (account_id, staff_user_id, token_hash, expires_at)
    VALUES (v_account.id, v_staff.id, public.hash_session_token(v_token), NOW() + INTERVAL '12 hours');

    PERFORM public.write_audit(v_account.id, v_staff.id, v_staff.staff_id, 'login', 'staff_users', v_staff.id);

    RETURN jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
            'sessionToken', v_token,
            'staffId', v_staff.staff_id,
            'staffName', v_staff.name,
            'role', v_staff.role,
            'accountId', v_account.id,
            'accountCode', v_account.account_code,
            'accountName', v_account.name
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_duplicate(p_session_token TEXT, p_hn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_tx RECORD;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);

    IF p_hn !~ '^07-[0-9]{2}-[0-9]{6}$' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)');
    END IF;

    SELECT id, created_at, staff_name INTO v_tx
    FROM public.transactions
    WHERE account_id = v_session.account_id
      AND hn = p_hn
      AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tx.id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'code', 'DUPLICATE_FOUND', 'message', 'พบรายการรับยาซ้ำ',
            'data', jsonb_build_object('recordId', v_tx.id, 'submittedAt', v_tx.created_at, 'staffName', v_tx.staff_name));
    END IF;

    RETURN jsonb_build_object('ok', true, 'code', 'SUCCESS');
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_transaction(
    p_session_token TEXT,
    p_hn TEXT,
    p_receiver_type TEXT,
    p_signature_url TEXT,
    p_device_id TEXT DEFAULT 'v2-web',
    p_is_duplicate_confirmed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_record public.transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);

    IF p_hn !~ '^07-[0-9]{2}-[0-9]{6}$' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)');
    END IF;

    IF p_receiver_type NOT IN ('PATIENT', 'RELATIVE') THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ประเภทผู้รับยาไม่ถูกต้อง');
    END IF;

    INSERT INTO public.transactions (
        account_id, hn, staff_id, staff_name, receiver_type, signature_url,
        service_date, device_id, is_duplicate_confirmed
    )
    VALUES (
        v_session.account_id, p_hn, v_session.staff_id, v_session.staff_name, p_receiver_type, p_signature_url,
        CURRENT_DATE, COALESCE(p_device_id, 'v2-web'), COALESCE(p_is_duplicate_confirmed, FALSE)
    )
    RETURNING * INTO v_record;

    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'submit_transaction', 'transactions', v_record.id);

    RETURN jsonb_build_object('ok', true, 'message', 'บันทึกข้อมูลเรียบร้อยแล้ว',
        'data', jsonb_build_object('recordId', v_record.id, 'serverTime', v_record.created_at,
        'serviceDate', v_record.service_date, 'staffId', v_record.staff_id, 'staffName', v_record.staff_name));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_transactions(p_session_token TEXT, p_hn TEXT DEFAULT NULL, p_service_date DATE DEFAULT NULL)
RETURNS TABLE (
    id UUID, created_at TIMESTAMPTZ, hn TEXT, vn TEXT, patient_first_name TEXT, patient_last_name TEXT,
    staff_id TEXT, staff_name TEXT, receiver_type TEXT, signature_url TEXT, drive_archive_url TEXT, service_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);

    RETURN QUERY
    SELECT t.id, t.created_at, t.hn, t.vn, t.patient_first_name, t.patient_last_name,
           t.staff_id, t.staff_name, t.receiver_type, t.signature_url, t.drive_archive_url, t.service_date
    FROM public.transactions t
    WHERE t.account_id = v_session.account_id
      AND (p_hn IS NULL OR t.hn = p_hn)
      AND (p_service_date IS NULL OR t.service_date = p_service_date)
    ORDER BY t.created_at DESC
    LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_staff(p_session_token TEXT)
RETURNS TABLE (id UUID, staff_id TEXT, name TEXT, role TEXT, account_code TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;

    RETURN QUERY
    SELECT su.id, su.staff_id, su.name, su.role, v_session.account_code, su.created_at
    FROM public.staff_users su
    WHERE su.account_id = v_session.account_id
    ORDER BY su.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_staff(p_session_token TEXT, p_staff_id TEXT, p_name TEXT, p_pin TEXT, p_role TEXT DEFAULT 'STAFF')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_role TEXT := upper(coalesce(p_role, 'STAFF'));
    v_new public.staff_users%ROWTYPE;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;
    IF v_role NOT IN ('ADMIN', 'STAFF', 'SIGNING_DEVICE') THEN
        v_role := 'STAFF';
    END IF;
    IF trim(coalesce(p_staff_id, '')) = '' OR trim(coalesce(p_name, '')) = '' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'กรุณากรอกรหัสและชื่อพนักงาน');
    END IF;
    IF trim(coalesce(p_pin, '')) !~ '^[0-9]{4,6}$' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'PIN ต้องเป็นตัวเลข 4-6 หลัก');
    END IF;

    INSERT INTO public.staff_users (account_id, staff_id, name, pin, pin_hash, role)
    VALUES (v_session.account_id, trim(p_staff_id), trim(p_name), NULL, crypt(trim(p_pin), gen_salt('bf')), v_role)
    RETURNING * INTO v_new;

    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'add_staff', 'staff_users', v_new.id,
        jsonb_build_object('role', v_role));
    RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'message', 'รหัสพนักงานนี้มีอยู่แล้วใน account นี้');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_staff(p_session_token TEXT, p_staff_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_target public.staff_users%ROWTYPE;
    v_admin_count INTEGER;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role <> 'ADMIN' THEN
        RAISE EXCEPTION 'Admin role required';
    END IF;
    SELECT * INTO v_target FROM public.staff_users WHERE id = p_staff_user_id AND account_id = v_session.account_id;
    IF v_target.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ไม่พบพนักงานใน account นี้');
    END IF;
    IF v_target.id = v_session.staff_user_id THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่');
    END IF;
    IF v_target.role = 'ADMIN' THEN
        SELECT count(*) INTO v_admin_count FROM public.staff_users WHERE account_id = v_session.account_id AND role = 'ADMIN';
        IF v_admin_count <= 1 THEN
            RETURN jsonb_build_object('ok', false, 'message', 'ต้องมี ADMIN อย่างน้อย 1 คนใน account');
        END IF;
    END IF;
    DELETE FROM public.staff_users WHERE id = p_staff_user_id AND account_id = v_session.account_id;
    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'delete_staff', 'staff_users', p_staff_user_id);
    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_signature_request(
    p_session_token TEXT,
    p_hn TEXT,
    p_vn TEXT DEFAULT NULL,
    p_patient_first_name TEXT DEFAULT NULL,
    p_patient_last_name TEXT DEFAULT NULL,
    p_receiver_type TEXT DEFAULT 'PATIENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_request public.signature_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role NOT IN ('ADMIN', 'STAFF') THEN
        RAISE EXCEPTION 'Staff role required';
    END IF;
    IF p_hn !~ '^07-[0-9]{2}-[0-9]{6}$' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'รูปแบบ HN ไม่ถูกต้อง (ต้องเป็น 07-XX-XXXXXX)');
    END IF;
    INSERT INTO public.signature_requests (
        account_id, hn, vn, patient_first_name, patient_last_name, receiver_type,
        status, created_by_staff_user_id, created_by_staff_id, created_by_staff_name
    )
    VALUES (
        v_session.account_id, p_hn, NULLIF(trim(coalesce(p_vn, '')), ''),
        NULLIF(trim(coalesce(p_patient_first_name, '')), ''),
        NULLIF(trim(coalesce(p_patient_last_name, '')), ''),
        CASE WHEN p_receiver_type IN ('PATIENT', 'RELATIVE') THEN p_receiver_type ELSE 'PATIENT' END,
        'PENDING', v_session.staff_user_id, v_session.staff_id, v_session.staff_name
    )
    RETURNING * INTO v_request;
    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'create_signature_request', 'signature_requests', v_request.id);
    RETURN jsonb_build_object('ok', true, 'data', row_to_json(v_request));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_signature_request(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_request RECORD;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role NOT IN ('ADMIN', 'STAFF', 'SIGNING_DEVICE') THEN
        RAISE EXCEPTION 'Signing role required';
    END IF;
    SELECT id, hn, vn, patient_first_name, patient_last_name, receiver_type, status, created_at INTO v_request
    FROM public.signature_requests
    WHERE account_id = v_session.account_id
      AND status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 1;
    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'code', 'NO_PENDING');
    END IF;
    RETURN jsonb_build_object('ok', true, 'code', 'PENDING_FOUND', 'data', row_to_json(v_request));
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_signature_request(p_session_token TEXT, p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_request public.signature_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role NOT IN ('ADMIN', 'STAFF', 'SIGNING_DEVICE') THEN
        RAISE EXCEPTION 'Signing role required';
    END IF;
    UPDATE public.signature_requests
    SET status = 'SIGNING',
        assigned_device_id = v_session.staff_id,
        updated_at = NOW()
    WHERE id = p_request_id
      AND account_id = v_session.account_id
      AND status = 'PENDING'
    RETURNING * INTO v_request;
    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'รายการนี้ถูกดึงไปเซ็นแล้วหรือไม่พบใน account นี้');
    END IF;
    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'claim_signature_request', 'signature_requests', v_request.id);
    RETURN jsonb_build_object('ok', true, 'data', row_to_json(v_request));
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_signature_request(p_session_token TEXT, p_request_id UUID, p_signature_url TEXT, p_device_id TEXT DEFAULT 'v2-web')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_request public.signature_requests%ROWTYPE;
    v_record public.transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role NOT IN ('ADMIN', 'STAFF', 'SIGNING_DEVICE') THEN
        RAISE EXCEPTION 'Signing role required';
    END IF;
    SELECT * INTO v_request
    FROM public.signature_requests
    WHERE id = p_request_id
      AND account_id = v_session.account_id
      AND status IN ('PENDING', 'SIGNING')
    FOR UPDATE;
    IF v_request.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ไม่พบ request ที่รอเซ็นใน account นี้');
    END IF;

    INSERT INTO public.transactions (
        account_id, hn, vn, patient_first_name, patient_last_name,
        staff_id, staff_name, receiver_type, signature_url, service_date, device_id
    )
    VALUES (
        v_session.account_id, v_request.hn, v_request.vn, v_request.patient_first_name, v_request.patient_last_name,
        COALESCE(v_request.created_by_staff_id, v_session.staff_id),
        COALESCE(v_request.created_by_staff_name, v_session.staff_name),
        COALESCE(v_request.receiver_type, 'PATIENT'),
        p_signature_url, CURRENT_DATE, COALESCE(p_device_id, 'v2-web')
    )
    RETURNING * INTO v_record;

    UPDATE public.signature_requests
    SET status = 'COMPLETED',
        signature_url = p_signature_url,
        signed_at = NOW(),
        completed_transaction_id = v_record.id,
        updated_at = NOW()
    WHERE id = v_request.id;

    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'complete_signature_request', 'signature_requests', v_request.id,
        jsonb_build_object('transaction_id', v_record.id));
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('recordId', v_record.id, 'serverTime', v_record.created_at,
        'serviceDate', v_record.service_date, 'staffId', v_record.staff_id, 'staffName', v_record.staff_name));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_signature_request(p_session_token TEXT, p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session RECORD;
    v_updated UUID;
BEGIN
    SELECT * INTO v_session FROM public.require_staff_session(p_session_token);
    IF v_session.role NOT IN ('ADMIN', 'STAFF') THEN
        RAISE EXCEPTION 'Staff role required';
    END IF;
    UPDATE public.signature_requests
    SET status = 'CANCELLED', updated_at = NOW()
    WHERE id = p_request_id
      AND account_id = v_session.account_id
      AND status IN ('PENDING', 'SIGNING')
    RETURNING id INTO v_updated;
    IF v_updated IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'ไม่พบ request ที่ยกเลิกได้ใน account นี้');
    END IF;
    PERFORM public.write_audit(v_session.account_id, v_session.staff_user_id, v_session.staff_id, 'cancel_signature_request', 'signature_requests', p_request_id);
    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.hash_session_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_audit(UUID, UUID, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_staff_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_staff(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_duplicate(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_transactions(TEXT, TEXT, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_staff(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_staff(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_signature_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_signature_request(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signature_request(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signature_request(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_signature_request(TEXT, UUID) TO anon, authenticated;
