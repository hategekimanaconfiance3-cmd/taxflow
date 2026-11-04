"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import {
  productionEntrySchema,
  productRegistrationSchema,
  productionRecipeSchema,
  productionMaterialPlanSchema,
} from "@/lib/validation/production.schema";
import {
  assessMaterialVariance,
  calculateMaterialDifference,
  calculatePlannedMaterialQuantity,
} from "@/lib/production-confidentiality";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  Plus,
  Trash2,
  Info,
  ChevronRight,
  FlaskConical,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  unit: string;
  categoryCode: string | null;
}

interface RecipeMaterial {
  recipeMaterialId: string;
  materialId: string;
  materialCode: string;
  name: string;
  unit: string;
  quantity: number;
  consumptionToleranceBasisPoints: number | null;
  consumptionToleranceStandardId: string | null;
}

interface Recipe {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  version: number;
  outputQuantity: number;
  yieldToleranceBasisPoints: number | null;
  yieldToleranceStandardId: string | null;
  materials: RecipeMaterial[];
}

interface Plan {
  id: string;
  productId: string;
  productName: string;
  recipeVersionId: string;
  plannedOutputQuantity: string;
  status: string;
}

interface MaterialDraft {
  name: string;
  unit: string;
  quantity: string; // per recipe output
}

interface ProductionReportFormProps {
  products: Product[];
  recipes: Recipe[];
  plans: Plan[];
  vatRate: number;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

type ReviewStatus =
  | "within_standard"
  | "above_range"
  | "below_range"
  | "no_standard"
  | "pending";

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "within_standard")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Within standard
      </span>
    );
  if (status === "above_range" || status === "below_range")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" />{" "}
        {status === "above_range" ? "Above range" : "Below range"}
      </span>
    );
  if (status === "no_standard")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
        <Info className="h-3 w-3" /> No standard
      </span>
    );
  return (
    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-400 ring-1 ring-slate-200">
      —
    </span>
  );
}

function computeStatus(
  tol: number | null,
  actual: number | null,
  planned: number
): ReviewStatus {
  if (actual === null) return "pending";
  if (tol === null || planned <= 0) return "no_standard";
  try {
    const r = assessMaterialVariance(planned, actual, tol);
    if (r.status === "within_tolerance") return "within_standard";
    return actual > planned ? "above_range" : "below_range";
  } catch {
    return "no_standard";
  }
}

function fmtDiff(diff: number, unit: string) {
  if (diff === 0) return `0 ${unit}`;
  return `${diff > 0 ? "+" : ""}${diff.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${unit}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductionReportForm({
  products,
  recipes,
  plans,
  vatRate,
}: ProductionReportFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Step tracker ─────────────────────────────────────────────────────────
  // "product" → "recipe" → "plan" → "report"
  const [step, setStep] = useState<"product" | "recipe" | "plan" | "report">(
    "product"
  );

  // ── Product ───────────────────────────────────────────────────────────────
  const [availableProducts, setAvailableProducts] = useState(products);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductUnit, setNewProductUnit] = useState("kg");
  const [newProductCategory, setNewProductCategory] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");

  // ── Recipe builder ────────────────────────────────────────────────────────
  const [availableRecipes, setAvailableRecipes] = useState(recipes);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  // For building a new recipe inline
  const [recipeOutputQty, setRecipeOutputQty] = useState("1");
  const [draftMaterials, setDraftMaterials] = useState<MaterialDraft[]>([
    { name: "", unit: "kg", quantity: "" },
  ]);

  // ── Plan ──────────────────────────────────────────────────────────────────
  const [availablePlans, setAvailablePlans] = useState(plans);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [plannedOutputQty, setPlannedOutputQty] = useState("");
  const idempotencyKeyPlan = useRef<string | null>(null);

  // ── Production report ─────────────────────────────────────────────────────
  const [quantity, setQuantity] = useState(""); // actual total output
  const [goodOutput, setGoodOutput] = useState("");
  const [rejectedOutput, setRejectedOutput] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [actualQtys, setActualQtys] = useState<Record<string, string>>({});
  const idempotencyKeyReport = useRef<string | null>(null);

  // ── Messages ──────────────────────────────────────────────────────────────
  const [msg, setMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const productRecipes = availableRecipes.filter(
    (r) => r.productId === selectedProductId
  );
  const selectedRecipe = availableRecipes.find(
    (r) => r.id === selectedRecipeId && r.productId === selectedProductId
  );
  const selectedPlan = availablePlans.find(
    (p) => p.id === selectedPlanId && p.status === "planned"
  );
  const selectedProduct = availableProducts.find(
    (p) => p.id === selectedProductId
  );

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const totalValue =
    Number.isFinite(qty * price) ? Math.round(qty * price) : 0;
  const potentialTax = Math.round(totalValue * vatRate);

  const goodQty = Number(goodOutput) || 0;
  const rejectedQty = Number(rejectedOutput) || 0;
  const isReconciled =
    quantity.trim() !== "" &&
    goodOutput.trim() !== "" &&
    rejectedOutput.trim() !== "" &&
    Math.round((goodQty + rejectedQty) * 1_000_000) ===
      Math.round(qty * 1_000_000);

  const materialRows = selectedRecipe
    ? selectedRecipe.materials.map((m) => {
        const planned =
          Number(plannedOutputQty) > 0
            ? (() => {
                try {
                  return calculatePlannedMaterialQuantity(
                    Number(plannedOutputQty),
                    selectedRecipe.outputQuantity,
                    m.quantity
                  );
                } catch {
                  return 0;
                }
              })()
            : 0;
        const actualText = actualQtys[m.recipeMaterialId] ?? "";
        const actual =
          actualText.trim() !== "" &&
          Number.isFinite(Number(actualText)) &&
          Number(actualText) >= 0
            ? Number(actualText)
            : null;
        const diff =
          actual !== null && planned > 0
            ? calculateMaterialDifference(actual, planned)
            : null;
        return {
          ...m,
          planned,
          actual,
          actualText,
          diff,
          status: computeStatus(
            m.consumptionToleranceBasisPoints,
            actual,
            planned
          ),
        };
      })
    : [];

  const completedMaterials = materialRows.filter(
    (r) => r.actual !== null
  ).length;
  const reviewRequired = materialRows.filter(
    (r) => r.status === "above_range" || r.status === "below_range"
  ).length;
  const missingStandards = materialRows.filter(
    (r) => r.status === "no_standard"
  ).length;

  const reportIncomplete =
    !selectedRecipe ||
    !selectedPlan ||
    quantity.trim() === "" ||
    goodOutput.trim() === "" ||
    rejectedOutput.trim() === "" ||
    !isReconciled ||
    selectedRecipe.materials.some(
      (m) => !actualQtys[m.recipeMaterialId]?.trim()
    ) ||
    selectedRecipe.materials.some(
      (m) =>
        actualQtys[m.recipeMaterialId]?.trim() &&
        Number(actualQtys[m.recipeMaterialId]) === 0 &&
        !productionNotes.trim()
    );

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleCreateProduct() {
    const parsed = productRegistrationSchema.safeParse({
      name: newProductName,
      unit: newProductUnit,
      categoryCode: newProductCategory,
    });
    if (!parsed.success) {
      setMsg({
        text: parsed.error.issues[0]?.message ?? "Enter valid product details.",
        type: "error",
      });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body: { product?: Product; error?: string } = await res.json();
        if (!res.ok || !body.product) {
          setMsg({
            text: body.error ?? "Unable to register product.",
            type: "error",
          });
          return;
        }
        setAvailableProducts((cur) =>
          cur.some((p) => p.id === body.product?.id)
            ? cur
            : [...cur, body.product!]
        );
        setSelectedProductId(body.product.id);
        setShowNewProduct(false);
        setNewProductName("");
        setMsg(null);
        // move to recipe step automatically
        setStep("recipe");
        router.refresh();
      } catch {
        setMsg({ text: "Unable to register product. Try again.", type: "error" });
      }
    });
  }

  async function handleSaveRecipe() {
    const parsed = productionRecipeSchema.safeParse({
      productId: selectedProductId,
      outputQuantity: Number(recipeOutputQty),
      materials: draftMaterials.map((m) => ({
        name: m.name.trim(),
        unit: m.unit.trim(),
        quantity: Number(m.quantity),
      })),
    });
    if (!parsed.success) {
      setMsg({
        text: parsed.error.issues[0]?.message ?? "Check recipe details.",
        type: "error",
      });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/production/recipes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body: {
          recipe?: {
            id: string;
            version: number;
            outputQuantity: number;
            materials: RecipeMaterial[];
          };
          error?: string;
        } = await res.json();
        if (!res.ok || !body.recipe) {
          setMsg({
            text: body.error ?? "Unable to save recipe.",
            type: "error",
          });
          return;
        }
        // Build a full Recipe object from the response so we can use it immediately
        const newRecipe: Recipe = {
          id: body.recipe.id,
          productId: selectedProductId,
          productName: selectedProduct?.name ?? "",
          productUnit: selectedProduct?.unit ?? "",
          version: body.recipe.version,
          outputQuantity: body.recipe.outputQuantity,
          yieldToleranceBasisPoints: null,
          yieldToleranceStandardId: null,
          materials: body.recipe.materials,
        };
        setAvailableRecipes((cur) => [...cur, newRecipe]);
        setSelectedRecipeId(newRecipe.id);
        setMsg(null);
        setStep("plan");
        router.refresh();
      } catch {
        setMsg({ text: "Unable to save recipe. Try again.", type: "error" });
      }
    });
  }

  async function handleSavePlan() {
    if (!selectedRecipeId || Number(plannedOutputQty) <= 0) {
      setMsg({
        text: "Enter a planned output quantity.",
        type: "error",
      });
      return;
    }
    idempotencyKeyPlan.current ??= crypto.randomUUID();
    const parsed = productionMaterialPlanSchema.safeParse({
      productId: selectedProductId,
      recipeVersionId: selectedRecipeId,
      plannedOutputQuantity: Number(plannedOutputQty),
      idempotencyKey: idempotencyKeyPlan.current,
    });
    if (!parsed.success) {
      setMsg({
        text: parsed.error.issues[0]?.message ?? "Check plan details.",
        type: "error",
      });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/production/plans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body: {
          plan?: { id: string; plannedOutputQuantity: string };
          error?: string;
        } = await res.json();
        if (!res.ok || !body.plan) {
          setMsg({
            text: body.error ?? "Unable to save plan.",
            type: "error",
          });
          return;
        }
        const newPlan: Plan = {
          id: body.plan.id,
          productId: selectedProductId,
          productName: selectedProduct?.name ?? "",
          recipeVersionId: selectedRecipeId,
          plannedOutputQuantity: body.plan.plannedOutputQuantity,
          status: "planned",
        };
        setAvailablePlans((cur) => [...cur, newPlan]);
        setSelectedPlanId(newPlan.id);
        setPlannedOutputQty(newPlan.plannedOutputQuantity);
        idempotencyKeyPlan.current = null;
        setMsg(null);
        setStep("report");
        router.refresh();
      } catch {
        setMsg({ text: "Unable to save plan. Try again.", type: "error" });
      }
    });
  }

  async function handleSubmitReport() {
    if (!isReconciled) {
      setMsg({
        text: "Good output plus rejected output must equal actual total output.",
        type: "error",
      });
      return;
    }
    if (selectedRecipe?.materials.some((m) => !actualQtys[m.recipeMaterialId]?.trim())) {
      setMsg({
        text: "Enter actual quantity for every material.",
        type: "error",
      });
      return;
    }

    idempotencyKeyReport.current ??= crypto.randomUUID();
    const parsed = productionEntrySchema.safeParse({
      productId: selectedProductId,
      quantity: qty,
      unitPrice: price,
      idempotencyKey: idempotencyKeyReport.current,
      notes: productionNotes || undefined,
      materialPlanId: selectedPlan?.id,
      recipeVersionId: selectedRecipe?.id,
      plannedOutputQuantity: Number(plannedOutputQty),
      goodOutputQuantity: goodQty,
      rejectedOutputQuantity: rejectedQty,
      actualMaterials: selectedRecipe?.materials.map((m) => ({
        recipeMaterialId: m.recipeMaterialId,
        actualQuantity: Number(actualQtys[m.recipeMaterialId] ?? 0),
        wasteQuantity: 0,
      })),
    });
    if (!parsed.success) {
      setMsg({
        text: parsed.error.issues[0]?.message ?? "Check report details.",
        type: "error",
      });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/production", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body: {
          record?: {
            batchReference: string;
            quantity: number;
            unit: string;
          };
          error?: string;
          requestId?: string;
        } = await res.json();
        if (!res.ok || !body.record) {
          const ref = body.requestId ? ` Ref: ${body.requestId}` : "";
          setMsg({
            text: `${body.error ?? "Unable to submit."}${ref}`,
            type: "error",
          });
          return;
        }
        setMsg({
          text: `Submitted · batch ${body.record.batchReference} · ${body.record.quantity.toLocaleString()} ${body.record.unit} · held for review`,
          type: "success",
        });
        // Full reset
        setStep("product");
        setSelectedProductId("");
        setSelectedRecipeId("");
        setSelectedPlanId("");
        setPlannedOutputQty("");
        setQuantity("");
        setGoodOutput("");
        setRejectedOutput("");
        setUnitPrice("");
        setProductionNotes("");
        setActualQtys({});
        setDraftMaterials([{ name: "", unit: "kg", quantity: "" }]);
        setRecipeOutputQty("1");
        idempotencyKeyReport.current = null;
        router.refresh();
      } catch {
        setMsg({ text: "Unable to submit. Retrying is safe.", type: "error" });
      }
    });
  }

  function handleReset() {
    setStep("product");
    setSelectedProductId("");
    setSelectedRecipeId("");
    setSelectedPlanId("");
    setPlannedOutputQty("");
    setQuantity("");
    setGoodOutput("");
    setRejectedOutput("");
    setUnitPrice("");
    setProductionNotes("");
    setActualQtys({});
    setDraftMaterials([{ name: "", unit: "kg", quantity: "" }]);
    setRecipeOutputQty("1");
    setMsg(null);
    idempotencyKeyPlan.current = null;
    idempotencyKeyReport.current = null;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  // Product output units must match productRegistrationSchema enum
  const PRODUCT_UNITS = ["kg", "unit", "liter", "box", "pack", "ton"];
  // Material input units can be any common unit (productionRecipeSchema accepts any string)
  const MATERIAL_UNITS = ["kg", "g", "ton", "liter", "L", "mL", "m", "m²", "m³", "unit", "box", "pack", "bag", "drum"];

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Production Report</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record what you produced, what materials you used, and the output quantities.
          </p>
        </div>
        {step !== "product" && (
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={isPending}>
            Start over
          </Button>
        )}
      </div>

      {/* ── Progress breadcrumb ── */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {[
          { key: "product", label: "1. Product" },
          { key: "recipe", label: "2. Materials" },
          { key: "plan", label: "3. Planned output" },
          { key: "report", label: "4. Submit report" },
        ].map(({ key, label }, i, arr) => (
          <span key={key} className="flex items-center gap-1">
            <span
              className={
                step === key
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }
            >
              {label}
            </span>
            {i < arr.length - 1 && <ChevronRight className="h-3 w-3" />}
          </span>
        ))}
      </div>

      {/* ── Status message ── */}
      {msg && (
        <div
          role={msg.type === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${
            msg.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {msg.text}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1 — PRODUCT
      ══════════════════════════════════════════════════════════════════════ */}
      <Card className={step !== "product" ? "opacity-60" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Step 1 — Select the product you are making
            </CardTitle>
            {step !== "product" && selectedProduct && (
              <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {selectedProduct.name}
              </span>
            )}
          </div>
        </CardHeader>
        {step === "product" && (
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Finished product</Label>
                <Select
                  value={selectedProductId}
                  onValueChange={(v) => {
                    setSelectedProductId(v);
                    setSelectedRecipeId("");
                    setMsg(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewProduct(!showNewProduct)}
                  disabled={isPending}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {showNewProduct ? "Cancel" : "Register new product"}
                </Button>
              </div>
            </div>

            {showNewProduct && (
              <div className="space-y-3 rounded-md border border-dashed p-4">
                <p className="text-sm font-medium">New product</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-name" className="text-xs">Name</Label>
                    <Input
                      id="new-name"
                      placeholder="e.g. Cement"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      maxLength={160}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Output unit</Label>
                    <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-cat" className="text-xs">Category code (optional)</Label>
                    <Input
                      id="new-cat"
                      placeholder="RRA code"
                      value={newProductCategory}
                      onChange={(e) => setNewProductCategory(e.target.value)}
                      maxLength={64}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateProduct}
                  disabled={isPending || !newProductName.trim()}
                >
                  {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Create product
                </Button>
              </div>
            )}

            {selectedProductId && (
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setMsg(null);
                    if (productRecipes.length > 0) {
                      // Product already has recipes — go to plan step
                      setSelectedRecipeId(productRecipes[productRecipes.length - 1].id);
                      setStep("plan");
                    } else {
                      setStep("recipe");
                    }
                  }}
                  disabled={isPending}
                  className="gap-2"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — MATERIALS (Recipe builder OR recipe selector)
      ══════════════════════════════════════════════════════════════════════ */}
      {(step === "recipe" || (step !== "product" && step !== "recipe")) && (
        <Card className={step !== "recipe" ? "opacity-60" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" />
                  Step 2 — Materials you will use
                </CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  List every material needed to make this product and the quantity per batch.
                </p>
              </div>
              {step !== "recipe" && selectedRecipe && (
                <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selectedRecipe.materials.length} materials
                </span>
              )}
            </div>
          </CardHeader>

          {step === "recipe" && (
            <CardContent className="space-y-4">
              {/* If existing recipes, offer to select one */}
              {productRecipes.length > 0 && (
                <div className="space-y-3 rounded-md bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    This product already has a saved recipe. Select it or create a new version below.
                  </p>
                  <Select
                    value={selectedRecipeId}
                    onValueChange={(v) => setSelectedRecipeId(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Use an existing recipe version" />
                    </SelectTrigger>
                    <SelectContent>
                      {productRecipes.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          v{r.version} · {r.materials.length} materials · output {r.outputQuantity} {r.productUnit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRecipeId && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setMsg(null);
                        setStep("plan");
                      }}
                      disabled={isPending}
                    >
                      Use this recipe <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">or scroll down to create a new recipe version</p>
                </div>
              )}

              {/* Recipe builder — always shown to allow creating new version */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <Label htmlFor="recipe-output" className="text-xs font-medium">
                      Recipe output quantity — how many {selectedProduct?.unit ?? "units"} does one batch produce?
                    </Label>
                    <Input
                      id="recipe-output"
                      type="number"
                      min="0.000001"
                      step="any"
                      value={recipeOutputQty}
                      onChange={(e) => setRecipeOutputQty(e.target.value)}
                      className="w-40"
                      placeholder="e.g. 1000"
                    />
                  </div>
                </div>

                {/* Materials table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Materials consumed during production
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {draftMaterials.length}{" "}
                      {draftMaterials.length === 1 ? "material" : "materials"}
                    </span>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden overflow-hidden rounded-md border md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="px-3 py-2.5 text-left font-medium">#</th>
                          <th className="px-3 py-2.5 text-left font-medium">Material name</th>
                          <th className="px-3 py-2.5 text-left font-medium">Unit</th>
                          <th className="px-3 py-2.5 text-right font-medium">
                            Planned quantity (per {recipeOutputQty || "1"} {selectedProduct?.unit ?? "unit"} output)
                          </th>
                          <th className="px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {draftMaterials.map((m, i) => (
                          <tr key={i} className="group">
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {i + 1}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={m.name}
                                onChange={(e) =>
                                  setDraftMaterials((cur) =>
                                    cur.map((row, idx) =>
                                      idx === i ? { ...row, name: e.target.value } : row
                                    )
                                  )
                                }
                                placeholder="e.g. Limestone"
                                maxLength={120}
                                className="h-8"
                                aria-label={`Material ${i + 1} name`}
                              />
                            </td>
                            <td className="px-3 py-2 w-32">
                              <select
                                value={m.unit}
                                onChange={(e) =>
                                  setDraftMaterials((cur) =>
                                    cur.map((row, idx) =>
                                      idx === i ? { ...row, unit: e.target.value } : row
                                    )
                                  )
                                }
                                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                                aria-label={`Material ${i + 1} unit`}
                              >
                                {MATERIAL_UNITS.map((u) => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 w-44">
                              <Input
                                type="number"
                                min="0.000001"
                                step="any"
                                value={m.quantity}
                                onChange={(e) =>
                                  setDraftMaterials((cur) =>
                                    cur.map((row, idx) =>
                                      idx === i ? { ...row, quantity: e.target.value } : row
                                    )
                                  )
                                }
                                placeholder="0"
                                className="h-8 text-right tabular-nums"
                                aria-label={`Material ${i + 1} quantity`}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                                disabled={draftMaterials.length <= 1}
                                onClick={() =>
                                  setDraftMaterials((cur) =>
                                    cur.filter((_, idx) => idx !== i)
                                  )
                                }
                                aria-label={`Remove material ${i + 1}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="space-y-2 md:hidden">
                    {draftMaterials.map((m, i) => (
                      <div key={i} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">
                            Material {i + 1}
                          </span>
                          {draftMaterials.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-red-500"
                              onClick={() =>
                                setDraftMaterials((cur) =>
                                  cur.filter((_, idx) => idx !== i)
                                )
                              }
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={m.name}
                              onChange={(e) =>
                                setDraftMaterials((cur) =>
                                  cur.map((row, idx) =>
                                    idx === i ? { ...row, name: e.target.value } : row
                                  )
                                )
                              }
                              placeholder="Material name"
                              maxLength={120}
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unit</Label>
                            <select
                              value={m.unit}
                              onChange={(e) =>
                                setDraftMaterials((cur) =>
                                  cur.map((row, idx) =>
                                    idx === i ? { ...row, unit: e.target.value } : row
                                  )
                                )
                              }
                              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                            >
                              {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Planned quantity</Label>
                            <Input
                              type="number"
                              min="0.000001"
                              step="any"
                              value={m.quantity}
                              onChange={(e) =>
                                setDraftMaterials((cur) =>
                                  cur.map((row, idx) =>
                                    idx === i ? { ...row, quantity: e.target.value } : row
                                  )
                                )
                              }
                              placeholder="0"
                              className="h-8 text-right"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add material button */}
                  <button
                    type="button"
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                    onClick={() =>
                      setDraftMaterials((cur) => [
                        ...cur,
                        { name: "", unit: "kg", quantity: "" },
                      ])
                    }
                    disabled={draftMaterials.length >= 100}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add material
                  </button>
                </div>

                {/* Save recipe button */}
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    onClick={handleSaveRecipe}
                    disabled={
                      isPending ||
                      !selectedProductId ||
                      draftMaterials.some(
                        (m) => !m.name.trim() || !m.quantity
                      ) ||
                      Number(recipeOutputQty) <= 0
                    }
                    className="gap-2"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save recipe and continue
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Saved recipes are immutable — each save creates a new version.
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — PLANNED OUTPUT
      ══════════════════════════════════════════════════════════════════════ */}
      {(step === "plan" || step === "report") && (
        <Card className={step !== "plan" ? "opacity-60" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">
                  Step 3 — How much do you plan to produce?
                </CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Enter the expected output quantity. This determines planned material amounts.
                </p>
              </div>
              {step !== "plan" && selectedPlan && (
                <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selectedPlan.plannedOutputQuantity} {selectedRecipe?.productUnit}
                </span>
              )}
            </div>
          </CardHeader>
          {step === "plan" && (
            <CardContent className="space-y-4">
              {/* Select existing plan or create new */}
              {availablePlans.filter(
                (p) =>
                  p.status === "planned" && p.productId === selectedProductId
              ).length > 0 && (
                <div className="space-y-2 rounded-md bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Use an existing production plan:
                  </p>
                  <Select
                    value={selectedPlanId}
                    onValueChange={(v) => {
                      const plan = availablePlans.find((p) => p.id === v);
                      setSelectedPlanId(v);
                      if (plan) setPlannedOutputQty(plan.plannedOutputQuantity);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlans
                        .filter(
                          (p) =>
                            p.status === "planned" &&
                            p.productId === selectedProductId
                        )
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.plannedOutputQuantity} {selectedRecipe?.productUnit} — planned
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {selectedPlanId && (
                    <Button
                      size="sm"
                      onClick={() => { setMsg(null); setStep("report"); }}
                      disabled={isPending}
                    >
                      Use this plan <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="planned-output" className="text-xs font-medium">
                    Planned output ({selectedRecipe?.productUnit ?? "unit"})
                  </Label>
                  <Input
                    id="planned-output"
                    type="number"
                    min="0.000001"
                    step="any"
                    placeholder="e.g. 1000"
                    value={plannedOutputQty}
                    onChange={(e) => {
                      setPlannedOutputQty(e.target.value);
                      idempotencyKeyPlan.current = null;
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    How many {selectedRecipe?.productUnit ?? "units"} of {selectedProduct?.name ?? "product"} do you expect to produce?
                  </p>
                </div>

                {/* Preview planned material quantities */}
                {selectedRecipe && Number(plannedOutputQty) > 0 && (
                  <div className="rounded-md border overflow-hidden">
                    <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                      Planned materials for {plannedOutputQty} {selectedRecipe.productUnit} output
                    </div>
                    <table className="w-full text-xs">
                      <tbody className="divide-y">
                        {selectedRecipe.materials.map((m) => {
                          let planned = 0;
                          try {
                            planned = calculatePlannedMaterialQuantity(
                              Number(plannedOutputQty),
                              selectedRecipe.outputQuantity,
                              m.quantity
                            );
                          } catch { planned = 0; }
                          return (
                            <tr key={m.recipeMaterialId}>
                              <td className="px-3 py-2 font-medium">{m.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{m.unit}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">
                                {planned.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <Button
                  onClick={handleSavePlan}
                  disabled={isPending || Number(plannedOutputQty) <= 0}
                  className="gap-2"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save plan and continue
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 4 — SUBMIT PRODUCTION REPORT
      ══════════════════════════════════════════════════════════════════════ */}
      {step === "report" && (
        <>
          {/* ── Materials consumed table ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Step 4a — Materials consumed
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Enter how much of each material you actually used during production.
                  </p>
                </div>
                <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                  {materialRows.length} materials
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-md border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 text-left font-medium">Material</th>
                      <th className="px-3 py-2.5 text-left font-medium">Unit</th>
                      <th className="px-3 py-2.5 text-right font-medium">Planned</th>
                      <th className="px-3 py-2.5 text-right font-medium">Actually used</th>
                      <th className="px-3 py-2.5 text-right font-medium">Difference</th>
                      <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialRows.map((row) => (
                      <tr key={row.recipeMaterialId} className="hover:bg-muted/20">
                        <td className="px-3 py-3 font-medium">{row.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{row.unit}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {row.planned > 0
                            ? row.planned.toLocaleString(undefined, { maximumFractionDigits: 6 })
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            aria-label={`Actual quantity — ${row.name}`}
                            value={row.actualText}
                            onChange={(e) => {
                              setActualQtys((cur) => ({
                                ...cur,
                                [row.recipeMaterialId]: e.target.value,
                              }));
                              idempotencyKeyReport.current = null;
                            }}
                            className="h-8 w-32 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {row.diff === null ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <span
                              className={
                                row.diff === 0
                                  ? "text-muted-foreground"
                                  : "font-medium text-amber-700"
                              }
                            >
                              {fmtDiff(row.diff, row.unit)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {materialRows.map((row, i) => (
                  <div key={row.recipeMaterialId} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{row.name}</span>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p>Unit</p>
                        <p className="font-medium text-foreground">{row.unit}</p>
                      </div>
                      <div>
                        <p>Planned</p>
                        <p className="font-medium text-foreground tabular-nums">
                          {row.planned > 0
                            ? row.planned.toLocaleString(undefined, { maximumFractionDigits: 4 })
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p>Difference</p>
                        <p
                          className={`font-medium tabular-nums ${row.diff !== null && row.diff !== 0 ? "text-amber-700" : "text-foreground"}`}
                        >
                          {row.diff !== null ? fmtDiff(row.diff, "") : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`mob-${row.recipeMaterialId}`} className="text-xs">
                        Actually used ({row.unit})
                      </Label>
                      <Input
                        id={`mob-${row.recipeMaterialId}`}
                        type="number"
                        min="0"
                        step="0.000001"
                        value={row.actualText}
                        onChange={(e) => {
                          setActualQtys((cur) => ({
                            ...cur,
                            [row.recipeMaterialId]: e.target.value,
                          }));
                          idempotencyKeyReport.current = null;
                        }}
                        className="h-9 tabular-nums"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Validation summary */}
              <div className="rounded-md border bg-muted/20 p-3 text-xs">
                <p className="mb-1.5 font-medium text-muted-foreground">Report validation</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Material rows</span>
                    <span className="font-medium">{materialRows.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Complete rows</span>
                    <span className={completedMaterials === materialRows.length ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                      {completedMaterials} / {materialRows.length}
                    </span>
                  </div>
                  {reviewRequired > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Requiring review</span>
                      <span className="font-medium text-amber-700">{reviewRequired}</span>
                    </div>
                  )}
                  {missingStandards > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">No approved standard</span>
                      <span className="font-medium text-slate-500">{missingStandards}</span>
                    </div>
                  )}
                  {completedMaterials === materialRows.length && materialRows.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      All rows are complete.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Finished goods output ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Step 4b — Finished goods produced
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Record actual output. Good + Rejected must equal Actual total output.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 text-left font-medium">Output</th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        Quantity ({selectedRecipe?.productUnit})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-3 py-2.5 text-muted-foreground">Planned output</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground font-medium">
                        {plannedOutputQty || "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-medium">Actual total output</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min="0.0001"
                          step="any"
                          placeholder="e.g. 950"
                          aria-label="Actual total output"
                          value={quantity}
                          onChange={(e) => { setQuantity(e.target.value); idempotencyKeyReport.current = null; }}
                          className="ml-auto h-8 w-32 text-right tabular-nums"
                        />
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/40">
                      <td className="px-3 py-2 text-emerald-700">Good products</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.000001"
                          placeholder="e.g. 930"
                          aria-label="Good output"
                          value={goodOutput}
                          onChange={(e) => { setGoodOutput(e.target.value); idempotencyKeyReport.current = null; }}
                          className="ml-auto h-8 w-32 text-right tabular-nums"
                        />
                      </td>
                    </tr>
                    <tr className="bg-red-50/30">
                      <td className="px-3 py-2 text-red-700">Rejected products</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.000001"
                          placeholder="e.g. 20"
                          aria-label="Rejected output"
                          value={rejectedOutput}
                          onChange={(e) => { setRejectedOutput(e.target.value); idempotencyKeyReport.current = null; }}
                          className="ml-auto h-8 w-32 text-right tabular-nums"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Reconciliation */}
              {quantity.trim() && goodOutput.trim() && rejectedOutput.trim() && (
                <div
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                    isReconciled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {isReconciled ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {isReconciled
                    ? `Reconciled \u00b7 ${goodQty} + ${rejectedQty} = ${qty} ${selectedRecipe?.productUnit}`
                    : `Not reconciled \u00b7 ${goodQty} + ${rejectedQty} \u2260 ${qty}`}
                </div>
              )}

              {/* Unit price */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="unit-price" className="text-xs font-medium">
                    Unit price (RWF) — for inventory valuation
                  </Label>
                  <Input
                    id="unit-price"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 7000"
                    value={unitPrice}
                    onChange={(e) => { setUnitPrice(e.target.value); idempotencyKeyReport.current = null; }}
                  />
                </div>
                {totalValue > 0 && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-1">
                    <p className="text-muted-foreground">Total batch value</p>
                    <p className="text-base font-bold">{formatRWF(totalValue)}</p>
                    <p className="text-muted-foreground">
                      Potential tax ({Math.round(vatRate * 100)}%): {formatRWF(potentialTax)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Production notes ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Production notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={productionNotes}
                onChange={(e) => { setProductionNotes(e.target.value); idempotencyKeyReport.current = null; }}
                maxLength={2_000}
                rows={3}
                placeholder="Describe any production differences, explain zero consumption on a material, or note problems encountered."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {productionNotes.length} / 2,000
              </p>
            </CardContent>
          </Card>

          {/* ── Submit actions ── */}
          <div className="flex flex-wrap items-center gap-3 pb-2">
            <Button
              onClick={handleSubmitReport}
              disabled={
                isPending ||
                price <= 0 ||
                !Number.isInteger(price) ||
                reportIncomplete
              }
              className="gap-2"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Submit for verification
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              disabled={isPending}
            >
              Cancel
            </Button>
            <p className="text-xs text-muted-foreground">
              Stock is held until an authorised reviewer releases the batch.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
