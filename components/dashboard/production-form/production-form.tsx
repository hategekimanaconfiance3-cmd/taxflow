"use client";

import { useState, useTransition } from "react";
import { createProduct, recordProduction } from "@/lib/actions/stock.action";
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
import { Plus, Save, Loader2 } from "lucide-react";

interface Product {
    id: string;
    name: string;
    unit: string;
}

interface ProductionFormProps {
    products: Product[];
    vatRate: number;
}


export function ProductionForm({ products, vatRate }: ProductionFormProps) {
    const [isPending, startTransition] = useTransition();

    // Product creation state
    const [showNewProduct, setShowNewProduct] = useState(false);
    const [newProductName, setNewProductName] = useState("");
    const [newProductUnit, setNewProductUnit] = useState("kg");

    // Production entry state
    const [selectedProductId, setSelectedProductId] = useState("");
    const [quantity, setQuantity] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    // Auto-calculation
    const qty = parseInt(quantity) || 0;
    const price = parseInt(unitPrice) || 0;
    const totalValue = qty * price;
    const potentialTax = Math.round(totalValue * vatRate);

    async function handleCreateProduct() {
        if (!newProductName.trim()) return;

        startTransition(async () => {
            try {
                await createProduct({
                    name: newProductName.trim(),
                    unit: newProductUnit,
                });
                setNewProductName("");
                setShowNewProduct(false);
                setMessage({
                    text: "Product created successfully",
                    type: "success",
                });
            } catch (err) {
                setMessage({
                    text:
                        err instanceof Error
                            ? err.message
                            : "Failed to create product",
                    type: "error",
                });
            }
        });
    }

    async function handleRecordProduction() {
        if (!selectedProductId || qty <= 0) return;

        startTransition(async () => {
            try {
                await recordProduction({
                    productId: selectedProductId,
                    quantity: qty,
                });
                setQuantity("");
                setUnitPrice("");
                setSelectedProductId("");
                setMessage({
                    text: `Production of ${qty} units recorded`,
                    type: "success",
                });
            } catch (err) {
                setMessage({
                    text:
                        err instanceof Error
                            ? err.message
                            : "Failed to record production",
                    type: "error",
                });
            }
        });
    }

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                    <span>1. Production Entry</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNewProduct(!showNewProduct)}
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {showNewProduct ? "Cancel" : "New Product"}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Status message */}
                {message && (
                    <div
                        className={`text-sm rounded-md px-3 py-2 ${message.type === "success"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                {/* New product form (collapsible) */}
                {showNewProduct && (
                    <div className="rounded-lg border border-dashed p-4 space-y-3 bg-muted/20">
                        <p className="text-sm font-medium">Register New Product</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Product Name</Label>
                                <Input
                                    placeholder="e.g., Soap"
                                    value={newProductName}
                                    onChange={(e) =>
                                        setNewProductName(e.target.value)
                                    }
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
                                        <SelectItem value="liter">Liter</SelectItem>
                                        <SelectItem value="box">Box</SelectItem>
                                        <SelectItem value="pack">Pack</SelectItem>
                                        <SelectItem value="ton">Ton</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleCreateProduct}
                            disabled={isPending || !newProductName.trim()}
                        >
                            {isPending && (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            )}
                            Create Product
                        </Button>
                    </div>
                )}

                {/* Production entry form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: inputs */}
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Product Name</Label>
                            <Select
                                value={selectedProductId}
                                onValueChange={setSelectedProductId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name} ({p.unit})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Quantity Produced</Label>
                            <Input
                                type="number"
                                placeholder="1000"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                min={1}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Price Per Unit (RWF)</Label>
                            <Input
                                type="number"
                                placeholder="500"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(e.target.value)}
                                min={0}
                            />
                        </div>
                    </div>

                    {/* Right: auto-calculation */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <p className="text-sm font-medium text-muted-foreground">
                            Automatic Calculation
                        </p>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    Total Value = {qty.toLocaleString()} ×{" "}
                                    {price.toLocaleString()}
                                </span>
                            </div>
                            <div className="text-lg font-bold">
                                = {formatRWF(totalValue)}
                            </div>
                        </div>
                        <div className="border-t pt-3 space-y-1">
                            <p className="text-xs text-muted-foreground">
                                Potential Tax ({Math.round(vatRate * 100)}%) =
                            </p>
                            <p className="text-xl font-bold text-emerald-600">
                                {formatRWF(potentialTax)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                    <Button
                        onClick={handleRecordProduction}
                        disabled={isPending || !selectedProductId || qty <= 0}
                        className="gap-2"
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        Save Production
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
