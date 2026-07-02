export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      return;
    }

    const { seed } = await import("@/lib/db/seed");
    await seed();
  }
}
