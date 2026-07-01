"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import { Button } from "@finopenpos/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
import {
	DataTable,
	TableActionButton,
	TableActions,
	type Column,
} from "@finopenpos/ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@finopenpos/ui/components/dialog";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@finopenpos/ui/components/select";
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@finopenpos/ui/components/table";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
	AlertTriangleIcon,
	BoxIcon,
	CalendarClockIcon,
	FilePenIcon,
	HistoryIcon,
	MailIcon,
	PhoneIcon,
	PlusCircleIcon,
	SearchIcon,
	SendIcon,
	ShoppingCartIcon,
	TrashIcon,
	TruckIcon,
	Users2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { z } from "zod/v4";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { useCrudMutation } from "@/hooks/use-crud-mutation";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";

type Supplier = RouterOutputs["suppliers"]["list"][number];
type RestockRule = RouterOutputs["restockRules"]["list"][number];
type RestockAlert = RouterOutputs["restockRules"]["alerts"][number];

export default function RestockingPage() {
	const trpc = useTRPC();
	const t = useTranslations("restocking");
	const [days, setDays] = useState<7 | 30 | 90>(30);
	const [leadTimeDays, setLeadTimeDays] = useState(7);
	const [coverageDays, setCoverageDays] = useState(14);
	const [search, setSearch] = useState("");

	const { data, isLoading } = useQuery(
		trpc.restocking.recommendations.queryOptions({
			days,
			leadTimeDays,
			coverageDays,
		}),
	);

	const items = useMemo(() => {
		if (!data) return [];
		const term = search.trim().toLowerCase();
		return term
			? data.items.filter((item) => item.name.toLowerCase().includes(term))
			: data.items;
	}, [data, search]);

	const statusBadge = (status: (typeof items)[number]["status"]) => {
		if (status === "urgent") {
			return <Badge variant="destructive">{t("urgent")}</Badge>;
		}
		if (status === "soon") {
			return (
				<Badge className="border-amber-200 bg-amber-100 text-amber-800">
					{t("soon")}
				</Badge>
			);
		}
		if (status === "healthy") {
			return (
				<Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
					{t("healthy")}
				</Badge>
			);
		}
		return <Badge variant="outline">{t("noDemand")}</Badge>;
	};

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-80 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("subtitle")}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label>{t("historyWindow")}</Label>
						<Select
							value={String(days)}
							onValueChange={(value) => setDays(Number(value) as 7 | 30 | 90)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="7">{t("lastDays", { days: 7 })}</SelectItem>
								<SelectItem value="30">
									{t("lastDays", { days: 30 })}
								</SelectItem>
								<SelectItem value="90">
									{t("lastDays", { days: 90 })}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="lead-time">{t("leadTime")}</Label>
						<Input
							id="lead-time"
							type="number"
							min={1}
							max={60}
							value={leadTimeDays}
							onChange={(event) =>
								setLeadTimeDays(
									Math.min(60, Math.max(1, Number(event.target.value) || 1)),
								)
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="coverage">{t("coverage")}</Label>
						<Input
							id="coverage"
							type="number"
							min={1}
							max={90}
							value={coverageDays}
							onChange={(event) =>
								setCoverageDays(
									Math.min(90, Math.max(1, Number(event.target.value) || 1)),
								)
							}
						/>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<SummaryCard
					icon={BoxIcon}
					label={t("analyzedProducts")}
					value={data.totalProducts}
				/>
				<SummaryCard
					icon={AlertTriangleIcon}
					label={t("urgentProducts")}
					value={data.urgentCount}
					accent="text-red-600"
				/>
				<SummaryCard
					icon={CalendarClockIcon}
					label={t("soonProducts")}
					value={data.soonCount}
					accent="text-amber-600"
				/>
				<SummaryCard
					icon={ShoppingCartIcon}
					label={t("suggestedUnits")}
					value={data.recommendedUnits}
					accent="text-blue-600"
				/>
			</div>

			<Card>
				<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<CardTitle>{t("recommendations")}</CardTitle>
						<CardDescription>
							{t("formulaHint", { leadTimeDays, coverageDays })}
						</CardDescription>
					</div>
					<div className="relative w-full sm:w-72">
						<SearchIcon className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("search")}
							className="pl-9"
						/>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("product")}</TableHead>
									<TableHead>{t("status")}</TableHead>
									<TableHead className="text-right">{t("stock")}</TableHead>
									<TableHead className="text-right">{t("unitsSold")}</TableHead>
									<TableHead className="text-right">
										{t("dailyDemand")}
									</TableHead>
									<TableHead className="text-right">
										{t("daysRemaining")}
									</TableHead>
									<TableHead className="text-right">
										{t("reorderPoint")}
									</TableHead>
									<TableHead className="text-right">{t("buy")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((item) => (
									<TableRow key={item.productId}>
										<TableCell>
											<p className="font-medium">{item.name}</p>
											<p className="text-muted-foreground text-xs">
												{item.category ?? "—"}
											</p>
										</TableCell>
										<TableCell>{statusBadge(item.status)}</TableCell>
										<TableCell className="text-right">
											{item.currentStock}
										</TableCell>
										<TableCell className="text-right">
											{item.unitsSold}
										</TableCell>
										<TableCell className="text-right">
											{item.averageDailyDemand.toFixed(2)}
										</TableCell>
										<TableCell className="text-right">
											{item.daysRemaining === null
												? "—"
												: t("daysValue", { days: item.daysRemaining })}
										</TableCell>
										<TableCell className="text-right">
											{item.reorderPoint}
										</TableCell>
										<TableCell className="text-right font-bold">
											{item.recommendedQuantity > 0
												? item.recommendedQuantity
												: "—"}
										</TableCell>
									</TableRow>
								))}
								{items.length === 0 && (
									<TableRow>
										<TableCell
											colSpan={8}
											className="h-24 text-center text-muted-foreground"
										>
											{t("noResults")}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<SuppliersSection />
			<RestockRulesSection />
			<AlertHistorySection />
		</div>
	);
}

function SummaryCard({
	icon: Icon,
	label,
	value,
	accent = "text-foreground",
}: {
	icon: LucideIcon;
	label: string;
	value: number;
	accent?: string;
}) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className={`font-bold text-3xl ${accent}`}>{value}</p>
				</div>
				<Icon className={`h-8 w-8 ${accent}`} />
			</CardContent>
		</Card>
	);
}

// ── Suppliers ────────────────────────────────────────────────────────────────

function SuppliersSection() {
	const trpc = useTRPC();
	const t = useTranslations("restocking");
	const tc = useTranslations("common");

	const { data: suppliers = [], isLoading } = useQuery(
		trpc.suppliers.list.queryOptions(),
	);
	const invalidateKeys = trpc.suppliers.list.queryOptions().queryKey;

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const isEditing = editingId !== null;

	const createMutation = useCrudMutation({
		mutationOptions: trpc.suppliers.create.mutationOptions(),
		invalidateKeys,
		successMessage: t("supplierSaved"),
		errorMessage: t("supplierSaveError"),
		onSuccess: () => setIsDialogOpen(false),
	});
	const updateMutation = useCrudMutation({
		mutationOptions: trpc.suppliers.update.mutationOptions(),
		invalidateKeys,
		successMessage: t("supplierSaved"),
		errorMessage: t("supplierSaveError"),
		onSuccess: () => setIsDialogOpen(false),
	});
	const deleteMutation = useCrudMutation({
		mutationOptions: trpc.suppliers.delete.mutationOptions(),
		invalidateKeys,
		successMessage: t("supplierDeleted"),
		errorMessage: t("supplierDeleteError"),
	});

	const formSchema = z.object({
		name: z.string().trim().min(1),
		contactName: z.string().trim(),
		email: z.string().trim(),
		phone: z.string().trim(),
		notes: z.string().trim(),
	});

	const form = useForm({
		defaultValues: {
			name: "",
			contactName: "",
			email: "",
			phone: "",
			notes: "",
		},
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			if (isEditing) {
				updateMutation.mutate({ id: editingId, ...value });
			} else {
				createMutation.mutate(value);
			}
		},
	});

	const openCreate = () => {
		setEditingId(null);
		form.reset();
		setIsDialogOpen(true);
	};

	const openEdit = (s: Supplier) => {
		setEditingId(s.id);
		form.reset();
		form.setFieldValue("name", s.name);
		form.setFieldValue("contactName", s.contact_name ?? "");
		form.setFieldValue("email", s.email ?? "");
		form.setFieldValue("phone", s.phone ?? "");
		form.setFieldValue("notes", s.notes ?? "");
		setIsDialogOpen(true);
	};

	const handleDelete = () => {
		if (deleteId !== null) {
			deleteMutation.mutate({ id: deleteId });
			setIsDeleteOpen(false);
			setDeleteId(null);
		}
	};

	const columns: Column<Supplier>[] = [
		{ key: "name", header: tc("name"), className: "font-medium" },
		{
			key: "contact_name",
			header: t("contactName"),
			render: (row) => row.contact_name ?? "—",
			hideOnMobile: true,
		},
		{
			key: "email",
			header: tc("email"),
			render: (row) =>
				row.email ? (
					<span className="flex items-center gap-1">
						<MailIcon className="h-3.5 w-3.5 text-muted-foreground" />
						{row.email}
					</span>
				) : (
					"—"
				),
		},
		{
			key: "phone",
			header: tc("phone"),
			render: (row) =>
				row.phone ? (
					<span className="flex items-center gap-1">
						<PhoneIcon className="h-3.5 w-3.5 text-muted-foreground" />
						{row.phone}
					</span>
				) : (
					"—"
				),
			hideOnMobile: true,
		},
		{
			key: "actions",
			header: tc("actions"),
			render: (row) => (
				<TableActions>
					<TableActionButton
						onClick={() => openEdit(row)}
						icon={<FilePenIcon className="h-4 w-4" />}
						label={tc("edit")}
					/>
					<TableActionButton
						variant="danger"
						onClick={() => {
							setDeleteId(row.id);
							setIsDeleteOpen(true);
						}}
						icon={<TrashIcon className="h-4 w-4" />}
						label={tc("delete")}
					/>
				</TableActions>
			),
		},
	];

	return (
		<Card>
			<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<Users2Icon className="h-5 w-5 text-muted-foreground" />
					<div>
						<CardTitle>{t("suppliersTitle")}</CardTitle>
						<CardDescription>{t("suppliersSubtitle")}</CardDescription>
					</div>
				</div>
				<Button size="sm" onClick={openCreate}>
					<PlusCircleIcon className="mr-2 h-4 w-4" />
					{t("addSupplier")}
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-32 w-full" />
				) : (
					<DataTable
						data={suppliers}
						columns={columns}
						emptyMessage={t("noSuppliers")}
						emptyIcon={<Users2Icon className="h-8 w-8" />}
					/>
				)}
			</CardContent>

			<Dialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					if (!open) setIsDialogOpen(false);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{isEditing ? t("editSupplier") : t("addSupplier")}
						</DialogTitle>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
					>
						<div className="grid gap-4 py-4">
							<form.Field name="name">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="supplier-name">{tc("name")}</Label>
										<Input
											id="supplier-name"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="contactName">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="supplier-contact">
											{t("contactName")}
										</Label>
										<Input
											id="supplier-contact"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="email">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="supplier-email">{tc("email")}</Label>
										<Input
											id="supplier-email"
											type="email"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="phone">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="supplier-phone">{tc("phone")}</Label>
										<Input
											id="supplier-phone"
											placeholder="+5211234567890"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="notes">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="supplier-notes">
											{t("supplierNotes")}
										</Label>
										<Input
											id="supplier-notes"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</form.Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => setIsDialogOpen(false)}
							>
								{tc("cancel")}
							</Button>
							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button
										type="submit"
										disabled={
											isSubmitting ||
											createMutation.isPending ||
											updateMutation.isPending
										}
									>
										{isEditing ? tc("update") : tc("create")}
									</Button>
								)}
							</form.Subscribe>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<DeleteConfirmationDialog
				open={isDeleteOpen}
				onOpenChange={setIsDeleteOpen}
				onConfirm={handleDelete}
			/>
		</Card>
	);
}

// ── Restock rules ─────────────────────────────────────────────────────────────

function RestockRulesSection() {
	const trpc = useTRPC();
	const t = useTranslations("restocking");
	const tc = useTranslations("common");

	const { data: rules = [], isLoading } = useQuery(
		trpc.restockRules.list.queryOptions(),
	);
	const { data: products = [] } = useQuery(trpc.products.list.queryOptions());
	const { data: suppliers = [] } = useQuery(trpc.suppliers.list.queryOptions());
	const invalidateKeys = trpc.restockRules.list.queryOptions().queryKey;
	const alertsInvalidateKeys = trpc.restockRules.alerts.queryOptions().queryKey;

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const [triggeringId, setTriggeringId] = useState<number | null>(null);
	const isEditing = editingId !== null;

	const createMutation = useCrudMutation({
		mutationOptions: trpc.restockRules.create.mutationOptions(),
		invalidateKeys,
		successMessage: t("ruleSaved"),
		errorMessage: t("ruleSaveError"),
		onSuccess: () => setIsDialogOpen(false),
	});
	const updateMutation = useCrudMutation({
		mutationOptions: trpc.restockRules.update.mutationOptions(),
		invalidateKeys,
		successMessage: t("ruleSaved"),
		errorMessage: t("ruleSaveError"),
		onSuccess: () => setIsDialogOpen(false),
	});
	const deleteMutation = useCrudMutation({
		mutationOptions: trpc.restockRules.delete.mutationOptions(),
		invalidateKeys,
		successMessage: t("ruleDeleted"),
		errorMessage: t("ruleDeleteError"),
	});
	const triggerMutation = useCrudMutation({
		mutationOptions: trpc.restockRules.triggerNow.mutationOptions(),
		invalidateKeys: alertsInvalidateKeys,
		successMessage: t("contactTriggered"),
		errorMessage: t("contactError"),
		onSuccess: () => setTriggeringId(null),
	});

	const formSchema = z.object({
		productId: z.number().min(1),
		supplierId: z.number().nullable(),
		thresholdQuantity: z.number().int().min(0),
		reorderQuantity: z.number().int().min(1),
		autoContactEmail: z.boolean(),
		autoContactSms: z.boolean(),
		isActive: z.boolean(),
		cooldownHours: z.number().int().min(1),
	});

	const form = useForm({
		defaultValues: {
			productId: 0,
			supplierId: null as number | null,
			thresholdQuantity: 5,
			reorderQuantity: 20,
			autoContactEmail: true,
			autoContactSms: false,
			isActive: true,
			cooldownHours: 24,
		},
		validators: { onSubmit: formSchema },
		onSubmit: ({ value }) => {
			if (isEditing) {
				updateMutation.mutate({ id: editingId, ...value });
			} else {
				createMutation.mutate(value);
			}
		},
	});

	const openCreate = () => {
		setEditingId(null);
		form.reset();
		setIsDialogOpen(true);
	};

	const openEdit = (rule: RestockRule) => {
		setEditingId(rule.id);
		form.reset();
		form.setFieldValue("productId", rule.product_id);
		form.setFieldValue("supplierId", rule.supplier_id);
		form.setFieldValue("thresholdQuantity", rule.threshold_quantity);
		form.setFieldValue("reorderQuantity", rule.reorder_quantity);
		form.setFieldValue("autoContactEmail", rule.auto_contact_email);
		form.setFieldValue("autoContactSms", rule.auto_contact_sms);
		form.setFieldValue("isActive", rule.is_active);
		form.setFieldValue("cooldownHours", rule.cooldown_hours);
		setIsDialogOpen(true);
	};

	const handleDelete = () => {
		if (deleteId !== null) {
			deleteMutation.mutate({ id: deleteId });
			setIsDeleteOpen(false);
			setDeleteId(null);
		}
	};

	const handleTriggerNow = (rule: RestockRule) => {
		setTriggeringId(rule.id);
		triggerMutation.mutate({ ruleId: rule.id });
	};

	const columns: Column<RestockRule>[] = [
		{
			key: "product",
			header: t("product"),
			render: (row) => row.product?.name ?? "—",
			className: "font-medium",
		},
		{
			key: "supplier",
			header: t("supplier"),
			render: (row) => row.supplier?.name ?? t("noSupplierOption"),
		},
		{
			key: "threshold_quantity",
			header: t("threshold"),
			render: (row) => row.threshold_quantity,
		},
		{
			key: "reorder_quantity",
			header: t("reorderQty"),
			render: (row) => row.reorder_quantity,
			hideOnMobile: true,
		},
		{
			key: "channels",
			header: tc("status"),
			render: (row) => (
				<div className="flex flex-wrap gap-1">
					{row.auto_contact_email && (
						<Badge variant="outline">
							<MailIcon className="mr-1 h-3 w-3" />
							Email
						</Badge>
					)}
					{row.auto_contact_sms && (
						<Badge variant="outline">
							<PhoneIcon className="mr-1 h-3 w-3" />
							SMS
						</Badge>
					)}
					{row.is_active ? (
						<Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
							{tc("active")}
						</Badge>
					) : (
						<Badge variant="outline">{tc("inactive")}</Badge>
					)}
				</div>
			),
		},
		{
			key: "actions",
			header: tc("actions"),
			render: (row) => (
				<TableActions>
					<TableActionButton
						onClick={() => handleTriggerNow(row)}
						icon={
							triggeringId === row.id && triggerMutation.isPending ? (
								<SendIcon className="h-4 w-4 animate-pulse" />
							) : (
								<SendIcon className="h-4 w-4" />
							)
						}
						label={t("contactNow")}
					/>
					<TableActionButton
						onClick={() => openEdit(row)}
						icon={<FilePenIcon className="h-4 w-4" />}
						label={tc("edit")}
					/>
					<TableActionButton
						variant="danger"
						onClick={() => {
							setDeleteId(row.id);
							setIsDeleteOpen(true);
						}}
						icon={<TrashIcon className="h-4 w-4" />}
						label={tc("delete")}
					/>
				</TableActions>
			),
		},
	];

	return (
		<Card>
			<CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<TruckIcon className="h-5 w-5 text-muted-foreground" />
					<div>
						<CardTitle>{t("rulesTitle")}</CardTitle>
						<CardDescription>{t("rulesSubtitle")}</CardDescription>
					</div>
				</div>
				<Button size="sm" onClick={openCreate}>
					<PlusCircleIcon className="mr-2 h-4 w-4" />
					{t("addRule")}
				</Button>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-32 w-full" />
				) : (
					<DataTable
						data={rules}
						columns={columns}
						emptyMessage={t("noRules")}
						emptyIcon={<TruckIcon className="h-8 w-8" />}
					/>
				)}
			</CardContent>

			<Dialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					if (!open) setIsDialogOpen(false);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{isEditing ? t("editRule") : t("addRule")}</DialogTitle>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
					>
						<div className="grid gap-4 py-4">
							<form.Field name="productId">
								{(field) => (
									<div className="space-y-2">
										<Label>{t("product")}</Label>
										<Select
											value={field.state.value ? String(field.state.value) : ""}
											onValueChange={(value) =>
												field.handleChange(Number(value))
											}
											disabled={isEditing}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{products.map((p) => (
													<SelectItem key={p.id} value={String(p.id)}>
														{p.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
							<form.Field name="supplierId">
								{(field) => (
									<div className="space-y-2">
										<Label>{t("supplier")}</Label>
										<Select
											value={
												field.state.value !== null
													? String(field.state.value)
													: "none"
											}
											onValueChange={(value) =>
												field.handleChange(
													value === "none" ? null : Number(value),
												)
											}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">
													{t("noSupplierOption")}
												</SelectItem>
												{suppliers.map((s) => (
													<SelectItem key={s.id} value={String(s.id)}>
														{s.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="thresholdQuantity">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="threshold">{t("threshold")}</Label>
											<Input
												id="threshold"
												type="number"
												min={0}
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value) || 0)
												}
											/>
										</div>
									)}
								</form.Field>
								<form.Field name="reorderQuantity">
									{(field) => (
										<div className="space-y-2">
											<Label htmlFor="reorder-qty">{t("reorderQty")}</Label>
											<Input
												id="reorder-qty"
												type="number"
												min={1}
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value) || 1)
												}
											/>
										</div>
									)}
								</form.Field>
							</div>
							<form.Field name="cooldownHours">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="cooldown">{t("cooldownHours")}</Label>
										<Input
											id="cooldown"
											type="number"
											min={1}
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(Number(e.target.value) || 1)
											}
										/>
									</div>
								)}
							</form.Field>
							<div className="flex flex-col gap-2">
								<form.Field name="autoContactEmail">
									{(field) => (
										<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
											<input
												type="checkbox"
												checked={field.state.value}
												onChange={(e) => field.handleChange(e.target.checked)}
												className="h-4 w-4 rounded border-gray-300"
											/>
											{t("autoEmail")}
										</label>
									)}
								</form.Field>
								<form.Field name="autoContactSms">
									{(field) => (
										<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
											<input
												type="checkbox"
												checked={field.state.value}
												onChange={(e) => field.handleChange(e.target.checked)}
												className="h-4 w-4 rounded border-gray-300"
											/>
											{t("autoSms")}
										</label>
									)}
								</form.Field>
								<form.Field name="isActive">
									{(field) => (
										<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
											<input
												type="checkbox"
												checked={field.state.value}
												onChange={(e) => field.handleChange(e.target.checked)}
												className="h-4 w-4 rounded border-gray-300"
											/>
											{t("ruleActive")}
										</label>
									)}
								</form.Field>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={() => setIsDialogOpen(false)}
							>
								{tc("cancel")}
							</Button>
							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button
										type="submit"
										disabled={
											isSubmitting ||
											createMutation.isPending ||
											updateMutation.isPending
										}
									>
										{isEditing ? tc("update") : tc("create")}
									</Button>
								)}
							</form.Subscribe>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<DeleteConfirmationDialog
				open={isDeleteOpen}
				onOpenChange={setIsDeleteOpen}
				onConfirm={handleDelete}
			/>
		</Card>
	);
}

// ── Alert history ─────────────────────────────────────────────────────────────

function AlertHistorySection() {
	const trpc = useTRPC();
	const t = useTranslations("restocking");

	const { data: alerts = [], isLoading } = useQuery(
		trpc.restockRules.alerts.queryOptions(),
	);

	const statusBadge = (status: string | null) => {
		if (status === "sent") {
			return (
				<Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
					{t("statusSent")}
				</Badge>
			);
		}
		if (status === "failed") {
			return <Badge variant="destructive">{t("statusFailed")}</Badge>;
		}
		if (status === "skipped") {
			return <Badge variant="outline">{t("statusSkipped")}</Badge>;
		}
		return <span className="text-muted-foreground">—</span>;
	};

	const columns: Column<RestockAlert>[] = [
		{
			key: "created_at",
			header: t("contactedAt"),
			render: (row) =>
				row.created_at ? new Date(row.created_at).toLocaleString() : "—",
		},
		{
			key: "product",
			header: t("product"),
			render: (row) => row.product?.name ?? "—",
			className: "font-medium",
		},
		{
			key: "supplier",
			header: t("supplier"),
			render: (row) => row.supplier?.name ?? t("noSupplierOption"),
		},
		{
			key: "stock_at_trigger",
			header: t("stockAtTrigger"),
			render: (row) => row.stock_at_trigger,
			hideOnMobile: true,
		},
		{
			key: "requested_quantity",
			header: t("requestedQty"),
			render: (row) => row.requested_quantity,
			hideOnMobile: true,
		},
		{
			key: "email_status",
			header: t("emailStatus"),
			render: (row) => statusBadge(row.email_status),
		},
		{
			key: "sms_status",
			header: t("smsStatus"),
			render: (row) => statusBadge(row.sms_status),
		},
		{
			key: "error_message",
			header: t("errorMessage"),
			render: (row) =>
				row.error_message ? (
					<span className="text-red-600 text-xs">{row.error_message}</span>
				) : (
					"—"
				),
			hideOnMobile: true,
		},
	];

	return (
		<Card>
			<CardHeader className="flex-row items-center gap-2">
				<HistoryIcon className="h-5 w-5 text-muted-foreground" />
				<div>
					<CardTitle>{t("historyTitle")}</CardTitle>
					<CardDescription>{t("historySubtitle")}</CardDescription>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-32 w-full" />
				) : (
					<DataTable
						data={alerts}
						columns={columns}
						emptyMessage={t("noHistory")}
						emptyIcon={<HistoryIcon className="h-8 w-8" />}
						defaultSort={[{ id: "created_at", desc: true }]}
					/>
				)}
			</CardContent>
		</Card>
	);
}
