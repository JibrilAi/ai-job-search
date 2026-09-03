-- Adds profile fields that real job applications commonly ask for
-- (research: LinkedIn Easy Apply, Indeed, Greenhouse/Lever/Workday screener
-- questions) but this profile didn't capture. Deliberately does NOT add
-- EEO/demographic fields (race, gender, veteran status, disability) --
-- every platform researched treats those as legally voluntary and separate
-- from the rest of the application; this app never asks for or stores
-- them. See lib/documents/autoSubmit.ts's FIELD_KEYWORDS comment for the
-- same boundary applied to the auto-fill side.
ALTER TABLE profiles ADD COLUMN notice_period TEXT;
ALTER TABLE profiles ADD COLUMN salary_expectation TEXT;
ALTER TABLE profiles ADD COLUMN relocation_willingness TEXT;
ALTER TABLE profiles ADD COLUMN work_arrangement_preference TEXT;
ALTER TABLE profiles ADD COLUMN portfolio_url TEXT;
