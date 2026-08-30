-- Seed: LinkedIn's public jobs-guest search, scoped to Toronto/Canada (this
-- deployment's default market). jobage is in days; limit is deliberately
-- small relative to freehire's -- see lib/scrapers/linkedin.ts's Open Risk
-- note on bounding request volume against a portal that rate-limits scraping.
INSERT INTO scrape_queries (id, portal, query_json, enabled)
VALUES ('seed-linkedin-toronto', 'linkedin', '{"query":"","location":"Toronto, Ontario, Canada","jobage":7,"limit":15}', 1);
