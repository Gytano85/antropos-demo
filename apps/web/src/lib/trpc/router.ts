import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { router } from "./init";
import { brandingRouter } from "./routers/branding";
import { citiesRouter } from "./routers/cities";
import { customersRouter } from "./routers/customers";
import { dashboardRouter } from "./routers/dashboard";
import { fiscalRouter } from "./routers/fiscal";
import { fiscalSettingsRouter } from "./routers/fiscal-settings";
import { ordersRouter } from "./routers/orders";
import { paymentMethodsRouter } from "./routers/payment-methods";
import { pricingRouter } from "./routers/pricing";
import { productsRouter } from "./routers/products";
import { recipesRouter } from "./routers/recipes";
import { restockingRouter } from "./routers/restocking";
import { restockRulesRouter } from "./routers/restock-rules";
import { suppliersRouter } from "./routers/suppliers";
import { tablesRouter } from "./routers/tables";
import { transactionsRouter } from "./routers/transactions";

export const appRouter = router({
	products: productsRouter,
	customers: customersRouter,
	orders: ordersRouter,
	transactions: transactionsRouter,
	paymentMethods: paymentMethodsRouter,
	dashboard: dashboardRouter,
	fiscalSettings: fiscalSettingsRouter,
	fiscal: fiscalRouter,
	cities: citiesRouter,
	tables: tablesRouter,
	pricing: pricingRouter,
	restocking: restockingRouter,
	recipes: recipesRouter,
	suppliers: suppliersRouter,
	restockRules: restockRulesRouter,
	branding: brandingRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
