import { OrdersSection } from "./section";

/**
 * Next.js solo admite exportaciones conocidas en un `page.tsx`, asi que la
 * seccion vive aparte y se comparte con el modulo que la agrupa en pestañas.
 */
export default function OrdersPage() {
	return <OrdersSection />;
}
