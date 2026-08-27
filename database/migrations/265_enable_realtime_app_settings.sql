-- Enable realtime for app_settings table
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'app_settings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
    END IF;
  END IF;
END \$\$;
