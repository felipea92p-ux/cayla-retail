import type { FilaOfertaDeMonto, OfertaDeGrupoDeVariante } from "./ofertas-de-grupo";
import { firmaDeOfertas } from "./precios-en-vivo-reglas";

/**
 * Apartar al día con las ofertas y campañas de hoy (ADR-0655, casuística 2026-11-16). Apartar las recibía UNA vez del servidor: con la
 * pantalla abierta, activar, cambiar o terminar un 3x2, un monto o una campaña hacía que `separar_prendas` rechazara el apartado
 * (`separacion_grupo_no_coincide`) hasta recargar. Ahora relee cada 10 s (como la caja) y, si esto cambió, rehace la pantalla.
 *
 * La firma mira solo las prendas de la pantalla: la lectura trae las de todo el catálogo y, comparada entera, cambiaría siempre.
 */
export type CampanaDePrenda = { etiquetaId: string; pct: number } | null | undefined;

export function firmaDeApartar(
  prendas: readonly { varianteId: string; campana?: CampanaDePrenda; ofertaGrupo?: OfertaDeGrupoDeVariante | null }[],
  montos: readonly FilaOfertaDeMonto[],
): string {
  const grupo: Record<string, OfertaDeGrupoDeVariante> = {};
  const campanas: string[] = [];
  for (const p of prendas) {
    if (p.ofertaGrupo) grupo[p.varianteId] = p.ofertaGrupo;
    if (p.campana) campanas.push(`${p.varianteId}:${p.campana.etiquetaId}:${p.campana.pct}`);
  }
  return JSON.stringify([firmaDeOfertas(grupo, montos), campanas.sort()]);
}

/** La misma firma con lo releído de la base, solo para las prendas de la pantalla. */
export function firmaReleida(
  varianteIds: readonly string[],
  campanas: ReadonlyMap<string, { etiquetaId: string; pct: number }>,
  grupo: Readonly<Record<string, OfertaDeGrupoDeVariante>>,
  montos: readonly FilaOfertaDeMonto[],
): string {
  return firmaDeApartar(
    varianteIds.map((varianteId) => ({ varianteId, campana: campanas.get(varianteId) ?? null, ofertaGrupo: grupo[varianteId] ?? null })),
    montos,
  );
}
