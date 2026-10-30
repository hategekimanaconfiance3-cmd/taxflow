"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { productionRecipeSchema } from "@/lib/validation/production.schema";

interface ProductOption { id: string; name: string; unit: string }
interface MaterialDraft { name: string; unit: string; quantity: string; consumptionTolerancePercent: string }

export function RecipeManager({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [tolerancePercent, setTolerancePercent] = useState("0");
  const [materials, setMaterials] = useState<MaterialDraft[]>([{ name: "", unit: "kg", quantity: "", consumptionTolerancePercent: "" }]);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function updateMaterial(index: number, key: keyof MaterialDraft, value: string) {
    setMaterials((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  function createRecipe() {
    const parsed = productionRecipeSchema.safeParse({
      productId,
      outputQuantity: Number(outputQuantity),
      yieldToleranceBasisPoints: Math.round(Number(tolerancePercent) * 100),
      materials: materials.map((row) => ({
        name: row.name,
        unit: row.unit,
        quantity: Number(row.quantity),
        consumptionToleranceBasisPoints: row.consumptionTolerancePercent === "" ? null : Math.round(Number(row.consumptionTolerancePercent) * 100),
      })),
    });
    if (!parsed.success) {
      setMessage({ text: parsed.error.issues[0]?.message ?? "Enter valid recipe details.", error: true });
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/production/recipes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const result = await response.json() as { recipe?: { version: number }; error?: string; requestId?: string };
        if (!response.ok || !result.recipe) {
          const requestReference = result.requestId ? ` Reference: ${result.requestId}` : "";
          setMessage({ text: `${result.error ?? "Unable to save this recipe version."}${requestReference}`, error: true });
          return;
        }
        setMessage({ text: `Recipe version ${result.recipe.version} saved. Previous versions remain unchanged.`, error: false });
        setMaterials([{ name: "", unit: "kg", quantity: "", consumptionTolerancePercent: "" }]);
        setTolerancePercent("0");
        router.refresh();
      } catch {
        setMessage({ text: "Unable to save this recipe. Check your connection and retry.", error: true });
      }
    });
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Confidential recipes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only authorized users for your manufacturer account can retrieve ingredient names. Saving changes creates a new immutable version.</p>
      </div>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{message.text}</p>}
      {products.length === 0 ? <p className="text-sm text-muted-foreground">Register a product before creating its recipe.</p> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Finished product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipe-output-quantity">Recipe output quantity</Label>
              <Input id="recipe-output-quantity" type="number" min="0.000001" step="any" value={outputQuantity} onChange={(event) => setOutputQuantity(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipe-tolerance">Manufacturer configured yield tolerance (%)</Label>
              <Input id="recipe-tolerance" type="number" min="0" max="100" step="0.01" value={tolerancePercent} onChange={(event) => setTolerancePercent(event.target.value)} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Materials per recipe output</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setMaterials((current) => [...current, { name: "", unit: "kg", quantity: "", consumptionTolerancePercent: "" }])} disabled={pending || materials.length >= 100}>
                <Plus className="mr-1 h-4 w-4" /> Add material
              </Button>
            </div>
            {materials.map((material, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label htmlFor={`material-name-${index}`}>Confidential material name</Label><Input id={`material-name-${index}`} value={material.name} maxLength={120} onChange={(event) => updateMaterial(index, "name", event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`material-unit-${index}`}>Unit</Label><Input id={`material-unit-${index}`} value={material.unit} maxLength={32} onChange={(event) => updateMaterial(index, "unit", event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`material-qty-${index}`}>Planned quantity</Label><Input id={`material-qty-${index}`} type="number" min="0.000001" step="any" value={material.quantity} onChange={(event) => updateMaterial(index, "quantity", event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`material-tolerance-${index}`}>Material tolerance (%) <span className="text-muted-foreground">optional</span></Label><Input id={`material-tolerance-${index}`} type="number" min="0" max="100" step="0.01" value={material.consumptionTolerancePercent} onChange={(event) => updateMaterial(index, "consumptionTolerancePercent", event.target.value)} /><p className="text-xs text-muted-foreground">Leave blank when no material-specific standard is configured; the batch remains reviewable.</p></div>
                {materials.length > 1 && <div className="lg:col-span-4"><Button type="button" variant="ghost" size="sm" onClick={() => setMaterials((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove material</Button></div>}
              </div>
            ))}
          </div>
          <Button type="button" onClick={createRecipe} disabled={pending || !productId}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save immutable recipe version
          </Button>
        </div>
      )}
    </section>
  );
}
