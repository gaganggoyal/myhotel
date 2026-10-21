CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"type" text NOT NULL,
	"path" text NOT NULL,
	"cta" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"device" text,
	"visitor_hash" text,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hotel_id" text,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"data" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"hotel_id" text,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"data" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_provider_payment_id_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'pending_dns' NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"expected" jsonb NOT NULL,
	"observed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text,
	"stream" text NOT NULL,
	"template_key" text NOT NULL,
	"to_email" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to" text,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"hotel_id" text NOT NULL,
	"key" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_hotel_id_key_pk" PRIMARY KEY("hotel_id","key")
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"guest_phone" text NOT NULL,
	"check_in" date,
	"check_out" date,
	"adults" integer DEFAULT 2 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"room_id" text,
	"room_name" text,
	"message" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"source" jsonb,
	"owner_notes" text,
	"reservation_id" text,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"site_status" text DEFAULT 'draft' NOT NULL,
	"published_version_id" text,
	"admin_suspended_at" timestamp with time zone,
	"admin_suspend_reason" text,
	"reply_to_email" text,
	"reply_to_verified_at" timestamp with time zone,
	"mail_paused_at" timestamp with time zone,
	"mail_pause_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"variants" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"hotel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_hotel_id_user_id_pk" PRIMARY KEY("hotel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"scheme" text DEFAULT 'upi' NOT NULL,
	"payee_name" text NOT NULL,
	"vpa" text NOT NULL,
	"note" text,
	"qr_media_id" text,
	"qr_decoded" text,
	"qr_warning" text,
	"attested_at" timestamp with time zone NOT NULL,
	"attested_by" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"token" text NOT NULL,
	"amount" integer NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"payee" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"guest_reported_at" timestamp with time zone,
	"guest_utr" text,
	"guest_proof_media_id" text,
	"guest_note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"actor_label" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"ref" text NOT NULL,
	"enquiry_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"guest_phone" text NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"adults" integer DEFAULT 2 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"room_name" text NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_drafts" (
	"hotel_id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"note" text,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_history" (
	"slug" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"hotel_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"interval" text DEFAULT 'monthly' NOT NULL,
	"status" text NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"suspended_reason" text,
	"provider" text DEFAULT 'simulated' NOT NULL,
	"provider_subscription_id" text,
	"provider_status" text,
	"checkout_url" text,
	"cancelled_at" timestamp with time zone,
	"trial_reminder_sent_at" timestamp with time zone,
	"renewal_reminder_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_hotel_id_unique" UNIQUE("hotel_id"),
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_drafts" ADD CONSTRAINT "site_drafts_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_versions" ADD CONSTRAINT "site_versions_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slug_history" ADD CONSTRAINT "slug_history_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_hotel_day_idx" ON "analytics_events" USING btree ("hotel_id","day");--> statement-breakpoint
CREATE INDEX "audit_hotel_idx" ON "audit_logs" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "domains_hotel_idx" ON "domains" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "email_messages_hotel_idx" ON "email_messages" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "email_messages_provider_idx" ON "email_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_scope_email_idx" ON "email_suppressions" USING btree ("scope","email");--> statement-breakpoint
CREATE INDEX "enquiries_hotel_created_idx" ON "enquiries" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "media_hotel_idx" ON "media" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_hotel_scheme_idx" ON "payment_methods" USING btree ("hotel_id","scheme");--> statement-breakpoint
CREATE INDEX "payment_requests_res_idx" ON "payment_requests" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_events_res_idx" ON "reservation_events" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservations_hotel_idx" ON "reservations" USING btree ("hotel_id","check_in");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_versions_hotel_version_idx" ON "site_versions" USING btree ("hotel_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_idx" ON "webhook_events" USING btree ("provider","event_id");