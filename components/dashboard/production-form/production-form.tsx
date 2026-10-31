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
import { productionEntrySchema, productRegistrationSchema } from "@/lib/validation/production.schema";
import { Plus, Save, Loader2 } from "lucide-react";

interface Product {
    id: string;
    name: string;
    unit: string;
    categoryCode: string | null;
}

interface ProductionFormProps {
    products: Product[];
    recipes: Array<{
        id: string;
        productId: string;
        productName: string;
        productUnit: string;
        version: number;
        outputQuantity: number;
        yieldToleranceBasisPoints: number | null;
        yieldToleranceStandardId: string | null;
        materials: Array<{ recipeMaterialId: string; materialId: string; materialCode: string; name: string; unit: string; quantity: number; consumptionToleranceBasisPoints: number | null; consumptionToleranceStandardId: string | null }>;
    }>;
    plans: Array<{ id: string; productId: string; productName: string; recipeVersionId: string; plannedOutputQuantity: string; status: string }>;
    vatRate: number;
}

interface ApiError {
    error?: string;
    requestId?: string;
}

export function ProductionForm({ products, recipes, plans, vatRate }: ProductionFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [availableProducts, setAvailableProducts] = useState(products);
    const [showNewProduct, setShowNewProduct] = useState(false);
    const [newProductName, setNewProductName] = useState("");
    const [newProductUnit, setNewProductUnit] = useState("box");
    const [newProductCategory, setNewProductCategory] = useState("");
    const [selectedProductId, setSelectedProductId] = useState("");
    const [selectedRecipeId, setSelectedRecipeId] = useState("");
    const [selectedPlanId, setSelectedPlanId] = useState("");
    const [actualMaterialQuantities, setActualMaterialQuantities] = useState<Record<string, string>>({});
    const [materialWasteQuantities, setMaterialWasteQuantities] = useState<Record<string, string>>({});
    const [plannedOutputQuantity, setPlannedOutputQuantity] = useState("");
    const [goodOutputQuantity, setGoodOutputQuantity] = useState("");
    const [rejectedOutputQuantity, setRejectedOutputQuantity] = useState("");
    const [quantity, setQuantity] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const idempotencyKey = useRef<string | null>(null);
    const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId && recipe.productId === selectedProductId);
    const selectedPlan = plans.find((plan) => plan.id === selectedPlanId && plan.status === "planned");

    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    const totalValue = Math.round(qty * price);
    const potentialTax = Math.round(totalValue * vatRate);

    function resetSubmissionKey() {
        idempotencyKey.current = null;
    }

    async function handleCreateProduct() {
        const parsed = productRegistrationSchema.safeParse({
            name: newProductName,
            unit: newProductUnit,
            categoryCode: newProductCategory,
        });
        if (!parsed.success) {
            setMessage({ text: parsed.error.issues[0]?.message ?? "Enter valid product details.", type: "error" });
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
                    setMessage({ text: body.error ?? "Unable to register this product. Please try again.", type: "error" });
                    return;
                }

                setAvailableProducts((current) => current.some((item) => item.id === body.product?.id)
                    ? current
                    : [...current, body.product!]);
                setSelectedProductId(body.product.id);
                setNewProductName("");
                setNewProductCategory("");
                setShowNewProduct(false);
                setMessage({ text: `Product registered · ${body.product.id}`, type: "success" });
                router.refresh();
            } catch {
                setMessage({ text: "Unable to register this product. Check your connection and try again.", type: "error" });
            }
        });
    }

    async function handleRecordProduction() {
        if (selectedRecipe && !selectedPlan) {
            setMessage({ text: "Create and select a reserved material plan before recording recipe-backed production.", type: "error" });
            return;
        }
        if (selectedRecipe && selectedRecipe.materials.some((material) => !actualMaterialQuantities[material.recipeMaterialId]?.trim())) {
            setMessage({ text: "Enter an actual quantity for every material in the selected recipe.", type: "error" });
            return;
        }
        const parsed = productionEntrySchema.safeParse({
            productId: selectedProductId,
            quantity: qty,
            unitPrice: price,
            idempotencyKey: idempotencyKey.current ?? crypto.randomUUID(),
            ...(selectedPlan ? { materialPlanId: selectedPlan.id } : {}),
            ...(selectedRecipe ? {
                recipeVersionId: selectedRecipe.id,
                plannedOutputQuantity: Number(plannedOutputQuantity),
                goodOutputQuantity: Number(goodOutputQuantity),
                rejectedOutputQuantity: Number(rejectedOutputQuantity),
                actualMaterials: selectedRecipe.materials.map((material) => ({
                    recipeMaterialId: material.recipeMaterialId,
                    actualQuantity: Number(actualMaterialQuantities[material.recipeMaterialId]),
                    wasteQuantity: Number(materialWasteQuantities[material.recipeMaterialId] || 0),
                })),
            } : {}),
        });
        if (!parsed.success) {
            setMessage({ text: parsed.error.issues[0]?.message ?? "Enter valid production details.", type: "error" });
            return;
        }
        idempotencyKey.current = parsed.data.idempotencyKey;

        startTransition(async () => {
            try {
                const response = await fetch("/api/production", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(parsed.data),
                });
                const body: { record?: { batchReference: string; quantity: number; unit: string; productionValidationStatus?: string } } & ApiError = await response.json();
                if (!response.ok || !body.record) {
                    const reference = body.requestId ? ` Reference: ${body.requestId}` : "";
                    setMessage({ text: `${body.error ?? "Unable to save production. Please try again."}${reference}`, type: "error" });
                    return;
                }

                setMessage({
                    text: `Production declaration saved · ${body.record.batchReference} · ${body.record.quantity.toLocaleString()} ${body.record.unit}${selectedRecipe ? " · held until authorized material review; finished stock is not yet available" : ""}`,
                    type: "success",
                });
                setQuantity("");
                setUnitPrice("");
                setSelectedProductId("");
                setSelectedRecipeId("");
                setSelectedPlanId("");
                setActualMaterialQuantities({});
                setMaterialWasteQuantities({});
                setPlannedOutputQuantity("");
                setGoodOutputQuantity("");
                setRejectedOutputQuantity("");
                resetSubmissionKey();
                router.refresh();
            } catch {
                setMessage({ text: "Unable to save production. Please try again. If you retry, the same submission will not be counted twice.", type: "error" });
            }
        });
    }

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <span>1. Production Entry</span>
                    <Button variant="outline" size="sm" onClick={() => setShowNewProduct(!showNewProduct)} disabled={isPending}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {showNewProduct ? "Cancel" : "New Product"}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div role={message.type === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                        {message.text}
                    </div>
                )}

                {showNewProduct && (
                    <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-4">
                        <p className="text-sm font-medium">Register New Product</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="new-product-name" className="text-xs">Product Name</Label>
                                <Input id="new-product-name" placeholder="e.g., Soap" value={newProductName} onChange={(event) => setNewProductName(event.target.value)} maxLength={160} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Unit</Label>
                                <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="kg">Kilogram (kg)</SelectItem>
                                        <SelectItem value="unit">Unit</SelectItem>
                                        <SelectItem value="liter">Liter</SelectItem>
                                        <SelectItem value="box">Box</SelectItem>
                                        <SelectItem value="pack">Pack</SelectItem>
                                        <SelectItem value="ton">Ton</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="new-product-category" className="text-xs">Category code (optional)</Label>
                                <Input id="new-product-category" placeholder="RRA category" value={newProductCategory} onChange={(event) => setNewProductCategory(event.target.value)} maxLength={64} />
                            </div>
                        </div>
                        <Button size="sm" onClick={handleCreateProduct} disabled={isPending || !newProductName.trim()}>
                            {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            Create Product
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                        {plans.some((plan) => plan.status === "planned") && (
                            <div className="space-y-1.5">
                                <Label htmlFor="production-material-plan" className="text-xs">Reserved material plan</Label>
                                <Select value={selectedPlanId || "none"} onValueChange={(value) => {
                                    const plan = plans.find((item) => item.id === value && item.status === "planned");
                                    setSelectedPlanId(plan?.id ?? "");
                                    if (plan) {
                                        setSelectedProductId(plan.productId);
                                        setSelectedRecipeId(plan.recipeVersionId);
                                        setPlannedOutputQuantity(plan.plannedOutputQuantity);
                                    }
                                    setActualMaterialQuantities({});
                                    resetSubmissionKey();
                                }}>
                                    <SelectTrigger id="production-material-plan"><SelectValue placeholder="Record against a plan" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No plan selected</SelectItem>
                                        {plans.filter((plan) => plan.status === "planned").map((plan) => (
                                            <SelectItem key={plan.id} value={plan.id}>{plan.productName} · planned {plan.plannedOutputQuantity}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Product Name</Label>
                            <Select value={selectedProductId} onValueChange={(value) => { setSelectedProductId(value); setSelectedRecipeId(""); setSelectedPlanId(""); setActualMaterialQuantities({}); setPlannedOutputQuantity(""); resetSubmissionKey(); }}>
                                <SelectTrigger><SelectValue placeholder="Select your registered product" /></SelectTrigger>
                                <SelectContent>
                                    {availableProducts.map((product) => (
                                        <SelectItem key={product.id} value={product.id}>{product.name} ({product.unit})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="production-quantity" className="text-xs">{selectedRecipe ? "Total actual output" : "Quantity Produced"}</Label>
                            <Input id="production-quantity" type="number" placeholder="1000" value={quantity} onChange={(event) => { setQuantity(event.target.value); resetSubmissionKey(); }} min="0.0001" step="any" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="production-unit-price" className="text-xs">Price Per Unit (RWF)</Label>
                            <Input id="production-unit-price" type="number" placeholder="7000" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); resetSubmissionKey(); }} min="0" step="1" />
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <p className="text-sm font-medium text-muted-foreground">Automatic Calculation · Preview</p>
                        <div className="space-y-2 text-sm">
                            <p className="text-muted-foreground">Total Value = {qty.toLocaleString()} × {price.toLocaleString()}</p>
                            <p className="text-lg font-bold">= {formatRWF(totalValue)}</p>
                        </div>
                        <div className="space-y-1 border-t pt-3">
                            <p className="text-xs text-muted-foreground">Potential Tax ({Math.round(vatRate * 100)}%)</p>
                            <p className="text-xl font-bold text-emerald-600">{formatRWF(potentialTax)}</p>
                            <p className="text-xs text-muted-foreground">Final values are calculated again on the server.</p>
                        </div>
                    </div>
                </div>

                {recipes.some((recipe) => recipe.productId === selectedProductId) && (
                    <div className="space-y-3 rounded-lg border border-dashed p-4">
                        <div className="space-y-1.5">
                            <Label>Confidential production recipe (optional)</Label>
                            <Select value={selectedRecipeId || "none"} onValueChange={(value) => { setSelectedRecipeId(value === "none" ? "" : value); setSelectedPlanId(""); setActualMaterialQuantities({}); setPlannedOutputQuantity(""); resetSubmissionKey(); }}>
                                <SelectTrigger><SelectValue placeholder="Record without a recipe" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No recipe evidence</SelectItem>
                                    {recipes.filter((recipe) => recipe.productId === selectedProductId).map((recipe) => (
                                        <SelectItem key={recipe.id} value={recipe.id}>Version {recipe.version} · {recipe.materials.length} materials</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedRecipe && (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">Recipe-backed batches require a reserved material plan and remain held until authorized review. Only verified good output becomes saleable stock; rejects are recorded separately.</p>
                                <div className="max-w-sm space-y-1.5">
                                    <Label htmlFor="planned-output-quantity">Planned finished output ({selectedRecipe.productUnit})</Label>
                                    <Input id="planned-output-quantity" type="number" min="0.0001" step="any" value={plannedOutputQuantity} disabled={Boolean(selectedPlan)} onChange={(event) => { setPlannedOutputQuantity(event.target.value); resetSubmissionKey(); }} />
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="space-y-1"><Label htmlFor="good-output">Manufacturer-reported good output ({selectedRecipe.productUnit})</Label><Input id="good-output" type="number" min="0" step="any" value={goodOutputQuantity} onChange={(event) => { setGoodOutputQuantity(event.target.value); resetSubmissionKey(); }} /></div>
                                    <div className="space-y-1"><Label htmlFor="rejected-output">Manufacturer-reported rejected output ({selectedRecipe.productUnit})</Label><Input id="rejected-output" type="number" min="0" step="any" value={rejectedOutputQuantity} onChange={(event) => { setRejectedOutputQuantity(event.target.value); resetSubmissionKey(); }} /></div>
                                </div>
                                <p className="text-xs text-muted-foreground">Good output plus rejected output must equal total actual output. No rework or waste conversion is assumed.</p>
                                {selectedRecipe.materials.map((material) => {
                                    const planned = Number(plannedOutputQuantity) > 0 ? Number(plannedOutputQuantity) * material.quantity / selectedRecipe.outputQuantity : 0;
                                    return (
                                        <div key={material.recipeMaterialId} className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                                            <div>
                                                <p className="text-sm font-medium">{material.name} <span className="font-mono text-xs text-muted-foreground">({material.materialCode})</span></p>
                                                <p className="text-xs text-muted-foreground">Planned for this batch: {planned.toLocaleString()} {material.unit}</p>
                                            </div>
                                            <div className="space-y-1"><Label htmlFor={`actual-material-${material.recipeMaterialId}`}>Actual used ({material.unit})</Label><Input id={`actual-material-${material.recipeMaterialId}`} type="number" min="0" step="any" value={actualMaterialQuantities[material.recipeMaterialId] ?? ""} onChange={(event) => { setActualMaterialQuantities((current) => ({ ...current, [material.recipeMaterialId]: event.target.value })); resetSubmissionKey(); }} /><Label htmlFor={`waste-material-${material.recipeMaterialId}`}>Recorded waste from this material ({material.unit})</Label><Input id={`waste-material-${material.recipeMaterialId}`} type="number" min="0" step="any" value={materialWasteQuantities[material.recipeMaterialId] ?? "0"} onChange={(event) => { setMaterialWasteQuantities((current) => ({ ...current, [material.recipeMaterialId]: event.target.value })); resetSubmissionKey(); }} /></div>
                                        </div>
                                    );
                                })}
                                <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                                    <p>Official yield standard: {selectedRecipe.yieldToleranceBasisPoints === null ? "unavailable; this batch requires review" : `${(selectedRecipe.yieldToleranceBasisPoints / 100).toFixed(2)}% deviation · version ${selectedRecipe.yieldToleranceStandardId}`}</p>
                                    {selectedRecipe.materials.map((material) => <p key={material.recipeMaterialId}>{material.name} standard: {material.consumptionToleranceBasisPoints === null ? "unavailable; this batch requires review" : `${(material.consumptionToleranceBasisPoints / 100).toFixed(2)}% deviation · version ${material.consumptionToleranceStandardId}`}</p>)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <Button onClick={handleRecordProduction} disabled={isPending || !selectedProductId || qty <= 0 || !Number.isInteger(price) || !Number.isFinite(qty * price) || Boolean(selectedRecipe && (!selectedPlan || goodOutputQuantity === "" || rejectedOutputQuantity === ""))} className="gap-2">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Production
                </Button>
            </CardContent>
        </Card>
    );
}
