-- ============================================
-- ALTER TABLE Migration for Consultant Table
-- Run this in Supabase SQL Editor if you have an existing database
-- ============================================
-- 
-- This migration allows creating consultants without auth users initially.
-- Consultants can be created with empty/default values and linked to auth users later.
-- ============================================

-- Drop the foreign key constraint on id (we'll make it nullable and add it back conditionally)
ALTER TABLE consultant 
DROP CONSTRAINT IF EXISTS consultant_id_fkey;

-- Make id nullable (so we can create consultants without auth users)
ALTER TABLE consultant 
ALTER COLUMN id DROP NOT NULL;

-- Make email nullable (so we can create consultants with just a name)
ALTER TABLE consultant 
ALTER COLUMN email DROP NOT NULL;

-- Make consultant_code nullable (so we can create consultants with just a name)
ALTER TABLE consultant 
ALTER COLUMN consultant_code DROP NOT NULL;

-- Remove unique constraint on email temporarily (we'll add it back with a partial index)
ALTER TABLE consultant 
DROP CONSTRAINT IF EXISTS consultant_email_key;

-- Remove unique constraint on consultant_code temporarily
ALTER TABLE consultant 
DROP CONSTRAINT IF EXISTS consultant_code_key;

-- Add unique constraint on email only for non-null values
CREATE UNIQUE INDEX IF NOT EXISTS consultant_email_unique 
ON consultant (email) 
WHERE email IS NOT NULL;

-- Add unique constraint on consultant_code only for non-null values
CREATE UNIQUE INDEX IF NOT EXISTS consultant_code_unique 
ON consultant (consultant_code) 
WHERE consultant_code IS NOT NULL;

-- Add foreign key constraint back, but only for non-null ids
-- Note: PostgreSQL doesn't support conditional foreign keys directly,
-- so we'll use a trigger or just allow null ids without FK constraint
-- The application logic will handle linking consultants to auth users when they're invited

-- Add a trigger to validate id references auth.users when id is not null
CREATE OR REPLACE FUNCTION validate_consultant_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id IS NOT NULL THEN
        -- Check if the id exists in auth.users
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id) THEN
            RAISE EXCEPTION 'Consultant id must reference an existing auth user when provided';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_consultant_auth_user_trigger ON consultant;
CREATE TRIGGER validate_consultant_auth_user_trigger
    BEFORE INSERT OR UPDATE ON consultant
    FOR EACH ROW
    EXECUTE FUNCTION validate_consultant_auth_user();
