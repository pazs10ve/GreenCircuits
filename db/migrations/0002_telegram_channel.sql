-- Telegram joins the alert delivery channels.
ALTER TABLE app.alert DROP CONSTRAINT alert_channels_check;
ALTER TABLE app.alert ADD CONSTRAINT alert_channels_check
  CHECK (channels <@ ARRAY['IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'TELEGRAM']);
ALTER TABLE app.notification_delivery DROP CONSTRAINT notification_delivery_channel_check;
ALTER TABLE app.notification_delivery ADD CONSTRAINT notification_delivery_channel_check
  CHECK (channel IN ('IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'TELEGRAM'));
