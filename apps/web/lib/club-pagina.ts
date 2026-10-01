import "server-only";
import { crearClienteAnonimo } from "@/lib/supabase/anonimo";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { esUuid, lecturaDePagina, type LecturaPagina } from "@/lib/club-registro-reglas";

// La lectura de la página pública del Club CAYLA (ADR-0288 act. g), del lado del servidor. La usan la página de registro
// (`app/club/[tienda]/page.tsx`), las de privacidad y términos, y la acción `registrarme` al releer los textos que cambiaron.

/**
 * Lo que la página de ESTA tienda muestra: `fn_club_pagina`, como `anon` (sin la sesión que pudiera tener el aparato). Un
 * segmento que no es un uuid ni se consulta («no es una tienda»). Si la base no responde, «no disponible» en vez de caerse
 * (principio 9): nunca inventa una tienda ni un texto.
 */
export async function leerPaginaClub(ubicacionId: string): Promise<LecturaPagina> {
  if (!esUuid(ubicacionId)) return { estado: "no_es_tienda" };
  try {
    const { data, error } = await crearClienteAnonimo().rpc("fn_club_pagina", { p_ubicacion_id: ubicacionId });
    if (error) {
      console.error("[club] fn_club_pagina falló", error.code, error.message);
      return { estado: "no_disponible" };
    }
    return lecturaDePagina(data as unknown);
  } catch (e) {
    console.error("[club] fn_club_pagina no respondió", e instanceof Error ? e.message : e);
    return { estado: "no_disponible" };
  }
}

/**
 * La política y los términos no dependen de la tienda (el % y la escala son de toda la empresa), pero `fn_club_pagina` pide
 * una. Se usa la del registro de donde viene (`?t=`); si se abre la dirección suelta, la primera tienda activa, buscada con la
 * llave de servicio (la única lectura que hace: un id; `anon` no ve `ubicaciones`). `volverA`: la tienda de su registro, para
 * el enlace de vuelta (solo si vino de ahí).
 */
export async function leerTextosLegales(t: string | null | undefined): Promise<{ lectura: LecturaPagina; volverA: string | null }> {
  if (t && esUuid(t)) {
    const lectura = await leerPaginaClub(t);
    if (lectura.estado !== "no_es_tienda") return { lectura, volverA: lectura.estado === "lista" ? t : null };
  }
  try {
    const { data, error } = await crearClienteAdmin()
      .from("ubicaciones")
      .select("id")
      .eq("activo", true)
      .eq("tipo", "tienda")
      .order("nombre")
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[club] no se pudo elegir una tienda para los textos legales", error.code, error.message);
      return { lectura: { estado: "no_disponible" }, volverA: null };
    }
    return { lectura: await leerPaginaClub(data.id), volverA: null };
  } catch (e) {
    console.error("[club] textos legales sin respuesta", e instanceof Error ? e.message : e);
    return { lectura: { estado: "no_disponible" }, volverA: null };
  }
}
