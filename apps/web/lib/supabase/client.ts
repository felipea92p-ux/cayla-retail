import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@cayla-retail/database";

export function createClient() {
  return createBrowserClient<Database, "retail">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: "retail" } }
  );
}
