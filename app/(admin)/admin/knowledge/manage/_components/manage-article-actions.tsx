'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { togglePublishArticle, archiveKnowledgeArticle } from '@/lib/actions/knowledge-center.action';
import { useRouter } from 'next/navigation';

interface Props {
  articleId: string;
  isPublished: boolean;
}

export function ManageArticleActions({ articleId, isPublished }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<'publish' | 'archive' | null>(null);

  function handleToggle() {
    setAction('publish');
    startTransition(async () => {
      try {
        await togglePublishArticle(articleId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to update article');
      } finally {
        setAction(null);
      }
    });
  }

  function handleArchive() {
    if (!confirm('Archive this article? It will no longer be visible to administrators.')) return;
    setAction('archive');
    startTransition(async () => {
      try {
        await archiveKnowledgeArticle(articleId);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to archive article');
      } finally {
        setAction(null);
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleToggle}
        disabled={isPending}
        title={isPublished ? 'Unpublish article' : 'Publish article'}
      >
        {isPending && action === 'publish' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isPublished ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={handleArchive}
        disabled={isPending}
        title="Archive article"
      >
        {isPending && action === 'archive' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
      </Button>
    </>
  );
}
