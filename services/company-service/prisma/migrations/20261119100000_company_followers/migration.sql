-- CreateTable
CREATE TABLE "company_followers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_followers_company_user_key" ON "company_followers"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "company_followers_user_idx" ON "company_followers"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "company_followers_company_idx" ON "company_followers"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "company_followers" ADD CONSTRAINT "company_followers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
