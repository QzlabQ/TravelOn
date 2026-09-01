CREATE TABLE IF NOT EXISTS public.user_identities (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    real_name character varying(80) NOT NULL,
    document_type character varying(24) NOT NULL,
    document_number character varying(48) NOT NULL,
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_user_identities_user_id ON public.user_identities(user_id);

CREATE TABLE IF NOT EXISTS public.saved_bank_cards (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    card_number character varying(19) NOT NULL,
    label character varying(64) NOT NULL,
    created_at timestamp(6) with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_saved_bank_cards_user_card ON public.saved_bank_cards(user_id, card_number);
CREATE INDEX IF NOT EXISTS idx_saved_bank_cards_user ON public.saved_bank_cards(user_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_identities_set_updated_at') THEN
        CREATE TRIGGER trg_user_identities_set_updated_at
        BEFORE UPDATE ON public.user_identities
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    END IF;
END;
$$;