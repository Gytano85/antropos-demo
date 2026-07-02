export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if ((process.env.VERCEL || process.env.NODE_ENV === "production") && !process.env.DATABASE_URL) {
      return;
    }

    const { seed } = await import("@/lib/db/seed");
    await seed().catch((error) => {
      console.warn("Seed demo omitido en runtime:", error);
    });
  }
}
