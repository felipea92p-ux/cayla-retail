// Cómo se LEE un movimiento manual del cajón (una entrada o una salida que no es una venta), en la lista del turno, en
// «Ver todo» y en el detalle de un cierre. Sin React ni Supabase: se prueba en `caja-movimiento-reglas.test.ts`.
//
// EL PROBLEMA (Felipe, 2026-10-12). Un gasto pagado del cajón salía en «Movimientos del turno» como «Otro», sin decir qué
// fue y sin abrir nada al tocarlo. No era un dato perdido: `registrar_gasto` (20260924235100) le escribe al egreso una nota
// —«Gasto · Servicios básicos — Baño»— porque el vocabulario de motivos de `registrar_movimiento_caja` es cerrado y no tiene
// «Gasto»; la pantalla leía el motivo y tiraba la nota. Las 26 salidas «Otro» que hay en producción son, todas, gastos.
//
// CONTRATO
//   PROMETE: para cada movimiento manual, el nombre con que se lee («Gasto · Baño», «Retiro de efectivo») y el detalle que lo
//            explica (la categoría del gasto, o la nota que dejó quien lo registró). Siempre devuelve algo: sin nota, el motivo.
//   ASUME:   la marca que escribe `registrar_gasto` en `caja_movimientos.nota`: «Gasto · <categoría> — <descripción>» y, si el
//            gasto trae comprobante, « (<serie>-<número>)» al final (cortado a 200 caracteres por la base).
//   NO HACE: no lee la tabla `gastos` —RLS la cierra a quien no tiene el módulo Gastos, y la nota la ve cualquiera que ve
//            Caja—, así que no sabe si el gasto se anuló después (`anular_gasto` no toca el egreso: la plata igual salió).

/** Lo que `registrar_gasto` antepone en la nota del egreso. Cambiarlo acá sin cambiarlo en la migración rompe el nombre. */
export const MARCA_GASTO = "Gasto · ";
/** Lo que separa la categoría de la descripción dentro de la marca (raya larga con espacios, como la escribe la base). */
const SEPARADOR = " — ";
/** «F001-00001234»: un comprobante de verdad, no un paréntesis cualquiera al final de la descripción. */
const COMPROBANTE = /\s\(([A-Za-z0-9]{1,8}-[A-Za-z0-9]{1,12})\)$/;

export type MovimientoManual = {
  motivo: string;
  nota: string | null;
};

export type GastoEnLaCaja = {
  /** «Servicios básicos». `null` si la nota no la trae (una nota cortada o de antes de la marca). */
  categoria: string | null;
  /** «Baño», «Útiles — pegatina para tallas»: lo que se compró, como lo escribió quien lo registró. */
  descripcion: string;
  /** «F001-00001234», si el gasto se registró con comprobante. */
  comprobante: string | null;
};

/** El gasto que la base escribió en la nota del egreso, o `null` si ese movimiento no es un gasto. */
export function gastoDeLaNota(nota: string | null): GastoEnLaCaja | null {
  const texto = (nota ?? "").trim();
  if (!texto.startsWith(MARCA_GASTO)) return null;
  let resto = texto.slice(MARCA_GASTO.length).trim();
  if (!resto) return null;
  // El comprobante va al final, fuera de la descripción: si no está, la descripción se queda entera.
  const conComprobante = resto.match(COMPROBANTE);
  const comprobante = conComprobante ? conComprobante[1]! : null;
  if (conComprobante) resto = resto.slice(0, conComprobante.index).trim();
  // Se corta en la PRIMERA raya: la descripción puede traer otras («Útiles — pegatina para tallas»), la categoría nunca.
  const corte = resto.indexOf(SEPARADOR);
  if (corte < 0) return { categoria: null, descripcion: resto, comprobante };
  const descripcion = resto.slice(corte + SEPARADOR.length).trim();
  if (!descripcion) return { categoria: null, descripcion: resto.slice(0, corte).trim(), comprobante };
  return { categoria: resto.slice(0, corte).trim(), descripcion, comprobante };
}

export type FilaDeMovimiento = {
  /** Lo que la fila dice en grande: «Gasto · Baño», «Retiro de efectivo», «Sencillo de la caja fuerte». */
  titulo: string;
  /** Entre la hora y quién lo registró: la categoría del gasto, o la nota que dejó quien lo registró. */
  detalle: string | null;
  /** Un gasto registrado: la fila lleva su ícono y su detalle abre la hoja del gasto. */
  esGasto: boolean;
};

/**
 * Cómo se lee la fila de un movimiento manual. Un gasto se nombra por lo que se compró (lo que la persona reconoce) y lleva
 * su categoría al lado; cualquier otro movimiento se nombra por su motivo, con la nota como detalle — que es justamente lo
 * que la base le exige a «Otro» y a «Depósito bancario» (`referenciaObligatoria`, caja-panel-reglas.ts).
 */
export function filaDeMovimiento(m: MovimientoManual): FilaDeMovimiento {
  const gasto = gastoDeLaNota(m.nota);
  if (gasto) return { titulo: `Gasto · ${gasto.descripcion}`, detalle: gasto.categoria, esGasto: true };
  const nota = (m.nota ?? "").trim();
  return { titulo: m.motivo, detalle: nota || null, esGasto: false };
}
