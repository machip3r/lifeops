-- Office-scoped tags with a section (consultant | client).
-- Assignments for consultants via consultant_tag; client_tag can be added later.

-- ============================================
-- 1. tag catalog
-- ============================================
CREATE TABLE IF NOT EXISTS tag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('consultant', 'client')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT tag_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tag_office_section_name_unique
ON tag (office_id, section, lower(trim(name)));

CREATE INDEX IF NOT EXISTS idx_tag_office_section ON tag (office_id, section);

CREATE TRIGGER update_tag_updated_at
BEFORE UPDATE ON tag
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- ============================================
-- 2. consultant ↔ tag
-- ============================================
CREATE TABLE IF NOT EXISTS consultant_tag (
    consultant_id UUID NOT NULL REFERENCES consultant (id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (consultant_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_consultant_tag_tag_id ON consultant_tag (tag_id);

CREATE OR REPLACE FUNCTION public.check_consultant_tag_section()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    tag_section TEXT;
    tag_office UUID;
    consultant_office UUID;
BEGIN
    SELECT t.section, t.office_id INTO tag_section, tag_office
    FROM tag t
    WHERE t.id = NEW.tag_id;

    IF tag_section IS NULL THEN
        RAISE EXCEPTION 'Tag not found';
    END IF;

    IF tag_section <> 'consultant' THEN
        RAISE EXCEPTION 'Tag section must be consultant for consultant_tag';
    END IF;

    SELECT c.office_id INTO consultant_office
    FROM consultant c
    WHERE c.id = NEW.consultant_id;

    IF consultant_office IS NULL THEN
        RAISE EXCEPTION 'Consultant not found';
    END IF;

    IF tag_office <> consultant_office THEN
        RAISE EXCEPTION 'Tag and consultant must belong to the same office';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_consultant_tag_section ON consultant_tag;
CREATE TRIGGER trg_check_consultant_tag_section
BEFORE INSERT OR UPDATE ON consultant_tag
FOR EACH ROW
EXECUTE FUNCTION check_consultant_tag_section();

-- ============================================
-- 3. RLS — tag
-- ============================================
ALTER TABLE tag ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Offices can view own tags" ON tag;
DROP POLICY IF EXISTS "Consultants can view office tags" ON tag;
DROP POLICY IF EXISTS "Offices can insert tags" ON tag;
DROP POLICY IF EXISTS "Offices can update tags" ON tag;
DROP POLICY IF EXISTS "Offices can delete tags" ON tag;

CREATE POLICY "Offices can view own tags" ON tag
FOR SELECT TO authenticated
USING (office_id = (SELECT auth.uid()));

CREATE POLICY "Consultants can view office tags" ON tag
FOR SELECT TO authenticated
USING (
    office_id IN (
        SELECT office_id FROM consultant
        WHERE id = (SELECT auth.uid())
           OR auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Offices can insert tags" ON tag
FOR INSERT TO authenticated
WITH CHECK (office_id = (SELECT auth.uid()));

CREATE POLICY "Offices can update tags" ON tag
FOR UPDATE TO authenticated
USING (office_id = (SELECT auth.uid()))
WITH CHECK (office_id = (SELECT auth.uid()));

CREATE POLICY "Offices can delete tags" ON tag
FOR DELETE TO authenticated
USING (office_id = (SELECT auth.uid()));

-- ============================================
-- 4. RLS — consultant_tag
-- ============================================
ALTER TABLE consultant_tag ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Offices can view consultant tags" ON consultant_tag;
DROP POLICY IF EXISTS "Consultants can view own tags" ON consultant_tag;
DROP POLICY IF EXISTS "Offices can insert consultant tags" ON consultant_tag;
DROP POLICY IF EXISTS "Offices can delete consultant tags" ON consultant_tag;

CREATE POLICY "Offices can view consultant tags" ON consultant_tag
FOR SELECT TO authenticated
USING (
    consultant_id IN (
        SELECT id FROM consultant WHERE office_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can view own tags" ON consultant_tag
FOR SELECT TO authenticated
USING (
    consultant_id = (SELECT auth.uid())
    OR consultant_id IN (
        SELECT id FROM consultant WHERE auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Offices can insert consultant tags" ON consultant_tag
FOR INSERT TO authenticated
WITH CHECK (
    consultant_id IN (
        SELECT id FROM consultant WHERE office_id = (SELECT auth.uid())
    )
    AND tag_id IN (
        SELECT id FROM tag WHERE office_id = (SELECT auth.uid()) AND section = 'consultant'
    )
);

CREATE POLICY "Offices can delete consultant tags" ON consultant_tag
FOR DELETE TO authenticated
USING (
    consultant_id IN (
        SELECT id FROM consultant WHERE office_id = (SELECT auth.uid())
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tag TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE consultant_tag TO authenticated;
GRANT ALL ON TABLE tag TO service_role;
GRANT ALL ON TABLE consultant_tag TO service_role;
