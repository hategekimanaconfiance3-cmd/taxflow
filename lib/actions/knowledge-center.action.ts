"use server";

import { and, asc, desc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import db from "@/db/drizzle";
import { knowledgeArticle, knowledgeArticleHistory, knowledgeFaq, auditLog } from "@/db/schema";
import { requireRRASession } from "@/lib/auth-guard";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { DEFAULT_KNOWLEDGE_ARTICLES } from "@/lib/knowledge-center-default-articles";
import { SEED_FAQS } from "@/lib/knowledge-center-seed-faqs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeArticleRow {
    id: string;
    slug: string;
    title: string;
    content: string;
    summary: string;
    section: string;
    tags: string[];
    roleVisibility: string[];
    isPublished: boolean;
    isArchived: boolean;
    version: number;
    createdBy: string;
    updatedBy: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface KnowledgeFaqRow {
    id: string;
    question: string;
    answer: string;
    section: string;
    sortOrder: number;
    isPublished: boolean;
    createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canViewArticle(article: KnowledgeArticleRow, userRoles: string[]): boolean {
    if (!article.isPublished || article.isArchived) return false;
    if (!article.roleVisibility || article.roleVisibility.length === 0) return true;
    return userRoles.some((r) => article.roleVisibility.includes(r));
}

// ---------------------------------------------------------------------------
// Read — available to all authenticated RRA staff
// ---------------------------------------------------------------------------

export async function getKnowledgeArticles(
    section?: string,
    search?: string,
): Promise<KnowledgeArticleRow[]> {
    const { staff } = await requireRRASession();
    const userRoles = staff.clearanceRoles?.length ? staff.clearanceRoles : [staff.clearanceLevel];

    const conditions = [
        eq(knowledgeArticle.isPublished, true),
        eq(knowledgeArticle.isArchived, false),
    ];
    if (section) conditions.push(eq(knowledgeArticle.section, section));
    if (search) {
        const q = `%${search.trim()}%`;
        conditions.push(
            or(
                ilike(knowledgeArticle.title, q),
                ilike(knowledgeArticle.summary, q),
                ilike(knowledgeArticle.content, q),
            )!,
        );
    }

    const rows = await db
        .select()
        .from(knowledgeArticle)
        .where(and(...conditions))
        .orderBy(asc(knowledgeArticle.title));

    return rows.filter((a) => canViewArticle(a as KnowledgeArticleRow, userRoles)) as KnowledgeArticleRow[];
}

export async function getKnowledgeArticle(slug: string): Promise<KnowledgeArticleRow | null> {
    const { staff } = await requireRRASession();
    const userRoles = staff.clearanceRoles?.length ? staff.clearanceRoles : [staff.clearanceLevel];

    const [row] = await db
        .select()
        .from(knowledgeArticle)
        .where(eq(knowledgeArticle.slug, slug))
        .limit(1);

    if (!row) return null;
    if (!canViewArticle(row as KnowledgeArticleRow, userRoles)) return null;
    return row as KnowledgeArticleRow;
}

// ---------------------------------------------------------------------------
// Super-Admin reads
// ---------------------------------------------------------------------------

export async function getAllKnowledgeArticles(): Promise<KnowledgeArticleRow[]> {
    await requireRRASession("super_admin");
    const rows = await db
        .select()
        .from(knowledgeArticle)
        .orderBy(desc(knowledgeArticle.updatedAt));
    return rows as KnowledgeArticleRow[];
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export async function getKnowledgeFaqs(section?: string): Promise<KnowledgeFaqRow[]> {
    await requireRRASession();
    const conditions = [eq(knowledgeFaq.isPublished, true)];
    if (section) conditions.push(eq(knowledgeFaq.section, section));

    const rows = await db
        .select()
        .from(knowledgeFaq)
        .where(and(...conditions))
        .orderBy(asc(knowledgeFaq.sortOrder), asc(knowledgeFaq.createdAt));
    return rows as KnowledgeFaqRow[];
}

// ---------------------------------------------------------------------------
// Mutations — super_admin only
// ---------------------------------------------------------------------------

const articleSchema = z.object({
    slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    title: z.string().min(3).max(200),
    summary: z.string().max(500).default(""),
    content: z.string().max(50000).default(""),
    section: z.string().min(1).max(60),
    tags: z.array(z.string().max(40)).max(20).default([]),
    roleVisibility: z.array(z.string().max(60)).max(20).default([]),
    isPublished: z.boolean().default(false),
});

export async function createKnowledgeArticle(data: z.infer<typeof articleSchema>): Promise<{ id: string }> {
    const { user } = await requireRRASession("super_admin");

    const parsed = articleSchema.safeParse(data);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid article data");

    const { slug, title, summary, content, section, tags, roleVisibility, isPublished } = parsed.data;

    const [existing] = await db.select({ id: knowledgeArticle.id }).from(knowledgeArticle).where(eq(knowledgeArticle.slug, slug)).limit(1);
    if (existing) throw new Error(`An article with slug "${slug}" already exists`);

    const [created] = await db.insert(knowledgeArticle).values({
        slug,
        title,
        summary,
        content,
        section,
        tags,
        roleVisibility,
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        createdBy: user.id,
    }).returning({ id: knowledgeArticle.id });

    await logAudit({
        userId: user.id,
        action: "KNOWLEDGE_ARTICLE_CREATED",
        targetType: "knowledge_article",
        targetId: created.id,
        metadata: { slug, title, section, isPublished },
    }, async (entry) => { await db.insert(auditLog).values(entry); });

    return { id: created.id };
}

export async function updateKnowledgeArticle(
    id: string,
    data: Partial<z.infer<typeof articleSchema>>,
): Promise<{ success: true }> {
    const { user } = await requireRRASession("super_admin");

    const [existing] = await db.select().from(knowledgeArticle).where(eq(knowledgeArticle.id, id)).limit(1);
    if (!existing) throw new Error("Article not found");

    // Save old version to history
    await db.insert(knowledgeArticleHistory).values({
        articleId: id,
        title: existing.title,
        content: existing.content,
        summary: existing.summary,
        version: existing.version,
        changedBy: user.id,
    });

    const updatePayload: Partial<typeof knowledgeArticle.$inferInsert> = {
        ...data,
        version: existing.version + 1,
        updatedBy: user.id,
        updatedAt: new Date(),
    };

    if (data.isPublished && !existing.isPublished) {
        updatePayload.publishedAt = new Date();
    }

    await db.update(knowledgeArticle).set(updatePayload).where(eq(knowledgeArticle.id, id));

    await logAudit({
        userId: user.id,
        action: "KNOWLEDGE_ARTICLE_UPDATED",
        targetType: "knowledge_article",
        targetId: id,
        metadata: { fields: Object.keys(data), newVersion: existing.version + 1 },
    }, async (entry) => { await db.insert(auditLog).values(entry); });

    return { success: true };
}

export async function togglePublishArticle(id: string): Promise<{ isPublished: boolean }> {
    const { user } = await requireRRASession("super_admin");

    const [existing] = await db.select().from(knowledgeArticle).where(eq(knowledgeArticle.id, id)).limit(1);
    if (!existing) throw new Error("Article not found");

    const newPublished = !existing.isPublished;
    await db.update(knowledgeArticle).set({
        isPublished: newPublished,
        publishedAt: newPublished ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
        updatedBy: user.id,
        updatedAt: new Date(),
    }).where(eq(knowledgeArticle.id, id));

    await logAudit({
        userId: user.id,
        action: newPublished ? "KNOWLEDGE_ARTICLE_PUBLISHED" : "KNOWLEDGE_ARTICLE_UNPUBLISHED",
        targetType: "knowledge_article",
        targetId: id,
        metadata: { isPublished: newPublished },
    }, async (entry) => { await db.insert(auditLog).values(entry); });

    return { isPublished: newPublished };
}

export async function archiveKnowledgeArticle(id: string): Promise<{ success: true }> {
    const { user } = await requireRRASession("super_admin");

    const [existing] = await db.select({ id: knowledgeArticle.id }).from(knowledgeArticle).where(eq(knowledgeArticle.id, id)).limit(1);
    if (!existing) throw new Error("Article not found");

    await db.update(knowledgeArticle).set({
        isArchived: true,
        isPublished: false,
        updatedBy: user.id,
        updatedAt: new Date(),
    }).where(eq(knowledgeArticle.id, id));

    await logAudit({
        userId: user.id,
        action: "KNOWLEDGE_ARTICLE_ARCHIVED",
        targetType: "knowledge_article",
        targetId: id,
        metadata: {},
    }, async (entry) => { await db.insert(auditLog).values(entry); });

    return { success: true };
}

// ---------------------------------------------------------------------------
// FAQ management
// ---------------------------------------------------------------------------

export async function upsertFaq(data: {
    id?: string;
    question: string;
    answer: string;
    section: string;
    sortOrder?: number;
    isPublished?: boolean;
}): Promise<{ id: string }> {
    const { user } = await requireRRASession("super_admin");

    if (data.id) {
        await db.update(knowledgeFaq).set({
            question: data.question,
            answer: data.answer,
            section: data.section,
            sortOrder: data.sortOrder ?? 0,
            isPublished: data.isPublished ?? true,
            updatedAt: new Date(),
        }).where(eq(knowledgeFaq.id, data.id));
        return { id: data.id };
    }

    const [created] = await db.insert(knowledgeFaq).values({
        question: data.question,
        answer: data.answer,
        section: data.section,
        sortOrder: data.sortOrder ?? 0,
        isPublished: data.isPublished ?? true,
        createdBy: user.id,
    }).returning({ id: knowledgeFaq.id });

    return { id: created.id };
}

export async function deleteFaq(id: string): Promise<{ success: true }> {
    await requireRRASession("super_admin");
    await db.delete(knowledgeFaq).where(eq(knowledgeFaq.id, id));
    return { success: true };
}

// ---------------------------------------------------------------------------
// Seed default content
// ---------------------------------------------------------------------------

export async function seedDefaultArticles(): Promise<{ seeded: number; skipped: number }> {
    const { user } = await requireRRASession("super_admin");

    let seeded = 0;
    let skipped = 0;

    for (const article of DEFAULT_KNOWLEDGE_ARTICLES) {
        const [existing] = await db
            .select({ id: knowledgeArticle.id })
            .from(knowledgeArticle)
            .where(eq(knowledgeArticle.slug, article.slug))
            .limit(1);

        if (existing) {
            skipped++;
            continue;
        }

        await db.insert(knowledgeArticle).values({
            slug: article.slug,
            title: article.title,
            summary: article.summary,
            content: article.content,
            section: article.section,
            tags: article.tags,
            roleVisibility: [],
            isPublished: true,
            publishedAt: new Date(),
            createdBy: user.id,
        });
        seeded++;
    }

    // Seed FAQs
    for (const faq of SEED_FAQS) {
        const [existing] = await db
            .select({ id: knowledgeFaq.id })
            .from(knowledgeFaq)
            .where(and(eq(knowledgeFaq.question, faq.question), eq(knowledgeFaq.section, faq.section)))
            .limit(1);

        if (!existing) {
            await db.insert(knowledgeFaq).values({
                question: faq.question,
                answer: faq.answer,
                section: faq.section,
                sortOrder: faq.sortOrder,
                isPublished: true,
                createdBy: user.id,
            });
        }
    }

    await logAudit({
        userId: user.id,
        action: "KNOWLEDGE_CENTER_SEEDED",
        targetType: "knowledge_article",
        metadata: { seeded, skipped },
    }, async (entry) => { await db.insert(auditLog).values(entry); });

    return { seeded, skipped };
}
