"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Ship } from 'lucide-react';
import { importIntentSchema } from '@/lib/validation/import-intent.schema';

interface ImportIntent {
  id: string;
  productName: string;
  plannedQuantity: number;
  purchaseCountry: string;
  createdAt: Date | string;
}

export function IntendedProductImports({
  initialIntents,
  manufacturer,
}: {
  initialIntents: ImportIntent[];
  manufacturer: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [intents, setIntents] = useState(initialIntents);
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchaseCountry, setPurchaseCountry] = useState('');
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  function submitIntent() {
    const parsed = importIntentSchema.safeParse({
      productName,
      plannedQuantity: Number(quantity),
      purchaseCountry,
    });
    if (!parsed.success) {
      setFeedback({ error: true, text: parsed.error.issues[0]?.message ?? 'Check the product, quantity, and country.' });
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/import-intents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });
        const body = await response.json() as { intent?: ImportIntent; error?: string };
        if (!response.ok || !body.intent) {
          setFeedback({ error: true, text: body.error ?? 'Unable to save this planned import.' });
          return;
        }
        setIntents((current) => [body.intent!, ...current]);
        setProductName('');
        setQuantity('');
        setPurchaseCountry('');
        setFeedback({ error: false, text: 'Intended import recorded. This does not confirm a purchase or add inventory.' });
        router.refresh();
      } catch {
        setFeedback({ error: true, text: 'Unable to save the intended import. Check your connection and retry.' });
      }
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Finished products planned for import</h2>
        <p className="text-sm text-muted-foreground">
          Register products for resale before purchase. Enter the product name, expected quantity, and purchase country.
          {manufacturer && ' Use the separate material declaration below for raw materials used in production.'}
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Ship className="h-4 w-4" /> Plan a product import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>{feedback.text}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="intended-import-product">Product name</Label>
              <Input id="intended-import-product" value={productName} maxLength={160} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Finished soap" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intended-import-quantity">Expected quantity</Label>
              <Input id="intended-import-quantity" type="number" min="0.000001" max="1000000000" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="e.g. 500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intended-import-country">Purchase country</Label>
              <Input id="intended-import-country" value={purchaseCountry} maxLength={100} onChange={(event) => setPurchaseCountry(event.target.value)} placeholder="e.g. Kenya" />
            </div>
          </div>
          <Button type="button" onClick={submitIntent} disabled={pending || !productName.trim() || !quantity || Number(quantity) <= 0 || !purchaseCountry.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record intended import
          </Button>
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium">My planned finished-product imports</h3>
            {intents.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">No planned product imports yet.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-md border">
                {intents.map((intent) => (
                  <li key={intent.id} className="grid gap-1 px-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5">
                    <span className="font-medium">{intent.productName}</span>
                    <span>{intent.plannedQuantity.toLocaleString()} planned</span>
                    <span className="text-muted-foreground">{intent.purchaseCountry} · {new Date(intent.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
