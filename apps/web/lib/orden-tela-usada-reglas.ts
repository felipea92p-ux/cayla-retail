import { cantidadConUnidad, type InsumoPagina } from "./orden-pagina-reglas";

// La tela y los avíos que se USAN en una orden (ADR-0400, actividad 7): anotar lo que se gastó y devolver lo que sobró. Sin React ni Supabase.
//
// LA BASE MANDA: `registrar_consumo_insumo` descuenta del lote más antiguo con saldo (y rechaza si ese lote no alcanza) y `devolver_insumo_de_produccion` devuelve al último lote del que salió
// (20260917141500, 20260920100000). Aquí solo se LEE lo que la página ya trae de cada insumo y se arma lo que la persona escribe; nada decide un número que la base no decida.
//
// CONTRATO
//   PROMETE: que una tela en varios colores es UNA fila (se suman los planes contra un solo estante y lo usado es el mismo número en cada fila, como en `filasDeTela`); que «lo que falta usar»
//            nunca es negativo; que lo que se anota o se devuelve es un número mayor que cero con hasta tres decimales; y que cuando el lote más antiguo no alcanza, la cantidad se parte en
//            los lotes que hagan falta (cada llamada es una consumo válido de la base, nunca una cantidad inventada).
//   ASUME:   el libro de insumos no sabe de colores; `registrar_consumo_insumo` y `devolver_insumo_de_produccion` son las únicas que escriben.
//   NO HACE: no escribe, y no decide qué lote se gasta (eso lo hace la base).

export const RPC_REGISTRAR_CONSUMO = "registrar_consumo_insumo";
export const RPC_DEVOLVER_INSUMO = "devolver_insumo_de_produccion";

export type TelaDeLaOrden = {
  insumoId: string;
  nombre: string;
  tipo: "tela" | "avio";
  unidad: string;
  /** Lo que pide el plan: la suma de sus colores. */
  plan: number;
  /** Lo que ya se descontó del estante para esta orden. */
  usado: number;
  /** Lo que todavía falta usar según el plan. */
  falta: number;
  /** Lo que hay en el estante del Taller. */
  saldo: number;
};

/** Cada tela y avío de la orden, UNA fila por insumo. */
export function telasDeLaOrden(insumos: readonly InsumoPagina[]): TelaDeLaOrden[] {
  const porInsumo = new Map<string, InsumoPagina[]>();
  for (const i of insumos) porInsumo.set(i.insumoId, [...(porInsumo.get(i.insumoId) ?? []), i]);
  return [...porInsumo.values()].map((filas) => {
    const base = filas[0];
    const plan = filas.reduce((s, f) => s + f.cantidadPlan, 0);
    const usado = Math.max(...filas.map((f) => f.usado));
    return { insumoId: base.insumoId, nombre: base.nombre, tipo: base.tipo, unidad: base.unidad, plan, usado, falta: Math.max(redondear(plan - usado), 0), saldo: base.saldo };
  });
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/** Lo que la persona escribió como un número: mayor que cero, con punto o coma, hasta tres decimales. `null` si no se entiende. */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return n > 0 ? n : null;
}

export type ModoDeTela = "usar" | "devolver";

/**
 * Lo que la base rechazaría: nada escrito, más de lo que hay en el estante (al usar) o más de lo que esta orden tiene descontado (al devolver). `null` si lo aceptaría. El valor de fábrica de
 * «usar» es lo que falta usar según el plan; el de «devolver» queda vacío (se devuelve lo que sobró, que solo la persona sabe).
 */
export function problemaDeTelaUsada(t: TelaDeLaOrden, texto: string, modo: ModoDeTela): string | null {
  const n = leerCantidad(texto);
  if (n === null) return modo === "usar" ? "Escribe cuánto usaste (un número mayor que cero, por ejemplo 12,5)." : "Escribe cuánto devuelves (un número mayor que cero, por ejemplo 2,5).";
  if (modo === "usar" && n > t.saldo) return t.saldo > 0 ? `En el estante solo hay ${cantidadConUnidad(t.saldo, t.unidad)}: no puedes anotar ${cantidadConUnidad(n, t.unidad)}.` : `No hay ${t.nombre.toLocaleLowerCase("es")} en el estante del Taller: recíbelo antes de anotar lo que usaste.`;
  if (modo === "devolver" && n > t.usado) return t.usado > 0 ? `Esta orden solo tiene descontados ${cantidadConUnidad(t.usado, t.unidad)}: no puedes devolver ${cantidadConUnidad(n, t.unidad)}.` : "Esta orden no tiene nada descontado de esto: no hay nada que devolver.";
  return null;
}

/** El valor de fábrica de «usé»: lo que falta según el plan, sin pasar de lo que hay en el estante (la base no deja anotar más), como texto de una celda (vacío si no falta nada o no hay estante). */
export function cantidadDeFabrica(t: TelaDeLaOrden): string {
  const n = Math.min(t.falta, t.saldo);
  return n > 0 ? String(redondear(n)) : "";
}

/**
 * Si la base dice «El lote más antiguo con saldo tiene N y pediste M», cuánto es N: es lo que sí se puede anotar de una vez. `null` si el mensaje es otro. La base pide dos llamadas
 * cuando una orden cruza de lote; la pantalla las hace sola.
 */
export function saldoDelLoteMasAntiguo(mensaje: string): number | null {
  const m = /lote más antiguo con saldo tiene ([\d.,]+) y pediste/.exec(mensaje);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ResultadoDeConsumo = { anotado: number; falta: number; error: { message: string } | null };

/**
 * Anota un consumo con la función de la base, partiéndolo entre lotes si el más antiguo no alcanza. `llamar(cantidad)` hace UNA llamada a `registrar_consumo_insumo`. Cada llamada es un consumo
 * válido; si una falla, lo ya anotado queda anotado y se devuelve cuánto falta y por qué. Nunca más de seis llamadas.
 */
export async function anotarConsumoEnLotes(cantidad: number, llamar: (cantidad: number) => PromiseLike<{ error: { message: string } | null }>): Promise<ResultadoDeConsumo> {
  let falta = redondear(cantidad);
  let anotado = 0;
  for (let i = 0; i < 6 && falta > 0; i++) {
    const { error } = await llamar(falta);
    if (!error) return { anotado: redondear(anotado + falta), falta: 0, error: null };
    const delLote = saldoDelLoteMasAntiguo(error.message);
    if (delLote === null || delLote >= falta) return { anotado, falta, error };
    const { error: error2 } = await llamar(delLote);
    if (error2) return { anotado, falta, error: error2 };
    anotado = redondear(anotado + delLote);
    falta = redondear(falta - delLote);
  }
  return { anotado, falta, error: falta > 0 ? { message: "La cantidad cruza demasiados lotes: anótala en partes." } : null };
}

/** El aviso de éxito: «Anotaste 12,5 m de Lino lavado». */
export function textoAnotasteTela(t: Pick<TelaDeLaOrden, "nombre" | "unidad">, cantidad: number, modo: ModoDeTela): string {
  return `${modo === "usar" ? "Anotaste" : "Devolviste"} ${cantidadConUnidad(cantidad, t.unidad)} de ${t.nombre}`;
}
