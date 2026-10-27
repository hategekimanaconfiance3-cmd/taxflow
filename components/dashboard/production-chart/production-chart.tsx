"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MonthlyData {
    month: string;
    total: number;
}

interface ProductionChartProps {
    data: MonthlyData[];
}

export function ProductionChart({ data }: ProductionChartProps) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                    Monthly Production
                </CardTitle>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                        No production data yet
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data}>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e5e7eb"
                            />
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 12 }}
                                stroke="#9ca3af"
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                stroke="#9ca3af"
                            />
                            <Tooltip
                                cursor={false}
                                contentStyle={{
                                    backgroundColor: "#fff",
                                    borderColor: "#e5e7eb",
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
                            />
                            <Bar
                                dataKey="total"
                                name="Produced"
                                fill="#3b82f6"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
