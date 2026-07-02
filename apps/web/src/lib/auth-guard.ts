import { cookies, headers } from "next/headers";
import { auth } from "./auth";

const DEMO_USER = {
  id: "i0v8ymZ0dln8QhoUforXYrj4VM6eifos",
  name: "Test User",
  email: "test@example.com",
};

export async function getAuthUser() {
  const cookieStore = await cookies();
  if (cookieStore.get("antropos_demo_session")?.value === "1") {
    return DEMO_USER;
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}
