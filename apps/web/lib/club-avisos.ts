import "server-only";
import { createClient } from "@/lib/supabase/server";
import { crearClienteAnonimo } from "@/lib/supabase/anonimo";
import { getTiendasConWhatsapp } from "@/lib/clientas";
import { leerAvisos, type AvisoPendiente, type FilaAvisoPendiente } from "@/lib/club-avisos-reglas";
import { leerBeneficios, type BeneficiosClub } from "@/lib/club-beneficios-reglas";

// Las lecturas de Clientas ▸ Avisos del lado del servidor (ADR-0288 act. g, G-8). El navegador escribe con
// `club-avisos-acciones.ts`. Si la base todavía no tiene la tanda 1g, cada lectura devuelve `falla` en vez de tumbar la pantalla
// (principio 9): la pantalla lo dice y sigue.

export type LecturaAvisos = { avisos: AvisoPendiente[]; falla: string | null };

/** Los avisos por mandar desde esta tienda (`fn_club_avisos_pendientes`, módulo «avisos_club»). Quién entra lo decide la base. */
export async function getAvisosPendientes(ubicacionId: string): Promise<LecturaAvisos> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_club_avisos_pendientes", { p_ubicacion_id: ubicacionId });
  if (error) return { avisos: [], falla: `No se pudo leer la lista de avisos: ${error.message}` };
  return { avisos: leerAvisos(data ?? []), falla: null };
}

export type LecturaBeneficios = { valores: BeneficiosClub | null; falla: string | null };

/**
 * Los beneficios vigentes del club para el modal del líder. Salen de `fn_club_pagina` —lo mismo que lee la página pública del cartel,
 * así el modal muestra exactamente lo que ella ve— y esa función pide una tienda: se usa la sede activa si es una, o la primera tienda
 * activa (los beneficios son de toda la empresa, no de una tienda). La función es de `anon`: se lee con el cliente anónimo del
 * servidor, sin la sesión de quien mira.
 */
export async function getBeneficiosClub(ubicacionId: string): Promise<LecturaBeneficios> {
  const { tiendas, falla } = await getTiendasConWhatsapp();
  const tienda = tiendas.find((t) => t.id === ubicacionId) ?? tiendas[0];
  if (!tienda) return { valores: null, falla: falla ?? "No hay ninguna tienda activa de la cual leer los beneficios del club." };
  try {
    const { data, error } = await crearClienteAnonimo().rpc("fn_club_pagina", { p_ubicacion_id: tienda.id });
    if (error) return { valores: null, falla: `No se pudieron leer los beneficios del club: ${error.message}` };
    const valores = leerBeneficios(data);
    return valores ? { valores, falla: null } : { valores: null, falla: "La base todavía no da los beneficios completos del club (falta la tanda 1g)." };
  } catch (e) {
    return { valores: null, falla: `No se pudieron leer los beneficios del club: ${e instanceof Error ? e.message : String(e)}` };
  }
}
