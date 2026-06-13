\connect community_db

ALTER TABLE public.community_post
    ALTER COLUMN content TYPE text;

ALTER TABLE public.community_post
    ADD COLUMN IF NOT EXISTS content_format character varying(255) NOT NULL DEFAULT 'PLAIN_TEXT';

ALTER TABLE public.community_post
    DROP CONSTRAINT IF EXISTS community_post_content_format_check;

ALTER TABLE public.community_post
    ADD CONSTRAINT community_post_content_format_check
        CHECK (((content_format)::text = ANY ((ARRAY['PLAIN_TEXT'::character varying, 'MARKDOWN'::character varying])::text[])));
