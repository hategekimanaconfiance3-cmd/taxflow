"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface ProductSelectorProps {
    products: { id: string; name: string; unit: string }[];
    selectedId?: string;
}

export function ProductSelector({ products, selectedId }: ProductSelectorProps) {
    const router = useRouter();

    function handleChange(productId: string) {
        router.push(`/admin/supply-chain?product=${productId}`);
    }

    return (
        <Select value={selectedId ?? ""} onValueChange={handleChange}>
            <SelectTrigger className="w-[280px] h-9 text-sm">
                <SelectValue placeholder="Select a product to trace…" />
            </SelectTrigger>
            <SelectContent>
                {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
