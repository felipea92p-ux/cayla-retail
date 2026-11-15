import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getEmpresasAqui } from "@/lib/empresas-de-sede";
import type { Lectura } from "@/lib/cuentas-dinero";
import { leerReportePorEmpresa, nombresDeEmpresas, type ReportePorEmpresa } from "@/lib/reportes-por-empresa-reglas";

// Ventas ▸ Reportes ▸ «CAYLA y CLAURE» (ADR-0667): qué tiendas se pueden mirar y la lectura de una (`fn_reporte_ventas_por_empresa`, 20261115042000).
// Si la base no responde, la pantalla se dibuja igual y lo dice (principio 9): nunca una cifra a medias.

/**
 * Las tiendas donde venden dos empresas y que esta cuenta ve: el líder, todas las de ese tipo; quien no lo es, la suya si es una de ellas. Son pocas (3 tiendas):
 * una lectura de empresas por tienda, que `getEmpresasAqui` ya guarda en la misma petición. Si la base no responde para una tienda, esa no se ofrece.
 */
export async function tiendasConDosEmpresas(persona: { rol: string; ubicacionId: string; ubicacionEtiqueta: string }): Promise<{ id: string; nombre: string; empresas: string }[]> {
  const candidatas =
    persona.rol === "lider"
      ? (await getUbicaciones()).filter((u) => u.tipo === "tienda" && u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))
      : [{ id: persona.ubicacionId, nombre: persona.ubicacionEtiqueta }];
  const empresas = await Promise.all(candidatas.map((t) => getEmpresasAqui(t.id).catch(() => null)));
  return candidatas.flatMap((t, i) => {
    const e = empresas[i];
    return e && e.length > 1 ? [{ ...t, empresas: nombresDeEmpresas(e.map((x) => x.nombre)) }] : [];
  });
}

/** El nombre de la pestaña: las empresas de la primera tienda que las tiene («CAYLA y CLAURE»), o `null` si en ninguna venden dos (no se dibuja). */
export async function pestanaPorEmpresa(persona: { rol: string; ubicacionId: string; ubicacionEtiqueta: string }): Promise<string | null> {
  return (await tiendasConDosEmpresas(persona).catch(() => []))[0]?.empresas ?? null;
}

/** `sinAcceso`: la cuenta no tiene el módulo o no ve esa tienda (`42501`). La puerta de la ruta ya lo frena; esto cubre lo que llegue por otro camino. */
export async function getReportePorEmpresa(
  fechas: { desde: string | null; hasta: string | null },
  ubicacionId: string,
): Promise<Lectura<ReportePorEmpresa | null> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reporte_ventas_por_empresa" as never, { p_desde: fechas.desde, p_hasta: fechas.hasta, p_ubicacion: ubicacionId } as never);
  if (error) {
    const code = (error as { code?: string }).code;
    // 22023 es un período que la base no acepta: su mensaje ya dice qué hacer («Elige un período de seis meses o menos.»).
    const falla = code === "22023" ? error.message : `No se pudieron leer las ventas: ${error.message}`;
    return { datos: null, falla, sinAcceso: code === "42501" };
  }
  const r = leerReportePorEmpresa(data);
  if (!r) return { datos: null, falla: "Las ventas llegaron en una forma que no se entiende.", sinAcceso: false };
  return { datos: r, falla: null, sinAcceso: false };
}
