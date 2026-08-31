-- Adds an admin role to users, backing the admin dashboard.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
