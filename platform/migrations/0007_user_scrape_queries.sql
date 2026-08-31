-- Lets a user's own profile shape what gets scraped, on top of the existing
-- global/admin scrape_queries rows (owner_user_id NULL). See
-- lib/scrapeQuerySuggestion.ts for how a query is derived from a profile.
ALTER TABLE scrape_queries ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_scrape_queries_owner ON scrape_queries(owner_user_id);
