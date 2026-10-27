"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { manufacturingMaterialSchema, manufacturingRecipeSchema } from "@/lib/validation/production.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProductOption { id: string; name: string; unit: string; }
interface MaterialOption { id: string; materialCode: string; name: string; unit: string; }
interface RecipeOption {
  id: string; productId: string; productName: string; version: number;
  batchOutputQuantity: number; materialTolerancePercent: number;
  materials: Array<{ materialId: string; materialCode: string; materialName: string; unit: string; plannedQuantity: number }>;
}

export function ManufacturingRecipeManager({
  products,
  initialMaterials,
  recipes,
}: {
  products: ProductOption[];
  initialMaterials: MaterialOption[];
  recipes: RecipeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [materials, setMaterials] = useState(initialMaterials);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [batchOutputQuantity, setBatchOutputQuantity] = useState("1");
  const [tolerance, setTolerance] = useState("5");
  const [lines, setLines] = useState([{ materialId: "", plannedQuantity: "" }]);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  function submitMaterial() {
    const parsed = manufacturingMaterialSchema.safeParse({ name, unit });
    if (!parsed.success) return setFeedback({ error: true, text: parsed.error.issues[0]?.message ?? "Check material details." });
    startTransition(async () => {
      try {
        const response = await fetch("/api/manufacturing/materials", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data),
        });
        const body = await response.json() as { material?: MaterialOption; error?: string };
        if (!response.ok || !body.material) return setFeedback({ error: true, text: body.error ?? "Unable to save material." });
        setMaterials((current) => [...current, body.material!]);
        setName("");
        setFeedback({ error: false, text: `Saved protected material code ${body.material.materialCode}.` });
        router.refresh();
      } catch {
        setFeedback({ error: true, text: "Unable to save material. Check your connection and retry." });
      }
    });
  }

  function submitRecipe() {
    const parsed = manufacturingRecipeSchema.safeParse({
      productId,
      batchOutputQuantity: Number(batchOutputQuantity),
      materialTolerancePercent: Number(tolerance),
      materials: lines.map((line) => ({ materialId: line.materialId, plannedQuantity: Number(line.plannedQuantity) })),
    });
    if (!parsed.success) return setFeedback({ error: true, text: parsed.error.issues[0]?.message ?? "Check recipe details." });
    startTransition(async () => {
      try {
        const response = await fetch("/api/manufacturing/recipes", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data),
        });
        const body = await response.json() as { recipe?: { version: number }; error?: string };
        if (!response.ok || !body.recipe) return setFeedback({ error: true, text: body.error ?? "Unable to save recipe." });
        setFeedback({ error: false, text: `Saved recipe version ${body.recipe.version}. Previous recipe versions remain unchanged.` });
        setLines([{ materialId: "", plannedQuantity: "" }]);
        router.refresh();
      } catch {
        setFeedback({ error: true, text: "Unable to save recipe. Check your connection and retry." });
      }
    });
  }

  return (
    <section className="space-y-5 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Confidential recipes and materials</h2>
        <p className="text-sm text-muted-foreground">Only your manufacturer account can view material names. New recipes create immutable versions.</p>
      </div>
      {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-emerald-700"}>{feedback.text}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border p-4">
          <h3 className="font-medium">Register a material</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="material-name">Confidential material name</Label><Input id="material-name" value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="material-unit">Unit</Label><Input id="material-unit" value={unit} maxLength={32} onChange={(event) => setUnit(event.target.value)} /></div>
          </div>
          <Button type="button" onClick={submitMaterial} disabled={pending || !name.trim()}>Register material</Button>
          <ul className="space-y-1 text-sm text-muted-foreground">{materials.map((material) => <li key={material.id}><span className="font-mono">{material.materialCode}</span> · {material.name} ({material.unit})</li>)}</ul>
        </div>
        <div className="space-y-3 rounded-md border p-4">
          <h3 className="font-medium">Create recipe version</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3"><Label htmlFor="recipe-product">Finished product</Label><select id="recipe-product" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="recipe-output">Output per recipe batch</Label><Input id="recipe-output" type="number" min="0.0001" step="any" value={batchOutputQuantity} onChange={(event) => setBatchOutputQuantity(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="recipe-tolerance">Usage tolerance (%)</Label><Input id="recipe-tolerance" type="number" min="0" max="100" step="any" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></div>
          </div>
          {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_8rem] gap-2">
            <select aria-label={`Material ${index + 1}`} className="h-10 rounded-md border bg-background px-3 text-sm" value={line.materialId} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, materialId: event.target.value } : item))}>
              <option value="">Select material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.materialCode} · {material.name}</option>)}
            </select>
            <Input aria-label={`Planned quantity ${index + 1}`} type="number" min="0.0001" step="any" placeholder="Quantity" value={line.plannedQuantity} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, plannedQuantity: event.target.value } : item))} />
          </div>)}
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { materialId: "", plannedQuantity: "" }])} disabled={materials.length === 0}>Add material</Button><Button type="button" onClick={submitRecipe} disabled={pending || !productId || materials.length === 0}>Save recipe version</Button></div>
          <div className="space-y-1 text-sm text-muted-foreground">{recipes.map((recipe) => <p key={recipe.id}>{recipe.productName} · version {recipe.version} · {recipe.materials.length} protected materials</p>)}</div>
        </div>
      </div>
    </section>
  );
}
