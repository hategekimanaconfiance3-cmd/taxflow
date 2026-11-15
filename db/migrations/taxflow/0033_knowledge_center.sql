-- Migration: Knowledge Center tables
-- Creates: knowledge_article, knowledge_article_history, knowledge_faq

CREATE TABLE IF NOT EXISTS "knowledge_article" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "slug" text UNIQUE NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "summary" text NOT NULL DEFAULT '',
  "section" text NOT NULL,
  "tags" text[] NOT NULL DEFAULT '{}',
  "role_visibility" text[] NOT NULL DEFAULT '{}',
  "is_published" boolean NOT NULL DEFAULT false,
  "is_archived" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL DEFAULT 1,
  "created_by" text NOT NULL,
  "updated_by" text,
  "published_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "knowledge_article_history" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "article_id" text NOT NULL REFERENCES "knowledge_article"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "summary" text NOT NULL,
  "version" integer NOT NULL,
  "changed_by" text NOT NULL,
  "changed_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "knowledge_faq" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "section" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_published" boolean NOT NULL DEFAULT true,
  "created_by" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "knowledge_article_section_idx" ON "knowledge_article"("section");
CREATE INDEX IF NOT EXISTS "knowledge_article_published_idx" ON "knowledge_article"("is_published");
CREATE INDEX IF NOT EXISTS "knowledge_article_history_article_idx" ON "knowledge_article_history"("article_id");
