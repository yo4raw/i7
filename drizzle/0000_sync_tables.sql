CREATE TABLE "card_counts" (
	"user_id" uuid NOT NULL,
	"card_id" integer NOT NULL,
	"count" integer NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_counts_user_id_card_id_pk" PRIMARY KEY("user_id","card_id"),
	CONSTRAINT "card_counts_count_range" CHECK ("card_counts"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "card_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deck_slots" (
	"user_id" uuid NOT NULL,
	"deck_id" text NOT NULL,
	"slot_index" smallint NOT NULL,
	"card_id" integer,
	"trained" boolean DEFAULT false NOT NULL,
	"skill_level" smallint,
	"bonus_tier" text,
	"shared_broach_ids" integer[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "deck_slots_user_id_deck_id_slot_index_pk" PRIMARY KEY("user_id","deck_id","slot_index"),
	CONSTRAINT "deck_slots_slot_range" CHECK ("deck_slots"."slot_index" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "deck_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "decks" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"song_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"rev" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "decks_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "decks_id_len" CHECK (char_length("decks"."id") between 1 and 64),
	CONSTRAINT "decks_name_len" CHECK (char_length("decks"."name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "decks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rabbit_notes" (
	"user_id" uuid NOT NULL,
	"character" text NOT NULL,
	"shout" integer NOT NULL,
	"beat" integer NOT NULL,
	"melody" integer NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rabbit_notes_user_id_character_pk" PRIMARY KEY("user_id","character"),
	CONSTRAINT "rabbit_notes_character_len" CHECK (char_length("rabbit_notes"."character") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "rabbit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shared_broach_counts" (
	"user_id" uuid NOT NULL,
	"broach_id" integer NOT NULL,
	"count" integer NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_broach_counts_user_id_broach_id_pk" PRIMARY KEY("user_id","broach_id"),
	CONSTRAINT "shared_broach_counts_count_range" CHECK ("shared_broach_counts"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shared_broach_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "card_counts" ADD CONSTRAINT "card_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_slots" ADD CONSTRAINT "deck_slots_deck_fk" FOREIGN KEY ("user_id","deck_id") REFERENCES "public"."decks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rabbit_notes" ADD CONSTRAINT "rabbit_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_broach_counts" ADD CONSTRAINT "shared_broach_counts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "card_counts_select" ON "card_counts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("card_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "card_counts_insert" ON "card_counts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("card_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "card_counts_update" ON "card_counts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("card_counts"."user_id" = (select auth.uid())) WITH CHECK ("card_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "card_counts_delete" ON "card_counts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("card_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deck_slots_select" ON "deck_slots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("deck_slots"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deck_slots_insert" ON "deck_slots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("deck_slots"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deck_slots_update" ON "deck_slots" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("deck_slots"."user_id" = (select auth.uid())) WITH CHECK ("deck_slots"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "deck_slots_delete" ON "deck_slots" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("deck_slots"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "decks_select" ON "decks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("decks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "decks_insert" ON "decks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("decks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "decks_update" ON "decks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("decks"."user_id" = (select auth.uid())) WITH CHECK ("decks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "decks_delete" ON "decks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("decks"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rabbit_notes_select" ON "rabbit_notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("rabbit_notes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rabbit_notes_insert" ON "rabbit_notes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("rabbit_notes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rabbit_notes_update" ON "rabbit_notes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("rabbit_notes"."user_id" = (select auth.uid())) WITH CHECK ("rabbit_notes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "rabbit_notes_delete" ON "rabbit_notes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("rabbit_notes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shared_broach_counts_select" ON "shared_broach_counts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("shared_broach_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shared_broach_counts_insert" ON "shared_broach_counts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("shared_broach_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shared_broach_counts_update" ON "shared_broach_counts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("shared_broach_counts"."user_id" = (select auth.uid())) WITH CHECK ("shared_broach_counts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "shared_broach_counts_delete" ON "shared_broach_counts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("shared_broach_counts"."user_id" = (select auth.uid()));