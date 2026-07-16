import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Sigue el patrón probado en cayla-dynamic/packages/database/src/client.ts:
// factory con propósito específico (no un cliente genérico compartido).
// Fase 1 solo usa la llave "publishable" (segura para el navegador) — todo el
// control de acceso real vive en las políticas RLS de supabase/migrations/0003_rls.sql.
// Si más adelante hace falta un cliente con la service_role key (ej. invitar personas
// desde el panel), se agrega entonces, no antes.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export function createAppSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { storageKey: "cayla-retail-app", persistSession: true } }
  );
}
