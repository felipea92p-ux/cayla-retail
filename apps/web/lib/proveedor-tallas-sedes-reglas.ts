// Ficha de proveedor ▸ «Las tallas que se llevan» y «Cómo le va en cada sede» (ADR-0502, actualización 2026-10-26 (e)). Reglas puras, sin
// I/O: las filas de `fn_proveedor_tallas_sedes` (una por prenda, talla y sede) entran y salen la curva, el ritmo por sede, el traslado sugerido
// y sus avisos para «Lo que quizá no ves».
//
// LAS REGLAS DE FELIPE (2026-10-26):
//   · Tallas: la MISMA regla que «Las tallas que se llevan» de Análisis (`curvaDeTallas`): una talla «pide más» si pesa 4 puntos más en lo
//     que vendes que en lo que tienes, y «sobra» si es al revés. El aviso sale solo con `MIN_VENDIDAS` vendidas del proveedor. Cuenta todo lo
//     vendido desde que llegó su ropa, como el resto de la ficha. «Lo que tienes» es todo su stock (tiendas, almacén y Taller).
//   · Sede: «rinde» se mide con el MISMO ritmo que el ranking (`ritmoDeDatos`): semanas que tardaría en venderse lo que queda EN esa sede,
//     contadas desde que le llegó su primera prenda de ese proveedor. Solo las tiendas venden; lo que está en almacén o Taller se cuenta aparte.
//   · Traslado: si una tienda va lenta y otra se agota, se sugiere CON cantidad. Solo se sugiere: el traslado lo hace una persona en Traslados.
//     `SEMANAS_COBERTURA_TRASLADO` (8) y `MIN_TRASLADO` (3): propuestos en la sesión y confirmados por Felipe el 2026-10-26; se cambian aquí.

import { curvaDeTallas, DIFERENCIA_QUE_SE_NOTA, type ColumnaTalla } from "./analisis-pedir";
import { MAX_AVISOS, MIN_VENDIDAS, type Hallazgo } from "./proveedor-analisis-reglas";
import { DIAS_PARA_JUZGAR, MIN_COMPRADAS, SEMANAS_STOCK_LARGO, ritmoDeDatos, textoSemanas, type Ritmo } from "./proveedor-ritmo-reglas";

/** Semanas de venta que se le deja a cada tienda al sugerir un traslado: la de destino recibe hasta cubrirlas, la de origen se las guarda. */
export const SEMANAS_COBERTURA_TRASLADO = 8;
/** Por debajo de esto, un traslado no vale el viaje. */
export const MIN_TRASLADO = 3;

/** Una fila de `fn_proveedor_tallas_sedes`. */
export type CeldaTallaSede = {
  productoId: string;
  referencia: string;
  categoria: string | null;
  talla: string;
  ubicacionId: string;
  sede: string;
  sedeTipo: string;
  vendidas: number;
  stock: number;
  primeraLlegada: string | null;
};

const num = (n: number) => n.toLocaleString("es-PE");
const unaDecima = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const esTienda = (c: Pick<CeldaTallaSede, "sedeTipo">) => c.sedeTipo === "tienda";
const minFecha = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b));

/* ───────── Tallas ───────── */

export type ColumnaTallaProveedor = ColumnaTalla & { sobra: boolean };

export type CurvaProveedor =
  | { tipo: "unica" }
  | { tipo: "vacia" }
  | { tipo: "tallas"; columnas: ColumnaTallaProveedor[]; max: number; nota: string | null; vendidas: number; tiene: number };

/** La curva del proveedor: lo vendido y lo que tienes por talla, sumando sus prendas en todas las sedes. */
export function curvaDelProveedor(celdas: readonly CeldaTallaSede[]): CurvaProveedor {
  const porPrendaTalla = new Map<string, { categoria: string | null; talla: string; vendidas30: number; piso: number; almacen: number }>();
  for (const c of celdas) {
    const k = `${c.productoId}|${c.talla}`;
    const a = porPrendaTalla.get(k) ?? { categoria: c.categoria, talla: c.talla, vendidas30: 0, piso: 0, almacen: 0 };
    a.vendidas30 += Math.max(0, c.vendidas);
    a.piso += Math.max(0, c.stock);
    porPrendaTalla.set(k, a);
  }
  // `curvaDeTallas` es la de Análisis: «vendidas30» aquí es todo lo vendido del proveedor y «piso» todo lo que tienes (la ventana la fija la ficha).
  const curva = curvaDeTallas([...porPrendaTalla.values()], null);
  if (curva.tipo !== "tallas") return curva;
  const columnas = curva.columnas.map((c) => ({ ...c, sobra: c.t - c.v >= DIFERENCIA_QUE_SE_NOTA }));
  return {
    ...curva,
    columnas,
    vendidas: columnas.reduce((s, c) => s + c.vend, 0),
    tiene: columnas.reduce((s, c) => s + c.tiene, 0),
  };
}

/* ───────── Sedes ───────── */

export type SedeDeProveedor = {
  ubicacionId: string;
  sede: string;
  vendidas: number;
  stock: number;
  primeraLlegada: string | null;
  ritmo: Ritmo;
};

export type SedesDeProveedor = {
  /** Las tiendas, de la que más vende a la que menos. */
  tiendas: SedeDeProveedor[];
  /** Lo que está fuera de las tiendas (almacén, Taller): no se vende ahí, pero es mercadería que se puede repartir. */
  fuera: { sede: string; stock: number }[];
};

/** Cómo le va al proveedor en cada tienda: el mismo ritmo que el ranking, medido dentro de cada una. */
export function sedesDelProveedor(celdas: readonly CeldaTallaSede[], hoy: string): SedesDeProveedor {
  const tiendas = new Map<string, { sede: string; vendidas: number; stock: number; primeraLlegada: string | null }>();
  const fuera = new Map<string, number>();
  for (const c of celdas) {
    if (!esTienda(c)) {
      if (c.stock > 0) fuera.set(c.sede, (fuera.get(c.sede) ?? 0) + c.stock);
      continue;
    }
    const a = tiendas.get(c.ubicacionId) ?? { sede: c.sede, vendidas: 0, stock: 0, primeraLlegada: null };
    a.vendidas += c.vendidas;
    a.stock += Math.max(0, c.stock);
    a.primeraLlegada = minFecha(a.primeraLlegada, c.primeraLlegada);
    tiendas.set(c.ubicacionId, a);
  }
  return {
    tiendas: [...tiendas.entries()]
      .map(([ubicacionId, a]) => {
        const vendidas = Math.max(0, a.vendidas);
        const ritmo = ritmoDeDatos({ unidadesVendidas: vendidas, unidadesCompradas: vendidas + a.stock, unidadesEnEstantes: a.stock, primeraEntrada: a.primeraLlegada }, hoy);
        return { ubicacionId, sede: a.sede, vendidas, stock: a.stock, primeraLlegada: a.primeraLlegada, ritmo };
      })
      .sort((x, y) => y.ritmo.porSemana - x.ritmo.porSemana || y.vendidas - x.vendidas || x.sede.localeCompare(y.sede, "es")),
    fuera: [...fuera.entries()].map(([sede, stock]) => ({ sede, stock })).sort((a, b) => b.stock - a.stock),
  };
}

/** La palabra de cada tienda, con la misma regla que el veredicto del ranking. */
export type VeredictoSede = "agotada" | "se-agota" | "lenta" | "va-bien" | "sin-medir";

/** Cómo se dice y de qué tono es cada palabra: la ficha y la lista (vista rápida y comparación) dicen lo mismo. */
export const PALABRA_SEDE: Record<VeredictoSede, { tono: "rojo" | "verde" | "ambar" | "neutro" | "apagado"; texto: string }> = {
  agotada: { tono: "rojo", texto: "Se agotó" },
  "se-agota": { tono: "verde", texto: "Se agota" },
  lenta: { tono: "ambar", texto: "Rota lento" },
  "va-bien": { tono: "neutro", texto: "Va bien" },
  "sin-medir": { tono: "apagado", texto: "Aún no se mide" },
};

export function veredictoDeSede(s: Pick<SedeDeProveedor, "ritmo">): VeredictoSede {
  if (!s.ritmo.juzgable) return "sin-medir";
  if (s.ritmo.enEstantes === 0 && s.ritmo.vendidas > 0) return "agotada";
  if (s.ritmo.agota) return "se-agota";
  if (s.ritmo.lento) return "lenta";
  return "va-bien";
}

/* ───────── Traslado sugerido ───────── */

export type LineaTraslado = { productoId: string; referencia: string; talla: string; cantidad: number };

export type TrasladoSugerido = {
  origen: SedeDeProveedor;
  destino: SedeDeProveedor;
  cantidad: number;
  /** Por dónde empezar: las prendas y tallas que la de destino ya vende, sacadas de lo que la de origen tiene. */
  lineas: LineaTraslado[];
};

/**
 * Si una tienda va lenta (le tomaría `SEMANAS_STOCK_LARGO` semanas o más vender lo que tiene) y otra lo vende tan rápido que no le alcanza para
 * `SEMANAS_COBERTURA_TRASLADO` semanas, se sugiere llevar de la primera a la segunda: lo que le falta a la de destino para cubrirlas, sin dejar a
 * la de origen por debajo de las suyas. Solo de prendas que la de destino ya vende. Una sola sugerencia: la del par más claro.
 */
export function trasladoSugerido(celdas: readonly CeldaTallaSede[], hoy: string): TrasladoSugerido | null {
  const { tiendas } = sedesDelProveedor(celdas, hoy);
  const destinos = tiendas.filter((s) => s.ritmo.juzgable && s.ritmo.porSemana > 0 && s.ritmo.semanasParaAgotar < SEMANAS_COBERTURA_TRASLADO);
  const origenes = tiendas.filter((s) => s.ritmo.lento && s.stock > 0);
  const destino = destinos[0]; // la que más vende por semana (`tiendas` ya viene así)
  const origen = [...origenes].filter((s) => s.ubicacionId !== destino?.ubicacionId).sort((a, b) => b.stock - a.stock)[0];
  if (!destino || !origen) return null;

  const falta = Math.ceil(destino.ritmo.porSemana * SEMANAS_COBERTURA_TRASLADO) - destino.stock;
  const leSobra = origen.stock - Math.ceil(origen.ritmo.porSemana * SEMANAS_COBERTURA_TRASLADO);
  const tope = Math.min(falta, leSobra);
  if (tope < MIN_TRASLADO) return null;

  // Lo que la de destino vende de cada prenda (y talla), y lo que la de origen tiene de cada una.
  const vendeDestino = new Map<string, number>();
  const vendeDestinoPrenda = new Map<string, number>();
  for (const c of celdas.filter((x) => x.ubicacionId === destino.ubicacionId && x.vendidas > 0)) {
    vendeDestino.set(`${c.productoId}|${c.talla}`, (vendeDestino.get(`${c.productoId}|${c.talla}`) ?? 0) + c.vendidas);
    vendeDestinoPrenda.set(c.productoId, (vendeDestinoPrenda.get(c.productoId) ?? 0) + c.vendidas);
  }
  const candidatas = celdas
    .filter((c) => c.ubicacionId === origen.ubicacionId && c.stock > 0 && (vendeDestinoPrenda.get(c.productoId) ?? 0) > 0)
    .sort(
      (a, b) =>
        (vendeDestino.get(`${b.productoId}|${b.talla}`) ?? 0) - (vendeDestino.get(`${a.productoId}|${a.talla}`) ?? 0) ||
        (vendeDestinoPrenda.get(b.productoId) ?? 0) - (vendeDestinoPrenda.get(a.productoId) ?? 0) ||
        b.stock - a.stock ||
        a.referencia.localeCompare(b.referencia, "es") ||
        a.talla.localeCompare(b.talla, "es"),
    );
  const lineas: LineaTraslado[] = [];
  let quedan = tope;
  for (const c of candidatas) {
    if (quedan <= 0) break;
    const cantidad = Math.min(c.stock, quedan);
    lineas.push({ productoId: c.productoId, referencia: c.referencia, talla: c.talla, cantidad });
    quedan -= cantidad;
  }
  const cantidad = tope - quedan;
  if (cantidad < MIN_TRASLADO) return null;
  return { origen, destino, cantidad, lineas };
}

/* ───────── La lista: lo de tallas y sedes en pocas palabras ───────── */

/** Una fila de `fn_proveedor_tallas_sedes` como la usan las reglas: la ficha la lee en el servidor y la lista, desde el navegador. */
export function celdaDeFila(f: {
  producto_id: string;
  referencia: string;
  categoria: string | null;
  talla: string;
  ubicacion_id: string;
  sede: string;
  sede_tipo: string;
  vendidas: number | string;
  stock: number | string;
  primera_llegada: string | null;
}): CeldaTallaSede {
  return {
    productoId: f.producto_id,
    referencia: f.referencia,
    categoria: f.categoria,
    talla: f.talla,
    ubicacionId: f.ubicacion_id,
    sede: f.sede,
    sedeTipo: f.sede_tipo,
    vendidas: Number(f.vendidas),
    stock: Number(f.stock),
    primeraLlegada: f.primera_llegada,
  };
}

export type ResumenTallasYSedes = {
  /** Las tallas que pide más y las que sobran (la regla de Análisis); `null` si todo es talla única o no hay nada. */
  tallas: { piden: string[]; sobran: string[]; vendidas: number; mide: boolean } | null;
  /** Cada tienda con su palabra, de la que más vende por semana a la que menos. */
  tiendas: { sede: string; veredicto: VeredictoSede }[];
  /** La tienda que más vende por semana entre las que ya se miden; `null` si ninguna se mide. */
  mejor: { sede: string; veredicto: VeredictoSede } | null;
  traslado: { cantidad: number; origen: string; destino: string } | null;
};

/**
 * Lo de tallas y sedes de UN proveedor en pocas palabras, para la vista rápida y la comparación de la lista (ADR-0521, actividad 6). Las mismas
 * cuentas de la ficha, sin ninguna nueva: con menos de `MIN_VENDIDAS` vendidas, de tallas no se concluye nada (`mide: false`), como en sus avisos.
 */
export function resumenTallasYSedes(celdas: readonly CeldaTallaSede[], hoy: string): ResumenTallasYSedes {
  const curva = curvaDelProveedor(celdas);
  const tallas =
    curva.tipo === "tallas"
      ? {
          piden: curva.columnas.filter((c) => c.pideMas).map((c) => c.talla),
          sobran: curva.columnas.filter((c) => c.sobra).map((c) => c.talla),
          vendidas: curva.vendidas,
          mide: curva.vendidas >= MIN_VENDIDAS,
        }
      : null;
  const tiendas = sedesDelProveedor(celdas, hoy).tiendas.map((t) => ({ sede: t.sede, veredicto: veredictoDeSede(t) }));
  const t = trasladoSugerido(celdas, hoy);
  return {
    tallas,
    tiendas,
    mejor: tiendas.find((x) => x.veredicto !== "sin-medir") ?? null,
    traslado: t ? { cantidad: t.cantidad, origen: t.origen.sede, destino: t.destino.sede } : null,
  };
}

/* ───────── «Lo que quizá no ves» ───────── */

const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Los avisos de tallas y sedes de UN proveedor. */
export function hallazgosDeTallasYSedes(celdas: readonly CeldaTallaSede[], hoy: string): Hallazgo[] {
  const out: Hallazgo[] = [];

  const curva = curvaDelProveedor(celdas);
  if (curva.tipo === "tallas" && curva.vendidas >= MIN_VENDIDAS) {
    const sobran = curva.columnas.filter((c) => c.sobra);
    const piden = curva.columnas.filter((c) => c.pideMas);
    if (sobran.length > 0 || piden.length > 0) {
      const partes = [sobran.length > 0 ? `de más ${enLista(sobran.map((c) => c.talla))}` : null, piden.length > 0 ? `de menos ${enLista(piden.map((c) => c.talla))}` : null].filter(Boolean);
      out.push({
        id: "tallas",
        tono: "atencion",
        titulo: `Le compras ${partes.join(" y ")}`,
        texto: `En el próximo pedido, reparte las tallas como se venden${piden.length > 0 ? `: pídele más ${enLista(piden.map((c) => c.talla))}` : ""}${sobran.length > 0 ? `${piden.length > 0 ? " y" : ":"} menos ${enLista(sobran.map((c) => c.talla))}` : ""}.`,
        numeros: [...sobran, ...piden].map((c) => `Talla ${c.talla}: ${c.v} % de lo que vendes y ${c.t} % de lo que tienes (${num(c.vend)} vendidas, ${num(c.tiene)} en stock)`),
        regla: `Igual que en Análisis: una talla pide más (o sobra) si pesa ${DIFERENCIA_QUE_SE_NOTA} puntos más en lo que vendes que en lo que tienes (o al revés). Con ${MIN_VENDIDAS} vendidas o más del proveedor.${curva.nota ? ` ${curva.nota}.` : ""}`,
        prioridad: 72,
      });
    }
  }

  const t = trasladoSugerido(celdas, hoy);
  if (t) {
    out.push({
      id: "traslado",
      tono: "info",
      titulo: `Lleva ${num(t.cantidad)} de ${t.origen.sede} a ${t.destino.sede}: allá se agota en ${textoSemanas(t.destino.ritmo)}`,
      texto: `En ${t.origen.sede} vender lo que tiene tardaría ${textoSemanas(t.origen.ritmo)}. Antes de comprarle más, mueve lo que ya tienes a donde se vende.`,
      numeros: [
        `${t.destino.sede}: ${unaDecima(t.destino.ritmo.porSemana)} por semana, le quedan ${num(t.destino.stock)}`,
        `${t.origen.sede}: ${unaDecima(t.origen.ritmo.porSemana)} por semana, le quedan ${num(t.origen.stock)}`,
        ...t.lineas.slice(0, 5).map((l) => `${l.referencia} talla ${l.talla}: ${num(l.cantidad)}`),
      ],
      regla: `Una tienda tardaría ${SEMANAS_STOCK_LARGO} semanas o más en vender lo que tiene y otra no tiene para ${SEMANAS_COBERTURA_TRASLADO} semanas: se lleva lo que le falta a la segunda, sin dejar a la primera por debajo de sus ${SEMANAS_COBERTURA_TRASLADO} semanas, y solo de prendas que la segunda ya vende. Cada tienda cuenta desde que le llegó su primera prenda, con ${MIN_COMPRADAS} unidades o más y ${DIAS_PARA_JUZGAR} días. Desde ${MIN_TRASLADO} unidades.`,
      prioridad: 82,
    });
  }

  return out;
}

/** Junta los avisos de la ficha (lo comprado y lo vendido) con los de tallas y sedes: los más importantes primero, hasta `MAX_AVISOS`. */
export function juntarHallazgos(...grupos: readonly (readonly Hallazgo[])[]): Hallazgo[] {
  return grupos
    .flat()
    .sort((a, b) => b.prioridad - a.prioridad)
    .slice(0, MAX_AVISOS);
}
