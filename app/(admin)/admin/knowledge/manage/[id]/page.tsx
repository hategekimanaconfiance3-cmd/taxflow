import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireRRASession } from '@/lib/auth-guard';
import { getKnowledgeArticleById, getKnowledgeArticleHistory } from '@/lib/actions/knowledge-center.action';
import { ArticleEditForm } from './_components/article-edit-form';
import { VersionHistory } from './_components/version-history';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const article = await getKnowledgeArticleById(id).catch(() => null);
  return { title: article ? `Edit: ${article.title} – Knowledge Center` : 'Edit Article' };
}

export default async function EditArticlePage({ params }: Props) {
  await requireRRASession('super_admin');
  const { id } = await params;

  const [article, history] = await Promise.all([
    getKnowledgeArticleById(id).catch(() => null),
    getKnowledgeArticleHistory(id).catch(() => []),
  ]);

  if (!article) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/admin/knowledge" className="hover:text-foreground transition-colors">Knowledge Center</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/knowledge/manage" className="hover:text-foreground transition-colors">Manage</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">{article.title}</span>
      </nav>

      <div>
        <h1 className="text-xl font-bold text-foreground">Edit Article</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Version {article.version} · Last updated{' '}
          {new Date(article.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <ArticleEditForm article={article} />

      {history.length > 0 && <VersionHistory history={history} />}
    </div>
  );
}
