"use client";

import { useRouter } from "next/navigation";
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
            <SelectTrigger className="h-10 w-full text-sm sm:h-9 sm:w-[280px]">
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
