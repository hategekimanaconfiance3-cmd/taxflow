import Link from 'next/link';
import { Plus, BookOpen, ChevronRight, Eye, EyeOff, Archive, Pencil, Sparkles } from 'lucide-react';
import { requireRRASession } from '@/lib/auth-guard';
import { getAllKnowledgeArticles } from '@/lib/actions/knowledge-center.action';
import { KNOWLEDGE_SECTIONS } from '@/lib/knowledge-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ManageArticleActions } from './_components/manage-article-actions';
import { SeedDefaultContentButton } from './_components/seed-default-content-button';

export const metadata = { title: 'Manage Knowledge Center – TaxFlow' };

export default async function KnowledgeManagePage() {
  await requireRRASession('super_admin');

  let articles: Awaited<ReturnType<typeof getAllKnowledgeArticles>> = [];
  try {
    articles = await getAllKnowledgeArticles();
  } catch {
    // DB not yet seeded
  }

  const publishedCount = articles.filter((a) => a.isPublished && !a.isArchived).length;
  const draftCount = articles.filter((a) => !a.isPublished && !a.isArchived).length;
  const archivedCount = articles.filter((a) => a.isArchived).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <Link href="/admin/knowledge" className="hover:text-foreground transition-colors">
              Knowledge Center
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Manage Content</span>
          </nav>
          <h1 className="text-xl font-bold text-foreground">Knowledge Center Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create, edit, publish, and archive documentation articles.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SeedDefaultContentButton />
          <Link href="/admin/knowledge/manage/new">
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4" />
              New Article
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Eye className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Published</p>
              <p className="text-lg font-bold text-foreground leading-none mt-0.5">{publishedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <EyeOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Drafts</p>
              <p className="text-lg font-bold text-foreground leading-none mt-0.5">{draftCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Archive className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Archived</p>
              <p className="text-lg font-bold text-foreground leading-none mt-0.5">{archivedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Article list */}
      {articles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-muted-foreground">No articles yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">
              Seed the default content or create your first article.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <SeedDefaultContentButton />
              <Link href="/admin/knowledge/manage/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Article
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              All Articles ({articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 divide-y">
            {articles.map((article) => {
              const sectionMeta = KNOWLEDGE_SECTIONS.find((s) => s.id === article.section);
              const updatedAt = new Date(article.updatedAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              });

              return (
                <div key={article.id} className="py-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground leading-snug">
                        {article.title}
                      </span>
                      {article.isArchived ? (
                        <Badge variant="secondary" className="text-xs text-gray-500">Archived</Badge>
                      ) : article.isPublished ? (
                        <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs text-amber-600 dark:text-amber-400">Draft</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {sectionMeta && <span>{sectionMeta.title}</span>}
                      <span>v{article.version}</span>
                      <span>Updated {updatedAt}</span>
                    </div>
                    {article.summary && (
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">{article.summary}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link href={`/admin/knowledge/manage/${article.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit article">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    {!article.isArchived && (
                      <ManageArticleActions articleId={article.id} isPublished={article.isPublished} />
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
