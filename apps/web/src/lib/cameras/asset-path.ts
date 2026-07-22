/**
 * Prefijo de rutas estaticas del detector.
 *
 * La app puede desplegarse bajo un subdirectorio (`basePath`), y el resto del
 * codigo ya lo respeta al construir URLs. Los pesos del modelo y los binarios
 * de ONNX se pedian con rutas absolutas y daban 404 en ese despliegue, con el
 * detector reportando "no pudo iniciar" sin mas pistas.
 *
 * `NEXT_PUBLIC_BASE_PATH` lo inyecta el bundler, asi que tambien funciona
 * dentro del worker.
 */
export function cameraAssetPath(path: string): string {
	const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${base}${normalized}`;
}
