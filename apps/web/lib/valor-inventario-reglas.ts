import { soles } from "./compras-reglas";

/**
 * «Ver el valor a costo» de Existencias (ADR-0557): arma lo que la pantalla dice a partir de las filas que devuelve
 * `fn_valor_inventario_existencias` (una por sede). Aquí NO se decide quién lo ve —eso es de la base: sin permiso devuelve cero
 * filas— ni se calcula plata desde costos sueltos: solo se suman las sumas que la base ya hizo y se escribe en lenguaje de tienda
 * lo que esa suma incluye y lo que deja fuera.
 */

/** Una fila de la función, ya con números (la base manda bigint/numeric y PostgREST a veces los entrega como texto). */
export type SedeConValor = {
  ubicacionId: string;
  sede: string;
  unidades: number;
  valor: number;
  unidadesSinCosto: number;
  tallasSinCosto: number;
  valorConCostoDeCompra: number;
  unidadesDanadas: number;
  valorDanadas: number;
  unidadesClaure: number;
  valorClaure: number;
};

/** Lo que la pantalla necesita de la sede abierta y, si quien mira es líder, de todas. */
export type VistaValor = {
  sede: SedeConValor;
  /** Todas las sedes juntas y cada una. `null` si quien mira solo ve la suya. */
  todas: { valor: number; unidades: number; tallasSinCosto: number; porSede: { sede: string; valor: number }[] } | null;
};

type FilaCruda = {
  ubicacion_id: string;
  sede: string;
  unidades: number | string;
  valor: number | string;
  unidades_sin_costo: number | string;
  prendas_sin_costo: number | string;
  valor_con_costo_de_compra: number | string;
  unidades_danadas: number | string;
  valor_danadas: number | string;
  unidades_claure: number | string;
  valor_claure: number | string;
};

const n = (x: number | string) => Number(x) || 0;
const aCentimos = (x: number) => Math.round(x * 100);

/** Suma montos sin arrastrar el error de los decimales (0.1 + 0.2): en céntimos enteros. */
export function sumarSoles(montos: readonly number[]): number {
  return montos.reduce((s, m) => s + aCentimos(m), 0) / 100;
}

/** Las filas de la base como números. `null` si no llegó ninguna: eso quiere decir «esta cuenta no ve el dinero» (o la base no respondió). */
export function leerFilasDeValor(filas: readonly FilaCruda[] | null | undefined): SedeConValor[] | null {
  if (!filas || filas.length === 0) return null;
  return filas.map((f) => ({
    ubicacionId: f.ubicacion_id,
    sede: f.sede,
    unidades: n(f.unidades),
    valor: n(f.valor),
    unidadesSinCosto: n(f.unidades_sin_costo),
    tallasSinCosto: n(f.prendas_sin_costo),
    valorConCostoDeCompra: n(f.valor_con_costo_de_compra),
    unidadesDanadas: n(f.unidades_danadas),
    valorDanadas: n(f.valor_danadas),
    unidadesClaure: n(f.unidades_claure),
    valorClaure: n(f.valor_claure),
  }));
}

/**
 * La sede abierta y, si la base entregó más de una sede (el líder), el total de todas. Si la sede abierta no está entre las filas
 * (otra cuenta, o una sede que la base no devolvió) no se dibuja nada: nunca el valor de otra sede con el nombre de esta.
 */
export function armarVistaValor(filas: readonly SedeConValor[] | null, sedeAbiertaId: string): VistaValor | null {
  if (!filas || filas.length === 0) return null;
  const sede = filas.find((f) => f.ubicacionId === sedeAbiertaId);
  if (!sede) return null;
  const todas =
    filas.length > 1
      ? {
          valor: sumarSoles(filas.map((f) => f.valor)),
          unidades: filas.reduce((s, f) => s + f.unidades, 0),
          tallasSinCosto: filas.reduce((s, f) => s + f.tallasSinCosto, 0),
          porSede: filas.filter((f) => f.valor > 0).map((f) => ({ sede: f.sede, valor: f.valor })).sort((a, b) => b.valor - a.valor),
        }
      : null;
  return { sede, todas };
}

const cuenta = (x: number) => x.toLocaleString("es-PE");
const prendas = (x: number) => `${cuenta(x)} ${x === 1 ? "prenda" : "prendas"}`;
const tallas = (x: number) => `${cuenta(x)} ${x === 1 ? "talla" : "tallas"}`;

/** Lo que no cuenta por no tener costo, dicho a la vista (nunca solo al pasar el mouse). `null` si todo tiene costo. */
export function fraseSinCosto(unidadesSinCosto: number, tallasSinCosto: number): string | null {
  if (unidadesSinCosto <= 0 && tallasSinCosto <= 0) return null;
  return `${prendas(unidadesSinCosto)} (${tallas(tallasSinCosto)}) sin costo: no cuentan en este valor.`;
}

/**
 * De dónde sale el costo. Hoy casi todo es el costo que se escribió al dar de alta cada prenda y no el de una factura: un total que
 * parece firme sin serlo es peor que no tenerlo. El porcentaje sale del dato, no de una frase fija, para que deje de decirlo cuando deje
 * de ser cierto. `null` si no hay valor del que hablar.
 */
export function fraseOrigenDelCosto(valor: number, valorConCostoDeCompra: number): string | null {
  if (valor <= 0) return null;
  const parte = Math.min(Math.max(valorConCostoDeCompra, 0), valor);
  if (parte <= 0) return "Ningún costo viene de una compra o de Producción: todo es el costo que se escribió al dar de alta cada prenda.";
  const pct = Math.round((parte / valor) * 100);
  if (pct >= 100) return "Todo el costo viene de una compra o de Producción.";
  const cuanto = pct < 1 ? "menos de 1 %" : `${pct} %`;
  return `${soles(parte)} (${cuanto}) viene de una compra o de Producción; el resto es el costo que se escribió al dar de alta cada prenda.`;
}

/** «Dañadas, aparte: 2 prendas · S/ 52.00». `null` si no hay. */
export function lineaAparte(etiqueta: string, unidades: number, valor: number): string | null {
  if (unidades <= 0) return null;
  return `${etiqueta}: ${prendas(unidades)} · ${soles(valor)}`;
}

/** Por qué este número no es el de la «Mercadería» del Balance de Finanzas. Una sola vez, a un toque, para quien se pregunte. */
export const PORQUE_NO_ES_EL_BALANCE =
  "Es lo que hay en la sede, a su costo. No incluye lo dañado ni lo de CLAURE (van aparte), ni lo que viene en camino entre sedes, ni lo facturado que aún no llega. Tampoco descuenta lo vendido por la web que todavía no se entrega. El Balance de Finanzas sí cuenta lo que va en camino y lo facturado por recibir, y suma las dañadas, así que su «Mercadería» puede ser distinta.";
