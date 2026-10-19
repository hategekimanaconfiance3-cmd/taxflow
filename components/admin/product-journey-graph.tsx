"use client";

import { useMemo, useState } from "react";
import { GitBranch, Search } from "lucide-react";

export type JourneyEdge = {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerTin: string | null;
  buyerId: string | null;
  buyerName: string | null;
  buyerTin: string | null;
  finalBuyerName: string | null;
  quantity: number;
  status: string;
  createdAt: string;
};

type Props = { edges: JourneyEdge[]; unit: string };

type BusinessNode = { id: string; name: string; tin: string | null; depth: number; isConsumer?: boolean };

export function ProductJourneyGraph({ edges, unit }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => edges.filter((edge) => {
    const text = [edge.id, edge.sellerName, edge.sellerTin, edge.buyerName, edge.buyerTin, edge.finalBuyerName].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query.toLowerCase()) && (status === "all" || edge.status === status);
  }), [edges, query, status]);

  const graph = useMemo(() => {
    const nodes = new Map<string, BusinessNode>();
    const parent = new Map<string, string>();
    for (const edge of filtered) {
      if (!nodes.has(edge.sellerId)) nodes.set(edge.sellerId, { id: edge.sellerId, name: edge.sellerName || "Unknown seller", tin: edge.sellerTin, depth: 0 });
      if (edge.buyerId && !nodes.has(edge.buyerId)) nodes.set(edge.buyerId, { id: edge.buyerId, name: edge.buyerName || "Unknown buyer", tin: edge.buyerTin, depth: 0 });
      if (edge.buyerId && edge.sellerId !== edge.buyerId && !parent.has(edge.buyerId)) parent.set(edge.buyerId, edge.sellerId);
    }
    // Depth is a visual aid based on recorded seller/buyer links only. Cycles are bounded.
    for (const node of nodes.values()) {
      let cursor = node.id;
      let depth = 0;
      const visited = new Set<string>([cursor]);
      while (parent.has(cursor) && depth < 8) {
        const next = parent.get(cursor)!;
        if (visited.has(next)) break;
        visited.add(next);
        cursor = next;
        depth++;
      }
      node.depth = depth;
    }
    const groups = new Map<number, BusinessNode[]>();
    for (const node of nodes.values()) groups.set(node.depth, [...(groups.get(node.depth) ?? []), node]);
    const positions = new Map<string, { x: number; y: number }>();
    for (const [depth, group] of groups) group.forEach((node, index) => positions.set(node.id, { x: 170 + depth * 280, y: 90 + index * 135 }));
    const consumers = filtered.filter((edge) => !edge.buyerId).map((edge, index) => {
      const id = "consumer:" + edge.id;
      const node: BusinessNode = { id, name: edge.finalBuyerName || "Final consumer not named", tin: null, depth: Math.min(8, (nodes.get(edge.sellerId)?.depth ?? 0) + 1), isConsumer: true };
      const p = positions.get(edge.sellerId) ?? { x: 170, y: 90 };
      positions.set(id, { x: p.x + 280, y: p.y + index * 22 });
      return node;
    });
    const allNodes = [...nodes.values(), ...consumers];
    const maxX = Math.max(600, ...Array.from(positions.values()).map((p) => p.x + 220));
    const maxY = Math.max(300, ...Array.from(positions.values()).map((p) => p.y + 90));
    return { nodes: allNodes, positions, width: maxX, height: maxY };
  }, [filtered]);

  const edgesWithConsumer = filtered.map((edge) => ({
    ...edge,
    targetId: edge.buyerId ?? "consumer:" + edge.id,
  }));

  if (edges.length === 0) return <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No business-to-business or final-sale transactions are recorded for this product. The journey cannot be reconstructed from transactions alone.</div>;

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="flex items-center gap-2 font-semibold"><GitBranch className="h-4 w-4" /> Supply-chain network</h3><p className="text-xs text-muted-foreground">Edges represent recorded transactions, not independently confirmed physical movements.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter business, TIN, transaction…" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm sm:w-64" aria-label="Filter journey graph" /></label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Filter transaction status"><option value="all">All statuses</option>{Array.from(new Set(edges.map((edge) => edge.status))).sort().map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-muted/20">
        <svg width={graph.width} height={graph.height} role="img" aria-label="Recorded product supply-chain network">
          {edgesWithConsumer.map((edge) => {
            const source = graph.positions.get(edge.sellerId);
            const target = graph.positions.get(edge.targetId);
            if (!source || !target) return null;
            const middle = (source.x + 210 + target.x) / 2;
            return <g key={edge.id}><path d={`M ${source.x + 210} ${source.y + 36} C ${middle} ${source.y + 36}, ${middle} ${target.y + 36}, ${target.x} ${target.y + 36}`} fill="none" stroke={["completed", "confirmed"].includes(edge.status) ? "#16a34a" : "#d97706"} strokeWidth="2" /><text x={middle} y={(source.y + target.y) / 2 + 28} textAnchor="middle" fontSize="11" fill="currentColor">{Number(edge.quantity).toLocaleString()} {unit}</text></g>;
          })}
          {graph.nodes.map((node) => {
            const p = graph.positions.get(node.id);
            if (!p) return null;
            const nodeEdges = filtered.filter((edge) => edge.sellerId === node.id || edge.buyerId === node.id);
            return <g key={node.id}><rect x={p.x} y={p.y} width="210" height="74" rx="9" fill={node.isConsumer ? "#fffbeb" : "#eff6ff"} stroke={node.isConsumer ? "#f59e0b" : "#93c5fd"} /><text x={p.x + 12} y={p.y + 22} fontSize="12" fontWeight="600" fill="#172554">{node.name.slice(0, 27)}</text><text x={p.x + 12} y={p.y + 41} fontSize="10" fill="#475569">{node.isConsumer ? "FINAL RECORDED SALE" : `TIN: ${node.tin || "Not recorded"}`}</text><text x={p.x + 12} y={p.y + 59} fontSize="10" fill="#475569">{nodeEdges.length} linked transaction(s)</text></g>;
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {edges.length} transactions. Green links are completed/confirmed; amber links need review or are pending. Graph depth is inferred only from recorded seller/buyer references. Cycles, missing records, and batch provenance may prevent a complete journey.</p>
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No transactions match the selected filters.</p>}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Filtered transaction evidence</h4>
        {filtered.map((edge) => <details key={edge.id} className="rounded-md border px-3 py-2"><summary className="cursor-pointer text-sm"><span className="font-mono">{edge.id}</span> · {edge.sellerName} → {edge.buyerName || edge.finalBuyerName || "Unlinked buyer"} · {Number(edge.quantity).toLocaleString()} {unit}</summary><div className="grid gap-1 pt-2 text-xs text-muted-foreground sm:grid-cols-3"><p>Seller TIN: {edge.sellerTin || "Not recorded"}</p><p>Buyer TIN: {edge.buyerTin || "Not recorded"}</p><p>Status: {edge.status}</p><p>Recorded: {new Date(edge.createdAt).toLocaleString()}</p></div></details>)}
      </div>
    </section>
  );
}
