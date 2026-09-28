/**
 * Cómo se lee el stock de un producto en `/productos` (Grilla y Tabla) — pantalla:productos,
 * tareas #1, #2 y #4 (docs/pantallas/productos.md).
 *
 * Tres decisiones de Felipe (2026-09-22) que viven aquí para que la tarjeta de la Grilla y la fila de
 * la Tabla no las repitan cada una a su manera:
 *
 *  1. Una prenda DESCONTINUADA no dispara alertas. Sigue listada y consultable, pero ni «Sin stock» ni
 *     «Stock bajo» le corresponden: no hay nada que reponer de algo que ya no se vende. La base aplica
 *     la misma regla a los contadores del subtítulo, al filtro y a «A quién pedirle» (migración
 *     20260922120000); esta función es la copia para lo que se pinta en cada fila. «Sin stock» y «Stock
 *     bajo» son EXCLUYENTES, igual que en la base: 0 unidades es «sin stock», no las dos cosas.
 *  2. (Reemplazada el 2026-09-28, ADR-0270.) Antes el número era el TOTAL de todas las sedes y el Taller,
 *     rotulado «Stock total». Ahora la tarjeta dice lo de la sede elegida arriba («7 aquí») y aparte el resto
 *     (`lineasDeStock`); las ALERTAS siguen mirando la red, porque de ellas sale qué pedirle al proveedor.
 *     «Stock total N» queda solo para cuando no se pudo leer lo de la sede.
 *  3. «Sin stock» no es rojo: con 23 prendas en 0, más de la mitad de la grilla quedaba en rojo y el
 *     rojo dejaba de avisar (MAX_ROJO_POR_PANTALLA = 2). Se dice con la misma palabra que el subtítulo y
 *     el filtro («sin stock»), en un chip neutro. Una descontinuada en 0 dice «Stock total 0»: es un
 *     hecho, no una alerta, y así ninguna tarjeta dice «Sin stock» sin contar en el número de arriba.
 */

export type AlertaStock = "sin_stock" | "bajo" | null;

type ProductoConStock = { estado: string; stockTotal: number; stockMinimo: number | null };

/** Lo que dice el total, tal como se pinta junto al nombre de la prenda. Solo si no se pudo leer lo de la sede (ver abajo). */
export const ROTULO_STOCK_TOTAL = "Stock total";

/** Para el `title` (al pasar el mouse o dejar el dedo) y para la nota de la cabecera. */
export const EXPLICACION_STOCK_TOTAL =
  "«Aquí» es lo que se puede vender en la sede elegida arriba: sin las apartadas ni las dañadas, igual que en Existencias. " +
  "Las otras sedes, el Taller y lo que viene en camino van aparte. «Sin stock» y «Stock bajo» miran toda la empresa: de ahí " +
  "sale qué pedirle al proveedor.";

/**
 * ¿Esta prenda pide atención por su stock? Solo las activas. `sin_stock` = 0 unidades en toda la red;
 * `bajo` = quedan, pero menos que su mínimo (el mínimo se carga al editar el producto).
 */
export function alertaDeStock(p: ProductoConStock): AlertaStock {
  if (p.estado !== "activo") return null;
  if (p.stockTotal === 0) return "sin_stock";
  if (p.stockMinimo != null && p.stockTotal < p.stockMinimo) return "bajo";
  return null;
}

/** «Stock total 12». En cero también: «Stock total 0» (la alerta «Sin stock» la pinta el chip, no este texto). */
export function textoDeStock(stockTotal: number): string {
  return `${ROTULO_STOCK_TOTAL} ${stockTotal}`;
}

// ============================================================================
// La tarjeta por sede (ADR-0270, decisiones 1 a 5 de Felipe, 2026-09-28): lo de la sede elegida arriba, en grande; las
// otras sedes, el Taller y lo que viene en camino, aparte; apartadas, dañadas y tallas retiradas como avisos. Los números
// salen de `fn_existencias_productos`, la misma cifra que Existencias: esta parte solo los redacta.
// ============================================================================

export type OtraSede = { ubicacionId: string; sede: string; disponible: number };

export type ExistenciasProducto = {
  /** Lo que se puede vender HOY en la sede elegida: sin apartadas, sin dañadas, sin tallas retiradas. */
  aqui: number;
  apartadoAqui: number;
  danadoAqui: number;
  enCaminoAqui: number;
  /** Las otras tiendas activas (no el Taller), sede por sede, de más a menos. */
  enOtrasTiendas: number;
  otras: OtraSede[];
  /** Terminadas en el Taller: aparte, nunca sumadas a lo que se vende (decisión 4). */
  enTaller: number;
  /** Prendas físicas en tallas desactivadas, en toda la red: no se venden; se avisan. */
  enTallasRetiradas: number;
};

/** Un producto sin filas (nunca tuvo stock): todo en cero. */
export const SIN_EXISTENCIAS: ExistenciasProducto = {
  aqui: 0,
  apartadoAqui: 0,
  danadoAqui: 0,
  enCaminoAqui: 0,
  enOtrasTiendas: 0,
  otras: [],
  enTaller: 0,
  enTallasRetiradas: 0,
};

const entero = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/**
 * Lo que devuelve `fn_existencias_productos`, por producto. Tolerante: una fila rara se salta, no tumba la grilla. Si la
 * lectura entera falló, quien llama recibe `null` y la tarjeta vuelve a «Stock total N» (se degrada así, no miente).
 */
export function leerExistenciasProductos(datos: unknown): Map<string, ExistenciasProducto> {
  const mapa = new Map<string, ExistenciasProducto>();
  if (!Array.isArray(datos)) return mapa;
  for (const fila of datos) {
    if (!fila || typeof fila !== "object") continue;
    const f = fila as Record<string, unknown>;
    if (typeof f.producto_id !== "string") continue;
    const otras = (Array.isArray(f.otras) ? f.otras : [])
      .map((o) => (o && typeof o === "object" ? (o as Record<string, unknown>) : null))
      .filter((o): o is Record<string, unknown> => !!o && typeof o.sede === "string")
      .map((o) => ({ ubicacionId: String(o.ubicacion_id ?? ""), sede: String(o.sede), disponible: entero(o.disponible) }))
      .filter((o) => o.disponible > 0);
    mapa.set(f.producto_id, {
      aqui: entero(f.aqui),
      apartadoAqui: entero(f.apartado_aqui),
      danadoAqui: entero(f.danado_aqui),
      enCaminoAqui: entero(f.en_camino_aqui),
      enOtrasTiendas: entero(f.en_otras_tiendas),
      otras,
      enTaller: entero(f.en_taller),
      enTallasRetiradas: entero(f.en_tallas_retiradas),
    });
  }
  return mapa;
}

/** «Tienda Trujillo» → «Trujillo» (el mismo criterio que «Dónde más hay», `stock-por-sede.ts`). */
const corta = (sede: string) => sede.replace(/^tienda\s+/i, "").trim();
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Cuántas otras sedes se nombran una por una antes de agruparlas: en una tarjeta de teléfono no caben más. */
export const MAX_SEDES_NOMBRADAS = 2;

export type LineasStock = {
  /** «7 aquí» — el número grande. */
  principal: string;
  /** «+60 en LIM · 40 en taller · +6 en camino», o null si no hay nada fuera de la sede. */
  detalle: string | null;
  /** «1 apartada», «2 dañadas», «6 en tallas retiradas»: lo que está en la sede pero no se ofrece. */
  avisos: string[];
};

export function lineasDeStock(e: ExistenciasProducto): LineasStock {
  const partes: string[] = [];
  const otras = [...e.otras].sort((a, b) => b.disponible - a.disponible || a.sede.localeCompare(b.sede, "es"));
  if (otras.length > 0) {
    if (otras.length <= MAX_SEDES_NOMBRADAS) {
      for (const o of otras) partes.push(`+${o.disponible} en ${corta(o.sede)}`);
    } else {
      partes.push(`+${e.enOtrasTiendas || otras.reduce((t, o) => t + o.disponible, 0)} en ${otras.length} sedes más`);
    }
  }
  if (e.enTaller > 0) partes.push(`${e.enTaller} en taller`);
  if (e.enCaminoAqui > 0) partes.push(`+${e.enCaminoAqui} en camino`);

  const avisos: string[] = [];
  if (e.apartadoAqui > 0) avisos.push(plural(e.apartadoAqui, "apartada", "apartadas"));
  if (e.danadoAqui > 0) avisos.push(plural(e.danadoAqui, "dañada", "dañadas"));
  if (e.enTallasRetiradas > 0) avisos.push(`${e.enTallasRetiradas} en tallas retiradas`);

  return { principal: `${e.aqui} aquí`, detalle: partes.length > 0 ? partes.join(" · ") : null, avisos };
}

/**
 * «Ver en Existencias» (ADR-0270, decisión 9: el stock se ajusta solo en Inventario): abre la prenda en una talla del color
 * que se está mirando —la primera activa—, como el mismo enlace de Movimientos (`/inventario?variante=`, ADR-0241).
 */
export function hrefEnExistencias(
  variantes: readonly { varianteId: string; activo: boolean; color: string | null }[],
  color: string | null = null
): string {
  const v = variantes.find((x) => x.activo && x.color === color) ?? variantes.find((x) => x.activo) ?? variantes[0];
  return v ? `/inventario?variante=${v.varianteId}` : "/inventario";
}

/** El vacío de siempre. */
export const MENSAJE_SIN_RESULTADOS = "Ningún producto calza con esos filtros.";

/**
 * Qué decir cuando no hay tarjetas. Pedir prendas descontinuadas Y una alerta de stock a la vez no puede
 * devolver nada (una descontinuada no es una alerta): se dice por qué, en vez del «no hay» genérico que
 * dejaría a una persona sin contexto pensando que el catálogo está vacío.
 */
export function mensajeSinResultados(filtros: { estado?: string; stock?: string }): string {
  if (filtros.estado === "descontinuado" && filtros.stock) {
    return "Las prendas descontinuadas no cuentan como sin stock, con stock bajo ni para pedir. Quita el filtro de stock para verlas.";
  }
  return MENSAJE_SIN_RESULTADOS;
}
