-- Minimal admin concept — just enough to gate the one feature that
-- genuinely needs it (the live backend console, which leaks cross-tenant
-- data if any logged-in account can see it). Not a general roles/permissions
-- system; that remains deliberately out of scope until there's a real need
-- for more than this one boolean. The first account ever created becomes
-- admin automatically (see routes/auth.js) — zero manual configuration,
-- consistent with the rest of this app's settings.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
