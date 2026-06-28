"use client";

import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@finopenpos/ui/components/badge";
import { formatCurrency } from "@/lib/utils";

export interface ProductPickerItem {
  id: number;
  name: string;
  price: number;
  in_stock: number;
  image_url?: string | null;
}

interface ProductPickerGridProps {
  products: ProductPickerItem[];
  onSelect: (productId: number) => void;
  locale: string;
  emptyMessage: string;
  outOfStockLabel: string;
  selectedIds?: number[];
  className?: string;
}

export function ProductPickerGrid({
  products,
  onSelect,
  locale,
  emptyMessage,
  outOfStockLabel,
  selectedIds = [],
  className,
}: ProductPickerGridProps) {
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  if (products.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${className ?? ""}`}
    >
      {products.map((product) => {
        const outOfStock = product.in_stock <= 0;
        const lowStock = !outOfStock && product.in_stock <= 5;
        const isSelected = selectedIds.includes(product.id);
        const showImage = Boolean(product.image_url) && !brokenImages[product.id];

        return (
          <button
            key={product.id}
            type="button"
            disabled={outOfStock}
            onClick={() => onSelect(product.id)}
            className={`group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors ${
              outOfStock
                ? "cursor-not-allowed opacity-50"
                : isSelected
                  ? "border-primary ring-2 ring-primary"
                  : "hover:border-primary hover:bg-accent/40"
            }`}
          >
            <div className="relative aspect-square w-full bg-muted">
              {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url ?? ""}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  onError={() =>
                    setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                  }
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <PackageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <Badge
                variant={outOfStock || lowStock ? "destructive" : "secondary"}
                className="absolute right-1 top-1 px-1.5 py-0 text-[10px] leading-tight"
              >
                {outOfStock ? outOfStockLabel : product.in_stock}
              </Badge>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2">
              <span className="line-clamp-2 text-xs font-medium leading-tight">
                {product.name}
              </span>
              <span className="text-primary text-sm font-semibold">
                {formatCurrency(product.price, locale)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
