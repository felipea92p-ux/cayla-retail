// Análisis v4 (ADR-0357): la pestaña «Se está acabando», sin React. Qué prendas muestra cada filtro (Todos · Comprar · Por
// llegar) y cuántas tiene cada uno, cómo se dibuja la pista de días (largo, color y texto) y qué dicen sus píldoras y el
// tooltip «Por llegar». Quién se acaba, cuántos días le quedan y qué viene en camino lo deciden las reglas de
// `analisis-reglas.ts`: aquí no nace ninguna regla de negocio, solo cómo se dice y se dibuja (la maqueta aprobada por Felipe,
// 2026-10-06).

import type { LlegadaPrenda, OrigenLlegada, OrigenPrenda, PrendaAnalisis, PrendaEnOtraSede, SedeAnalisis } from "./analisis-tipos";
import type { ModeloAnalisis } from "./analisis-modelo";
import type { ProveedorDelModelo } from "./analisis-a-quien-pedir";
import { DIAS_SE_ACABA, diasDeVentas, diasQueQuedan, esTallaUnica, GRUPOS_ACABA, llegadaAtrasada, llegadasDe, ordenSeAcaba, plural, porLlegar, prendasDe, totalEnTienda, ventanaDe } from "./analisis-reglas";
import { margenPorDia, montoPorDia, rangoDeDias, unaSolaVenta, type RangoDeDias } from "./analisis-ritmo";
import { compararTallas } from "./tallas";
import { fechaCorta } from "./motor-demanda-reglas";
import { diasEntreFechas } from "./fechas-lima";

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
 * El título del carril sale del FILTRO (Felipe 2026-10-16: con «Por llegar» decía «Cómpralas» sobre lo que ya viene en camino, y la compradora
 * aprieta «Comprar» en lo que no hace falta): «Todos» → «Se están acabando», «Comprar» → «Cómpralas», «Por llegar» → «Ya vienen». La cuenta
 * que lo acompaña es la misma del filtro. El grupo conserva su clave (`comprar`) y su «?»: Hoy lo deja a la vista con ella.
 */
export function tituloDelCarril(filtro: FiltroAcaba, n: number): string {
  if (filtro === "comprar") return plural(n, "Cómprala", "Cómpralas");
  if (filtro === "llega") return plural(n, "Ya viene", "Ya vienen");
  return plural(n, "Se está acabando", "Se están acabando");
}

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
export function prendasQueSeAcaban<T extends PrendaAnalisis>(prendas: readonly T[]): T[] {
  return [...prendasDe(prendas, GRUPOS_ACABA)].sort(ordenSeAcaba);
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
  | {
      agotada: true;
      texto: string;
      /** Una sola venta (D6, 2026-10-16): el agotado no va en rojo, va suave (ámbar). Solo viene cuando es cierto. */
      suave?: true;
    }
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

/**
 * La pista con los días que quedan (`diasQueQuedan`); null si la prenda no tiene ritmo (no se vende: no se acaba). Con `unaVenta` (el ritmo sale
 * de UNA sola venta: D6 de Felipe, 2026-10-16) la fila sigue en «Comprar» pero no grita: la barra de una semana o menos va en ámbar en vez de
 * rojo y el agotado va suave. El rojo de lo demás no cambia (eso es la escala de urgencia, A13).
 */
export function pistaAcaba(dias: number | null, unaVenta = false): PistaAcaba | null {
  if (dias === null) return null;
  if (dias <= 0) return unaVenta ? { agotada: true, texto: "Se agotó", suave: true } : { agotada: true, texto: "Se agotó" };
  const n = Math.min(dias / DIAS_SE_ACABA, 1);
  const color = unaVenta && dias <= UNA_SEMANA ? "var(--color-ambar)" : colorDias(dias);
  return { agotada: false, n, color, texto: `${dias} ${plural(dias, "día", "días")}`, dentro: n > 0.8 };
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

/**
 * Cuándo llega lo que viene, para la píldora «Por llegar 24 · en 4 días»: «hoy», «mañana», «en 4 días» si todo llega el mismo día; «sin
 * fecha» si nadie anotó cuándo; y, si hay varias fechas (o una parte sin fecha), «desde el 20 oct.» (la primera): el tooltip trae cada parte.
 * null si no viene nada a tiempo (lo atrasado no cuenta: tiene su propia píldora).
 */
export function cuandoLlega(p: Pick<PrendaAnalisis, "llega">, hoy: string): string | null {
  const partes = p.llega.filter((x) => x.cantidad > 0 && !llegadaAtrasada(x, hoy));
  if (partes.length === 0) return null;
  const fechas = [...new Set(partes.map((x) => x.fecha).filter((f): f is string => f !== null))].sort();
  if (fechas.length === 0) return "sin fecha";
  const primera = fechas[0]!;
  if (fechas.length === 1 && partes.every((x) => x.fecha !== null)) {
    const dias = diasEntreFechas(hoy, primera);
    return dias <= 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
  }
  return `desde el ${fechaCorta(primera)}`;
}

/**
 * Lo que pasa cuando lo que viene en camino llega DESPUÉS de que se acaba la prenda (segundo pase visual, 2026-10-17): en «Ya vienen», el Vestido
 * Midi tenía «6 días · puede acabarse en 4» y «Por llegar 15 · en 10 días» en verde, y nadie decía que el piso se queda vacío varios días. NO cambia
 * en qué filtro cae la prenda (eso es de Felipe): solo avisa.
 */
export type LlegaTarde = {
  /** En cuántos días llega lo primero que viene (con fecha). */
  llegaEn: number;
  /** Los días que quedan en el peor caso (0 si ya no hay). */
  peor: number;
  /** Días sin stock en el peor caso: `llegaEn − peor`, siempre 1 o más. */
  hasta: number;
  /** Días sin stock al ritmo de la barra: `llegaEn − diasQueQuedan`; 0 si, a ese ritmo, llega a tiempo y solo en el peor caso no. */
  unos: number;
};

/**
 * ¿Lo primero que viene llega DESPUÉS de los días que quedan en el peor caso? (`rangoDeDias`: quien compra decide por el peor caso, A5.) Solo se afirma
 * cuando TODO lo que viene a tiempo tiene fecha: si una parte no la tiene (`fecha` null) no se sabe cuándo llega lo primero, y no se acusa de tarde lo que
 * quizá llega mañana (ni se inventa una fecha); lo atrasado ya tiene su propia píldora. Llegar el mismo día en que se acaba (peor caso) no es llegar
 * tarde. Ya agotada, todo lo que llegue de mañana en adelante lo es: el peor caso son 0 días. null si llega antes (o el mismo día), si no se sabe
 * cuándo, o si la prenda no tiene ritmo.
 */
export function llegaTarde(p: Pick<PrendaAnalisis, "llega" | "piso" | "almacen" | "vendidas30" | "diasDeVentas">, hoy: string): LlegaTarde | null {
  if (!(p.vendidas30 > 0)) return null;
  const aTiempo = p.llega.filter((x) => x.cantidad > 0 && !llegadaAtrasada(x, hoy));
  if (aTiempo.length === 0 || aTiempo.some((x) => x.fecha === null)) return null;
  const fechas = aTiempo.map((x) => x.fecha!);
  const llegaEn = Math.max(0, diasEntreFechas(hoy, [...fechas].sort()[0]!));
  const enStock = totalEnTienda(p);
  const peor = enStock === 0 ? 0 : (rangoDeDias({ ventas: p.vendidas30, ventana: ventanaDe(p), enStock })?.desde ?? 0);
  if (llegaEn <= peor) return null;
  return { llegaEn, peor, hasta: llegaEn - peor, unos: Math.max(0, llegaEn - (diasQueQuedan(p) ?? 0)) };
}

/**
 * Lo que dice la píldora (y la franja de la ficha): «Llega tarde · te quedas unos 4 días sin stock». Si, al ritmo de la barra, llega a tiempo y solo
 * con el ritmo más alto no (`unos` es 0), no se promete un número que no es: «Puede llegar tarde».
 */
export function textoLlegaTarde(t: Pick<LlegaTarde, "unos">): string {
  if (t.unos <= 0) return "Puede llegar tarde";
  return `Llega tarde · te quedas ${t.unos === 1 ? "1 día" : `unos ${t.unos} días`} sin stock`;
}

/** El tooltip de esa píldora: qué llega cuándo, cuánto dura, y el peor caso (que es el que importa para pedir). Sin cantidades (decisión 7). */
export function tipLlegaTarde(t: LlegaTarde): string {
  const dias = (n: number) => `${n} ${plural(n, "día", "días")}`;
  // `llegaTarde` solo devuelve algo si llega DESPUÉS del peor caso, así que `llegaEn` es siempre 1 o más (nunca «hoy»).
  const llega = `en ${dias(t.llegaEn)}`;
  if (t.peor === 0) return `Ya no hay y lo que viene llega ${llega}: te quedas ${dias(t.hasta)} sin stock.`;
  const peor = `si se vende más rápido, se acaba en ${dias(t.peor)} y te quedas hasta ${dias(t.hasta)} sin stock`;
  return t.unos > 0
    ? `Lo que viene llega ${llega}, después de lo que te dura: al ritmo de la barra, unos ${dias(t.unos)} sin stock; ${peor}.`
    : `Lo que viene llega ${llega}. Al ritmo de la barra llega a tiempo, pero ${peor}.`;
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

/** Hasta cuántas tallas se nombran en la píldora «Falta …»; con más, se cuentan («Faltan 3 tallas o colores») y se nombran en su tooltip. */
const FALTAN_NOMBRADAS = 2;

/**
 * Lo que ya no hay de un modelo que se acaba (ADR-0357, decisión 12): la talla y el color que se agotaron en mi tienda, de lo que más
 * se vendía a lo que menos. Se nombra la talla (no la única) y el color solo si el modelo tiene varios: «Falta S Arena», «Faltan S y
 * M»; con más de dos, se cuentan y se dice QUÉ se cuenta: «Faltan 3 tallas o colores» (si el modelo tiene un solo color, «Faltan 3 tallas»;
 * «Faltan 3» a secas no decía si eran tallas, colores o unidades: segundo pase visual, 2026-10-17), con las tres en `todas`. null si no
 * falta ninguna, o si se agotó el modelo entero (eso ya lo dice su pista).
 */
export function faltanDelModelo(m: Pick<ModeloAnalisis, "variantes" | "colores">): { texto: string; todas: string[] } | null {
  const agotadas = m.variantes.filter((v) => totalEnTienda(v) === 0);
  if (agotadas.length === 0 || agotadas.length === m.variantes.length) return null;
  const variosColores = m.colores.filter((c) => c.trim() !== "").length > 1;
  const todas = [...agotadas]
    .sort((a, b) => b.vendidas30 - a.vendidas30 || compararTallas(a.talla, b.talla))
    .map((v) => [esTallaUnica(v.talla) ? null : v.talla, variosColores ? v.color : null].filter(Boolean).join(" ") || v.color || v.talla);
  const verbo = todas.length === 1 ? "Falta" : "Faltan";
  const que = variosColores ? "tallas o colores" : "tallas";
  const texto = todas.length <= FALTAN_NOMBRADAS ? `${verbo} ${todas.join(" y ")}` : `${verbo} ${todas.length} ${que}`;
  return { texto, todas };
}

// ───────── El ritmo se ve con su base (A5) y cuánto cuesta esperar (A15), 2026-10-16 ─────────
//
// «Vendió 2 en 7 días · puede acabarse en 5 días, o durar hasta 53 días»: la base del número y el rango en el que cabe (`analisis-ritmo.ts`).
// Quien compra decide por el peor caso, así que la respuesta es la cota baja y el rango es el detalle. Aquí solo se dice con palabras de tienda
// (sin «Poisson» ni «80 %»: ley 4 de /formidable); las cuentas son de `analisis-ritmo.ts`. No sugiere cantidades (decisión 7).

/** Más allá de un año, «hasta 2.562 días» no le sirve a nadie que compra: se dice «más de un año». */
const DIAS_MAS_DE_UN_ANO = 365;

const diasEscritos = (n: number): string => `${n} ${plural(n, "día", "días")}`;

/** «hoy», «ayer» o «hace 3 días»: cuándo fue algo, contado desde `hoy` (YYYY-MM-DD). Una fecha de mañana o de hoy es «hoy». */
function textoHace(fecha: string, hoy: string): string {
  const dias = Math.max(0, diasEntreFechas(fecha, hoy));
  return dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
}

/** «entre 5 y 53 días», «entre 5 días y más de un año» o, si no se separan, «3 días»: el rango entero, para el detalle. */
function textoEntre(r: RangoDeDias): string {
  if (r.hasta <= r.desde) return diasEscritos(r.desde);
  return r.hasta > DIAS_MAS_DE_UN_ANO ? `entre ${diasEscritos(r.desde)} y más de un año` : `entre ${r.desde} y ${diasEscritos(r.hasta)}`;
}

/** Lo que dice la fila (y la ficha) de la base de una prenda que se acaba. Los textos que no aplican vienen en null. */
type LecturaDeRitmo = {
  /** «Vendió 2 en 7 días»: con qué venta se calculó el número. */
  vendio: string;
  /** El ritmo sale de UNA sola venta (D6): lleva el chip «Una sola venta» y no usa rojo. */
  unaVenta: boolean;
  /** Ya no hay en la tienda: no hay días que contar, sino lo que cuesta esperar. */
  agotada: boolean;
  /** Con stock, la otra punta: «o durar hasta 53 días». null si el rango no se separa de la cifra: la nota de la fila no lo repite (`notaDeRitmo`). */
  hasta: string | null;
  /** Con stock, el rango entero, del peor caso al mejor: «entre 5 y 53 días» (o «3 días» si no se separa). Quien compra decide por el primero (A5). */
  entre: string | null;
  /** Agotada y con su última venta conocida: «hoy», «ayer» o «hace 3 días». */
  hace: string | null;
  /** Agotada: «última venta hace 3 días». */
  ultima: string | null;
  /** Agotada con precio y costo: lo que dejas de ganar por día, ya redondeado (A15). Sin costo no se inventa. */
  margenDia: number | null;
};

/**
 * Lo que la fila y la ficha dicen del ritmo de una prenda que se vende. null si no se vendió (sin ritmo no hay base que decir). El rango se
 * calcula sobre la MISMA ventana que `diasQueQuedan` (`ventanaDe`), así el peor caso nunca pasa de los días de la barra. Recuerda que el ritmo
 * de un modelo con quiebre es un piso (`ventanaDeRitmo`): el rango cubre el azar de pocas ventas, no ese sesgo.
 */
export function lecturaDeRitmo(
  p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasDeVentas" | "precio" | "costo"> & { ultimaVenta?: string | null },
  hoy: string,
): LecturaDeRitmo | null {
  if (!(p.vendidas30 > 0)) return null;
  const ventana = ventanaDe(p);
  const enStock = totalEnTienda(p);
  const agotada = enStock === 0;
  const rango = rangoDeDias({ ventas: p.vendidas30, ventana, enStock });
  const hace = agotada && p.ultimaVenta ? textoHace(p.ultimaVenta, hoy) : null;
  return {
    vendio: `Vendió ${p.vendidas30} en ${diasEscritos(ventana)}`,
    unaVenta: unaSolaVenta(p.vendidas30),
    agotada,
    hasta: rango && rango.hasta > rango.desde ? (rango.hasta > DIAS_MAS_DE_UN_ANO ? "o durar más de un año" : `o durar hasta ${diasEscritos(rango.hasta)}`) : null,
    entre: rango ? textoEntre(rango) : null,
    hace,
    ultima: hace ? `última venta ${hace}` : null,
    margenDia: agotada ? montoPorDia(margenPorDia(p, ventana)) : null,
  };
}

/** El detalle de una sola venta, a un toque: por qué no hay que fiarse del número. Con stock dice también cuánto te puede durar. */
export function tipUnaVenta(l: Pick<LecturaDeRitmo, "agotada" | "entre">): string {
  return l.agotada || !l.entre
    ? "Solo se registró una venta de esta prenda: con tan poco no se sabe si se repite."
    : `Solo se registró una venta de esta prenda: con tan poco no se sabe el ritmo. Te puede durar ${l.entre}.`;
}

/** El detalle del rango, a un toque: de dónde sale el «entre 5 y 53 días» de la nota de la fila. null si ya se agotó. */
export const tipRitmo = (l: Pick<LecturaDeRitmo, "entre">): string | null => (l.entre ? `Según lo vendido hasta hoy, te puede durar ${l.entre}.` : null);

/**
 * «dejas de ganar ~S/ 26 al día», con el monto ya escrito (`solesFicha`: el espacio de «S/» no se parte, ADR-0413). Es una estimación: lleva «~».
 * Va en minúscula porque siempre sigue a otra frase: la nota bajo la barra («Vendió 10 en 13 días · última venta ayer · dejas de ganar ~S/ 55 al
 * día») y la bajada de «Ya no hay» en la ficha. Antes era una píldora de 184 px en una columna de 150: a 1280 pisaba «Pídelo a …».
 */
export const textoDejasDeGanar = (monto: string): string => `dejas de ganar ~${monto} al día`;

/**
 * La nota bajo la barra de una fila: UNA sola frase (segundo pase visual, 2026-10-17: la fila traía tres números de días —la barra, «puede acabarse en
 * X» en negrita y «o durar hasta Y»— y la compradora no sabía cuál usar). La barra dice el número; esta frase, de dónde sale y entre cuánto cabe:
 * «Vendió 2 en 7 días · entre 1 y 13 días»; si el rango no se separa de la cifra, solo «Vendió 2 en 7 días». Agotada, la última venta y, aparte (la
 * pantalla le pone su tooltip), lo que dejas de ganar: «Vendió 10 en 13 días · última venta ayer» + «dejas de ganar ~S/ 55 al día».
 */
export function notaDeRitmo(l: Pick<LecturaDeRitmo, "vendio" | "entre" | "hasta" | "agotada" | "ultima">, dejas: string | null): { base: string; dejas: string | null } {
  const partes = [l.vendio];
  if (l.agotada) {
    if (l.ultima) partes.push(l.ultima);
  } else if (l.entre && l.hasta) {
    partes.push(l.entre);
  }
  return { base: partes.join(" · "), dejas: l.agotada ? dejas : null };
}

/**
 * La cifra principal de la ficha de lo que se acaba, en UNA tarjeta (antes eran dos: «Quedan 12 días» y «Puede acabarse en 8 días · entre 8 y 17»):
 * «Te dura ~12 días» y, debajo, el rango (solo si se separa de la cifra) y lo que tienes.
 */
export function textoTeDura(dias: number, ritmo: Pick<LecturaDeRitmo, "entre" | "hasta"> | null, tienes: number): { valor: string; etiqueta: string } {
  const rango = ritmo?.entre && ritmo.hasta ? ritmo.entre : null;
  return { valor: `Te dura ~${diasEscritos(dias)}`, etiqueta: [rango, `tienes ${tienes}`].filter(Boolean).join(" · ") };
}

/** El tooltip de esa cifra: de dónde sale, sin cantidades. */
export const TIP_DEJAS_DE_GANAR = "Lo que vendías por día multiplicado por lo que te queda en cada una sin el IGV y sin el costo. Es una estimación: mientras no hay, esa ganancia no entra.";
