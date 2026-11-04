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

interface ProductionReportFormProps {
  products: Product[];
  recipes: Recipe[];
  plans: Plan[];
  vatRate: number;
}

interface ApiError {
  error?: string;
  requestId?: string;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

type ReviewStatus =
  | "within_standard"
  | "above_range"
  | "below_range"
  | "review_required"
  | "no_standard"
  | "pending";

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "within_standard")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Within standard
      </span>
    );
  if (status === "above_range")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" />
        Above range
      </span>
    );
  if (status === "below_range")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" />
        Below range
      </span>
    );
  if (status === "review_required")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" />
        Review required
      </span>
    );
  if (status === "no_standard")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
        <Info className="h-3 w-3" />
        No standard
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-200">
      —
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(
  material: RecipeMaterial,
  actual: number | null,
  planned: number
): ReviewStatus {
  if (actual === null) return "pending";
  if (material.consumptionToleranceBasisPoints === null) return "no_standard";
  if (planned <= 0) return "no_standard";
  try {
    const result = assessMaterialVariance(
      planned,
      actual,
      material.consumptionToleranceBasisPoints
    );
    if (result.status === "within_tolerance") return "within_standard";
    return actual > planned ? "above_range" : "below_range";
  } catch {
    return "review_required";
  }
}

function formatDiff(diff: number, unit: string): string {
  if (diff === 0) return `0 ${unit}`;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${unit}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProductionReportForm({
  products,
  recipes,
  plans,
  vatRate,
}: ProductionReportFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Product registration
  const [availableProducts, setAvailableProducts] = useState(products);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductUnit, setNewProductUnit] = useState("box");
  const [newProductCategory, setNewProductCategory] = useState("");

  // Core selections
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");

  // Output fields
  const [plannedOutputQuantity, setPlannedOutputQuantity] = useState("");
  const [quantity, setQuantity] = useState(""); // actual total output
  const [goodOutputQuantity, setGoodOutputQuantity] = useState("");
  const [rejectedOutputQuantity, setRejectedOutputQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [productionNotes, setProductionNotes] = useState("");

  // Material actuals: keyed by recipeMaterialId
  const [actualMaterialQuantities, setActualMaterialQuantities] = useState<
    Record<string, string>
  >({});

  // Status
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  // ─── Derived values ────────────────────────────────────────────────────────

  const selectedRecipe = recipes.find(
    (r) => r.id === selectedRecipeId && r.productId === selectedProductId
  );
  const selectedPlan = plans.find(
    (p) => p.id === selectedPlanId && p.status === "planned"
  );
  const productRecipes = recipes.filter(
    (r) => r.productId === selectedProductId
  );
  const recipeRequired = productRecipes.length > 0;

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const totalValue = Number.isFinite(qty * price) ? Math.round(qty * price) : 0;
  const potentialTax = Math.round(totalValue * vatRate);

  // Output reconciliation
  const goodQty = Number(goodOutputQuantity) || 0;
  const rejectedQty = Number(rejectedOutputQuantity) || 0;
  const isReconciled =
    quantity.trim() !== "" &&
    goodOutputQuantity.trim() !== "" &&
    rejectedOutputQuantity.trim() !== "" &&
    Math.round((goodQty + rejectedQty) * 1_000_000) ===
      Math.round(qty * 1_000_000);

  // Material rows with computed values
  const materialRows = selectedRecipe
    ? selectedRecipe.materials.map((m) => {
        const planned =
          Number(plannedOutputQuantity) > 0
            ? (() => {
                try {
                  return calculatePlannedMaterialQuantity(
                    Number(plannedOutputQuantity),
                    selectedRecipe.outputQuantity,
                    m.quantity
                  );
                } catch {
                  return 0;
                }
              })()
            : 0;
        const actualText = actualMaterialQuantities[m.recipeMaterialId] ?? "";
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
        const status = computeStatus(m, actual, planned);
        return { ...m, planned, actual, actualText, diff, status };
      })
    : [];

  // Review summary stats
  const totalMaterials = materialRows.length;
  const completedMaterials = materialRows.filter((r) => r.actual !== null).length;
  const reviewRequired = materialRows.filter(
    (r) =>
      r.status === "above_range" ||
      r.status === "below_range" ||
      r.status === "review_required"
  ).length;
  const missingStandards = materialRows.filter(
    (r) => r.status === "no_standard"
  ).length;

  const recipeSubmissionIncomplete =
    (recipeRequired && !selectedRecipe) ||
    Boolean(
      selectedRecipe &&
        (!selectedPlan ||
          quantity.trim() === "" ||
          goodOutputQuantity.trim() === "" ||
          rejectedOutputQuantity.trim() === "" ||
          !isReconciled ||
          selectedRecipe.materials.some(
            (m) => !actualMaterialQuantities[m.recipeMaterialId]?.trim()
          ) ||
          selectedRecipe.materials.some(
            (m) =>
              actualMaterialQuantities[m.recipeMaterialId]?.trim() &&
              Number(actualMaterialQuantities[m.recipeMaterialId]) === 0 &&
              !productionNotes.trim()
          ))
    );

  function resetKey() {
    idempotencyKey.current = null;
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreateProduct() {
    const parsed = productRegistrationSchema.safeParse({
      name: newProductName,
      unit: newProductUnit,
      categoryCode: newProductCategory,
    });
    if (!parsed.success) {
      setMessage({
        text: parsed.error.issues[0]?.message ?? "Enter valid product details.",
        type: "error",
      });
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body: { product?: Product } & ApiError = await response.json();
        if (!response.ok || !body.product) {
          setMessage({
            text: body.error ?? "Unable to register this product.",
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
        setNewProductName("");
        setNewProductCategory("");
        setShowNewProduct(false);
        setMessage({
          text: `Product registered · ${body.product.id}`,
          type: "success",
        });
        router.refresh();
      } catch {
        setMessage({
          text: "Unable to register this product. Try again.",
          type: "error",
        });
      }
    });
  }

  async function handleSubmit() {
    if (recipeRequired && !selectedRecipe) {
      setMessage({
        text: "This product has an approved recipe. Select the recipe and reserved plan.",
        type: "error",
      });
      return;
    }
    if (selectedRecipe && !selectedPlan) {
      setMessage({
        text: "Create and select a reserved material plan before submitting.",
        type: "error",
      });
      return;
    }
    if (
      selectedRecipe &&
      selectedRecipe.materials.some(
        (m) => !actualMaterialQuantities[m.recipeMaterialId]?.trim()
      )
    ) {
      setMessage({
        text: "Enter actual quantity for every material in the recipe.",
        type: "error",
      });
      return;
    }
    if (selectedRecipe && !isReconciled) {
      setMessage({
        text: "Good output plus rejected output must equal actual total output.",
        type: "error",
      });
      return;
    }

    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;

    const parsed = productionEntrySchema.safeParse({
      productId: selectedProductId,
      quantity: qty,
      unitPrice: price,
      idempotencyKey: key,
      notes: productionNotes,
      ...(selectedPlan ? { materialPlanId: selectedPlan.id } : {}),
      ...(selectedRecipe
        ? {
            recipeVersionId: selectedRecipe.id,
            plannedOutputQuantity: Number(plannedOutputQuantity),
            goodOutputQuantity: goodQty,
            rejectedOutputQuantity: rejectedQty,
            actualMaterials: selectedRecipe.materials.map((m) => ({
              recipeMaterialId: m.recipeMaterialId,
              actualQuantity: Number(
                actualMaterialQuantities[m.recipeMaterialId]
              ),
              wasteQuantity: 0,
            })),
          }
        : {}),
    });

    if (!parsed.success) {
      setMessage({
        text:
          parsed.error.issues[0]?.message ?? "Enter valid production details.",
        type: "error",
      });
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/production", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body: {
          record?: {
            batchReference: string;
            quantity: number;
            unit: string;
            productionValidationStatus?: string;
          };
        } & ApiError = await response.json();
        if (!response.ok || !body.record) {
          const ref = body.requestId ? ` Reference: ${body.requestId}` : "";
          setMessage({
            text: `${body.error ?? "Unable to save production."}${ref}`,
            type: "error",
          });
          return;
        }
        setMessage({
          text: `Declaration saved · ${body.record.batchReference} · ${body.record.quantity.toLocaleString()} ${body.record.unit}${selectedRecipe ? " · held until authorised material review" : ""}`,
          type: "success",
        });
        // Reset form
        setQuantity("");
        setUnitPrice("");
        setSelectedProductId("");
        setSelectedRecipeId("");
        setSelectedPlanId("");
        setActualMaterialQuantities({});
        setPlannedOutputQuantity("");
        setGoodOutputQuantity("");
        setRejectedOutputQuantity("");
        setProductionNotes("");
        idempotencyKey.current = null;
        router.refresh();
      } catch {
        setMessage({
          text: "Unable to save. The same submission will not be counted twice if you retry.",
          type: "error",
        });
      }
    });
  }

  function handleCancel() {
    setSelectedProductId("");
    setSelectedRecipeId("");
    setSelectedPlanId("");
    setActualMaterialQuantities({});
    setPlannedOutputQuantity("");
    setQuantity("");
    setGoodOutputQuantity("");
    setRejectedOutputQuantity("");
    setUnitPrice("");
    setProductionNotes("");
    setMessage(null);
    idempotencyKey.current = null;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Production Report</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Record a production run and submit for verification. The batch reference is generated on submission.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNewProduct(!showNewProduct)}
          disabled={isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {showNewProduct ? "Cancel" : "Register Product"}
        </Button>
      </div>

      {/* ── Message ── */}
      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2.5 text-sm flex items-start gap-2 ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* ── New Product Panel ── */}
      {showNewProduct && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">Register New Product</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-product-name" className="text-xs">
                  Product name
                </Label>
                <Input
                  id="new-product-name"
                  placeholder="e.g., Soap"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  maxLength={160}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Select
                  value={newProductUnit}
                  onValueChange={setNewProductUnit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kilogram (kg)</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                    <SelectItem value="liter">Litre (L)</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                    <SelectItem value="ton">Ton</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-product-category" className="text-xs">
                  Category code (optional)
                </Label>
                <Input
                  id="new-product-category"
                  placeholder="RRA category"
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
              {isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Create Product
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Production Information
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            1. Production information
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Select the finished product and its reserved plan. The batch
            reference is generated on submission.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Finished product */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Finished product</Label>
              <Select
                value={selectedProductId}
                onValueChange={(v) => {
                  setSelectedProductId(v);
                  setSelectedRecipeId("");
                  setSelectedPlanId("");
                  setActualMaterialQuantities({});
                  setPlannedOutputQuantity("");
                  resetKey();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose product" />
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

            {/* Production plan */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Production plan</Label>
              <Select
                value={selectedPlanId || "none"}
                disabled={!selectedProductId}
                onValueChange={(v) => {
                  if (v === "none") {
                    setSelectedPlanId("");
                    setPlannedOutputQuantity("");
                    return;
                  }
                  const plan = plans.find(
                    (p) => p.id === v && p.status === "planned"
                  );
                  setSelectedPlanId(plan?.id ?? "");
                  if (plan) {
                    setSelectedProductId(plan.productId);
                    setSelectedRecipeId(plan.recipeVersionId);
                    setPlannedOutputQuantity(plan.plannedOutputQuantity);
                  }
                  setActualMaterialQuantities({});
                  resetKey();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plan selected</SelectItem>
                  {plans
                    .filter(
                      (p) =>
                        p.status === "planned" &&
                        (!selectedProductId ||
                          p.productId === selectedProductId)
                    )
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.productName} · {p.plannedOutputQuantity}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipe version */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Approved recipe version
              </Label>
              <Select
                value={selectedRecipeId}
                disabled={!selectedProductId || productRecipes.length === 0}
                onValueChange={(v) => {
                  setSelectedRecipeId(v);
                  setSelectedPlanId("");
                  setActualMaterialQuantities({});
                  setPlannedOutputQuantity("");
                  resetKey();
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      productRecipes.length === 0
                        ? "No recipe"
                        : "Choose version"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {productRecipes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      v{r.version} · {r.materials.length} materials
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit price */}
            <div className="space-y-1.5">
              <Label htmlFor="rpt-unit-price" className="text-xs font-medium">
                Unit price (RWF)
              </Label>
              <Input
                id="rpt-unit-price"
                type="number"
                placeholder="7000"
                min="0"
                step="1"
                value={unitPrice}
                onChange={(e) => {
                  setUnitPrice(e.target.value);
                  resetKey();
                }}
              />
            </div>
          </div>

          {/* Summary row */}
          {selectedRecipe && (
            <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                Recipe:{" "}
                <strong className="text-foreground">
                  v{selectedRecipe.version}
                </strong>
              </span>
              <span>
                Planned output:{" "}
                <strong className="text-foreground">
                  {plannedOutputQuantity || "—"} {selectedRecipe.productUnit}
                </strong>
              </span>
              <span>
                Yield standard:{" "}
                <strong
                  className={
                    selectedRecipe.yieldToleranceBasisPoints === null
                      ? "text-amber-700"
                      : "text-foreground"
                  }
                >
                  {selectedRecipe.yieldToleranceBasisPoints === null
                    ? "Review required · no approved standard"
                    : `\u00b1${(selectedRecipe.yieldToleranceBasisPoints / 100).toFixed(2)}%`}
                </strong>
              </span>
              {totalValue > 0 && (
                <span className="ml-auto font-medium text-foreground">
                  {formatRWF(totalValue)} total · {formatRWF(potentialTax)}{" "}
                  potential tax
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Materials Consumed
      ══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                2. Materials consumed
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Planned quantities come from the approved recipe. Actual
                quantities are entered by you.
              </p>
            </div>
            {selectedRecipe && (
              <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                {selectedRecipe.materials.length}{" "}
                {selectedRecipe.materials.length === 1
                  ? "material"
                  : "materials"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedRecipe ? (
            <div className="rounded-md border border-dashed bg-muted/20 py-10 text-center text-sm text-muted-foreground">
              {selectedProductId && productRecipes.length === 0
                ? "This product has no approved recipe. Use the quantity field below for non-recipe production."
                : "Select a finished product with an approved recipe to see required materials here."}
            </div>
          ) : (
            <div className="space-y-3">
              {/* ── Table (desktop) ── */}
              <div className="hidden overflow-x-auto rounded-md border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 text-left font-medium">
                        Material
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Unit
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        Planned
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        Actual used
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        Difference
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-2.5" aria-label="Action" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialRows.map((row) => (
                      <tr
                        key={row.recipeMaterialId}
                        className="group hover:bg-muted/20"
                      >
                        <td className="px-3 py-2.5 font-medium">{row.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {row.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.planned > 0 ? (
                            row.planned.toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            aria-label={`Actual quantity used \u2014 ${row.name}`}
                            value={row.actualText}
                            onChange={(e) => {
                              setActualMaterialQuantities((cur) => ({
                                ...cur,
                                [row.recipeMaterialId]: e.target.value,
                              }));
                              resetKey();
                            }}
                            className="h-8 w-32 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
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
                              {formatDiff(row.diff, row.unit)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            title="Recipe materials cannot be removed. Enter 0 with a production note if this material was not used."
                            aria-label="Required recipe material — cannot be removed"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled
                              className="h-7 w-7 p-0 text-muted-foreground/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Cards (mobile) ── */}
              <div className="space-y-3 md:hidden">
                {materialRows.map((row, i) => (
                  <div
                    key={row.recipeMaterialId}
                    className="rounded-lg border p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Material {i + 1} — {row.name}
                      </span>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Unit</p>
                        <p className="text-sm">{row.unit}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Planned quantity
                        </p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {row.planned > 0
                            ? `${row.planned.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${row.unit}`
                            : "—"}
                        </p>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label
                          htmlFor={`mob-actual-${row.recipeMaterialId}`}
                          className="text-xs text-muted-foreground"
                        >
                          Actual quantity used ({row.unit})
                        </Label>
                        <Input
                          id={`mob-actual-${row.recipeMaterialId}`}
                          type="number"
                          min="0"
                          step="0.000001"
                          value={row.actualText}
                          onChange={(e) => {
                            setActualMaterialQuantities((cur) => ({
                              ...cur,
                              [row.recipeMaterialId]: e.target.value,
                            }));
                            resetKey();
                          }}
                          className="h-8 tabular-nums"
                        />
                      </div>
                    </div>
                    {row.diff !== null && (
                      <p className="text-right text-xs tabular-nums">
                        Difference:{" "}
                        <span
                          className={
                            row.diff === 0
                              ? "text-foreground"
                              : "font-semibold text-amber-700"
                          }
                        >
                          {formatDiff(row.diff, row.unit)}
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Add additional material note ── */}
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                onClick={() =>
                  setProductionNotes((cur) =>
                    cur.trim()
                      ? cur
                      : "Additional materials used:\n"
                  )
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add additional material note
              </button>

              {/* ── Validation summary ── */}
              <div className="rounded-md border bg-muted/20 p-3 text-xs">
                <p className="mb-1.5 font-medium text-muted-foreground">
                  Report validation
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Material rows
                    </span>
                    <span className="font-medium">{totalMaterials}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Complete rows
                    </span>
                    <span
                      className={
                        completedMaterials === totalMaterials
                          ? "font-medium text-emerald-700"
                          : "font-medium text-amber-700"
                      }
                    >
                      {completedMaterials} / {totalMaterials}
                    </span>
                  </div>
                  {reviewRequired > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Requiring review
                      </span>
                      <span className="font-medium text-amber-700">
                        {reviewRequired}
                      </span>
                    </div>
                  )}
                  {missingStandards > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Missing standards
                      </span>
                      <span className="font-medium text-slate-500">
                        {missingStandards}
                      </span>
                    </div>
                  )}
                  {completedMaterials === totalMaterials &&
                    totalMaterials > 0 && (
                      <p className="mt-1.5 flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        All rows are complete in this preview.
                      </p>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ── Non-recipe path ── */}
          {selectedProductId && productRecipes.length === 0 && (
            <div className="mt-4 space-y-3 rounded-md border border-dashed bg-muted/10 p-4">
              <p className="text-sm font-medium">Non-recipe production</p>
              <p className="text-xs text-muted-foreground">
                This product has no approved recipe. Enter the total quantity
                produced.
              </p>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="rpt-qty" className="text-xs">
                  Quantity produced
                </Label>
                <Input
                  id="rpt-qty"
                  type="number"
                  placeholder="1000"
                  min="0.0001"
                  step="any"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    resetKey();
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — Finished Goods Output
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedRecipe && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              3. Finished-goods output
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Good output plus rejected output must equal actual total output.
              Stock is held until an authorised reviewer releases the batch.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 text-left font-medium">
                      Output
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Quantity ({selectedRecipe.productUnit})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      Planned output
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {plannedOutputQuantity || "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 font-medium">
                      Actual total output
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        placeholder="e.g. 950"
                        min="0.0001"
                        step="any"
                        aria-label="Actual total output"
                        value={quantity}
                        onChange={(e) => {
                          setQuantity(e.target.value);
                          resetKey();
                        }}
                        className="ml-auto h-8 w-32 text-right tabular-nums"
                      />
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/40">
                    <td className="px-3 py-2.5 text-emerald-700">
                      Good output
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        placeholder="e.g. 930"
                        min="0"
                        step="0.000001"
                        aria-label="Good output"
                        value={goodOutputQuantity}
                        onChange={(e) => {
                          setGoodOutputQuantity(e.target.value);
                          resetKey();
                        }}
                        className="ml-auto h-8 w-32 text-right tabular-nums"
                      />
                    </td>
                  </tr>
                  <tr className="bg-red-50/30">
                    <td className="px-3 py-2.5 text-red-700">
                      Rejected output
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        placeholder="e.g. 20"
                        min="0"
                        step="0.000001"
                        aria-label="Rejected output"
                        value={rejectedOutputQuantity}
                        onChange={(e) => {
                          setRejectedOutputQuantity(e.target.value);
                          resetKey();
                        }}
                        className="ml-auto h-8 w-32 text-right tabular-nums"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Reconciliation indicator */}
            {quantity.trim() &&
              goodOutputQuantity.trim() &&
              rejectedOutputQuantity.trim() && (
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
                    ? `Reconciled \u00b7 ${goodQty} + ${rejectedQty} = ${qty} ${selectedRecipe.productUnit}`
                    : `Not reconciled \u00b7 ${goodQty} + ${rejectedQty} = ${(goodQty + rejectedQty).toLocaleString(undefined, { maximumFractionDigits: 6 })} \u2260 ${qty} ${selectedRecipe.productUnit}`}
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — Production Notes
      ══════════════════════════════════════════════════════════════════════ */}
      {(selectedRecipe ||
        (selectedProductId && productRecipes.length === 0)) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              4. Production notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="rpt-notes" className="sr-only">
              Production notes
            </Label>
            <textarea
              id="rpt-notes"
              value={productionNotes}
              onChange={(e) => {
                setProductionNotes(e.target.value);
                resetKey();
              }}
              maxLength={2_000}
              rows={3}
              placeholder="Record production differences, explain zero consumption on a material, or describe additional materials used."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {productionNotes.length} / 2,000
            </p>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — Review Summary
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedRecipe && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              5. Review summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  label: "Product",
                  value:
                    availableProducts.find((p) => p.id === selectedProductId)
                      ?.name ?? "—",
                },
                {
                  label: "Recipe version",
                  value: `v${selectedRecipe.version}`,
                },
                {
                  label: "Planned output",
                  value: plannedOutputQuantity
                    ? `${plannedOutputQuantity} ${selectedRecipe.productUnit}`
                    : "—",
                },
                {
                  label: "Actual output",
                  value: quantity
                    ? `${quantity} ${selectedRecipe.productUnit}`
                    : "—",
                },
                {
                  label: "Good / Rejected",
                  value: `${goodOutputQuantity || "—"} / ${rejectedOutputQuantity || "—"}`,
                },
                {
                  label: "Materials",
                  value: `${completedMaterials}/${totalMaterials} complete`,
                },
                {
                  label: "Requiring review",
                  value:
                    reviewRequired > 0
                      ? `${reviewRequired} material${reviewRequired > 1 ? "s" : ""}`
                      : "None",
                  highlight: reviewRequired > 0 ? "amber" : "green",
                },
                {
                  label: "Missing standards",
                  value: missingStandards > 0 ? String(missingStandards) : "None",
                  highlight: missingStandards > 0 ? "slate" : "green",
                },
                {
                  label: "Output reconciled",
                  value:
                    quantity.trim() &&
                    goodOutputQuantity.trim() &&
                    rejectedOutputQuantity.trim()
                      ? isReconciled
                        ? "\u2713 Yes"
                        : "\u2717 No"
                      : "—",
                  highlight:
                    quantity.trim() &&
                    goodOutputQuantity.trim() &&
                    rejectedOutputQuantity.trim()
                      ? isReconciled
                        ? "green"
                        : "red"
                      : undefined,
                },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 rounded-md bg-muted/30 px-3 py-2"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span
                    className={`font-medium truncate ${
                      highlight === "amber"
                        ? "text-amber-700"
                        : highlight === "green"
                          ? "text-emerald-700"
                          : highlight === "red"
                            ? "text-red-600"
                            : highlight === "slate"
                              ? "text-slate-500"
                              : ""
                    }`}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Batch reference is generated on submission. Stock is held until an
              authorised reviewer verifies and releases the batch.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Actions ── */}
      {selectedProductId && (
        <div className="flex flex-wrap items-center gap-3 pb-2">
          <Button
            onClick={handleSubmit}
            disabled={
              isPending ||
              !selectedProductId ||
              price <= 0 ||
              !Number.isInteger(price) ||
              !Number.isFinite(qty * price) ||
              (productRecipes.length === 0
                ? qty <= 0
                : recipeSubmissionIncomplete)
            }
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {selectedRecipe ? "Submit for verification" : "Save production"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
