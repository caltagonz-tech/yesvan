-- Add separate SMTP host column for email sending
ALTER TABLE users ADD COLUMN IF NOT EXISTS roundcube_smtp_host text;
