import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, ArrowLeft, BookOpen, FileText } from 'lucide-react';
import { requireRRASession } from '@/lib/auth-guard';
import { getKnowledgeArticles } from '@/lib/actions/knowledge-center.action';
import { KNOWLEDGE_SECTIONS, SECTION_COLOR_MAP } from '@/lib/knowledge-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{ section: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { section: sectionId } = await params;
  const section = KNOWLEDGE_SECTIONS.find((s) => s.id === sectionId);
  return { title: section ? `${section.title} – Knowledge Center` : 'Knowledge Center' };
}

export default async function KnowledgeSectionPage({ params }: Props) {
  await requireRRASession();
  const { section: sectionId } = await params;

  const sectionMeta = KNOWLEDGE_SECTIONS.find((s) => s.id === sectionId);
  if (!sectionMeta) notFound();

  const colors = SECTION_COLOR_MAP[sectionMeta.color];
  const Icon = sectionMeta.icon;

  let articles: Awaited<ReturnType<typeof getKnowledgeArticles>> = [];
  try {
    articles = await getKnowledgeArticles(sectionId);
  } catch {
    // action not yet available
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/knowledge" className="hover:text-foreground transition-colors">
          Knowledge Center
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{sectionMeta.title}</span>
      </nav>

      {/* Section header */}
      <div className={`rounded-xl border p-6 ${colors.bg} ${colors.border}`}>
        <div className="flex items-center gap-4">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${colors.icon}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{sectionMeta.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{sectionMeta.description}</p>
          </div>
        </div>
      </div>

      {/* Article list */}
      {articles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-muted-foreground">No articles published yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Check back soon — content for this section is on its way.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/admin/knowledge/${sectionId}/${article.slug}`}
              className="group block"
            >
              <Card className="border hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${colors.badge}`}>
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {article.tags?.slice(0, 3).map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Back link */}
      <Link href="/admin/knowledge">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Knowledge Center
        </Button>
      </Link>
    </div>
  );
}
