CREATE TABLE "scheme_views" (
	"scheme_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scheme_views_scheme_id_day_pk" PRIMARY KEY("scheme_id","day")
);
--> statement-breakpoint
ALTER TABLE "scheme_views" ADD CONSTRAINT "scheme_views_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;