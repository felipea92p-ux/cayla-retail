/* ====================================================================
   La misión del día en Existencias: el anillo «N de M hoy» (maqueta `docs/maquetas/existencias-tactil-2026-10/`, «anilloMision»)

   Al abrir el día, Existencias toma una foto de lo que hay que resolver hoy en el piso: cada talla «Por colgar» que tiene algo en el
   almacén, y cada talla sin nada aquí que otra tienda tiene (se pide). El anillo cuenta cuántas de esas ya se resolvieron —la talla
   ya no está por colgar, o ya hay de ella aquí— y se llena a medida que el equipo avanza. Tocarlo abre «Pendientes».

   La foto se guarda en el navegador de ESE equipo, una por sede y por día (clave `cayla.mision.<sede>.<aaaa-mm-dd>`): no es un dato de
   la tienda que deba compartirse ni auditarse, es el marcador del día de quien mira la pantalla. Sin almacenamiento (ventana privada)
   la foto es la de ahora y el anillo arranca de nuevo al recargar: la pantalla funciona igual. Un pedido hecho no cuenta como resuelto
   hasta que la prenda llega (la base no le dice a Existencias qué se pidió).
   ==================================================================== */

import { hoyDeTalla } from "./existencias-hoy";
import type { FilaPrenda } from "./existencias-prendas";

type FilaMision = Pick<FilaPrenda, "varianteId" | "pisoDisponible" | "almacenDisponible" | "disponible" | "planPiso"> & {
  enRed?: readonly { sede: string; cantidad: number }[];
};

/** ¿Esta talla es trabajo de hoy? Por colgar con algo atrás, o sin nada aquí y una tienda a la que pedirle la tiene. */
export function esObjetivo(f: FilaMision, tiendas: ReadonlySet<string>): boolean {
  if (hoyDeTalla(f) === "por_colgar" && (f.almacenDisponible ?? 0) > 0) return true;
  return f.disponible <= 0 && (f.enRed ?? []).some((r) => r.cantidad > 0 && tiendas.has(r.sede));
}

export function objetivosDeHoy(filas: readonly FilaMision[], tiendas: ReadonlySet<string>): string[] {
  return filas.filter((f) => esObjetivo(f, tiendas)).map((f) => f.varianteId);
}

/** Cuántas de la foto del día ya se resolvieron: la talla ya no está pendiente (o ya no está en la sede). */
export function avanceDeMision(objetivos: readonly string[], filas: readonly FilaMision[], tiendas: ReadonlySet<string>): { hechas: number; total: number } {
  const porId = new Map(filas.map((f) => [f.varianteId, f]));
  const hechas = objetivos.filter((id) => {
    const f = porId.get(id);
    return !f || !esObjetivo(f, tiendas);
  }).length;
  return { hechas, total: objetivos.length };
}

export const claveMision = (ubicacionId: string, fecha: string) => `cayla.mision.${ubicacionId}.${fecha}`;

/** Lee la foto guardada: una lista de ids, o `null` si no hay (o está rota). */
export function leerFotoMision(texto: string | null): string[] | null {
  if (!texto) return null;
  try {
    const v: unknown = JSON.parse(texto);
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
  } catch {
    return null;
  }
}
