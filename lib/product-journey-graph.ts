export type JourneyEdge = {
    id: string;
    sellerId: string;
    buyerId: string | null;
};

export function getJourneyRootBusinessIds(records: JourneyEdge[]): string[] {
    const buyers = new Set(records.flatMap((record) => record.buyerId ? [record.buyerId] : []));
    const roots = [...new Set(records.filter((record) => !buyers.has(record.sellerId)).map((record) => record.sellerId))];
    return roots.length > 0 || records.length === 0 ? roots : [records[0].sellerId];
}

export function isJourneyCycle(path: ReadonlySet<string>, buyerId: string | null): boolean {
    return buyerId !== null && path.has(buyerId);
}

export function getJourneyChildren<T extends JourneyEdge>(records: T[], businessId: string, rendered: Set<string>): T[] {
    const seen = new Set(rendered);
    return records.filter((record) => {
        if (record.sellerId !== businessId || seen.has(record.id)) return false;
        seen.add(record.id);
        return true;
    });
}
