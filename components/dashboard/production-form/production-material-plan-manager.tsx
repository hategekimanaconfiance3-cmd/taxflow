"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, Loader2 } from "lucide-react";

interface Product { id: string; name: string; unit: string }
interface Recipe { id: string; productId: string; version: number; outputQuantity: number; productUnit: string }
interface Plan { id: string; productId: string; productName: string; recipeVersionId: string; recipeVersion: number; plannedOutputQuantity: string; status: string; createdAt: Date | string }

export function ProductionMaterialPlanManager({ products, recipes, plans }: { products: Product[]; recipes: Recipe[]; plans: Plan[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState("");
  const [recipeVersionId, setRecipeVersionId] = useState("");
  const [plannedOutputQuantity, setPlannedOutputQuantity] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const requestKey = useRef<string | null>(null);
  const eligibleRecipes = recipes.filter((recipe) => recipe.productId === productId);

  function updateProduct(value: string) {
    setProductId(value);
    setRecipeVersionId("");
    setPlannedOutputQuantity("");
    requestKey.current = null;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId || !recipeVersionId || Number(plannedOutputQuantity) <= 0) {
      setFeedback({ text: "Choose a product and recipe, then enter the intended output quantity.", error: true });
      return;
    }
    requestKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        const response = await fetch("/api/production/plans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productId, recipeVersionId, plannedOutputQuantity: Number(plannedOutputQuantity), idempotencyKey: requestKey.current }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) {
          setFeedback({ text: result.error ?? "Unable to save the production plan.", error: true });
          return;
        }
        setFeedback({ text: "Plan recorded. It has not changed material or finished-product stock.", error: false });
        requestKey.current = null;
        setPlannedOutputQuantity("");
        router.refresh();
      } catch {
        setFeedback({ text: "Could not save the plan. Check your connection and retry.", error: true });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" /> Production plans</CardTitle>
        <p className="text-sm text-muted-foreground">Plans use an immutable recipe version. Planning never deducts materials or creates finished stock.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={(event) => void submit(event)} className="grid gap-3 md:grid-cols-4 md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="material-plan-product">Finished product</Label>
            <select id="material-plan-product" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productId} onChange={(event) => updateProduct(event.target.value)}>
              <option value="">Choose a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="material-plan-recipe">Recipe version</Label>
            <select id="material-plan-recipe" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={recipeVersionId} onChange={(event) => { setRecipeVersionId(event.target.value); requestKey.current = null; }} disabled={!productId}>
              <option value="">Choose a recipe</option>
              {eligibleRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>Version {recipe.version} · output {recipe.outputQuantity} {recipe.productUnit}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="material-plan-quantity">Planned output</Label>
            <Input id="material-plan-quantity" type="number" min="0.000001" step="0.000001" value={plannedOutputQuantity} onChange={(event) => { setPlannedOutputQuantity(event.target.value); requestKey.current = null; }} />
          </div>
          <Button type="submit" disabled={pending || !recipeVersionId}>{pending && <Loader2 className="animate-spin" data-icon="inline-start" />}Save plan</Button>
        </form>
        {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-emerald-700"}>{feedback.text}</p>}
        <div className="space-y-2">
          <h3 className="font-medium">Recent plans</h3>
          {plans.length === 0 ? <p className="text-sm text-muted-foreground">No production plans are recorded.</p> : (
            <div className="divide-y rounded-md border">
              {plans.map((plan) => <div key={plan.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div><p className="font-medium">{plan.productName} · recipe version {plan.recipeVersion}</p><p className="text-xs text-muted-foreground">Planned output: {plan.plannedOutputQuantity} · {new Date(plan.createdAt).toLocaleDateString()}</p></div>
                <span className="rounded-full border px-2 py-0.5 text-xs capitalize">{plan.status.replaceAll("_", " ")}</span>
              </div>)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
