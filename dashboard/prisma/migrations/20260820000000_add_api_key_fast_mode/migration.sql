-- Preserve the existing global Fast behavior for keys that already exist.
ALTER TABLE "user_api_keys"
  ADD COLUMN IF NOT EXISTS "fastEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_api_keys"
SET "fastEnabled" = true;
