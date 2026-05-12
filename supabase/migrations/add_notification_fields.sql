-- Add notification delivery fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_events jsonb DEFAULT '["payment_overdue", "handoff", "process_blocked"]';
