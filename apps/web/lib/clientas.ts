import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { aClienta, type Clienta } from "@/lib/clientas-reglas";

// Ficha de clienta, v1 backend (D-76/D-77, 20260922140000_ficha_de_clienta_v1_backend.sql).
// Identificación mínima y no invasiva desde el mostrador: DNI opcional en un solo campo, el
// consentimiento de WhatsApp es un dato APARTE del teléfono (Ley 29733 — nunca se asume por
// dar el número). Esta pantalla (`/clientas`) es solo para probar el backend a mano: la
// captura real en el mostrador (Punto de Venta) la construye otra tanda de agentes después.
//
// Página (server) importa este archivo; el panel cliente SOLO `clientas-reglas.ts` y
// `clientas-acciones.ts` (mismo criterio que separa `ventas-historial.ts` de
// `ventas-historial-reglas.ts`: un Server Component nunca llama código de un archivo
// `"use client"`, y viceversa nunca debería hacer falta).
export type { Clienta };

/** Las últimas `limite` clientas registradas — solo para que la pantalla de verificación
 *  tenga algo que mostrar antes de buscar. No es el listado que usará el mostrador (esa
 *  pantalla es de otra tanda de agentes). */
export async function getClientas(limite = 20): Promise<Clienta[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("clientas")
      .select("id, dni, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_at")
      .order("created_at", { ascending: false })
      .limit(limite),
    "las clientas"
  );
  return filas.map(aClienta);
}
