CREATE TABLE "profile"."profile_views" (
    "profile_id" UUID NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "view_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("profile_id", "recruiter_id", "view_id"),
    CONSTRAINT "profile_views_profile_id_fkey" FOREIGN KEY ("profile_id")
        REFERENCES "profile"."profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
