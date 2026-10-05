-- Phase 1: remove office tags (catalog + consultant assignments).
-- UI and adapters are removed in the same change; restore only with an explicit product decision.

DROP TRIGGER IF EXISTS trg_check_consultant_tag_section ON consultant_tag;
DROP FUNCTION IF EXISTS public.check_consultant_tag_section();

DROP TABLE IF EXISTS consultant_tag CASCADE;
DROP TABLE IF EXISTS tag CASCADE;
