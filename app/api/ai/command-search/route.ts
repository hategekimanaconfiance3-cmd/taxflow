// ---------------------------------------------------------------------------
// POST /api/ai/command-search — Command palette AI search
//
// Returns a short descriptive answer and relevant navigation links for the
// given admin query. Intentionally lightweight: no DB queries, no tool calls.
// Auth: RRA staff session required (same cookie as admin panel).
// ---------------------------------------------------------------------------

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ADMIN_SIDEBAR_GROUPS } from "@/lib/admin-sidebar-config";
import type { NextRequest } from "next/server";

// Flat list of all navigation items (label, href, keywords)
const NAV_INDEX = ADMIN_SIDEBAR_GROUPS.flatMap((g) =>
    g.items.flatMap((item) => [
        { label: item.label, href: item.href, group: g.label ?? "Overview" },
        ...(item.children?.map((child) => ({
            label: child.label,
            href: child.href,
            group: item.label,
        })) ?? []),
    ])
);

// Naive keyword match — returns up to 4 most relevant links
function findLinks(query: string): Array<{ label: string; href: string }> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const scored = NAV_INDEX.map((item) => {
        const label = item.label.toLowerCase();
        const group = item.group.toLowerCase();
        const href = item.href.toLowerCase();
        let score = 0;
        if (label === q) score += 100;
        else if (label.startsWith(q)) score += 60;
        else if (label.includes(q)) score += 40;
        if (group.includes(q)) score += 20;
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
    // Auth check — must be an active session
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
    }
    if (session.user.isActive === false) {
        return new Response("Forbidden", { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (
        typeof body !== "object" ||
        body === null ||
        typeof (body as Record<string, unknown>).query !== "string"
    ) {
        return Response.json({ error: "Missing query" }, { status: 400 });
    }

    const query = ((body as Record<string, unknown>).query as string).slice(0, 200).trim();
    if (!query) {
        return Response.json({ answer: "", links: [] });
    }

    const links = findLinks(query);
    const answer = buildAnswer(query, links);

    return Response.json({ answer, links });
}
