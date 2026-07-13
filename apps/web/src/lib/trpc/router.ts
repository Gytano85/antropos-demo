import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { router } from "./init";
import { alcoholControlRouter } from "./routers/alcohol-control";
import { appSettingsRouter } from "./routers/app-settings";
import { attendanceRouter } from "./routers/attendance";
import { camerasRouter } from "./routers/cameras";
import { citiesRouter } from "./routers/cities";
import { customersRouter } from "./routers/customers";
import { dashboardRouter } from "./routers/dashboard";
import { fiscalRouter } from "./routers/fiscal";
import { fiscalSettingsRouter } from "./routers/fiscal-settings";
import { menuEngineRouter } from "./routers/menu-engine";
import { ordersRouter } from "./routers/orders";
import { paymentMethodsRouter } from "./routers/payment-methods";
import { pricingRouter } from "./routers/pricing";
import { productsRouter } from "./routers/products";
import { recipesRouter } from "./routers/recipes";
import { restockingRouter } from "./routers/restocking";
import { tablesRouter } from "./routers/tables";
import { transactionsRouter } from "./routers/transactions";
import { visionOpsRouter } from "./routers/vision-ops";

export const appRouter = router({
	products: productsRouter,
	alcoholControl: alcoholControlRouter,
	appSettings: appSettingsRouter,
	attendance: attendanceRouter,
	cameras: camerasRouter,
	customers: customersRouter,
	orders: ordersRouter,
	transactions: transactionsRouter,
	paymentMethods: paymentMethodsRouter,
	dashboard: dashboardRouter,
	fiscalSettings: fiscalSettingsRouter,
	fiscal: fiscalRouter,
	menuEngine: menuEngineRouter,
	cities: citiesRouter,
	tables: tablesRouter,
	pricing: pricingRouter,
	restocking: restockingRouter,
	recipes: recipesRouter,
	visionOps: visionOpsRouter,
});

export type AppRouter = typeof appRouter;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
