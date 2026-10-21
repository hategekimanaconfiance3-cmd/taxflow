'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { createTransaction } from '@/lib/actions/transaction.action';
import { BuyerLookup, type BuyerInfo } from '@/components/dashboard/buyer-lookup/buyer-lookup';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { PriceRangeBar, usePriceSuggestion } from '@/components/dashboard/price-range-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, ShoppingCart } from 'lucide-react';

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  quantity: number;
  unitPrice?: number | null;
}

interface SellFormProps {
  inventory?: InventoryItem[];
  /** Backward-compatible prop name used by older sell pages. */
  products?: InventoryItem[];
  vatRate: number;
}

interface SaleItem {
  productId: string;
  productName: string;
  available: number;
  quantityToSell: number;
  unitPrice: number;
  minPrice?: number;
}

function SaleItemRow({
  item,
  idx,
  vatRate,
  onUpdate,
}: {
  item: SaleItem;
  idx: number;
  vatRate: number;
  onUpdate: (idx: number, field: keyof SaleItem, value: number | string) => void;
}) {
  const { suggestion: priceSuggestion } = usePriceSuggestion(item.productId);
  const minPrice = priceSuggestion?.floor ?? 0;

  // Update minPrice when suggestion loads
  useEffect(() => {
    if (minPrice > 0) {
      onUpdate(idx, 'minPrice', minPrice);
      // If current price is below new min, auto-correct it
      if (item.unitPrice > 0 && item.unitPrice < minPrice) {
        onUpdate(idx, 'unitPrice', minPrice);
      }
    }
  }, [minPrice, idx, onUpdate, item.unitPrice]);

  const lineTotal = item.quantityToSell * item.unitPrice;
  const lineTax = Math.round(lineTotal * vatRate);

  return (
    <TableRow key={item.productId}>
      <TableCell className="font-medium">{item.productName}</TableCell>
      <TableCell className="text-right font-mono">{item.available.toLocaleString()}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          className="w-24 text-right ml-auto h-8"
          value={item.quantityToSell || ''}
          onChange={(e) => {
            const value = parseFloat(e.target.value) || 0;
            // Auto-reset to max available if user enters more than stock
            if (value > item.available) {
              onUpdate(idx, 'quantityToSell', item.available);
            } else {
              onUpdate(idx, 'quantityToSell', value);
            }
          }}
          min={0}
          max={item.available}
          step="any"
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="space-y-1">
          <Input
            type="number"
            className="w-24 text-right ml-auto h-8"
            value={item.unitPrice || ''}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 0;
              // Prevent entering price below floor
              if (minPrice > 0 && value > 0 && value < minPrice) {
                onUpdate(idx, 'unitPrice', minPrice);
              } else {
                onUpdate(idx, 'unitPrice', value);
              }
            }}
            min={minPrice > 0 ? minPrice : 0}
          />
          {item.quantityToSell > 0 && (
            <PriceRangeBar productId={item.productId} currentPrice={item.unitPrice} compact />
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        {lineTax > 0 ? formatRWF(lineTax) : '—'}
      </TableCell>
      <TableCell className="text-right font-mono font-medium">{lineTotal > 0 ? formatRWF(lineTotal) : '—'}</TableCell>
    </TableRow>
  );
}

export function SellForm({ inventory, products, vatRate }: SellFormProps) {
  // Older page versions passed the same stock list as `products`. Treat an
  // absent or malformed prop as an empty list so rendering never crashes.
  const sellableInventory = Array.isArray(inventory)
    ? inventory
    : Array.isArray(products)
      ? products
      : [];
  const [isPending, startTransition] = useTransition();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [isDirectBulkSale, setIsDirectBulkSale] = useState(false);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliverySchedule, setDeliverySchedule] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItem[]>(
    () => sellableInventory.map((inv) => ({
      productId: inv.productId,
      productName: inv.productName,
      available: inv.quantity,
      quantityToSell: 0,
      unitPrice: inv.unitPrice ?? 0,
    })),
  );
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const handleBuyerFound = useCallback((b: BuyerInfo) => setBuyer(b), []);
  const handleBuyerCleared = useCallback(() => setBuyer(null), []);

  function updateItem(idx: number, field: keyof SaleItem, value: number | string) {
    setSaleItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Items with quantity > 0
  const activeItems = saleItems.filter((item) => item.quantityToSell > 0);

  // Totals
  const totalSaleValue = activeItems.reduce((sum, item) => sum + item.quantityToSell * item.unitPrice, 0);
  const totalTax = Math.round(totalSaleValue * vatRate);

  const canSubmit = buyer?.isEligible && activeItems.length > 0;

  async function handleConfirmSale() {
    if (!buyer?.isEligible || activeItems.length === 0) return;

    startTransition(async () => {
      try {
        setMessage(null);
        // Submit each product as a separate transaction
        for (const item of activeItems) {
          await createTransaction({
            buyerTin: buyer.tinNumber!,
            productId: item.productId,
            quantity: item.quantityToSell,
            unitPrice: item.unitPrice,
            transactionType: isDirectBulkSale ? 'DIRECT_BULK_SALE' : 'STANDARD_B2B_SALE',
            invoiceReference,
            deliveryInformation: isDirectBulkSale
              ? { address: deliveryAddress, schedule: deliverySchedule, notes: deliveryNotes }
              : undefined,
          });
        }

        setMessage({
          text: `Sale of ${activeItems.length} product(s) submitted for confirmation`,
          type: 'success',
        });

        // Reset quantities
        setSaleItems((prev) =>
          prev.map((item) => ({
            ...item,
            quantityToSell: 0,
            unitPrice: 0,
          })),
        );
      } catch (err) {
        setMessage({
          text: err instanceof Error ? err.message : 'Failed to create sale',
          type: 'error',
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Sell to Buyer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status message */}
        {message && (
          <div
            className={`text-sm rounded-md px-3 py-2 ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Buyer lookup */}
        <BuyerLookup onBuyerFound={handleBuyerFound} onBuyerCleared={handleBuyerCleared} />

        {buyer?.isEligible && (
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="mt-1"
                checked={isDirectBulkSale}
                onChange={(event) => setIsDirectBulkSale(event.target.checked)}
              />
              <span>
                Direct bulk sale <span className="block text-xs font-normal text-muted-foreground">For a large business or institution buying directly from you. It does not require a wholesaler in between.</span>
              </span>
            </label>
            {isDirectBulkSale && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={invoiceReference}
                  onChange={(event) => setInvoiceReference(event.target.value)}
                  placeholder="Invoice / reference number"
                  maxLength={120}
                />
                <Input
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="Delivery address"
                  maxLength={500}
                />
                <Input
                  value={deliverySchedule}
                  onChange={(event) => setDeliverySchedule(event.target.value)}
                  placeholder="Delivery schedule, e.g. 10,000 bags weekly"
                  maxLength={500}
                />
                <Input
                  value={deliveryNotes}
                  onChange={(event) => setDeliveryNotes(event.target.value)}
                  placeholder="Delivery notes (optional)"
                  maxLength={500}
                />
              </div>
            )}
          </div>
        )}

        {/* Product selection table */}
        {buyer?.isEligible && (
          <>
            <div>
              <p className="text-sm font-medium mb-2">Select Products to Sell</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right w-28">Qty to Sell</TableHead>
                    <TableHead className="text-right w-28">Unit Price</TableHead>
                    <TableHead className="text-right">Tax ({Math.round(vatRate * 100)}%)</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleItems.map((item, idx) => (
                    <SaleItemRow key={item.productId} item={item} idx={idx} vatRate={vatRate} onUpdate={updateItem} />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            {activeItems.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <div className="flex gap-6 text-sm">
                  <span>
                    Total Sale Value: <strong className="font-mono">{formatRWF(totalSaleValue)}</strong>
                  </span>
                  <span>
                    Total Tax: <strong className="font-mono text-emerald-600">{formatRWF(totalTax)}</strong>
                  </span>
                </div>
                <Button onClick={handleConfirmSale} disabled={isPending || !canSubmit} className="gap-2">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Confirm Sale
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
