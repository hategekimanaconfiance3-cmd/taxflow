import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, ArrowLeft, BookOpen, Tag, Calendar, Hash } from 'lucide-react';
import { requireRRASession } from '@/lib/auth-guard';
import { getKnowledgeArticle, getKnowledgeFaqs } from '@/lib/actions/knowledge-center.action';
import { KNOWLEDGE_SECTIONS, SECTION_COLOR_MAP } from '@/lib/knowledge-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{ section: string; slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = await getKnowledgeArticle(slug).catch(() => null);
  return { title: article ? `${article.title} – Knowledge Center` : 'Knowledge Center' };
}

function renderMarkdown(content: string): string {
  return content
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold text-foreground mt-5 mb-1.5">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-foreground mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-foreground mt-7 mb-2 pb-1 border-b">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-foreground mt-6 mb-3">$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-muted text-sm px-1.5 py-0.5 rounded font-mono">$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-6 border-border" />')
    // Unordered list items
    .replace(/^\s*[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm text-muted-foreground leading-relaxed">$1</li>')
    // Ordered list items
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li class="ml-4 list-decimal text-sm text-muted-foreground leading-relaxed">$1</li>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-blue-300 pl-4 italic text-muted-foreground text-sm my-3">$1</blockquote>')
    // Paragraphs — blank lines become spacing
    .replace(/\n\n/g, '</p><p class="text-sm text-muted-foreground leading-relaxed mb-3">')
    // Wrap in paragraph
    .replace(/^/, '<p class="text-sm text-muted-foreground leading-relaxed mb-3">')
    .replace(/$/, '</p>');
}

export default async function ArticlePage({ params }: Props) {
  await requireRRASession();
  const { section: sectionId, slug } = await params;

  const [article, faqs] = await Promise.all([
    getKnowledgeArticle(slug).catch(() => null),
    getKnowledgeFaqs(sectionId).catch(() => []),
  ]);

  if (!article) notFound();

  const sectionMeta = KNOWLEDGE_SECTIONS.find((s) => s.id === sectionId);
  const colors = sectionMeta ? SECTION_COLOR_MAP[sectionMeta.color] : SECTION_COLOR_MAP['blue'];
  const Icon = sectionMeta?.icon ?? BookOpen;

  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/admin/knowledge" className="hover:text-foreground transition-colors">
          Knowledge Center
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {sectionMeta && (
          <>
            <Link href={`/admin/knowledge/${sectionId}`} className="hover:text-foreground transition-colors">
              {sectionMeta.title}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </>
        )}
        <span className="text-foreground font-medium truncate">{article.title}</span>
      </nav>

      {/* Article header */}
      <div className={`rounded-xl border p-6 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${colors.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground leading-tight">{article.title}</h1>
            {article.summary && (
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{article.summary}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {publishedDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Published {publishedDate}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                Version {article.version}
              </span>
            </div>
            {article.tags && article.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Article body */}
      <Card>
        <CardContent className="p-6 md:p-8">
          <div
            className="prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
          />
        </CardContent>
      </Card>

      {/* FAQs for this section */}
      {faqs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            {faqs.map((faq) => (
              <details key={faq.id} className="group py-3 cursor-pointer">
                <summary className="text-sm font-medium text-foreground list-none flex items-center justify-between gap-2">
                  <span>{faq.question}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed pl-0.5">{faq.answer}</p>
              </details>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Link href={sectionMeta ? `/admin/knowledge/${sectionId}` : '/admin/knowledge'}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            {sectionMeta ? `Back to ${sectionMeta.title}` : 'Back to Knowledge Center'}
          </Button>
        </Link>
        <Link href="/admin/knowledge">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            Knowledge Center
          </Button>
        </Link>
      </div>
    </div>
  );
}
