-- Seeds a starter set of Greenhouse/Lever board tokens so the new
-- scrapers (lib/scrapers/greenhouse.ts, lever.ts) do something useful out
-- of the box, without requiring manual admin configuration first.
--
-- Unlike freehire.me's single global search API, Greenhouse and Lever are
-- per-company boards -- there's no "search everything" endpoint, so
-- query_json's "query" here is a comma-separated list of board
-- tokens/slugs (each company's board URL slug), not a keyword.
--
-- IMPORTANT: this sandbox's network policy blocks direct requests to
-- boards-api.greenhouse.io and api.lever.co, so these specific tokens are
-- a best-effort list based on public knowledge, NOT verified live against
-- either API. A wrong/stale token 404s and is silently skipped (see
-- fetchBoard/fetchPostings in the scraper files) -- harmless, but means
-- this seed may need real tokens swapped in after checking which ones
-- actually resolve. Update or add rows via the admin scrape_queries table
-- once you've confirmed real board tokens for companies relevant to your
-- users.
INSERT INTO scrape_queries (id, portal, query_json, enabled)
VALUES
  ('seed-greenhouse-default', 'greenhouse', '{"query":"stripe,airbnb,doordash,coinbase","jobage":14,"limit":200}', 1),
  ('seed-lever-default', 'lever', '{"query":"shopify,netflix,attentive","jobage":14,"limit":200}', 1);
