// Qué incluye el «Vendido» de Ventas ▸ Reportes (tarea 77). Lógica pura, sin React ni Supabase; la lectura vive en `lib/reportes-ventas.ts`.
//
// EL PROBLEMA. El mismo mes da tres cifras de «vendido» según la pantalla (Reportes, Rendimiento, Ganancias y pérdidas), y no es un error: cada una
// cuenta algo distinto. Reportes cuenta lo cobrado CON IGV y, en Lima, también las prendas de CLAURE (se cobran en la misma caja, ADR-0532). La
// tarjeta solo decía el período, así que quien comparaba creía que algo estaba mal.
//
// LA REGLA. Solo se rotula: la cifra no cambia. Siempre «con IGV». La línea de CLAURE sale solo si lo de CLAURE del tramo es mayor que cero, que
// pasa solo mirando Lima o todas las tiendas (en Trujillo y Arequipa todo es CAYLA y la línea sería ruido). El enlace al cuadro «De Ventas a
// Finanzas» lo decide la página con `veModulo` (solo quien ve Estados financieros).

import { solesCentimos } from "./flujo-caja-reglas";
import type { Mes } from "./facturacion-reglas";
import type { VendidoEmpresa } from "./vendido-por-empresa-reglas";

/** La clave de CLAURE en `retail.empresas` (ADR-0463). */
const CLAVE_CLAURE = "claure";

/** El pie de la tarjeta «Vendido»: el tramo y que va con IGV. */
export const pieVendido = (tramo: string): string => `${tramo} · con IGV`;

/** El título de la columna «Vendido» de la tabla por tienda y por categoría. */
export const TITULO_COLUMNA_VENDIDO = "Vendido con IGV";

/** Cuánto de lo vendido es de CLAURE, a partir de `fn_vendido_por_empresa`. Sin lectura (`null`) o sin CLAURE, 0: la línea no sale. */
export function claureDelVendido(empresas: readonly VendidoEmpresa[] | null): number {
  if (!empresas) return 0;
  const centimos = empresas.filter((e) => e.clave === CLAVE_CLAURE).reduce((s, e) => s + Math.round(e.total * 100), 0);
  return Math.max(0, centimos) / 100;
}

/** «Lo vendido incluye S/ 500.00 de prendas de CLAURE, cobradas en la misma caja»; `null` si no hay nada de CLAURE (la línea no se dibuja). */
export function lineaClaure(monto: number): string | null {
  return monto >= 0.005 ? `Lo vendido incluye ${solesCentimos(monto)} con IGV de prendas de CLAURE, cobradas en la misma caja.` : null;
}

/** El enlace al cuadro «De Ventas a Finanzas» de Ganancias y pérdidas, con el mismo mes y, si se mira una tienda, esa sede. Se abre plegado
 *  («Ver más») salvo con `cuadre=1`, que lo deja abierto. */
export function hrefCuadreFinanzas(mes: Mes, tiendaId: string | null): string {
  const m = `${mes.anio}-${String(mes.mes).padStart(2, "0")}`;
  return `/finanzas/reportes?mes=${m}${tiendaId ? `&sede=${tiendaId}` : ""}&cuadre=1#de-ventas-a-finanzas`;
}

/** Los límites del tramo (días de Lima, `hasta` exclusivo) como instantes, para `fn_vendido_por_empresa`: Lima no tiene horario de verano. */
export const instanteLima = (dia: string): string => `${dia}T00:00:00-05:00`;
