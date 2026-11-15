'use client';

import { useState, useTransition } from 'react';
import { Sparkles, Loader2, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { seedDefaultArticles } from '@/lib/actions/knowledge-center.action';
import { useRouter } from 'next/navigation';

export function SeedDefaultContentButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ seeded: number; updated: number; skipped: number } | null>(null);

  function handleSeed() {
    if (!confirm('Seed / refresh TaxFlow Knowledge Center documentation?\n\nNew articles will be created and existing articles will be updated with the latest content.')) return;
    startTransition(async () => {
      try {
        const res = await seedDefaultArticles();
        setResult(res);
        router.refresh();
        setTimeout(() => setResult(null), 8000);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to seed content');
      }
    });
  }

  if (result) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
        <CheckCircle className="h-4 w-4" />
        Created {result.seeded} · Updated {result.updated} · Skipped {result.skipped}
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleSeed}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Seed &amp; Refresh Content
    </Button>
  );
}
