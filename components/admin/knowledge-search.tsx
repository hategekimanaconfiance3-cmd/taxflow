'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function KnowledgeSearch() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/admin/knowledge/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative mt-4 max-w-xl">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the Knowledge Center…"
        className="pl-9 pr-24 h-10 bg-white dark:bg-background border-blue-200 dark:border-blue-900 focus-visible:ring-blue-400"
      />
      <Button
        type="submit"
        size="sm"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 bg-blue-600 hover:bg-blue-700 text-white"
      >
        Search
      </Button>
    </form>
  );
}
