import { Suspense } from "react";
import { requireRRASession } from "@/lib/auth-guard";
import {
    getProductList,
    getProductFlow,
} from "@/lib/actions/admin-supply-chain.action";
import type { ProductFlow } from "@/lib/actions/admin-supply-chain.action";
import { ProductSelector } from "@/components/admin/product-selector";
import { formatRWF } from "@/components/dashboard/stat-card/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ArrowRight,
    Factory,
    Store,
    ShoppingCart,
    Package,
    Users,
    ArrowDownRight,
} from "lucide-react";

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> =
{
    manufacturer: Factory,
    wholesaler: Package,
    retailer: Store,
    consumer: ShoppingCart,
};

const ROLE_COLORS: Record<string, string> = {
    manufacturer: "bg-blue-500/10 text-blue-600 border-blue-200",
    wholesaler: "bg-violet-500/10 text-violet-600 border-violet-200",
    retailer: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    consumer: "bg-amber-500/10 text-amber-600 border-amber-200",
};

export default async function SupplyChainPage({
    searchParams,
}: {
    searchParams: Promise<{ product?: string }>;
}) {
    await requireRRASession("audit_officer", "stock_officer");
    const params = await searchParams;
    const products = await getProductList();
    const flow = params.product
        ? await getProductFlow(params.product)
        : null;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Supply Chain
                </h1>
                <p className="text-muted-foreground">
                    Trace product flow from manufacturer to consumer.
                </p>
            </div>

            {/* Product selector */}
            <Suspense fallback={null}>
                <ProductSelector
                    products={products}
                    selectedId={params.product}
                />
            </Suspense>

            {!params.product && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">
                            Select a product above to visualize its supply
                            chain flow.
                        </p>
                    </CardContent>
                </Card>
            )}

            {params.product && !flow && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">
                            Product not found or no transactions recorded.
                        </p>
                    </CardContent>
                </Card>
            )}

            {flow && <SupplyChainFlow flow={flow} />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Flow Visualization Component
// ---------------------------------------------------------------------------

function SupplyChainFlow({ flow }: { flow: ProductFlow }) {
    // Group nodes by role
    const manufacturers = flow.nodes.filter(
        (n) => n.role === "manufacturer",
    );
    const wholesalers = flow.nodes.filter((n) => n.role === "wholesaler");
    const retailers = flow.nodes.filter((n) => n.role === "retailer");

    // Consumer links (sold by retailers without a buyerId)
    const consumerLinks = flow.links.filter((l) => l.to === "consumer");
    const totalToConsumers = consumerLinks.reduce(
        (s, l) => s + l.totalQuantity,
        0,
    );

    return (
        <div className="space-y-6">
            {/* Summary */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">
                        {flow.product.name} — Supply Chain Overview
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                        <Badge variant="outline" className={ROLE_COLORS.manufacturer}>
                            {manufacturers.length} Manufacturer{manufacturers.length !== 1 ? "s" : ""}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline" className={ROLE_COLORS.wholesaler}>
                            {wholesalers.length} Wholesaler{wholesalers.length !== 1 ? "s" : ""}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline" className={ROLE_COLORS.retailer}>
                            {retailers.length} Retailer{retailers.length !== 1 ? "s" : ""}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline" className={ROLE_COLORS.consumer}>
                            {totalToConsumers.toLocaleString()}{" "}
                            {flow.product.unit} to consumers
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Flow Lanes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Manufacturers */}
                <FlowLane
                    title="Manufacturers"
                    role="manufacturer"
                    nodes={manufacturers}
                    links={flow.links}
                    unit={flow.product.unit}
                />

                {/* Wholesalers */}
                <FlowLane
                    title="Wholesalers"
                    role="wholesaler"
                    nodes={wholesalers}
                    links={flow.links}
                    unit={flow.product.unit}
                />

                {/* Retailers */}
                <FlowLane
                    title="Retailers"
                    role="retailer"
                    nodes={retailers}
                    links={flow.links}
                    unit={flow.product.unit}
                />
            </div>

            {/* Detailed Links */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <ArrowDownRight className="h-4 w-4" />
                        Transaction Flows ({flow.links.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {flow.links.map((link, i) => {
                            const fromNode = flow.nodes.find(
                                (n) => n.businessId === link.from,
                            );
                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 text-sm py-2 px-3 rounded-md bg-muted/40"
                                >
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] ${ROLE_COLORS[fromNode?.role ?? ""] ?? ""}`}
                                    >
                                        {fromNode?.businessName ?? "Unknown"}
                                    </Badge>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] ${link.to === "consumer" ? ROLE_COLORS.consumer : ROLE_COLORS[flow.nodes.find((n) => n.businessId === link.to)?.role ?? ""] ?? ""}`}
                                    >
                                        {link.toName}
                                    </Badge>
                                    <span className="ml-auto font-mono text-muted-foreground">
                                        {link.totalQuantity.toLocaleString()}{" "}
                                        {flow.product.unit}
                                    </span>
                                    <span className="font-mono">
                                        {formatRWF(link.totalValue)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        ({link.transactionCount} txn
                                        {link.transactionCount !== 1
                                            ? "s"
                                            : ""}
                                        )
                                    </span>
                                </div>
                            );
                        })}
                        {flow.links.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No transaction flows found.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Flow Lane (column for each role tier)
// ---------------------------------------------------------------------------

function FlowLane({
    title,
    role,
    nodes,
    links,
    unit,
}: {
    title: string;
    role: string;
    nodes: ProductFlow["nodes"];
    links: ProductFlow["links"];
    unit: string;
}) {
    const Icon = ROLE_ICONS[role] ?? Users;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {nodes.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                        No {title.toLowerCase()} in this chain.
                    </p>
                ) : (
                    nodes.map((node) => {
                        const outgoing = links.filter(
                            (l) => l.from === node.businessId,
                        );
                        const totalOut = outgoing.reduce(
                            (s, l) => s + l.totalQuantity,
                            0,
                        );

                        return (
                            <div
                                key={node.businessId}
                                className="p-3 rounded-lg border bg-card space-y-2"
                            >
                                <p className="text-sm font-medium">
                                    {node.businessName}
                                </p>
                                <div className="grid grid-cols-3 gap-1 text-[11px]">
                                    <div>
                                        <p className="text-muted-foreground">
                                            Bought
                                        </p>
                                        <p className="font-mono font-medium">
                                            {node.totalBought.toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">
                                            Sold
                                        </p>
                                        <p className="font-mono font-medium">
                                            {node.totalSold.toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">
                                            Stock
                                        </p>
                                        <p className="font-mono font-medium">
                                            {node.currentStock.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                {outgoing.length > 0 && (
                                    <div className="pt-1 border-t">
                                        <p className="text-[10px] text-muted-foreground mb-1">
                                            Sold to:
                                        </p>
                                        {outgoing.map((l, i) => (
                                            <p
                                                key={i}
                                                className="text-[11px] flex items-center gap-1"
                                            >
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <span>{l.toName}</span>
                                                <span className="ml-auto font-mono text-muted-foreground">
                                                    {l.totalQuantity.toLocaleString()}{" "}
                                                    {unit}
                                                </span>
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}
