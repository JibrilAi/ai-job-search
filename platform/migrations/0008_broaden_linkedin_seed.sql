-- migrations/0006 hardcoded the global LinkedIn seed's location to Toronto,
-- which only made sense as a placeholder baseline -- it doesn't scale to a
-- multi-tenant platform where users are in different cities. Per-user
-- location scoping now comes from each individual's own profile via the
-- search-preferences feature (lib/scrapeQuerySuggestion.ts), so the shared
-- global seed should cast a wide net like freehire's does, not favor one
-- city. Drop the location filter from the existing row rather than
-- re-inserting, since 0006 already ran in production.
UPDATE scrape_queries
SET query_json = '{"query":"","jobage":7,"limit":15}'
WHERE id = 'seed-linkedin-toronto';
