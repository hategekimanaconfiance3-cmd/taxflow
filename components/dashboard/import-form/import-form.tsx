"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declareImport } from "@/lib/actions/import.action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Ship, CheckCircle } from "lucide-react";

interface ImportFormProps {
    products: { id: string; name: string; unit: string }[];
    materials: { id: string; materialCode: string; name: string; unit: string }[];
}

export function ImportForm({ products, materials }: ImportFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [productId, setProductId] = useState("");
    const [productionMaterialId, setProductionMaterialId] = useState("");
    const [expectedQuantity, setExpectedQuantity] = useState("");
    const [customsRef, setCustomsRef] = useState("");
    const [originCountry, setOriginCountry] = useState("");
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    function handleSubmit() {
        const qty = Number(expectedQuantity) || 0;
        if (!productId || qty <= 0) return;

        startTransition(async () => {
            try {
                setMessage(null);
                await declareImport({
                    productId,
                    productionMaterialId: productionMaterialId || undefined,
                    expectedQuantity: qty,
                    customsRef: customsRef.trim() || undefined,
                    originCountry: originCountry.trim() || undefined,
                });
                setMessage({
                    text: `Import declaration filed for ${qty.toLocaleString()} units`,
                    type: "success",
                });
                setProductId("");
                setProductionMaterialId("");
                setExpectedQuantity("");
                setCustomsRef("");
                setOriginCountry("");
                router.refresh();
            } catch (err) {
                setMessage({
                    text:
                        err instanceof Error
                            ? err.message
                            : "Failed to declare import",
                    type: "error",
                });
            }
        });
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Ship className="h-4 w-4" />
                    Declare Import
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Customs product classification</Label>
                        <Select
                            value={productId}
                            onValueChange={setProductId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select a product" />
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

                    <div className="space-y-2">
                        <Label htmlFor="expectedQty">Expected Quantity</Label>
                        <Input
                            id="expectedQty"
                            type="number"
                            placeholder="Enter expected quantity"
                            value={expectedQuantity}
                            onChange={(e) =>
                                setExpectedQuantity(e.target.value)
                            }
                            min={1}
                            step="any"
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="customsRef">
                            Customs Reference{" "}
                            <span className="text-muted-foreground font-normal">
                                (optional)
                            </span>
                        </Label>
                        <Input
                            id="customsRef"
                            placeholder="e.g. CUS-2026-001234"
                            value={customsRef}
                            onChange={(e) => setCustomsRef(e.target.value)}
                            className="font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="originCountry">
                            Country of Origin{" "}
                            <span className="text-muted-foreground font-normal">
                                (optional)
                            </span>
                        </Label>
                        <Input
                            id="originCountry"
                            placeholder="e.g. China, Kenya, UAE"
                            value={originCountry}
                            onChange={(e) => setOriginCountry(e.target.value)}
                        />
                    </div>
                </div>

                {materials.length > 0 && (
                    <div className="space-y-2 rounded-md border border-dashed p-3">
                        <Label>Confidential manufacturing material (optional)</Label>
                        <Select value={productionMaterialId || "none"} onValueChange={(value) => setProductionMaterialId(value === "none" ? "" : value)}>
                            <SelectTrigger><SelectValue placeholder="Ordinary product import" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Ordinary product import</SelectItem>
                                {materials.map((material) => (
                                    <SelectItem key={material.id} value={material.id}>{material.name} · {material.materialCode} ({material.unit})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {productionMaterialId && <p className="text-xs text-muted-foreground">RRA inspection will post the verified quantity to your confidential material ledger and will not add it to ordinary product inventory. The customs product unit must match the material unit.</p>}
                    </div>
                )}

                <Button
                    onClick={handleSubmit}
                    disabled={
                        isPending ||
                        !productId ||
                        !expectedQuantity ||
                        Number(expectedQuantity) <= 0
                    }
                    className="w-full sm:w-auto gap-2"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <CheckCircle className="h-4 w-4" />
                    )}
                    File Declaration
                </Button>
            </CardContent>
        </Card>
    );
}
