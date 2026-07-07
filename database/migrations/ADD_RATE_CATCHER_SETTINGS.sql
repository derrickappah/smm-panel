-- Add Rate Catcher Configuration Settings
INSERT INTO app_settings (key, value, description)
VALUES
    ('rate_catcher_exchange_rate', '15.0', 'Exchange rate used in Rate Change Catcher (USD to GHS)'),
    ('rate_catcher_markup_percent', '50.0', 'Default markup percentage used in Rate Change Catcher')
ON CONFLICT (key) DO NOTHING;
