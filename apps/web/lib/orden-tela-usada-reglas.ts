import { cantidadConUnidad, type InsumoPagina } from "./orden-pagina-reglas";

// La tela y los avíos que se USAN en una orden (ADR-0400, actividad 7): anotar lo que se gastó y devolver lo que sobró. Sin React ni Supabase.
//
// LA BASE MANDA: `anotar_insumos_de_la_orden` descuenta lo usado de los lotes del más antiguo al más nuevo, todo o nada (ADR-0570, actividad 4, 20261029190000), y
// `devolver_insumo_de_produccion` devuelve al último lote del que salió (20260920100000). Aquí solo se LEE lo que la página ya trae de cada insumo y se arma lo que la persona escribe; nada
// decide un número que la base no decida.
//
// «¿CUÁNTO QUEDÓ?» (Felipe, 2026-10-29): en el Taller se mide lo que quedó en el rollo, no lo que se usó. Una tela se anota con lo que quedó en el estante (lo usado es lo que había menos
// eso) y un avío con cuántos se usaron (se cuentan).
//
// CONTRATO
//   PROMETE: que una tela en varios colores es UNA fila (se suman los planes contra un solo estante y lo usado es el mismo número en cada fila, como en `filasDeTela`); que «lo que falta usar»
//            nunca es negativo; que lo que se usa o se devuelve es un número mayor que cero con hasta tres decimales (lo que quedó puede ser cero: se acabó el rollo); y que lo que
//            quedó nunca pasa de lo que había.
//   ASUME:   el libro de insumos no sabe de colores; `anotar_insumos_de_la_orden` y `devolver_insumo_de_produccion` son las que escriben.
//   NO HACE: no escribe, y no decide qué lote se gasta (eso lo hace la base).

export const RPC_DEVOLVER_INSUMO = "devolver_insumo_de_produccion";
/** ADR-0570, actividad 4: lo usado de toda la orden en UNA llamada (todo o nada); la base descuenta de los lotes del más antiguo al más nuevo. */
export const RPC_ANOTAR_INSUMOS = "anotar_insumos_de_la_orden";
export const RPC_ENCONTRE_TELA = "encontre_tela";

export type TelaDeLaOrden = {
  insumoId: string;
  nombre: string;
  tipo: "tela" | "avio";
  /** Una tela que es complemento de la prenda (forro, otra tela) en TODOS sus colores (ADR-0563): no cuenta como «la tela» de la orden. Un avío nunca. */
  complemento: boolean;
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
    return { insumoId: base.insumoId, nombre: base.nombre, tipo: base.tipo, complemento: filas.every((f) => f.esComplemento), unidad: base.unidad, plan, usado, falta: Math.max(redondear(plan - usado), 0), saldo: base.saldo };
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

/** El aviso de éxito: «Anotaste 12,5 m de Lino lavado». */
export function textoAnotasteTela(t: Pick<TelaDeLaOrden, "nombre" | "unidad">, cantidad: number, modo: ModoDeTela): string {
  return `${modo === "usar" ? "Anotaste" : "Devolviste"} ${cantidadConUnidad(cantidad, t.unidad)} de ${t.nombre}`;
}

// ---------- «¿Cuánto quedó?» y «Encontré tela» (ADR-0570, actividad 4) ----------

/** Cómo se anota: una tela con lo que quedó en el estante; un avío con cuántos se usaron. */
export type ComoSeAnota = "quedo" | "usado";

export const comoSeAnota = (t: Pick<TelaDeLaOrden, "tipo">): ComoSeAnota => (t.tipo === "tela" ? "quedo" : "usado");

/** Lo que queda por anotar de la orden: lo que todavía tiene plan por usar y la tela que no tiene nada anotado. */
export function pendientesDeAnotar(insumos: readonly InsumoPagina[]): TelaDeLaOrden[] {
  return telasDeLaOrden(insumos).filter((t) => t.falta > 0 || (t.tipo === "tela" && t.usado === 0));
}

/** El valor de fábrica: para una tela, lo que quedaría en el estante si se usó lo que pide el plan; para un avío, lo que falta usar. Vacío si no hay nada en el estante. */
export function valorDeFabrica(t: TelaDeLaOrden): string {
  if (t.saldo <= 0) return "";
  return comoSeAnota(t) === "quedo" ? String(redondear(Math.max(t.saldo - t.falta, 0))) : cantidadDeFabrica(t);
}

/** Lo que la persona escribió como lo que quedó: cero o más, con punto o coma y hasta tres decimales. `null` si no se entiende. */
export function leerQuedo(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  return /^\d+(\.\d{1,3})?$/.test(limpio) ? Number(limpio) : null;
}

/** Lo usado según lo escrito en una fila, y lo que la base rechazaría. Una fila vacía no se anota (`usado` nulo, sin problema). */
export function usoDeLaFila(t: TelaDeLaOrden, texto: string): { usado: number | null; problema: string | null } {
  if (texto.trim() === "") return { usado: null, problema: null };
  if (comoSeAnota(t) === "quedo") {
    const n = leerQuedo(texto);
    if (n === null) return { usado: null, problema: `Escribe cuánto quedó de ${t.nombre} (un número, por ejemplo 12,5; cero si se acabó).` };
    if (n > t.saldo) return { usado: null, problema: `En el estante había ${cantidadConUnidad(t.saldo, t.unidad)} de ${t.nombre}: no pudo quedar ${cantidadConUnidad(n, t.unidad)}. Si apareció tela, anótala con «Encontré tela».` };
    return { usado: redondear(t.saldo - n), problema: null };
  }
  const problema = problemaDeTelaUsada(t, texto, "usar");
  return problema ? { usado: null, problema } : { usado: leerCantidad(texto), problema: null };
}

export type LineaDeUso = { insumo_id: string; quedo: number } | { insumo_id: string; usado: number };

/** Lo que viaja a `anotar_insumos_de_la_orden`: una línea por fila escrita, con «quedo» o «usado» según el insumo. */
export function lineasDeUso(telas: readonly TelaDeLaOrden[], escrito: Readonly<Record<string, string>>): LineaDeUso[] {
  return telas.flatMap((t): LineaDeUso[] => {
    const texto = escrito[t.insumoId] ?? "";
    const { usado, problema } = usoDeLaFila(t, texto);
    if (usado === null || problema) return [];
    return comoSeAnota(t) === "quedo" ? [{ insumo_id: t.insumoId, quedo: leerQuedo(texto) as number }] : [{ insumo_id: t.insumoId, usado }];
  });
}

/** Lo que impide anotar lo escrito: el primer problema de una fila, o que con eso no se use nada (la base repite: `uso_nada`). `null` si se puede. */
export function problemaDeLoUsado(telas: readonly TelaDeLaOrden[], escrito: Readonly<Record<string, string>>): string | null {
  for (const t of telas) {
    const { problema } = usoDeLaFila(t, escrito[t.insumoId] ?? "");
    if (problema) return problema;
  }
  const usado = telas.reduce((s, t) => s + (usoDeLaFila(t, escrito[t.insumoId] ?? "").usado ?? 0), 0);
  return usado > 0 ? null : "Con eso no se usó nada: escribe lo que quedó (o lo que usaste) de al menos una.";
}

/** «Usaste 33 m de Gabardina beige y 12 botones»: lo que se va a anotar, en palabras. */
export function textoDeLoUsado(telas: readonly TelaDeLaOrden[], escrito: Readonly<Record<string, string>>): string | null {
  const partes = telas.flatMap((t) => {
    const usado = usoDeLaFila(t, escrito[t.insumoId] ?? "").usado;
    return usado && usado > 0 ? [`${cantidadConUnidad(usado, t.unidad)} de ${t.nombre}`] : [];
  });
  if (partes.length === 0) return null;
  return `Usaste ${partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`}`;
}

/** «Encontré tela»: cuánto, un número mayor que cero; el precio, vacío (el último de ese color) o cero o más. `null` si la base lo aceptaría. */
export function problemaDeTelaEncontrada(cantidad: string, precio: string): string | null {
  if (leerCantidad(cantidad) === null) return "Escribe cuánta tela encontraste (un número mayor que cero, por ejemplo 2,5).";
  if (precio.trim() !== "" && leerQuedo(precio) === null) return "Escribe el precio por metro como un número (por ejemplo 18,50), o déjalo vacío para usar el último.";
  return null;
}

/** La tela que se manda a cortar afuera (Felipe: «si se corta afuera, sale al mandarla»): lo que sale de cada tela, como «usado». Una fila vacía no sale. */
export function lineasDeTelaQueSale(telas: readonly TelaDeLaOrden[], escrito: Readonly<Record<string, string>>): { insumo_id: string; usado: number }[] {
  return telas.flatMap((t) => {
    const texto = escrito[t.insumoId] ?? "";
    const n = leerCantidad(texto);
    return texto.trim() !== "" && n !== null && problemaDeTelaUsada(t, texto, "usar") === null ? [{ insumo_id: t.insumoId, usado: n }] : [];
  });
}

/** Lo que impide mandar lo escrito: el primer problema de una fila escrita. `null` si se puede (todo vacío también: la tela se anota después). */
export function problemaDeTelaQueSale(telas: readonly TelaDeLaOrden[], escrito: Readonly<Record<string, string>>): string | null {
  for (const t of telas) {
    const texto = escrito[t.insumoId] ?? "";
    if (texto.trim() === "") continue;
    const problema = problemaDeTelaUsada(t, texto, "usar");
    if (problema) return problema;
  }
  return null;
}
