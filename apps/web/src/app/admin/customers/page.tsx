import { CustomersSection } from "./section";

/**
 * Next.js solo admite exportaciones conocidas en un `page.tsx`, asi que la
 * seccion vive aparte y se comparte con el modulo que la agrupa en pestañas.
 */
export default function CustomersPage() {
	return <CustomersSection />;
}
