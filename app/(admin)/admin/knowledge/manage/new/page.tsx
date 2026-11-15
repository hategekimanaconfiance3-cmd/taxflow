'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, ChevronRight } from 'lucide-react';
import { createKnowledgeArticle } from '@/lib/actions/knowledge-center.action';
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

export default function NewArticlePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [section, setSection] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManual) setSlug(slugify(val));
  }

  function handleSlugChange(val: string) {
    setSlugManual(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        await createKnowledgeArticle({
          title: title.trim(),
          slug: slug.trim(),
          section,
          summary: summary.trim(),
          content: content.trim(),
          tags: tagList,
          roleVisibility: [],
          isPublished,
        });
        router.push('/admin/knowledge/manage');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create article');
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/admin/knowledge" className="hover:text-foreground transition-colors">Knowledge Center</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/knowledge/manage" className="hover:text-foreground transition-colors">Manage</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">New Article</span>
      </nav>

      <div>
        <h1 className="text-xl font-bold text-foreground">New Article</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Write documentation in Markdown format.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
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
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. How the 95% Compliance Rule Works"
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug">
                Slug <span className="text-destructive">*</span>
                <span className="ml-2 text-xs text-muted-foreground font-normal">(URL path — lowercase letters, numbers, hyphens)</span>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. how-95-percent-compliance-rule-works"
                required
                pattern="[a-z0-9-]+"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="section">Section <span className="text-destructive">*</span></Label>
              <Select value={section} onValueChange={setSection} required>
                <SelectTrigger id="section">
                  <SelectValue placeholder="Select a section…" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_SECTIONS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary">
                Summary
                <span className="ml-2 text-xs text-muted-foreground font-normal">(shown in article cards, max 500 chars)</span>
              </Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Short description shown on the section listing page…"
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">
                Tags
                <span className="ml-2 text-xs text-muted-foreground font-normal">(comma-separated)</span>
              </Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. compliance, tax, monitoring"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Content <span className="font-normal text-muted-foreground/60 normal-case">(Markdown supported)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'# Article Title\n\nWrite your documentation here using Markdown...\n\n## Section\n\nContent here...'}
              rows={20}
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
              <p className="text-sm font-medium text-foreground">Publish immediately</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Published articles are visible to all administrators.
              </p>
            </div>
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
              aria-label="Publish article immediately"
              className="h-4 w-4 accent-blue-600"
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            disabled={isPending || !title || !slug || !section}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPublished ? 'Create & Publish' : 'Save as Draft'}
          </Button>
          <Link href="/admin/knowledge/manage">
            <Button type="button" variant="ghost" disabled={isPending}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
