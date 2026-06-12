ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS role character varying(16) NOT NULL DEFAULT 'USER';

UPDATE public.users
SET role = 'USER'
WHERE role IS NULL OR role = '';
