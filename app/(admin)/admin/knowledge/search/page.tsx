import Link from 'next/link';
import { BookOpen, ChevronRight, Search, FileText } from 'lucide-react';
import { requireRRASession } from '@/lib/auth-guard';
import { getKnowledgeArticles } from '@/lib/actions/knowledge-center.action';
import { KNOWLEDGE_SECTIONS } from '@/lib/knowledge-sections';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KnowledgeSearch } from '@/components/admin/knowledge-search';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export const metadata = { title: 'Search – Knowledge Center' };

export default async function KnowledgeSearchPage({ searchParams }: Props) {
  await requireRRASession();
  const { q } = await searchParams;
  const query = q?.trim() ?? '';

  let results: Awaited<ReturnType<typeof getKnowledgeArticles>> = [];
  if (query.length >= 2) {
    try {
      results = await getKnowledgeArticles(undefined, query);
    } catch {
      // action unavailable
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/knowledge" className="hover:text-foreground transition-colors">
          Knowledge Center
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Search</span>
      </nav>

      {/* Search bar */}
      <div className="bg-muted/40 rounded-xl border p-5">
        <h1 className="text-lg font-bold text-foreground mb-3">Search the Knowledge Center</h1>
        <KnowledgeSearch initialQuery={query} />
      </div>

      {/* Results */}
      {query.length >= 2 ? (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            {results.length === 0
              ? `No results found for "${query}"`
              : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`}
          </p>

          {results.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium text-muted-foreground">No articles found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Try different keywords or browse by topic below.
                </p>
                <Link href="/admin/knowledge" className="mt-4 text-sm text-blue-600 hover:underline">
                  Browse all topics →
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {results.map((article) => {
                const sectionMeta = KNOWLEDGE_SECTIONS.find((s) => s.id === article.section);
                return (
                  <Link
                    key={article.id}
                    href={`/admin/knowledge/${article.section}/${article.slug}`}
                    className="group block"
                  >
                    <Card className="border hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
                      <CardContent className="p-5 flex items-start gap-4">
                        <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {article.title}
                          </h3>
                          {sectionMeta && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5">{sectionMeta.title}</p>
                          )}
                          {article.summary && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {article.summary}
                            </p>
                          )}
                          {article.tags && article.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {article.tags.slice(0, 4).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Enter at least 2 characters to search articles.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {KNOWLEDGE_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <Link key={section.id} href={`/admin/knowledge/${section.id}`} className="group">
                  <Card className="border hover:shadow-sm transition-all duration-200">
                    <CardContent className="p-4 flex items-center gap-3">
                      <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground group-hover:text-blue-600 transition-colors">
                        {section.title}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
