"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const DEMO_EMAIL = "test@example.com";
const DEMO_PASSWORD = "test1234";
const DEMO_COOKIE = "antropos_demo_session";
const BRANCH_COOKIE = "antropos_active_branch";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
    if (process.env.VERCEL && !process.env.DEMO_LIGHT_SEED) {
      process.env.DEMO_LIGHT_SEED = "1";
    }

    const { seed } = await import("@/lib/db/seed");
    await seed().catch((error) => {
      console.warn("Demo seed skipped during login:", error);
    });

    const cookieStore = await cookies();
    cookieStore.delete(BRANCH_COOKIE);
    cookieStore.set(DEMO_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    revalidatePath("/admin", "layout");
    redirect("/branches");
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    redirect("/login?error=invalid-credentials");
  }

  revalidatePath("/admin", "layout");
  (await cookies()).delete(BRANCH_COOKIE);
  redirect("/branches");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE);
  cookieStore.delete(BRANCH_COOKIE);

  await auth.api.signOut({
    headers: await headers(),
  });

  revalidatePath("/", "layout");
  redirect("/");
}
