import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDemoRecipes } from "@/lib/db/demo-recipes";
import { user } from "@/lib/db/schema";

const demoUser = await db.query.user.findFirst({
	where: eq(user.email, "test@example.com"),
});

if (!demoUser) {
	console.log("Demo user not found; recipe seed skipped.");
} else {
	await ensureDemoRecipes(demoUser.id);
	console.log("Demo ingredients and recipes are ready.");
}
