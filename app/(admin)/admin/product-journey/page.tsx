import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import db from '@/db/drizzle';
import { product, productionBatch, transaction, user, stockMovement, importDeclaration } from '@/db/schema';
import { requireRRASession } from '@/lib/auth-guard';
import { ProductJourneyExplorer } from '@/components/admin/product-journey-explorer';
import { reconcileStockMovements } from '@/lib/product-journey/reconciliation';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ productId?: string; q?: string }>;
};

export default async function ProductJourneyPage({ searchParams }: PageProps) {
  await requireRRASession('super_admin', 'compliance_officer', 'audit_officer', 'stock_officer');
  const params = await searchParams;
  const selectedProductId = params.productId ?? '';

  const products = await db.select({
    id: product.id,
    name: product.name,
    unit: product.unit,
  }).from(product).orderBy(product.name).limit(500);

  const selectedProduct = products.find((item) => item.id === selectedProductId) ?? null;
  const seller = alias(user, 'journey_seller');
  const buyer = alias(user, 'journey_buyer');

  const transactions = selectedProduct
    ? await db.select({
        id: transaction.id,
        quantity: transaction.quantity,
        unitPrice: transaction.unitPrice,
        totalAmount: transaction.totalAmount,
        vatAmount: transaction.vatAmount,
        status: transaction.status,
        createdAt: transaction.createdAt,
        sellerId: seller.id,
        sellerName: seller.businessName,
        sellerTin: seller.tinNumber,
        buyerId: buyer.id,
        buyerName: buyer.businessName,
        buyerTin: buyer.tinNumber,
        finalBuyerName: transaction.buyerName,
      })
        .from(transaction)
        .innerJoin(seller, eq(transaction.sellerId, seller.id))
        .leftJoin(buyer, eq(transaction.buyerId, buyer.id))
        .where(eq(transaction.productId, selectedProduct.id))
        .orderBy(desc(transaction.createdAt))
        .limit(500)
    : [];

  const batches = selectedProduct
    ? await db.select({
        id: productionBatch.id,
        batchReference: productionBatch.batchReference,
        quantity: productionBatch.declaredQuantity,
        status: productionBatch.status,
        createdAt: productionBatch.createdAt,
        manufacturerId: productionBatch.manufacturerId,
        manufacturerName: user.businessName,
        manufacturerTin: user.tinNumber,
      })
        .from(productionBatch)
        .innerJoin(user, eq(productionBatch.manufacturerId, user.id))
        .where(eq(productionBatch.productId, selectedProduct.id))
        .orderBy(desc(productionBatch.createdAt))
        .limit(200)
    : [];

  const imports = selectedProduct
    ? await db.select({
        id: importDeclaration.id,
        reference: importDeclaration.declarationRef,
        quantity: importDeclaration.inspectedQuantity,
        expectedQuantity: importDeclaration.expectedQuantity,
        status: importDeclaration.status,
        createdAt: importDeclaration.createdAt,
        businessName: user.businessName,
        tin: user.tinNumber,
      })
        .from(importDeclaration)
        .innerJoin(user, eq(importDeclaration.businessId, user.id))
        .where(eq(importDeclaration.productId, selectedProduct.id))
        .orderBy(desc(importDeclaration.createdAt))
        .limit(200)
    : [];

  const movements = selectedProduct
    ? await db.select({
        id: stockMovement.id,
        businessId: stockMovement.businessId,
        quantityDelta: stockMovement.quantityDelta,
        quantityBefore: stockMovement.quantityBefore,
        quantityAfter: stockMovement.quantityAfter,
        movementType: stockMovement.movementType,
        sourceType: stockMovement.sourceType,
        sourceId: stockMovement.sourceId,
        reason: stockMovement.reason,
        createdAt: stockMovement.createdAt,
        businessName: user.businessName,
        tin: user.tinNumber,
      })
        .from(stockMovement)
        .innerJoin(user, eq(stockMovement.businessId, user.id))
        .where(eq(stockMovement.productId, selectedProduct.id))
        .orderBy(desc(stockMovement.createdAt))
        .limit(500)
    : [];

  const totalProduced = batches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
  const totalInspectedImports = imports.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const completedSales = transactions.filter((item) => ['completed', 'confirmed'].includes(item.status));
  const totalRecordedSales = completedSales.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const unmatchedCount = transactions.filter((item) => !item.buyerId && !item.finalBuyerName).length;
  const movementChecks = reconcileStockMovements(movements.map((item) => ({
    id: item.id,
    quantityBefore: Number(item.quantityBefore),
    quantityDelta: Number(item.quantityDelta),
    quantityAfter: Number(item.quantityAfter),
  })));
  const inconsistentMovementCount = movementChecks.filter((item) => !item.consistent).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">RRA Intelligence / Traceability</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Product Journey Tree</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Follow recorded production, import, business-to-business transactions and inventory movements.
            Unlinked records are identified rather than guessed.
          </p>
        </div>
        <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium">Authorized RRA view</span>
      </div>

      <ProductJourneyExplorer products={products} selectedProductId={selectedProductId} />

      {!selectedProduct ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-semibold">Select a product to trace</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choose a product above to load its recorded production batches, imports, transactions and inventory evidence.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Recorded production" value={totalProduced} unit={selectedProduct.unit} />
            <Summary label="Inspected import quantity" value={totalInspectedImports} unit={selectedProduct.unit} />
            <Summary label="Confirmed/completed sales" value={totalRecordedSales} unit={selectedProduct.unit} />
            <Summary label="Inventory movement records" value={movements.length} unit="events" />
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{selectedProduct.name} — recorded journey</h2>
                <p className="text-xs text-muted-foreground">Unit: {selectedProduct.unit} · {transactions.length} transaction records · {batches.length} production batches · {imports.length} import declarations</p>
              </div>
              <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Batch lineage may be incomplete</span>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              <JourneyColumn title="Origin records" subtitle="Production and imports">
                {batches.map((batch) => (
                  <article key={batch.id} className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                    <div className="text-xs font-semibold text-blue-800">MANUFACTURER · {batch.batchReference}</div>
                    <div className="mt-1 font-medium">{batch.manufacturerName ?? 'Unknown manufacturer'}</div>
                    <div className="text-xs text-muted-foreground">TIN: {batch.manufacturerTin ?? 'Not recorded'}</div>
                    <div className="mt-2 text-sm">{Number(batch.quantity).toLocaleString()} {selectedProduct.unit} declared</div>
                    <div className="mt-1 text-xs text-muted-foreground">Status: {batch.status ?? 'Unknown'} · {formatDate(batch.createdAt)}</div>
                  </article>
                ))}
                {imports.map((item) => (
                  <article key={item.id} className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                    <div className="text-xs font-semibold text-violet-800">IMPORT · {item.reference ?? item.id}</div>
                    <div className="mt-1 font-medium">{item.businessName ?? 'Unknown importer'}</div>
                    <div className="text-xs text-muted-foreground">TIN: {item.tin ?? 'Not recorded'}</div>
                    <div className="mt-2 text-sm">{item.quantity == null ? 'No inspected quantity' : `${Number(item.quantity).toLocaleString()} ${selectedProduct.unit} inspected`}</div>
                    <div className="text-xs text-muted-foreground">Declared: {Number(item.expectedQuantity).toLocaleString()} · Status: {item.status}</div>
                  </article>
                ))}
                {batches.length === 0 && imports.length === 0 && <Empty>There are no recorded production batches or import declarations for this product.</Empty>}
              </JourneyColumn>

              <JourneyColumn title="Recorded transfers and sales" subtitle="Transactions grouped by timestamp">
                {transactions.map((item) => (
                  <article key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{item.id}</span>
                      <Status value={item.status} />
                    </div>
                    <div className="my-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.sellerName ?? 'Unknown seller'}</p>
                        <p className="text-[11px] text-muted-foreground">TIN {item.sellerTin ?? '—'}</p>
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-semibold">{item.buyerName ?? item.finalBuyerName ?? 'Final customer not named'}</p>
                        <p className="text-[11px] text-muted-foreground">TIN {item.buyerTin ?? 'Consumer / not linked'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 border-t pt-2 text-xs">
                      <span>{Number(item.quantity).toLocaleString()} {selectedProduct.unit}</span>
                      <span>{Number(item.totalAmount).toLocaleString()} RWF</span>
                      <span className="text-muted-foreground">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">VAT recorded: {Number(item.vatAmount).toLocaleString()} RWF</p>
                  </article>
                ))}
                {transactions.length === 0 && <Empty>No transactions are recorded for this product.</Empty>}
              </JourneyColumn>

              <JourneyColumn title="Inventory evidence" subtitle="Append-only stock movement records">
                {movements.map((movement) => (
                  <article key={movement.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{movement.businessName ?? 'Unknown business'}</div>
                      <span className={Number(movement.quantityDelta) < 0 ? 'text-sm font-semibold text-red-600' : 'text-sm font-semibold text-emerald-700'}>
                        {Number(movement.quantityDelta) > 0 ? '+' : ''}{Number(movement.quantityDelta).toLocaleString()} {selectedProduct.unit}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">TIN: {movement.tin ?? 'Not recorded'} · {movement.movementType}</p>
                    <p className="mt-1 text-xs">Balance: {Number(movement.quantityBefore).toLocaleString()} → {Number(movement.quantityAfter).toLocaleString()}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Source: {movement.sourceType ?? 'Unlinked'} / {movement.sourceId ?? 'No source ID'}</p>
                    {movement.reason && <p className="mt-1 text-xs">Note: {movement.reason}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(movement.createdAt)}</p>
                  </article>
                ))}
                {movements.length === 0 && <Empty>No stock movement evidence is recorded for this product.</Empty>}
              </JourneyColumn>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="font-semibold text-amber-900">Traceability limitations and review flags</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
              <li>Product-level records are not proof of batch-level provenance unless a batch allocation is recorded.</li>
              <li>{unmatchedCount} transaction(s) have neither a linked business buyer nor a recorded final-customer name.</li>
              <li>Only confirmed/completed transactions are included in the recorded-sales summary; this is not a physical stock count.</li>
              <li>Legacy stock balances without movement history cannot be reliably attributed to a source batch.</li>
              <li>{inconsistentMovementCount} stock movement(s) have an arithmetic mismatch between before + delta and after. This is a data-quality flag, not a fraud finding.</li>
              <li>Displayed quantities are recorded evidence, not an automatic finding of fraud or a physical-location claim.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{Number(value).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{unit}</span></p></div>;
}

function JourneyColumn({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="min-w-0 space-y-3"><div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{subtitle}</p></div>{children}</section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{children}</p>;
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const classes = normalized === 'completed' || normalized === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : normalized === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${classes}`}>{value}</span>;
}

function formatDate(value: Date | null) {
  if (!value) return 'Date not recorded';
  return new Date(value).toLocaleString('en-RW', { dateStyle: 'medium', timeStyle: 'short' });
}
