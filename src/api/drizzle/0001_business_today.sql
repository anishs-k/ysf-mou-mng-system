-- Purpose: Adds business_today(), the single definition of "today" for the whole
-- system. SPEC-01 section 6.2 requires the MOU status and every alert threshold to
-- be evaluated in Asia/Kolkata regardless of the server or session time zone, so
-- no query may use CURRENT_DATE or now()::date directly. This is a custom SQL
-- migration because drizzle-kit generates DDL from the TypeScript schema, and the
-- schema has no way to express a function.
--
-- STABLE, not IMMUTABLE, on purpose: it may be used in queries but not in a
-- generated column or an index predicate, because its value changes as the clock
-- advances. CREATE OR REPLACE keeps the migration re-appliable.

CREATE OR REPLACE FUNCTION business_today() RETURNS date
  LANGUAGE sql STABLE AS
  $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;
