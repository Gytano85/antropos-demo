import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";

export async function getAuthUser() {
  const cookieStore = await cookies();
  if (cookieStore.get("antropos_demo_session")?.value === "1") {
    const demoUser = await db.query.user.findFirst({
      where: eq(user.email, "test@example.com"),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (demoUser) return demoUser;
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}
