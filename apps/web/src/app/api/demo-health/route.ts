import { NextResponse } from "next/server";
import { getDemoDiagnostics } from "@/lib/demo-diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json(await getDemoDiagnostics());
}
