"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createRetailSale } from "@/lib/actions/transaction.action";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { PriceRangeBar } from "@/components/dashboard/price-range-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle, ShoppingBag } from "lucide-react";

interface InventoryItem {
    id: string;
    productId: string;
    productName: string;
    productUnit: string;
    quantity: number;
    latestUnitPrice: number | null;
}

interface RecordSaleFormProps {
    inventory: InventoryItem[];
    vatRate: number;
}

interface SaleItem {
    productId: string;
    productName: string;
    available: number;
    quantityToSell: number;
    unitPrice: number;
}

type SaleItemEdit = Pick<SaleItem, "quantityToSell" | "unitPrice">;


export function RecordSaleForm({ inventory, vatRate }: RecordSaleFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [customerName, setCustomerName] = useState("");
    const [saleItemEdits, setSaleItemEdits] = useState<Record<string, SaleItemEdit>>({});
    const saleItems: SaleItem[] = inventory.map((inv) => ({
            productId: inv.productId,
            productName: inv.productName,
            available: inv.quantity,
            quantityToSell: saleItemEdits[inv.productId]?.quantityToSell ?? 0,
            unitPrice: saleItemEdits[inv.productId]?.unitPrice ?? (inv.latestUnitPrice ?? 0),
        }));
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    // Track which products have prices below AI floor
    const [blockedProducts, setBlockedProducts] = useState<Set<string>>(new Set());

    const handlePriceStatusChange = useCallback(
        (productId: string, status: string) => {
            setBlockedProducts((prev) => {
                const isBlocked = status === "blocked";
                const wasBlocked = prev.has(productId);
                if (isBlocked === wasBlocked) return prev; // No change — skip re-render
                const next = new Set(prev);
                if (isBlocked) {
                    next.add(productId);
                } else {
                    next.delete(productId);
                }
                return next;
            });
        },
        [],
    );

    function updateItem(
        idx: number,
        field: "quantityToSell" | "unitPrice",
        value: string,
    ) {
        const item = saleItems[idx];
        if (!item) return;
        const numericValue = field === "quantityToSell" ? (parseFloat(value) || 0) : (parseInt(value) || 0);
        setSaleItemEdits((previous) => {
            const current = previous[item.productId] ?? {
                quantityToSell: item.quantityToSell,
                unitPrice: item.unitPrice,
            };
            const updated: SaleItemEdit = field === "quantityToSell"
                ? { ...current, quantityToSell: Math.min(numericValue, item.available) }
                : { ...current, unitPrice: Math.min(numericValue, 999_999_999) };
            return { ...previous, [item.productId]: updated };
        });
    }

    const activeItems = saleItems.filter((item) => item.quantityToSell > 0);
    const totalSaleValue = activeItems.reduce(
        (sum, item) => sum + item.quantityToSell * item.unitPrice,
        0,
    );
    const totalTax = Math.round(totalSaleValue * vatRate);

    // Check if any active item has a blocked price
    const hasBlockedPrice = activeItems.some((item) =>
        blockedProducts.has(item.productId),
    );

    const canSubmit =
        customerName.trim() &&
        activeItems.length > 0 &&
        activeItems.every((item) => item.quantityToSell <= item.available) &&
        !hasBlockedPrice;

    async function handleConfirmSale() {
        if (!canSubmit) return;

        startTransition(async () => {
            try {
                setMessage(null);
                for (const item of activeItems) {
                    await createRetailSale({
                        productId: item.productId,
                        quantity: item.quantityToSell,
                        unitPrice: item.unitPrice,
                        customerName: customerName.trim(),
                    });
                }

                setMessage({
                    text: `Sale of ${activeItems.length} product(s) to ${customerName} completed`,
                    type: "success",
                });

                // Optimistic update: deduct sold quantities from available stock
                setCustomerName("");
                setSaleItemEdits({});
                router.refresh();
            } catch (err) {
                setMessage({
                    text:
                        err instanceof Error
                            ? err.message
                            : "Failed to record sale",
                    type: "error",
                });
            }
        });
    }

    return (
        <Card>
            <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    Record Sale to Consumer
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

                {/* Customer name */}
                <div className="space-y-2">
                    <Label htmlFor="customerName">
                        Buyer Name / ID
                    </Label>
                    <Input
                        id="customerName"
                        placeholder="Enter customer name or ID"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="max-w-md"
                    />
                </div>

                {/* Product selection table */}
                <div className="overflow-x-auto">
                    <p className="text-sm font-medium mb-2">
                        Select Products to Sell
                    </p>
                    <Table className="table-fixed w-full">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[20%]">Product</TableHead>
                                <TableHead className="text-right w-[12%]">
                                    Available
                                </TableHead>
                                <TableHead className="text-right w-[15%]">
                                    Qty to Sell
                                </TableHead>
                                <TableHead className="text-right w-[15%]">
                                    Unit Price
                                </TableHead>
                                <TableHead className="text-right w-[18%]">
                                    Tax ({Math.round(vatRate * 100)}%)
                                </TableHead>
                                <TableHead className="text-right w-[20%]">
                                    Total
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {saleItems.map((item, idx) => {
                                const lineTotal =
                                    item.quantityToSell * item.unitPrice;
                                const lineTax = Math.round(
                                    lineTotal * vatRate,
                                );
                                return (
                                    <TableRow key={item.productId}>
                                        <TableCell className="font-medium truncate">
                                            {item.productName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {item.available.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Input
                                                type="number"
                                                className="w-20 text-right ml-auto h-8"
                                                value={
                                                    item.quantityToSell || ""
                                                }
                                                onChange={(e) =>
                                                    updateItem(
                                                        idx,
                                                        "quantityToSell",
                                                        e.target.value,
                                                    )
                                                }
                                                min={0}
                                                max={item.available}
                                                step="any"
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="space-y-1">
                                                <Input
                                                    type="number"
                                                    className="w-20 text-right ml-auto h-8"
                                                    value={item.unitPrice || ""}
                                                    onChange={(e) =>
                                                        updateItem(
                                                            idx,
                                                            "unitPrice",
                                                            e.target.value,
                                                        )
                                                    }
                                                    min={0}
                                                />
                                                {item.quantityToSell > 0 && (
                                                    <PriceRangeBar
                                                        productId={item.productId}
                                                        currentPrice={item.unitPrice}
                                                        compact
                                                        onStatusChange={(status) =>
                                                            handlePriceStatusChange(item.productId, status)
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-muted-foreground truncate">
                                            {lineTax > 0
                                                ? `${lineTax.toLocaleString()} RWF`
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-mono truncate">
                                            {lineTotal > 0
                                                ? `${lineTotal.toLocaleString()} RWF`
                                                : "—"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* Totals and submit */}
                {activeItems.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                        <div className="flex gap-6 text-sm">
                            <span>
                                Total Sale Value:{" "}
                                <strong className="font-mono">
                                    {totalSaleValue.toLocaleString()} RWF
                                </strong>
                            </span>
                            <span>
                                Total Tax:{" "}
                                <strong className="font-mono text-emerald-600">
                                    {totalTax.toLocaleString()} RWF
                                </strong>
                            </span>
                        </div>
                        <Button
                            onClick={handleConfirmSale}
                            disabled={isPending || !canSubmit}
                            className="gap-2"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle className="h-4 w-4" />
                            )}
                            Confirm Sale
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
