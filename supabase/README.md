# Supabase Setup

1. Create a new Supabase project.
2. Open the SQL editor.
3. Run [`schema.sql`](schema.sql).
4. Copy the project URL and keys:
   - Use `service_role` only in GitHub Actions and local migration scripts.
   - Use `anon` only in the public dashboard.

The dashboard is public read-only in v1. The schema grants anonymous `select` permissions only to analytics views, not to the raw tables.

## Analytics Rules

- Steam returns cumulative `playtime_forever` values in minutes.
- The analytics views calculate deltas between adjacent snapshots.
- The first snapshot for each game has a `0` delta and acts as baseline.
- The boundary from `legacy_import` snapshots to the rebuilt collector is treated as a new baseline.
- Negative deltas are clamped to `0`.
- Dates use `Asia/Shanghai`.
- Weeks start on Monday via PostgreSQL `date_trunc('week', ...)`.
