// Lo que un Líder escribe al configurar una campaña (descuento, fechas) y las
// reglas para aceptarlo. Las mismas reglas las cierra la base
// (`etiquetas_descuento_rango`, `etiquetas_vigencia_coherente`, y el RPC
// `actualizar_campana_etiqueta`); esto solo las dice con una frase clara ANTES
// de ir a la base, y sirve igual en el navegador y en la API.

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/**
 * "20", "12.5", "12,5", "20 %" → número. Vacío → `null` (etiqueta informativa,
 * sin descuento). El rango es (0, 100], igual que `codigos_descuento`.
 */
export function parsearDescuento(texto: string): Resultado<number | null> {
  const limpio = texto.replace("%", "").trim().replace(",", ".");
  if (limpio === "") return { ok: true, valor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return { ok: false, error: "Escribe el descuento como un número, por ejemplo 20 o 12.5." };
  const n = Number(limpio);
  if (n <= 0 || n > 100) return { ok: false, error: "El descuento tiene que ser mayor que 0 y como máximo 100 %." };
  return { ok: true, valor: n };
}

/** Fecha `AAAA-MM-DD` real (rechaza el 2026-02-31) o vacío → `null`. */
export function parsearFecha(texto: string): Resultado<string | null> {
  const limpio = texto.trim();
  if (limpio === "") return { ok: true, valor: null };
  const invalida = { ok: false, error: "Esa fecha no es válida." } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return invalida;
  // Un mes 13 da `Invalid Date` (y `toISOString` lanza); un 31 de febrero se
  // "corre" al 3 de marzo — por eso se compara de vuelta con lo escrito.
  const fecha = new Date(`${limpio}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== limpio) return invalida;
  return { ok: true, valor: limpio };
}

export function objecionVigencia(desde: string | null, hasta: string | null): string | null {
  if (desde && hasta && desde > hasta) return "La fecha de inicio no puede ser posterior a la de fin.";
  return null;
}

// ---- Aviso «por debajo del costo» --------------------------------------------------
// La campaña NO se bloquea aunque baje del costo (una liquidación puede ser justo eso;
// decidido con Felipe, 2026-09-18). Pero quien la configura tiene que ENTERARSE: un 60 %
// escrito por error se cobra tal cual en el mostrador. El costo es un dato del Líder, así
// que el aviso vive acá y no en la caja.

export type PrendaConCosto = { id: string; categoriaId: string | null; precio: number; costo: number; nombre: string };

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Las prendas del alcance de una campaña que quedarían con precio menor que su costo.
 *  El alcance es el que aplica la base: las etiquetadas a mano MÁS todas las de las
 *  categorías elegidas. El monto se redondea a centavos igual que `registrar_venta`. */
export function prendasBajoCosto(
  pct: number | null,
  prendas: readonly PrendaConCosto[],
  categoriaIds: ReadonlySet<string>,
  varianteIdsManuales: ReadonlySet<string>,
): PrendaConCosto[] {
  if (pct === null || pct <= 0) return [];
  return prendas.filter((p) => {
    const alcanzada = varianteIdsManuales.has(p.id) || (p.categoriaId !== null && categoriaIds.has(p.categoriaId));
    return alcanzada && p.precio - redondear2((p.precio * pct) / 100) < p.costo;
  });
}
