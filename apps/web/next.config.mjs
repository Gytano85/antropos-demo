import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	devIndicators: false,
	basePath: process.env.BASE_PATH || "",
	env: {
		NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH || "",
	},
	serverExternalPackages: ["@electric-sql/pglite"],
	outputFileTracingIncludes: {
		"/*": ["./demo-data/pglite/**/*"],
	},
	typescript: {
		ignoreBuildErrors: true,
	},
	async headers() {
		return [
			{
				// El detector de camara corre ONNX. Sin aislamiento de origen cruzado el
				// navegador prohibe SharedArrayBuffer y el WASM cae a un solo hilo:
				// medido, 1434 ms por inferencia contra 178 ms en WebGPU. Estos headers
				// habilitan el WASM multihilo como respaldo real en equipos sin WebGPU.
				source: "/admin/cameras",
				headers: [
					{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
					{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
				],
			},
		];
	},
};

export default withNextIntl(nextConfig);
