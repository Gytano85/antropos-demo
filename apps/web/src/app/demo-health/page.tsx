import { getDemoDiagnostics } from "@/lib/demo-diagnostics";

export const dynamic = "force-dynamic";

export default async function DemoHealthPage() {
	const data = await getDemoDiagnostics();

	return (
		<main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
			<div className="mx-auto max-w-5xl space-y-4">
				<div>
					<h1 className="font-bold text-2xl">Demo health</h1>
					<p className="text-sm text-zinc-400">
						Copia este JSON y pegalo en Codex. No contiene secretos.
					</p>
				</div>
				<pre className="overflow-auto rounded-xl border border-zinc-800 bg-black p-4 text-xs leading-relaxed">
					{JSON.stringify(data, null, 2)}
				</pre>
			</div>
		</main>
	);
}
