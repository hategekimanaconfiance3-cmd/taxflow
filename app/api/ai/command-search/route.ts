// ---------------------------------------------------------------------------
// POST /api/ai/command-search — Command palette AI search
//
// Returns a short descriptive answer and relevant navigation links for the
// given admin query. Intentionally lightweight: no DB queries, no tool calls.
// Auth: RRA staff session required (same cookie as admin panel).
// ---------------------------------------------------------------------------

import { getAdminNavigationLinks } from "@/lib/admin-sidebar-config";
import { requireRRASession } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
import { z } from "zod";

// Naive keyword match — returns up to 4 most relevant links
function findLinks(query: string, allowedLinks: Array<{ label: string; href: string }>): Array<{ label: string; href: string }> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const scored = allowedLinks.map((item) => {
        const label = item.label.toLowerCase();
        const href = item.href.toLowerCase();
        let score = 0;
        if (label === q) score += 100;
        else if (label.startsWith(q)) score += 60;
        else if (label.includes(q)) score += 40;
        if (href.includes(q)) score += 10;
        // Partial word match
        const words = q.split(/\s+/);
        for (const word of words) {
            if (word.length >= 3 && label.includes(word)) score += 15;
        }
        return { item, score };
    });

    return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((s) => ({ label: s.item.label, href: s.item.href }));
}

// Generate a short text answer based on query + matching links
function buildAnswer(query: string, links: Array<{ label: string; href: string }>): string {
    if (links.length === 0) {
        return `No matching admin page found for **"${query}"**. Try searching by module name (e.g. "traders", "audit", "payments").`;
    }

    const top = links[0]!;
    if (links.length === 1) {
        return `Navigate to **${top.label}** for "${query}".`;
    }

    const others = links
        .slice(1)
        .map((l) => `**${l.label}**`)
        .join(", ");
    return `**${top.label}** is the best match for "${query}". Related: ${others}.`;
}

export async function POST(request: NextRequest) {
    // Require an active RRA staff account and search only its role-filtered navigation.
    const { staff } = await requireRRASession();

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = z.object({ query: z.string().trim().max(200) }).safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });

    const query = parsed.data.query;
    if (!query) {
        return Response.json({ answer: "", links: [] });
    }

    const links = findLinks(query, getAdminNavigationLinks(staff.clearanceRoles));
    const answer = buildAnswer(query, links);

    return Response.json({ answer, links });
}
