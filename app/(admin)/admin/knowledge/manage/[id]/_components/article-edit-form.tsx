'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { updateKnowledgeArticle, type KnowledgeArticleRow } from '@/lib/actions/knowledge-center.action';
import { KNOWLEDGE_SECTIONS } from '@/lib/knowledge-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  article: KnowledgeArticleRow;
}

export function ArticleEditForm({ article }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [title, setTitle] = useState(article.title);
  const [section, setSection] = useState(article.section);
  const [summary, setSummary] = useState(article.summary ?? '');
  const [content, setContent] = useState(article.content ?? '');
  const [tags, setTags] = useState((article.tags ?? []).join(', '));
  const [isPublished, setIsPublished] = useState(article.isPublished);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        await updateKnowledgeArticle(article.id, {
          title: title.trim(),
          section,
          summary: summary.trim(),
          content: content.trim(),
          tags: tagList,
          isPublished,
        });
        setSuccess(true);
        router.refresh();
        setTimeout(() => setSuccess(false), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update article');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Article updated successfully.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Slug <span className="text-xs text-muted-foreground font-normal">(cannot be changed)</span>
            </Label>
            <Input id="slug" value={article.slug} disabled className="bg-muted text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="section">Section <span className="text-destructive">*</span></Label>
            <Select value={section} onValueChange={setSection} required>
              <SelectTrigger id="section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWLEDGE_SECTIONS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags <span className="text-xs text-muted-foreground font-normal">(comma-separated)</span></Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Content <span className="font-normal text-muted-foreground/60 normal-case">(Markdown)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            className="font-mono text-sm resize-y"
            maxLength={50000}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Supports: # ## ### headings, **bold**, *italic*, `code`, - lists, 1. numbered lists, --- dividers
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Published</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Published articles are visible to all administrators.
            </p>
          </div>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
              aria-label="Publish article"
              className="h-4 w-4 accent-blue-600"
            />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending || !title || !section}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
        <Link href="/admin/knowledge/manage">
          <Button type="button" variant="ghost" disabled={isPending}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Manage
          </Button>
        </Link>
      </div>
    </form>
  );
}
