// Análisis v4 (ADR-0357): la pestaña «Se está acabando», sin React. Qué prendas muestra cada filtro (Todos · Comprar · Por
// llegar) y cuántas tiene cada uno, cómo se dibuja la pista de días (largo, color y texto) y qué dicen sus píldoras y el
// tooltip «Por llegar». Quién se acaba, cuántos días le quedan y qué viene en camino lo deciden las reglas de
// `analisis-reglas.ts`: aquí no nace ninguna regla de negocio, solo cómo se dice y se dibuja (la maqueta aprobada por Felipe,
// 2026-10-06).

import type { LlegadaPrenda, OrigenLlegada, OrigenPrenda, PrendaAnalisis, PrendaEnOtraSede, SedeAnalisis } from "./analisis-tipos";
import type { ModeloAnalisis } from "./analisis-modelo";
import type { ProveedorDelModelo } from "./analisis-a-quien-pedir";
import { DIAS_SE_ACABA, diasDeVentas, diasQueQuedan, esTallaUnica, GRUPOS_ACABA, llegadaAtrasada, llegadasDe, ordenSeAcaba, plural, porLlegar, prendasDe, totalEnTienda } from "./analisis-reglas";
import { compararTallas } from "./tallas";
import { fechaCorta } from "./motor-demanda-reglas";

/** Una semana: hasta aquí los días van en rojo, y es la línea punteada del carril. */
export const UNA_SEMANA = 7;

/** Los filtros de la pestaña: todo lo que se acaba, lo que hay que comprar (nada viene en camino) y lo que ya viene. */
export type FiltroAcaba = "todos" | "comprar" | "llega";

export const FILTROS_ACABA: readonly { clave: FiltroAcaba; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "comprar", texto: "Comprar" },
  { clave: "llega", texto: "Por llegar" },
];

/**
 * Si una prenda que se acaba pasa el filtro: «Comprar» = no viene nada en camino a tiempo; «Por llegar» = algo ya viene. Una llegada
 * ATRASADA (su fecha estimada ya pasó) no cuenta como «viene»: la prenda vuelve a «Comprar», con su etiqueta «Atrasada N días»
 * (A3, plan verificado 2026-10-16). Antes una llegada vencida la sacaba del filtro y escondía una compra que seguía haciendo falta.
 */
export function pasaFiltroAcaba(p: Pick<PrendaAnalisis, "llega">, filtro: FiltroAcaba, hoy: string): boolean {
  if (filtro === "todos") return true;
  const viene = porLlegar(p, hoy) > 0;
  return filtro === "llega" ? viene : !viene;
}

/** Lo que se acaba (grupo «Cómpralas»), de lo más urgente a lo menos: primero lo agotado, a igual plazo lo que más se vende. */
export function prendasQueSeAcaban<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): T[] {
  return [...prendasDe(prendas, GRUPOS_ACABA, liquidarDesde)].sort(ordenSeAcaba);
}

/** Cuántas caen en cada filtro (las tres píldoras): «Comprar» y «Por llegar» se reparten «Todos» sin repetir ninguna. */
export function cuentasFiltroAcaba(seAcaban: readonly Pick<PrendaAnalisis, "llega">[], hoy: string): Record<FiltroAcaba, number> {
  const llega = seAcaban.filter((p) => porLlegar(p, hoy) > 0).length;
  return { todos: seAcaban.length, comprar: seAcaban.length - llega, llega };
}

const semanas = (dias: number): string => {
  const n = Math.round(dias / UNA_SEMANA);
  return `${n} ${plural(n, "semana", "semanas")}`;
};

/** Las marcas del eje sobre las pistas: 0 · 1 semana · 2 semanas (el tope es `DIAS_SE_ACABA`). */
export const EJE_ACABA: readonly { texto: string; left: string }[] = [
  { texto: "0", left: "0%" },
  { texto: semanas(UNA_SEMANA), left: `${(UNA_SEMANA / DIAS_SE_ACABA) * 100}%` },
  { texto: semanas(DIAS_SE_ACABA), left: "100%" },
];

/** Dónde va la línea punteada de una semana en cada pista. */
export const LINEA_SEMANA = `${(UNA_SEMANA / DIAS_SE_ACABA) * 100}%`;

/** El color de los días que quedan: rojo una semana o menos, ámbar hasta dos, taupe más allá (como en la maqueta). */
export function colorDias(dias: number): string {
  if (dias <= UNA_SEMANA) return "var(--color-rojo-profundo)";
  if (dias <= DIAS_SE_ACABA) return "var(--color-ambar)";
  return "var(--color-taupe)";
}

/** Cómo se dibuja la pista de una prenda: agotada (rayada y «Se agotó») o una barra de 0 a 2 semanas con sus días. */
export type PistaAcaba =
  | { agotada: true; texto: string }
  | {
      agotada: false;
      /** El largo de la barra, de 0 a 1 (`--n`). */
      n: number;
      /** El color de la barra (`--c`). */
      color: string;
      texto: string;
      /** Si la barra casi llena la pista, los días se escriben dentro de ella. */
      dentro: boolean;
    };

/** La pista con los días que quedan (`diasQueQuedan`); null si la prenda no tiene ritmo (no se vende: no se acaba). */
export function pistaAcaba(dias: number | null): PistaAcaba | null {
  if (dias === null) return null;
  if (dias <= 0) return { agotada: true, texto: "Se agotó" };
  const n = Math.min(dias / DIAS_SE_ACABA, 1);
  return { agotada: false, n, color: colorDias(dias), texto: `${dias} ${plural(dias, "día", "días")}`, dentro: n > 0.8 };
}

/** De dónde llega cada parte, como se dice en tienda. */
const NOMBRE_LLEGADA: Record<OrigenLlegada, string> = { compra: "Compra", almacen: "Almacén", taller: "Taller", tienda: "Otra tienda" };

/** Una línea del tooltip «Por llegar»: «Compra: 10 · llega el 15 oct.»; «llega hoy»; «debía llegar el …» si la fecha ya pasó. */
export function textoLlegada(x: LlegadaPrenda, hoy: string): string {
  const cuando =
    x.fecha === null ? "sin fecha" : x.fecha === hoy ? "llega hoy" : x.fecha < hoy ? `debía llegar el ${fechaCorta(x.fecha)}` : `llega el ${fechaCorta(x.fecha)}`;
  return `${NOMBRE_LLEGADA[x.de]}: ${x.cantidad} · ${cuando}`;
}

/** Las líneas de un tooltip, de lo que llega antes a lo que llega después (lo que no tiene fecha, al final). */
function lineasDe(partes: readonly LlegadaPrenda[], hoy: string): string[] {
  const orden = (f: string | null) => f ?? "9999-12-31";
  return [...partes]
    .filter((x) => x.cantidad > 0)
    .sort((a, b) => orden(a.fecha).localeCompare(orden(b.fecha)))
    .map((x) => textoLlegada(x, hoy));
}

/** Las líneas del tooltip «Por llegar»: solo lo que todavía se espera (lo atrasado va en su propio tooltip). */
export const lineasPorLlegar = (p: Pick<PrendaAnalisis, "llega">, hoy: string): string[] =>
  lineasDe(p.llega.filter((x) => !llegadaAtrasada(x, hoy)), hoy);

/** El título del tooltip: «Por llegar: 13». */
export const tituloPorLlegar = (p: Pick<PrendaAnalisis, "llega">, hoy: string): string => `Por llegar: ${porLlegar(p, hoy)}`;

/** Lo que debía llegar y no llegó: cuántas unidades y cuántos días lleva la más atrasada; null si nada está atrasado. */
export function atrasoDe(p: Pick<PrendaAnalisis, "llega">, hoy: string): { unidades: number; dias: number } | null {
  const l = llegadasDe(p.llega, hoy);
  return l.atrasadas > 0 ? { unidades: l.atrasadas, dias: l.diasAtraso } : null;
}

/** La etiqueta de la píldora: «Atrasada 26 días» (los de la parte que más se atrasó). */
export const textoAtraso = (dias: number): string => `Atrasada ${dias} ${plural(dias, "día", "días")}`;

/** El título del tooltip «Atrasada»: «Atrasada: 8 sin llegar». */
export const tituloAtrasada = (unidades: number): string => `Atrasada: ${unidades} sin llegar`;

/**
 * Lo que dice el tooltip «Atrasada» al final. Si no viene nada más, la prenda sigue en «Comprar» y se dice; si además llega algo a
 * tiempo, la prenda está en «Por llegar» y la nota solo dice que lo atrasado no cuenta (no puede mandar a una lista donde no está).
 */
export function notaAtrasada(unidades: number, vieneAlgoMas: boolean): string {
  if (vieneAlgoMas) return `${plural(unidades, "Esta no la cuento", "Estas no las cuento")} como que ${plural(unidades, "viene", "vienen")} hasta que ${plural(unidades, "llegue", "lleguen")}.`;
  return "No la cuento como que viene: sigue en «Comprar» hasta que llegue.";
}

/** Las líneas del tooltip «Atrasada», de la que más se atrasó a la que menos: «Taller: 8 · debía llegar el 20 sep.». */
export const lineasAtrasadas = (p: Pick<PrendaAnalisis, "llega">, hoy: string): string[] =>
  lineasDe(p.llega.filter((x) => llegadaAtrasada(x, hoy)), hoy);

/** Si ninguna otra tienda la tiene: a quién se compra («Proveedor taller» / «Proveedor terceros»); null si no se sabe. */
export function textoProveedor(origen: OrigenPrenda | null): string | null {
  if (origen === "taller") return "Proveedor taller";
  if (origen === "terceros") return "Proveedor terceros";
  return null;
}

/**
 * La píldora genérica («Proveedor taller» / «Proveedor terceros») solo sale cuando la fila NO pudo decir a quién se pide: el nombre ya se
 * dice en «Pídelo a …» (bajo «Comprar»). `quien` es null si los proveedores no se pudieron leer (A8): entonces queda lo de siempre.
 */
export function textoProveedorGenerico(quien: ProveedorDelModelo | null, origen: OrigenPrenda | null): string | null {
  return quien && quien.fuente !== "ninguno" ? null : textoProveedor(origen);
}

/** El tooltip de «AQP tiene 3»: el dato y qué hacer con él (decide la persona, decisión 7). */
export const tipOtraTienda = (sede: Pick<SedeAnalisis, "ciudad">, stock: number): string =>
  `${sede.ciudad} tiene ${stock}. Toca la prenda para ver cuánto vende cada tienda y decide si pedirla.`;

/**
 * Los días de ventas que cada tienda tiene en el ERP (hasta 30), por id, desde su primera venta: con ellos se mide el ritmo de lo que
 * OTRA tienda vende de un modelo (de ella solo se lee cuánto tiene y cuánto vendió, no desde cuándo está colgado). Una tienda cuyo motor
 * no se pudo leer no aparece: de ella no se dice nada en vez de medirla con una ventana inventada.
 */
export function ventanasPorSede(preparacion: readonly { ubicacionId: string; primeraVenta: string | null }[], hoy: string): Record<string, number> {
  return Object.fromEntries(preparacion.map((f) => [f.ubicacionId, diasDeVentas(f.primeraVenta, hoy)]));
}

/** Una otra tienda donde el modelo TAMBIÉN se acaba: cuántos días le quedan allá (0 = ya no tiene y lo venden), cuánto tiene y cuánto vendió. */
export type SeAcabaEnOtra = { sedeId: string; dias: number; stock: number; vendidas30: number };

/**
 * Las otras tiendas donde este modelo también se acaba (A8): se vende allá y, al ritmo de su tienda, lo que tiene dura `DIAS_SE_ACABA`
 * días o menos. Es la misma regla que «se está acabando» aquí (`diasQueQuedan`), con los días de ventas de esa tienda. Sirve para que
 * quien compra sepa que el mismo modelo falta en más de una tienda: una orden de compra tiene UN solo destino (`ordenes_compra.ubicacion_destino_id`) y Análisis ve una tienda.
 * No dice cuántas pedir (decisión 7). De la más urgente a la menos; una tienda sin su ventana (`ventanas`) o sin ventas no cuenta.
 */
export function seAcabaEnOtras(otras: readonly PrendaEnOtraSede[], ventanas: Readonly<Record<string, number>>): SeAcabaEnOtra[] {
  const acaban: SeAcabaEnOtra[] = [];
  for (const o of otras) {
    const ventana = ventanas[o.sedeId];
    if (ventana === undefined) continue;
    const dias = diasQueQuedan({ piso: o.stock, almacen: 0, vendidas30: o.vendidas30, diasDeVentas: ventana });
    if (dias !== null && dias <= DIAS_SE_ACABA) acaban.push({ sedeId: o.sedeId, dias, stock: o.stock, vendidas30: o.vendidas30 });
  }
  return acaban.sort((a, b) => a.dias - b.dias || b.vendidas30 - a.vendidas30 || a.sedeId.localeCompare(b.sedeId));
}

/** Lo que dice la píldora tras el código de la tienda: «AQP también se acaba» (o «también se agotó» si allá ya no hay). */
export const textoTambienSeAcaba = (o: Pick<SeAcabaEnOtra, "dias">): string => (o.dias === 0 ? "también se agotó" : "también se acaba");

/** El tooltip de esa píldora: qué pasa allá y por qué importa al pedir (una orden de compra lleva un solo destino); sin cantidades. */
export function tipTambienSeAcaba(sede: Pick<SedeAnalisis, "ciudad">, o: Pick<SeAcabaEnOtra, "dias">): string {
  const como = o.dias === 0 ? `${sede.ciudad} ya no tiene y lo vende.` : `${sede.ciudad} también se queda sin él: al ritmo que vende, ${plural(o.dias, "le queda", "le quedan")} ${o.dias} ${plural(o.dias, "día", "días")}.`;
  return `${como} Una orden de compra tiene un solo destino: piénsalo también para ${sede.ciudad}.`;
}

/** El botón de texto bajo «Comprar»: «o pedir a Arequipa». */
export const textoPedirA = (sede: Pick<SedeAnalisis, "ciudad">): string => `o pedir a ${sede.ciudad}`;

/** Lo que se dice cuando la pestaña no tiene carril: nada se acaba, o no se pudieron leer las prendas. */
export type VacioAcaba = "nada" | "sin-datos";

/**
 * Sin nada que se acabe en la tienda (sin buscar ni filtrar): «Nada se está acabando». Si no llegó ni una prenda y algo falló al
 * leer, no se dice «va bien» por un error (principio 9): se dice que no se pudo ver. null = hay carril.
 */
export function vacioAcaba(c: { prendas: number; seAcaban: number; fallas: number }): VacioAcaba | null {
  if (c.seAcaban > 0) return null;
  return c.prendas === 0 && c.fallas > 0 ? "sin-datos" : "nada";
}

/** El título y la línea de cada vacío. */
export const TEXTO_VACIO_ACABA: Record<VacioAcaba, { titulo: string; linea: string }> = {
  nada: { titulo: "Nada se está acabando", linea: `Todo lo que se vende te dura más de ${semanas(DIAS_SE_ACABA)}.` },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
};

/** Hasta cuántas tallas se nombran en la píldora «Falta …»; con más, se cuentan («Faltan 3») y se nombran en su tooltip. */
const FALTAN_NOMBRADAS = 2;

/**
 * Lo que ya no hay de un modelo que se acaba (ADR-0357, decisión 12): la talla y el color que se agotaron en mi tienda, de lo que más
 * se vendía a lo que menos. Se nombra la talla (no la única) y el color solo si el modelo tiene varios: «Falta S Arena», «Faltan S y
 * M», «Faltan 3» (con las tres en `todas`). null si no falta ninguna, o si se agotó el modelo entero (eso ya lo dice su pista).
 */
export function faltanDelModelo(m: Pick<ModeloAnalisis, "variantes" | "colores">): { texto: string; todas: string[] } | null {
  const agotadas = m.variantes.filter((v) => totalEnTienda(v) === 0);
  if (agotadas.length === 0 || agotadas.length === m.variantes.length) return null;
  const variosColores = m.colores.filter((c) => c.trim() !== "").length > 1;
  const todas = [...agotadas]
    .sort((a, b) => b.vendidas30 - a.vendidas30 || compararTallas(a.talla, b.talla))
    .map((v) => [esTallaUnica(v.talla) ? null : v.talla, variosColores ? v.color : null].filter(Boolean).join(" ") || v.color || v.talla);
  const verbo = todas.length === 1 ? "Falta" : "Faltan";
  const texto = todas.length <= FALTAN_NOMBRADAS ? `${verbo} ${todas.join(" y ")}` : `${verbo} ${todas.length}`;
  return { texto, todas };
}
