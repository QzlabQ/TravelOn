-- Preserve monetary values exactly and normalize existing rows to two decimals.
-- Run this migration against the hotel, transport and reservation databases
-- before deploying the corresponding services.

ALTER TABLE IF EXISTS room
    ALTER COLUMN price_per_adult TYPE numeric(12,2)
    USING round(price_per_adult::numeric, 2);

ALTER TABLE IF EXISTS ticket_offer_templates
    ALTER COLUMN price TYPE numeric(12,2)
    USING round(price::numeric, 2);

ALTER TABLE IF EXISTS reservation
    ALTER COLUMN price TYPE numeric(12,2)
    USING round(price::numeric, 2);

ALTER TABLE IF EXISTS payment_transaction
    ALTER COLUMN amount TYPE numeric(12,2)
    USING round(amount::numeric, 2);

ALTER TABLE IF EXISTS refund_record
    ALTER COLUMN amount TYPE numeric(12,2)
    USING round(amount::numeric, 2);
