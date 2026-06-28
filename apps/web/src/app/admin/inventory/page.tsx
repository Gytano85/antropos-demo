"use client";

import { FlaskConicalIcon, ShieldAlertIcon, TruckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import InventoryAuditPage from "@/app/admin/inventory-audit/page";
import RecipesPage from "@/app/admin/recipes/page";
import RestockingPage from "@/app/admin/restocking/page";

type InventoryTab = "restocking" | "recipes" | "inventoryAudit";

export default function InventoryPage() {
	const t = useTranslations("nav");
	const [tab, setTab] = useState<InventoryTab>("restocking");

	const tabs: { key: InventoryTab; labelKey: "restocking" | "recipes" | "inventoryAudit"; icon: typeof TruckIcon }[] = [
		{ key: "restocking", labelKey: "restocking", icon: TruckIcon },
		{ key: "recipes", labelKey: "recipes", icon: FlaskConicalIcon },
		{ key: "inventoryAudit", labelKey: "inventoryAudit", icon: ShieldAlertIcon },
	];

	return (
		<div className="space-y-6">
			<div className="flex gap-1 overflow-x-auto border-b">
				{tabs.map(({ key, labelKey, icon: Icon }) => (
					<button
						key={key}
						type="button"
						onClick={() => setTab(key)}
						className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
							tab === key
								? "border-primary text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<Icon className="h-4 w-4" />
						{t(labelKey)}
					</button>
				))}
			</div>

			{tab === "restocking" && <RestockingPage />}
			{tab === "recipes" && <RecipesPage />}
			{tab === "inventoryAudit" && <InventoryAuditPage />}
		</div>
	);
}
