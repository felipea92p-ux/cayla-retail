import { filtrarPrendasV2, resolverCodigoV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";
import { motivoNoCobrable } from "./vender-stock-local";

/**
 * El buscador de la caja muestra primero lo que se puede cobrar (spike del Punto de venta, 2026-09-26, hallazgo 7):
 * con «c», la primera fila era un polo sin stock y la colaboradora tenía que leer seis filas para encontrar uno
 * vendible. Orden: lo que hay en el piso de esta sede → lo que no se cobra todavía pero existe aquí (el almacén de
 * esta sede, D-40, o lo que el motivo de la caja agregue después) → lo que no hay en ninguna parte de esta sede.
 * Dentro de cada grupo se respeta el orden en que llegó el catálogo: no se inventa relevancia.
 *
 * Solo ordena la LISTA: el Enter con un código exacto de la pistola se resuelve antes (`resolverCodigoV2`) y no pasa
 * por aquí.
 */
type Buscable = PrendaBuscableV2 & { stockAqui: number; almacenAqui?: number | null };

export type GrupoResultado = "aqui" | "guardada" | "sin_stock";

export function grupoDeResultado(v: { stockAqui: number; almacenAqui?: number | null }): GrupoResultado {
  const motivo = motivoNoCobrable(v);
  if (motivo === "cobrable") return "aqui";
  if (motivo === "agotada") return "sin_stock";
  return "guardada";
}

const ORDEN: Record<GrupoResultado, number> = { aqui: 0, guardada: 1, sin_stock: 2 };

/** Los primeros `max` que coinciden con el texto, con lo vendible arriba. Filtra TODO el catálogo antes de cortar: si
 *  cortara primero, una prenda vendible que el catálogo trae en el puesto 7 nunca aparecería. */
export function buscarVendiblePrimero<T extends Buscable>(texto: string, variantes: T[], max: number): T[] {
  const coinciden = filtrarPrendasV2(texto, variantes, Number.POSITIVE_INFINITY);
  // `sort` es estable desde ES2019: dentro de cada grupo queda el orden del catálogo.
  return [...coinciden].sort((a, b) => ORDEN[grupoDeResultado(a)] - ORDEN[grupoDeResultado(b)]).slice(0, max);
}

/**
 * Qué hace el Enter del campo de escaneo de Vender (la pistola remata cada código con Enter):
 * - `exacta`: el texto es el código de una prenda (`sku` o código de barras) → esa prenda, aunque la lista resalte otra.
 * - `resaltada`: lo tecleado a medias, sin código exacto → la fila resaltada de la lista, con lo vendible arriba.
 * - `no-encontrada`: ni lo uno ni lo otro.
 * `null` = campo vacío: no hay nada que resolver ni que limpiar.
 *
 * Esta función solo ELIGE la prenda. Que entre o no al ticket lo decide `agregar` con el stock del piso
 * (`motivoNoCobrable`): una prenda sin piso no entra y el aviso dice por qué. Y con cualquiera de las tres acciones el
 * campo se vacía (`PuntoDeVenta.alTeclado`): una lectura que fallaba se quedaba escrita y la pistola escribía la
 * siguiente ENCIMA, así que ninguna de las dos volvía a coincidir con una prenda.
 */
export type AccionEnter<T> = { tipo: "exacta"; variante: T } | { tipo: "resaltada"; variante: T } | { tipo: "no-encontrada"; texto: string };

export function accionDelEnter<T extends PrendaBuscableV2>(texto: string, variantes: T[], resultados: T[], activo: number): AccionEnter<T> | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const exacta = resolverCodigoV2(limpio, variantes);
  if (exacta) return { tipo: "exacta", variante: exacta };
  if (resultados.length > 0) return { tipo: "resaltada", variante: resultados[Math.min(Math.max(activo, 0), resultados.length - 1)] };
  return { tipo: "no-encontrada", texto: limpio };
}
