import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import { requireRRASession } from '@/lib/auth-guard';
import { getKnowledgeArticles } from '@/lib/actions/knowledge-center.action';
import { KNOWLEDGE_SECTIONS, SECTION_COLOR_MAP } from '@/lib/knowledge-sections';
import { KnowledgeSearch } from '@/components/admin/knowledge-search';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'Knowledge Center – TaxFlow' };

export default async function KnowledgeCenterPage() {
  await requireRRASession();

  // Fetch article counts per section (best-effort — works once backend lands)
  const articlesBySection: Record<string, number> = {};
  try {
    const articles = await getKnowledgeArticles();
    for (const a of articles) {
      articlesBySection[a.section] = (articlesBySection[a.section] ?? 0) + 1;
    }
  } catch {
    // Backend not yet available — render page without counts
  }

  return (
    <div className="space-y-6">
      {/* ── Hero header ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-100 dark:border-blue-900 p-6 md:p-8">
        <div className="flex items-start gap-4 mb-2">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
              Welcome to the TaxFlow Knowledge Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Your central guide to understanding how TaxFlow works — from AI monitoring and tax compliance rules to supply chain tracking and administrative roles.
            </p>
          </div>
        </div>
        <KnowledgeSearch />
      </div>

      {/* ── Section grid ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Browse by Topic
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {KNOWLEDGE_SECTIONS.map((section) => {
            const colors = SECTION_COLOR_MAP[section.color];
            const Icon = section.icon;
            const count = articlesBySection[section.id] ?? 0;
            return (
              <Link key={section.id} href={`/admin/knowledge/${section.id}`} className="group">
                <Card className={`h-full border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${colors.border}`}>
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colors.icon}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {count > 0 && (
                        <Badge variant="secondary" className={`text-xs ${colors.badge}`}>
                          {count} article{count !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {section.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {section.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                      <span>Explore</span>
                      <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
