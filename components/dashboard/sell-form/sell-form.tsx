'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSaleForConfirmation } from '@/lib/actions/transaction.action';
import { BuyerLookup, type BuyerInfo } from '@/components/dashboard/buyer-lookup/buyer-lookup';
import { formatRWF } from '@/components/dashboard/stat-card/stat-card';
import { PriceRangeBar, usePriceSuggestion } from '@/components/dashboard/price-range-bar';
import { useSocket } from '@/lib/socket-client';
import { useSocketContext } from '@/components/providers/socket-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDown, Check, CheckCircle, Circle, Clock3, Loader2, PackagePlus, Search,
  Send, ShoppingCart, Trash2,
} from 'lucide-react';

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  quantity: number;
  unitPrice?: number | null;
}

interface RecentTransaction {
  id: string;
  buyerName: string | null;
  buyerTin: string | null;
  productName: string;
  quantity: number;
  totalAmount: number;
  vatAmount: number;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
}

interface SellFormProps {
  inventory: InventoryItem[];
  vatRate: number;
  recentTransactions: RecentTransaction[];
}

interface SaleItem {
  productId: string;
  productName: string;
  productUnit: string;
  available: number;
  quantityToSell: number;
  unitPrice: number;
}

function SaleItemRow({
  item, onUpdate, onRemove, vatRate,
}: {
  item: SaleItem;
  onUpdate: (field: 'quantityToSell' | 'unitPrice', value: number) => void;
  onRemove: () => void;
  vatRate: number;
}) {
  const { suggestion } = usePriceSuggestion(item.productId);
  const subtotal = Math.round(item.quantityToSell * item.unitPrice);
  const tax = Math.round(subtotal * vatRate);
  const invalidQuantity = item.quantityToSell <= 0 || item.quantityToSell > item.available;
  const invalidPrice = !Number.isSafeInteger(item.unitPrice) || item.unitPrice <= 0 || (suggestion?.floor ? item.unitPrice < suggestion.floor : false);

  return (
    <TableRow>
      <TableCell className="min-w-44">
        <p className="font-medium">{item.productName}</p>
        <p className="text-xs text-muted-foreground">ID {item.productId} · {item.productUnit}</p>
      </TableCell>
      <TableCell className="text-right font-mono">{item.available.toLocaleString()}</TableCell>
      <TableCell className="text-right">
        <Input
          aria-label={`Quantity of ${item.productName}`}
          type="number" className="ml-auto h-9 w-24 text-right" value={item.quantityToSell || ''}
          min="0.001" max={item.available} step="any"
          onChange={(event) => onUpdate('quantityToSell', event.target.value === '' ? 0 : Number(event.target.value))}
        />
        {invalidQuantity && item.quantityToSell > 0 && <p className="mt-1 text-xs text-red-600">Exceeds available stock</p>}
      </TableCell>
      <TableCell className="text-right">
        <div className="space-y-1">
          <Input
            aria-label={`Unit price for ${item.productName}`}
            type="number" className="ml-auto h-9 w-28 text-right" value={item.unitPrice || ''}
            min={suggestion?.floor ?? 1} step="1"
            onChange={(event) => onUpdate('unitPrice', event.target.value === '' ? 0 : Number(event.target.value))}
          />
          {suggestion?.floor && item.unitPrice > 0 && <PriceRangeBar productId={item.productId} currentPrice={item.unitPrice} compact />}
          {invalidPrice && item.unitPrice > 0 && <p className="mt-1 text-xs text-red-600">Enter a valid price{suggestion?.floor ? ` (minimum ${formatRWF(suggestion.floor)})` : ''}</p>}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">{tax ? formatRWF(tax) : '—'}</TableCell>
      <TableCell className="text-right font-mono font-medium">{subtotal ? formatRWF(subtotal + tax) : '—'}</TableCell>
      <TableCell className="text-right">
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.productName}`} onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function TransactionTimeline({ transaction: txn }: { transaction: RecentTransaction | null }) {
  const status = txn?.status ?? 'draft';
  const stages = [
    { label: 'Sale created', complete: Boolean(txn), pending: false },
    { label: 'Buyer notified', complete: Boolean(txn), pending: false },
    { label: status === 'rejected' ? 'Rejected by buyer' : status === 'cancelled' ? 'Cancelled by seller' : status === 'expired' ? 'Reservation expired' : 'Pending buyer confirmation', complete: false, pending: status === 'pending' },
    { label: 'Confirmed by buyer', complete: ['confirmed', 'completed'].includes(status), pending: false },
    { label: 'Tax recorded', complete: ['confirmed', 'completed'].includes(status), pending: false },
    { label: 'Transaction completed', complete: ['confirmed', 'completed'].includes(status), pending: false },
  ];

  return (
    <ol className="space-y-0">
      {stages.map((stage, index) => (
        <li key={stage.label} className="relative flex gap-3 pb-5 last:pb-0">
          {index < stages.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-border" />}
          <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${stage.complete ? 'border-emerald-600 bg-emerald-600 text-white' : stage.pending ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border bg-background text-muted-foreground'}`}>
            {stage.complete ? <Check className="h-3.5 w-3.5" /> : stage.pending ? <Clock3 className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}
          </span>
          <span className={`pt-0.5 text-sm ${stage.complete ? 'font-medium' : stage.pending ? 'font-semibold text-amber-700' : 'text-muted-foreground'}`}>{stage.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function SellForm({ inventory, vatRate, recentTransactions }: SellFormProps) {
  const router = useRouter();
  const { userId } = useSocketContext();
  const [isPending, startTransition] = useTransition();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [isDirectBulkSale, setIsDirectBulkSale] = useState(false);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliverySchedule, setDeliverySchedule] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [localTransaction, setLocalTransaction] = useState<RecentTransaction | null>(null);

  const sellableInventory = useMemo(() => inventory.filter((item) => Number.isFinite(item.quantity) && item.quantity > 0), [inventory]);
  const availableToAdd = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return sellableInventory.filter((item) => !saleItems.some((selected) => selected.productId === item.productId)
      && (!query || `${item.productName} ${item.productId}`.toLocaleLowerCase().includes(query)));
  }, [sellableInventory, saleItems, search]);
  const subtotal = saleItems.reduce((sum, item) => sum + Math.round(item.quantityToSell * item.unitPrice), 0);
  const taxTotal = saleItems.reduce((sum, item) => sum + Math.round(Math.round(item.quantityToSell * item.unitPrice) * vatRate), 0);
  const total = subtotal + taxTotal;
  const totalItems = saleItems.reduce((sum, item) => sum + item.quantityToSell, 0);
  const hasInvalidItems = saleItems.some((item) => item.quantityToSell <= 0 || item.quantityToSell > item.available
    || !Number.isFinite(item.quantityToSell) || !Number.isSafeInteger(item.unitPrice) || item.unitPrice <= 0);
  const canSubmit = Boolean(buyer?.isEligible && saleItems.length > 0 && !hasInvalidItems && !isPending);

  const handleRefresh = useCallback(() => router.refresh(), [router]);
  useSocket(userId, {
    'txn:confirmed': handleRefresh,
    'txn:rejected': handleRefresh,
    'txn:cancelled': handleRefresh,
    'txn:expired': handleRefresh,
  });

  const latestTransaction = recentTransactions[0] ?? null;
  const displayedTransaction = localTransaction
    ? recentTransactions.find((item) => item.id === localTransaction.id) ?? localTransaction
    : latestTransaction;

  function updateItem(productId: string, field: 'quantityToSell' | 'unitPrice', value: number) {
    setSaleItems((items) => items.map((item) => item.productId === productId ? { ...item, [field]: value } : item));
  }

  function addProduct() {
    const product = sellableInventory.find((item) => item.productId === selectedProductId);
    if (!product || saleItems.some((item) => item.productId === product.productId)) return;
    setSaleItems((items) => [...items, {
      productId: product.productId,
      productName: product.productName,
      productUnit: product.productUnit,
      available: product.quantity,
      quantityToSell: 0,
      unitPrice: product.unitPrice ?? 0,
    }]);
    setSelectedProductId('');
  }

  function handleBuyerFound(value: BuyerInfo) {
    setBuyer(value);
    setSaleItems([]);
    setMessage(null);
  }

  function handleBuyerCleared() {
    setBuyer(null);
    setSaleItems([]);
    setMessage(null);
  }

  function handleSendSale() {
    if (!buyer?.isEligible || hasInvalidItems || saleItems.length === 0) return;
    startTransition(async () => {
      try {
        setMessage(null);
        const result = await createSaleForConfirmation({
          buyerTin: buyer.tinNumber ?? '',
          items: saleItems.map(({ productId, quantityToSell, unitPrice }) => ({ productId, quantity: quantityToSell, unitPrice })),
          transactionType: isDirectBulkSale ? 'DIRECT_BULK_SALE' : 'STANDARD_B2B_SALE',
          invoiceReference,
          deliveryInformation: isDirectBulkSale ? { address: deliveryAddress, schedule: deliverySchedule, notes: deliveryNotes } : undefined,
        });
        if (!result.success) {
          setMessage({ text: result.error, type: 'error' });
          return;
        }
        const ids = result.transactions.map((transaction) => transaction.id);
        const firstTransaction = result.transactions[0];
        if (firstTransaction) setLocalTransaction({
          id: firstTransaction.id,
          buyerName: buyer.businessName ?? buyer.name,
          buyerTin: buyer.tinNumber,
          productName: saleItems.length === 1 ? saleItems[0].productName : `${saleItems.length} products`,
          quantity: totalItems,
          totalAmount: subtotal,
          vatAmount: taxTotal,
          status: 'pending',
          createdAt: new Date(),
          confirmedAt: null,
        });
        setMessage({
          text: `Sale Sent Successfully. The buyer has been notified and must confirm this transaction before it is finalized. Reference${ids.length === 1 ? '' : 's'}: ${ids.join(', ')}`,
          type: 'success',
        });
        setSaleItems([]);
        router.refresh();
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : 'Unable to send the sale for confirmation.', type: 'error' });
      }
    });
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold"><ShoppingCart className="h-4 w-4" />Sell to Buyer</CardTitle>
            <p className="text-sm text-muted-foreground">Step 1 · Verify the buyer&apos;s TIN before selecting products.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {message && <div role="status" className={`rounded-md border px-3 py-2 text-sm ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{message.text}</div>}
            <BuyerLookup onBuyerFound={handleBuyerFound} onBuyerCleared={handleBuyerCleared} />

            {buyer?.isEligible && <>
              <div className="rounded-lg border p-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                  <input type="checkbox" className="mt-1 accent-foreground" checked={isDirectBulkSale} onChange={(event) => setIsDirectBulkSale(event.target.checked)} />
                  <span>Direct Bulk Sale<span className="block text-xs font-normal text-muted-foreground">For large businesses or institutions buying directly from the manufacturer.</span></span>
                </label>
                {isDirectBulkSale && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} placeholder="Invoice / reference number" maxLength={120} />
                  <Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Delivery address" maxLength={500} />
                  <Input value={deliverySchedule} onChange={(event) => setDeliverySchedule(event.target.value)} placeholder="Delivery schedule" maxLength={500} />
                  <Input value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Delivery notes (optional)" maxLength={500} />
                </div>}
              </div>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h2 className="font-semibold">Select Products to Sell</h2><p className="text-xs text-muted-foreground">Only products in your authorized, available inventory are listed.</p></div>
                  <Badge variant="outline">Step 2 · Select products</Badge>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search product name or TaxFlow Product ID" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                  <select aria-label="Choose inventory product" className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-56" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                    <option value="">Choose a product</option>
                    {availableToAdd.map((item) => <option key={item.productId} value={item.productId}>{item.productName} · {item.quantity.toLocaleString()} {item.productUnit}</option>)}
                  </select>
                  <Button type="button" variant="outline" disabled={!selectedProductId} onClick={addProduct} className="gap-2"><PackagePlus className="h-4 w-4" />Add Product</Button>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Product / Product ID</TableHead><TableHead className="text-right">Available stock</TableHead>
                      <TableHead className="text-right">Qty to sell</TableHead><TableHead className="text-right">Unit price (RWF)</TableHead>
                      <TableHead className="text-right">Tax ({Math.round(vatRate * 100)}%)</TableHead><TableHead className="text-right">Total</TableHead><TableHead />
                    </TableRow></TableHeader>
                    <TableBody>
                      {saleItems.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        {sellableInventory.length ? 'Search and add products from your inventory to start this sale.' : 'No sellable stock is available. Record production or confirm an incoming purchase to add inventory.'}
                      </TableCell></TableRow> : saleItems.map((item) => <SaleItemRow
                        key={item.productId} item={item} vatRate={vatRate}
                        onUpdate={(field, value) => updateItem(item.productId, field, value)}
                        onRemove={() => setSaleItems((items) => items.filter((selected) => selected.productId !== item.productId))}
                      />)}
                    </TableBody>
                  </Table>
                </div>
                {saleItems.length > 0 && <>
                  <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Total items</p><p className="font-semibold">{totalItems.toLocaleString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">Subtotal</p><p className="font-mono font-semibold">{formatRWF(subtotal)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Tax</p><p className="font-mono font-semibold text-emerald-700">{formatRWF(taxTotal)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Grand total (RWF)</p><p className="font-mono text-lg font-bold">{formatRWF(total)}</p></div>
                  </div>
                  {hasInvalidItems && <p className="text-sm text-red-600">Correct each quantity and unit price before sending. Quantity cannot exceed available stock.</p>}
                  <div className="flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
                    <div><p className="text-xs text-muted-foreground">Step 3 · Buyer must confirm before this sale is finalized.</p><p className="text-sm font-medium">Total amount: {formatRWF(total)}</p></div>
                    <Button onClick={handleSendSale} disabled={!canSubmit} size="lg" className="gap-2">
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {isPending ? 'Sending…' : 'Send Sale for Confirmation'}
                    </Button>
                  </div>
                </>}
              </section>
            </>}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Purchase confirmation</CardTitle><p className="text-sm text-muted-foreground">Buyer confirmation is required before completion.</p></CardHeader>
          <CardContent className="space-y-4">
            {displayedTransaction ? <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{displayedTransaction.buyerName ?? 'Buyer'}</span><Badge variant="outline" className="capitalize">{displayedTransaction.status.replaceAll('_', ' ')}</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">TIN {displayedTransaction.buyerTin ?? '—'}</p>
              <div className="mt-3 flex justify-between gap-3"><span className="text-muted-foreground">Product</span><span className="text-right font-medium">{displayedTransaction.productName} × {displayedTransaction.quantity.toLocaleString()}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-mono">{formatRWF(displayedTransaction.vatAmount)}</span></div>
              <div className="mt-2 flex justify-between border-t pt-2"><span className="text-muted-foreground">Sale value</span><span className="font-mono font-semibold">{formatRWF(displayedTransaction.totalAmount + displayedTransaction.vatAmount)}</span></div>
              <p className="mt-2 break-all text-[11px] text-muted-foreground">Reference: {displayedTransaction.id}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{new Date(displayedTransaction.createdAt).toLocaleString()}</p>
            </div> : <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">New sale details and its reference will appear here after it is sent.</div>}
            <TransactionTimeline transaction={displayedTransaction} />
            {displayedTransaction?.status === 'pending' && <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800"><Clock3 className="h-4 w-4 shrink-0" /><p>{displayedTransaction.quantity.toLocaleString()} unit(s) are reserved and excluded from available stock. The hold converts on confirmation or releases exactly once on rejection, seller cancellation, or expiry.</p></div>}
            {displayedTransaction?.status === 'rejected' && <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"><ArrowDown className="h-4 w-4 shrink-0" /><p>Sale rejected by buyer. The transaction was not finalized and reserved stock has been returned.</p></div>}
            {displayedTransaction?.status === 'expired' && <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"><Clock3 className="h-4 w-4 shrink-0" /><p>Reservation expired before buyer confirmation. The transaction was not finalized and reserved stock has been returned.</p></div>}
            {displayedTransaction?.status === 'cancelled' && <div className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"><Circle className="h-4 w-4 shrink-0" /><p>Sale cancelled before buyer confirmation. Reserved stock has been returned.</p></div>}
          </CardContent>
        </Card>

        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">How confirmation works</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="flex gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />Sale and stock hold are recorded together.</p>
          <p className="flex gap-2"><Send className="h-4 w-4 shrink-0" />The buyer receives a TaxFlow notification.</p>
          <p className="flex gap-2"><Clock3 className="h-4 w-4 shrink-0" />The buyer confirms or rejects from Pending Confirmations.</p>
        </CardContent></Card>
      </aside>
    </div>
  );
}
