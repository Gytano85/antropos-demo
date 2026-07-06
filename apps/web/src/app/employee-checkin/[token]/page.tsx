"use client";

import { Button } from "@finopenpos/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@finopenpos/ui/components/card";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@finopenpos/ui/components/select";
import { CheckCircle2Icon, Loader2Icon, MapPinIcon, XCircleIcon } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TokenInfo = {
	ok: boolean;
	message?: string;
	purpose: "check_in" | "check_out";
	expiresAt: string;
	employees: { id: number; name: string; role: string }[];
	settings: {
		requireLocation: boolean;
		requirePin: boolean;
		allowedRadiusMeters: number;
		locationName: string;
	} | null;
};

export default function EmployeeCheckinPage() {
	const params = useParams<{ token: string }>();
	const search = useSearchParams();
	const token = params.token;
	const purpose = (search.get("purpose") === "check_out" ? "check_out" : "check_in") as
		| "check_in"
		| "check_out";
	const [info, setInfo] = useState<TokenInfo | null>(null);
	const [employeeId, setEmployeeId] = useState("");
	const [pin, setPin] = useState("");
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

	useEffect(() => {
		fetch(`/api/attendance/token/${token}`)
			.then((r) => r.json())
			.then((data) => setInfo(data))
			.catch(() => setInfo({ ok: false, message: "No se pudo leer el QR." } as TokenInfo))
			.finally(() => setLoading(false));
	}, [token]);

	const selectedEmployee = useMemo(
		() => info?.employees.find((employee) => String(employee.id) === employeeId),
		[employeeId, info?.employees],
	);

	const getLocation = () =>
		new Promise<{ latitude: number | null; longitude: number | null }>((resolve) => {
			if (!info?.settings?.requireLocation || !navigator.geolocation) {
				resolve({ latitude: null, longitude: null });
				return;
			}
			navigator.geolocation.getCurrentPosition(
				(pos) =>
					resolve({
						latitude: pos.coords.latitude,
						longitude: pos.coords.longitude,
					}),
				() => resolve({ latitude: null, longitude: null }),
				{ enableHighAccuracy: true, timeout: 10000 },
			);
		});

	const submit = async () => {
		setResult(null);
		if (!employeeId) {
			setResult({ ok: false, message: "Selecciona tu nombre." });
			return;
		}
		setSubmitting(true);
		const location = await getLocation();
		const response = await fetch("/api/attendance/check", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token,
				purpose,
				employeeId: Number(employeeId),
				pin,
				...location,
				deviceFingerprint: navigator.userAgent,
			}),
		});
		const data = await response.json();
		setSubmitting(false);
		setResult({
			ok: response.ok && data.ok,
			message:
				response.ok && data.ok
					? `${purpose === "check_in" ? "Entrada" : "Salida"} registrada: ${data.status}`
					: data.message ?? "No se pudo registrar.",
		});
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
			<Card className="w-full max-w-md border-slate-800 bg-white text-slate-950">
				<CardHeader>
					<CardTitle>
						{purpose === "check_in" ? "Check-in de empleado" : "Check-out de empleado"}
					</CardTitle>
					<p className="text-muted-foreground text-sm">
						{info?.settings?.locationName ?? "Antro POS"} · QR temporal
					</p>
				</CardHeader>
				<CardContent className="space-y-4">
					{loading ? (
						<div className="flex items-center gap-2 text-sm">
							<Loader2Icon className="h-4 w-4 animate-spin" /> Validando QR...
						</div>
					) : !info?.ok ? (
						<div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
							<XCircleIcon className="h-5 w-5" />
							{info?.message ?? "QR vencido o invalido."}
						</div>
					) : (
						<>
							<div className="space-y-2">
								<Label>Empleado</Label>
								<Select value={employeeId} onValueChange={setEmployeeId}>
									<SelectTrigger>
										<SelectValue placeholder="Selecciona tu nombre" />
									</SelectTrigger>
									<SelectContent>
										{info.employees.map((employee) => (
											<SelectItem key={employee.id} value={String(employee.id)}>
												{employee.name} · {employee.role}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label>PIN</Label>
								<Input
									value={pin}
									onChange={(event) => setPin(event.target.value)}
									type="password"
									inputMode="numeric"
									placeholder="PIN de empleado"
								/>
								<p className="text-muted-foreground text-xs">
									Demo: todos los empleados usan PIN 1234.
								</p>
							</div>
							{info.settings?.requireLocation && (
								<div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm">
									<MapPinIcon className="h-4 w-4" />
									Se validara que estes dentro de {info.settings.allowedRadiusMeters} m.
								</div>
							)}
							{selectedEmployee && (
								<p className="text-muted-foreground text-sm">
									Registrando a {selectedEmployee.name} como {selectedEmployee.role}.
								</p>
							)}
							<Button className="w-full" onClick={submit} disabled={submitting}>
								{submitting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
								{purpose === "check_in" ? "Marcar entrada" : "Marcar salida"}
							</Button>
							{result && (
								<div
									className={`flex items-center gap-2 rounded-lg border p-3 ${
										result.ok
											? "border-emerald-200 bg-emerald-50 text-emerald-700"
											: "border-red-200 bg-red-50 text-red-700"
									}`}
								>
									{result.ok ? <CheckCircle2Icon className="h-5 w-5" /> : <XCircleIcon className="h-5 w-5" />}
									{result.message}
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
