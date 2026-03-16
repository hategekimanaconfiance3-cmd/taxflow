"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter configuration for faceted (dropdown) filters */
export interface FacetedFilter {
  /** Column accessor key */
  columnId: string;
  /** Human-readable label */
  title: string;
  /** Options the user can pick from */
  options: { label: string; value: string }[];
}

export interface DataTableProps<TData, TValue> {
  /** TanStack column definitions */
  columns: ColumnDef<TData, TValue>[];
  /** Data rows */
  data: TData[];
  /** Column id to use as the global search target (optional) */
  searchColumn?: string;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Faceted dropdown filters (optional) */
  facetedFilters?: FacetedFilter[];
  /** Page sizes to offer — default [10, 20, 30, 50] */
  pageSizes?: number[];
  /** Whether to show column visibility toggle — default true */
  showColumnVisibility?: boolean;
  /** Whether to show pagination — default true */
  showPagination?: boolean;
  /** CSS class applied to the container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Sortable header helper — re-export for column definitions
// ---------------------------------------------------------------------------

export function SortableHeader({
  column,
  children,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground transition-colors -ml-1 px-1 py-0.5 rounded-sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Search…",
  facetedFilters = [],
  pageSizes = [10, 20, 30, 50],
  showColumnVisibility = true,
  showPagination = true,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: pageSizes[0] ?? 10 } },
  });

  return (
    <div className={className}>
      {/* ---- Toolbar ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div className="flex flex-1 items-center gap-2 flex-wrap">
          {/* Search */}
          {searchColumn && (
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="data-table-search"
                placeholder={searchPlaceholder}
                value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
                onChange={(e) =>
                  table.getColumn(searchColumn)?.setFilterValue(e.target.value)
                }
                className="pl-8 h-9"
              />
            </div>
          )}

          {/* Faceted Filters */}
          {facetedFilters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) return null;
            const currentValue = (column.getFilterValue() as string) ?? "";
            return (
              <Select
                key={filter.columnId}
                value={currentValue}
                onValueChange={(value) =>
                  column.setFilterValue(value === "__all__" ? undefined : value)
                }
              >
                <SelectTrigger
                  id={`filter-${filter.columnId}`}
                  className="h-9 w-[140px] text-xs"
                >
                  <SelectValue placeholder={filter.title} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All {filter.title}</SelectItem>
                  {filter.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
        </div>

        {/* Column Visibility */}
        {showColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    className="capitalize text-xs"
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  >
                    {col.id.replace(/([A-Z])/g, " $1").trim()}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ---- Table ---- */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- Pagination ---- */}
      {showPagination && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4">
          <p className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} row(s) total
          </p>

          <div className="flex items-center gap-4">
            {/* Page Size */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger id="page-size-select" className="h-8 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizes.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page Info */}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
