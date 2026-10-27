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

interface Recipe {
    id: string;
    productId: string;
    batchOutputQuantity: number;
    materials: Array<{ materialId: string; materialCode: string; materialName: string; unit: string; plannedQuantity: number }>;
}

interface ProductionFormProps {
    products: Product[];
    recipes: Recipe[];
    vatRate: number;
}

interface ApiError {
    error?: string;
    requestId?: string;
}

export function ProductionForm({ products, recipes, vatRate }: ProductionFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [availableProducts, setAvailableProducts] = useState(products);
    const [showNewProduct, setShowNewProduct] = useState(false);
    const [newProductName, setNewProductName] = useState("");
    const [newProductUnit, setNewProductUnit] = useState("box");
    const [newProductCategory, setNewProductCategory] = useState("");
    const [selectedProductId, setSelectedProductId] = useState("");
    const [selectedRecipeId, setSelectedRecipeId] = useState("");
    const [plannedOutputQuantity, setPlannedOutputQuantity] = useState("");
    const [actualMaterialUsage, setActualMaterialUsage] = useState<Record<string, string>>({});
    const [quantity, setQuantity] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const idempotencyKey = useRef<string | null>(null);

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
        const parsed = productionEntrySchema.safeParse({
            productId: selectedProductId,
            quantity: qty,
            ...(selectedRecipeId ? { plannedOutputQuantity: Number(plannedOutputQuantity) } : {}),
            unitPrice: price,
            idempotencyKey: idempotencyKey.current ?? crypto.randomUUID(),
            ...(selectedRecipeId ? {
                recipeId: selectedRecipeId,
                materialUsage: selectedRecipe?.materials.map((material) => ({
                    materialId: material.materialId,
                    actualQuantity: Number(actualMaterialUsage[material.materialId]),
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
                const body: { record?: { batchReference: string; quantity: number; unit: string } } & ApiError = await response.json();
                if (!response.ok || !body.record) {
                    const reference = body.requestId ? ` Reference: ${body.requestId}` : "";
                    setMessage({ text: `${body.error ?? "Unable to save production. Please try again."}${reference}`, type: "error" });
                    return;
                }

                setMessage({
                    text: `Production recorded · ${body.record.batchReference} · ${body.record.quantity.toLocaleString()} ${body.record.unit}`,
                    type: "success",
                });
                setQuantity("");
                setUnitPrice("");
                setSelectedProductId("");
                resetSubmissionKey();
                router.refresh();
            } catch {
                setMessage({ text: "Unable to save production. Please try again. If you retry, the same submission will not be counted twice.", type: "error" });
            }
        });
    }

    const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId);

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
                        <div className="space-y-1.5">
                            <Label className="text-xs">Product Name</Label>
                            <Select value={selectedProductId} onValueChange={(value) => { setSelectedProductId(value); setSelectedRecipeId(""); setActualMaterialUsage({}); resetSubmissionKey(); }}>
                                <SelectTrigger><SelectValue placeholder="Select your registered product" /></SelectTrigger>
                                <SelectContent>
                                    {availableProducts.map((product) => (
                                        <SelectItem key={product.id} value={product.id}>{product.name} ({product.unit})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="production-quantity" className="text-xs">Quantity Produced</Label>
                            <Input id="production-quantity" type="number" placeholder="1000" value={quantity} onChange={(event) => { setQuantity(event.target.value); resetSubmissionKey(); }} min="0.0001" step="any" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="production-unit-price" className="text-xs">Price Per Unit (RWF)</Label>
                            <Input id="production-unit-price" type="number" placeholder="7000" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); resetSubmissionKey(); }} min="0" step="1" />
                        </div>
                        {recipes.some((recipe) => recipe.productId === selectedProductId) && <div className="space-y-2 rounded-md border p-3 md:col-span-2">
                            <Label htmlFor="production-recipe" className="text-xs">Recipe version (optional)</Label>
                            <select id="production-recipe" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedRecipeId} onChange={(event) => { setSelectedRecipeId(event.target.value); setPlannedOutputQuantity(""); setActualMaterialUsage({}); resetSubmissionKey(); }}>
                                <option value="">Record output only</option>
                                {recipes.filter((recipe) => recipe.productId === selectedProductId).map((recipe) => <option key={recipe.id} value={recipe.id}>Version {recipe.id.slice(0, 8)} · expected input per {recipe.batchOutputQuantity.toLocaleString()} output units</option>)}
                            </select>
                            {selectedRecipe && <div className="space-y-1.5"><Label htmlFor="planned-output" className="text-xs">Planned output quantity ({availableProducts.find((item) => item.id === selectedProductId)?.unit})</Label><Input id="planned-output" type="number" min="0.0001" step="any" value={plannedOutputQuantity} onChange={(event) => { setPlannedOutputQuantity(event.target.value); resetSubmissionKey(); }} /></div>}
                            {selectedRecipe?.materials.map((material) => {
                                const plannedOutput = Number(plannedOutputQuantity) || 0;
                                const expected = plannedOutput > 0 ? material.plannedQuantity * plannedOutput / selectedRecipe.batchOutputQuantity : material.plannedQuantity;
                                return <div key={material.materialId} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                                    <Label htmlFor={`actual-${material.materialId}`} className="text-xs">{material.materialCode} · {material.materialName} ({material.unit}); planned {expected.toLocaleString()}</Label>
                                    <Input id={`actual-${material.materialId}`} type="number" min="0" step="any" placeholder="Actual" value={actualMaterialUsage[material.materialId] ?? ""} onChange={(event) => { setActualMaterialUsage((current) => ({ ...current, [material.materialId]: event.target.value })); resetSubmissionKey(); }} />
                                </div>;
                            })}
                            {selectedRecipe && <p className="text-xs text-muted-foreground">The actual quantities are stored with the recipe version. RRA production views show protected material codes.</p>}
                        </div>}
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

                <Button onClick={handleRecordProduction} disabled={isPending || !selectedProductId || qty <= 0 || !Number.isInteger(price) || !Number.isFinite(qty * price) || Boolean(selectedRecipe && (!Number.isFinite(Number(plannedOutputQuantity)) || Number(plannedOutputQuantity) <= 0 || selectedRecipe.materials.some((material) => actualMaterialUsage[material.materialId] === undefined || actualMaterialUsage[material.materialId] === "")))} className="gap-2">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Production
                </Button>
            </CardContent>
        </Card>
    );
}
