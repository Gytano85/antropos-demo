"use client";

import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { isBadDemoImage, productPhotoUrl } from "@/lib/product-photos";

export function getProductImageUrl(
	imageUrl?: string | null,
	category?: string | null,
	name = "Producto",
) {
	if (imageUrl && !isBadDemoImage(imageUrl)) return imageUrl;
	return productPhotoUrl(name, category);
}

export function ProductImage({
	src,
	category,
	alt,
	className = "h-16 w-16",
}: {
	src?: string | null;
	category?: string | null;
	alt: string;
	className?: string;
}) {
	const [failed, setFailed] = useState(false);
	const image = getProductImageUrl(src, category, alt);

	if (failed) {
		return (
			<div
				className={`flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ${className}`}
			>
				<PackageIcon className="h-5 w-5" />
			</div>
		);
	}

	return (
		<img
			src={image}
			alt={alt}
			className={`shrink-0 rounded-lg object-cover ${className}`}
			loading="lazy"
			referrerPolicy="no-referrer"
			onError={() => setFailed(true)}
		/>
	);
}
