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
}

export function ImportForm({ products }: ImportFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [productId, setProductId] = useState("");
    const [expectedQuantity, setExpectedQuantity] = useState("");
    const [customsRef, setCustomsRef] = useState("");
    const [originCountry, setOriginCountry] = useState("");
    const [supplierName, setSupplierName] = useState("");
    const [expectedReturnDate, setExpectedReturnDate] = useState("");
    const [estimatedValue, setEstimatedValue] = useState("");
    const [currency, setCurrency] = useState("RWF");
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    function handleSubmit() {
        const qty = parseInt(expectedQuantity) || 0;
        if (!productId || qty <= 0) return;

        startTransition(async () => {
            try {
                setMessage(null);
                await declareImport({
                    productId,
                    expectedQuantity: qty,
                    customsRef: customsRef.trim() || undefined,
                    originCountry: originCountry.trim() || undefined,
                    supplierName: supplierName.trim() || undefined,
                    expectedReturnDate: expectedReturnDate || undefined,
                    estimatedValue: estimatedValue === "" ? undefined : Number(estimatedValue),
                    currency,
                });
                setMessage({
                    text: `Import declaration filed for ${qty.toLocaleString()} units`,
                    type: "success",
                });
                setProductId("");
                setExpectedQuantity("");
                setCustomsRef("");
                setOriginCountry("");
                setSupplierName("");
                setExpectedReturnDate("");
                setEstimatedValue("");
                setCurrency("RWF");
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
                    Pre-Travel Goods Declaration
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Record the goods you expect to bring into Rwanda. Customs officers will record the quantity they physically inspect before goods are marked as cleared.
                </p>
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
                        <Label>Product</Label>
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
                        <Label htmlFor="originCountry">Country of Purchase / Origin</Label>
                        <Input
                            id="originCountry"
                            placeholder="e.g. China, Kenya, UAE"
                            value={originCountry}
                            onChange={(e) => setOriginCountry(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="supplierName">Supplier / Store Name</Label>
                        <Input
                            id="supplierName"
                            placeholder="Supplier or shop name"
                            value={supplierName}
                            onChange={(e) => setSupplierName(e.target.value)}
                            maxLength={160}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="expectedReturnDate">Expected Return Date</Label>
                        <Input
                            id="expectedReturnDate"
                            type="date"
                            value={expectedReturnDate}
                            onChange={(e) => setExpectedReturnDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="estimatedValue">Estimated Total Value</Label>
                        <Input
                            id="estimatedValue"
                            type="number"
                            min={0}
                            step="1"
                            placeholder="Estimated purchase value"
                            value={estimatedValue}
                            onChange={(e) => setEstimatedValue(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="currency">Currency</Label>
                        <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger id="currency"><SelectValue placeholder="Select currency" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="RWF">RWF — Rwandan Franc</SelectItem>
                                <SelectItem value="USD">USD — US Dollar</SelectItem>
                                <SelectItem value="EUR">EUR — Euro</SelectItem>
                                <SelectItem value="CNY">CNY — Chinese Yuan</SelectItem>
                                <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                                <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                                <SelectItem value="UGX">UGX — Ugandan Shilling</SelectItem>
                                <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Button
                    onClick={handleSubmit}
                    disabled={
                        isPending ||
                        !productId ||
                        !expectedQuantity ||
                        parseInt(expectedQuantity) <= 0
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
