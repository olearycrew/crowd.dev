ALTER TABLE organizations ALTER COLUMN website TYPE TEXT;

DROP INDEX IF EXISTS "ix_organizations_tenantId_website_not_null";
CREATE UNIQUE INDEX IF NOT EXISTS "ix_organizations_tenantId_website_not_null"
    ON organizations (website, "tenantId")
    WHERE (website IS NOT NULL);

