import { UNIDADES_INSUMO } from "./insumos-reglas";
import { leerDinero } from "./modelo-nuevo-reglas";
import { compararTallas } from "./tallas";

// «Tela», el bloque nuevo de la hoja «Nueva orden de producción» (ADR-0400, decisión 6; actividad 2): las reglas puras. Sin React ni Supabase.
//
// EL PROBLEMA PRIMERO: la orden no sabía qué tela llevaba (tres montos tecleados) y «¿alcanza la tela?» callaba. Ahora la orden elige el tejido del
// modelo → la tela de ese color en Insumos → metros a pedir = consumo por prenda × prendas × (1 + merma de la tela), y el consumo se escribe una vez
// en el modelo (`producto_consumos`, lo que calcula Audaces) y lo real lo corrige al cerrar.
//
// LA BASE MANDA: `fn_produccion_insumos_normalizar` (migración 20261014154000) valida otra vez y rechaza con un `hint` estable. `problemasTela` NO
// agrega reglas (CLAUDE.md «Guía de foco», punto 5): una orden SIN tela es válida (la base acepta `p_insumos` nulo o vacío), y la prueba lee la
// migración y exige que cada `hint` de acá exista allá.
//
// CONTRATO
//   PROMETE: que si `problemasTela` no dice nada, `insumosParaRpc` arma un `p_insumos` que la base acepta (cada tela existe y no está archivada, su
//            color es uno que la orden fabrica, el consumo es un número entre 0 y 9999, y la misma tela va una vez por color); y al revés.
//            Que `metrosAPedir` redondea a 3 decimales como `cantidad_plan`.
//   ASUME:   `mermaPct` es FRACCIÓN (0.05 = 5 %), como `insumos.merma_pct`; el consumo llega como TEXTO y se lee ESTRICTO (`leerDinero`, la misma
//            lectura que el precio de esta hoja: solo dígitos y un punto).
//   NO HACE: no decide qué lote se descuenta (eso es `registrar_consumo_insumo`, al cerrar Corte) ni escribe `producto_consumos` (lo hace la base).
//
// CONSUMO POR TALLA (ADR-0513, actividad 2). Una fila de tela o avío puede llevar `porTalla` (talla → consumo): entonces el plan es Σ (consumo de la talla × prendas de esa
// talla del color de la fila) × (1 + merma), igual que `fn_produccion_insumos_normalizar` (migración 20261026151000), y `consumoPorPrenda` deja de mandar. Sin `porTalla`, UNA cifra para
// todas las tallas: es el caso «aproximado». Solo se ofrece por talla donde la fila fabrica dos tallas o más.

export type InsumoDelTaller = {
  id: string;
  nombre: string;
  tipo: "tela" | "avio";
  /** `insumos.unidad_medida`: metro, unidad, kilo… */
  unidad: string;
  tejidoId: string | null;
  colorCodigo: string | null;
  /** Lo que hay en el estante (Σ lotes − consumos), en su unidad. */
  saldo: number;
  /** Fracción: 0.05 = 5 % (`insumos.merma_pct`). */
  mermaPct: number;
  archivado: boolean;
};

/** Una fila del bloque. `colorCodigo` null = para toda la orden (el hilo, los botones). El consumo va como TEXTO, igual que la caja. */
export type TelaBorrador = {
  insumoId: string | null;
  colorCodigo: string | null;
  consumoPorPrenda: string;
  /** Una cifra por talla (talla → texto). Nulo o ausente = una sola cifra para todas las tallas (aproximado). Si está, `consumoPorPrenda` no manda. */
  porTalla?: Record<string, string> | null;
};

export type TallaDeLaOrden = { talla: string; cantidad: number };
/** `tallas` son las tallas del color con prendas, de la más chica a la más grande; vacío si alguna línea del color no dice su talla (entonces no hay «por talla»). */
export type ColorDeLaOrden = { colorCodigo: string | null; cantidad: number; tallas: TallaDeLaOrden[] };

/** Los colores que la orden fabrica, con cuántas prendas de cada uno (y de cada talla), en el orden en que aparecen. Un color con 0 prendas no existe para la tela
 *  (la base lo rechaza: `insumo_color_ajeno`). Un modelo sin colores es un solo «color» nulo. */
export function coloresDeLaOrden(lineas: readonly { colorCodigo: string | null; cantidad: number; talla?: string | null }[]): ColorDeLaOrden[] {
  const suma = new Map<string | null, { cantidad: number; tallas: Map<string, number>; sinTalla: boolean }>();
  for (const l of lineas) {
    const n = Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 0;
    const c = suma.get(l.colorCodigo) ?? { cantidad: 0, tallas: new Map<string, number>(), sinTalla: false };
    c.cantidad += n;
    if (n > 0) {
      if (l.talla) c.tallas.set(l.talla, (c.tallas.get(l.talla) ?? 0) + n);
      else c.sinTalla = true;
    }
    suma.set(l.colorCodigo, c);
  }
  return [...suma]
    .filter(([, c]) => c.cantidad > 0)
    .map(([colorCodigo, c]) => ({
      colorCodigo,
      cantidad: c.cantidad,
      tallas: c.sinTalla ? [] : [...c.tallas].sort(([a], [b]) => compararTallas(a, b)).map(([talla, cantidad]) => ({ talla, cantidad })),
    }));
}

/** Las tallas de una fila con sus prendas: las de su color, o las de todos los colores juntas si es de toda la orden (color vacío). Vacío si no se puede saber (una línea sin talla). */
export function tallasDeLaFila(colorCodigo: string | null, colores: readonly ColorDeLaOrden[]): TallaDeLaOrden[] {
  if (colorCodigo !== null) return colores.find((c) => c.colorCodigo === colorCodigo)?.tallas ?? [];
  if (colores.some((c) => c.tallas.length === 0)) return [];
  const suma = new Map<string, number>();
  for (const c of colores) for (const t of c.tallas) suma.set(t.talla, (suma.get(t.talla) ?? 0) + t.cantidad);
  return [...suma].sort(([a], [b]) => compararTallas(a, b)).map(([talla, cantidad]) => ({ talla, cantidad }));
}

/** ¿Esta fila puede llevar una cifra por talla? Cuando la orden fabrica dos tallas o más de ese color (con una sola, una cifra ya ES la de la talla). */
export const admitePorTalla = (tallas: readonly TallaDeLaOrden[]): boolean => tallas.length >= 2;

/**
 * Una tela por color de la orden: la del estante que es de ese tejido y de ese color; si no la hay, la de ese tejido sin color; si tampoco, la fila
 * queda sin tela (la persona elige). Nunca una archivada. Entre varias que calcen gana la de más saldo (la que de verdad puede surtir). Sin tejido en el
 * modelo no se adivina nada: proponer una tela de otro tejido por el color sería afirmar algo que no se sabe.
 */
export function telasSugeridas(o: {
  tejidoId: string | null;
  colores: readonly ColorDeLaOrden[];
  insumos: readonly InsumoDelTaller[];
  consumo?: string;
  /** La cifra por talla del modelo (ya a la escala de lo que manda, `consumoPorTallaSugerido`): se propone solo si cubre TODAS las tallas del color. */
  porTalla?: Readonly<Record<string, number>> | null;
}): TelaBorrador[] {
  const telas = o.tejidoId ? o.insumos.filter((i) => i.tipo === "tela" && !i.archivado && i.tejidoId === o.tejidoId) : [];
  const mejor = (candidatas: InsumoDelTaller[]) => candidatas.reduce<InsumoDelTaller | null>((m, i) => (m === null || i.saldo > m.saldo ? i : m), null);
  return o.colores.map((c) => {
    const delColor = c.colorCodigo === null ? null : mejor(telas.filter((i) => i.colorCodigo === c.colorCodigo));
    const sinColor = mejor(telas.filter((i) => i.colorCodigo === null));
    const fila: TelaBorrador = { insumoId: (delColor ?? sinColor)?.id ?? null, colorCodigo: c.colorCodigo, consumoPorPrenda: o.consumo ?? "" };
    const deLaTalla = (talla: string) => o.porTalla?.[talla] ?? 0;
    if (o.porTalla && admitePorTalla(c.tallas) && c.tallas.every((t) => deLaTalla(t.talla) > 0)) {
      fila.porTalla = Object.fromEntries(c.tallas.map((t) => [t.talla, deLaTalla(t.talla).toFixed(3)]));
    }
    return fila;
  });
}

/**
 * Lo que el modelo dice que lleva, tal como lo entrega `fn_nueva_orden_opciones` (ADR-0513):
 *  · `telaPorPrenda` y `fuente`: lo que MANDA hoy (lo declarado, o lo medido si ya hay 3 órdenes cerradas desde la última declaración);
 *  · `porTalla`: la forma que declaró Audaces (talla → metros), si la hay;
 *  · `declaradoPorPrenda`, `medidoPorPrenda`, `ordenesMedidas`: de dónde sale lo que manda.
 */
export type ConsumoDelModelo = {
  telaPorPrenda: number;
  fuente: "declarado" | "medido";
  porTalla?: Readonly<Record<string, number>> | null;
  declaradoPorPrenda?: number | null;
  medidoPorPrenda?: number | null;
  ordenesMedidas?: number;
};

/** Lo que el modelo dice que lleva (`producto_consumos`), listo para la caja: «1.200». Vacío si el modelo todavía no lo sabe. */
export function consumoSugerido(declarado: ConsumoDelModelo | null): string {
  if (!declarado || !Number.isFinite(declarado.telaPorPrenda) || declarado.telaPorPrenda <= 0) return "";
  return declarado.telaPorPrenda.toFixed(3);
}

/**
 * La cifra por talla del modelo a la escala de lo que manda: si manda lo medido, la FORMA es la de Audaces (la tela se mide por orden, no por talla) y solo el nivel
 * sube —cada talla × (medido ÷ declarado)—. Null si el modelo no declaró cifra por talla.
 */
export function consumoPorTallaSugerido(declarado: ConsumoDelModelo | null): Record<string, number> | null {
  if (!declarado?.porTalla || Object.keys(declarado.porTalla).length === 0) return null;
  const base = declarado.declaradoPorPrenda ?? 0;
  const k = declarado.fuente === "medido" && base > 0 ? declarado.telaPorPrenda / base : 1;
  return Object.fromEntries(Object.entries(declarado.porTalla).map(([talla, v]) => [talla, aMilesimas(v * k)]));
}

/**
 * El consumo de la primera tela de la orden contra lo que ya dice el modelo (`producto_consumos`), para el interruptor «Dejar este consumo como el del modelo» (Felipe, 2026-10-15).
 *  · `ninguna`: no hay tela con consumo escrito, o lo escrito es lo mismo que dice el modelo: no hay nada que ofrecer.
 *  · `primera`: el modelo todavía no dice nada; esta orden lo deja declarado sola (sin interruptor ni permiso: es lo de siempre).
 *  · `corregir`: el modelo dice otra cosa. Corregirlo es de quien edita el catálogo; a los demás se les dice que solo esta orden usa lo escrito.
 * Solo cuenta la PRIMERA tela (la base escribe una sola, `producto_consumos.tela_por_prenda`); un avío no cuenta.
 */
export type OfertaDeConsumo =
  | { tipo: "ninguna" }
  | { tipo: "primera"; nuevo: number; unidad: string }
  | { tipo: "corregir"; nuevo: number; actual: number; fuente: "declarado" | "medido"; unidad: string };

export function ofertaDeConsumoDelModelo(
  telas: readonly TelaBorrador[],
  insumos: readonly InsumoDelTaller[],
  declarado: ConsumoDelModelo | null,
  colores: readonly ColorDeLaOrden[] = [],
): OfertaDeConsumo {
  for (const t of telas) {
    const insumo = t.insumoId ? insumos.find((i) => i.id === t.insumoId) : undefined;
    if (!insumo || insumo.tipo !== "tela") continue;
    const tallas = tallasDeLaFila(t.colorCodigo, colores);
    const nuevo = consumoPromedio(t, tallas);
    if (nuevo === null) continue;
    if (!declarado || !(declarado.telaPorPrenda > 0)) return { tipo: "primera", nuevo, unidad: insumo.unidad };
    // Con cifra por talla de por medio se compara la FORMA (el promedio de una orden depende de sus tallas y no dice nada del modelo); con una sola cifra, la cifra.
    const formaNueva = consumosPorTalla(t, tallas);
    const formaModelo = consumoPorTallaSugerido(declarado);
    const igual = formaNueva && formaModelo ? mismaForma(formaNueva, formaModelo) : !formaNueva && !formaModelo && aMilesimas(nuevo) === aMilesimas(declarado.telaPorPrenda);
    return igual ? { tipo: "ninguna" } : { tipo: "corregir", nuevo, actual: declarado.telaPorPrenda, fuente: declarado.fuente, unidad: insumo.unidad };
  }
  return { tipo: "ninguna" };
}

const mismaForma = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean => {
  const llaves = Object.keys(a);
  return llaves.length === Object.keys(b).length && llaves.every((k) => k in b && aMilesimas(a[k]) === aMilesimas(b[k]));
};

/** A tres decimales como la base (`round(x, 3)` de numeric: la mitad sube). `toPrecision(15)` quita el ruido binario (1.2 × 30 × 1.05 = 37.800000000000004). */
export function aMilesimas(n: number): number {
  return Math.round(Number((n * 1000).toPrecision(15))) / 1000;
}

/** El consumo escrito como número (> 0), o null si no se puede leer. El tope de 9999 lo dice `problemasTela`; acá solo se lee. */
export function leerConsumo(texto: string | number): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) && texto > 0 ? texto : null;
  const l = leerDinero(texto);
  return l.tipo === "ok" && l.valor > 0 ? l.valor : null;
}

/** `cantidad_plan` de la base: consumo × prendas × (1 + merma), a 3 decimales. null si el consumo no es un número mayor que cero. */
export function metrosAPedir(consumo: string | number, prendas: number, mermaPct: number): number | null {
  const c = leerConsumo(consumo);
  if (c === null) return null;
  const merma = Number.isFinite(mermaPct) && mermaPct > 0 ? mermaPct : 0;
  return aMilesimas(c * Math.max(prendas, 0) * (1 + merma));
}

// ---------- Consumo por talla ----------

/** ¿Esta fila lleva una cifra por talla? Solo si la tiene escrita Y la fila fabrica dos tallas o más (si no, manda la única cifra). */
export const usaPorTalla = (t: TelaBorrador, tallas: readonly TallaDeLaOrden[]): boolean => t.porTalla != null && admitePorTalla(tallas);

/** Una cifra mayor que cero por CADA talla de la fila, o null si falta alguna o no se lee. Las llaves de más (una talla que la orden ya no fabrica) se ignoran. */
export function consumosPorTalla(t: TelaBorrador, tallas: readonly TallaDeLaOrden[]): Record<string, number> | null {
  if (!usaPorTalla(t, tallas)) return null;
  const salida: Record<string, number> = {};
  for (const x of tallas) {
    const c = leerConsumo(t.porTalla?.[x.talla] ?? "");
    if (c === null) return null;
    salida[x.talla] = c;
  }
  return salida;
}

/** El consumo por prenda de la fila: su única cifra, o —por talla— el promedio ponderado por las prendas de cada talla (3 decimales, como lo guarda la base). */
export function consumoPromedio(t: TelaBorrador, tallas: readonly TallaDeLaOrden[]): number | null {
  if (!usaPorTalla(t, tallas)) return leerConsumo(t.consumoPorPrenda);
  const c = consumosPorTalla(t, tallas);
  if (!c) return null;
  const peso = tallas.reduce((s, x) => s + x.cantidad, 0);
  return peso > 0 ? aMilesimas(tallas.reduce((s, x) => s + c[x.talla] * x.cantidad, 0) / peso) : null;
}

/** `cantidad_plan` de la base para una fila: con cifra por talla, Σ (cifra de la talla × prendas de la talla) × (1 + merma); si no, consumo × prendas × (1 + merma). */
export function planDeFila(t: TelaBorrador, tallas: readonly TallaDeLaOrden[], prendas: number, mermaPct: number): number | null {
  if (!usaPorTalla(t, tallas)) return metrosAPedir(t.consumoPorPrenda, prendas, mermaPct);
  const c = consumosPorTalla(t, tallas);
  if (!c) return null;
  const merma = Number.isFinite(mermaPct) && mermaPct > 0 ? mermaPct : 0;
  return aMilesimas(tallas.reduce((s, x) => s + c[x.talla] * x.cantidad, 0) * (1 + merma));
}

/** «Separar por talla»: cada talla parte de la cifra única que ya había (o de la que ya tenía escrita). Sin dos tallas, no hace nada. */
export function separarPorTalla(t: TelaBorrador, tallas: readonly TallaDeLaOrden[]): TelaBorrador {
  if (!admitePorTalla(tallas)) return t;
  const base = t.consumoPorPrenda.trim();
  return { ...t, porTalla: Object.fromEntries(tallas.map((x) => [x.talla, t.porTalla?.[x.talla] ?? base])) };
}

/** «Una cifra»: vuelve a una sola cifra, el promedio de lo que había por talla (si se lee; si no, la que estaba). */
export function unirEnUnaCifra(t: TelaBorrador, tallas: readonly TallaDeLaOrden[]): TelaBorrador {
  const promedio = usaPorTalla(t, tallas) ? consumoPromedio(t, tallas) : null;
  return { ...t, consumoPorPrenda: promedio !== null ? promedio.toFixed(3) : t.consumoPorPrenda, porTalla: null };
}

export type VeredictoTela = {
  alcanza: boolean;
  /** Lo que falta CONTANDO lo que viene en camino. */
  faltan: number;
  /** Lo que faltaría sin contar lo que viene (el estante solo). */
  faltanSinLoQueViene: number;
  /** Alcanza, pero solo gracias a lo que viene en camino (el estante solo no alcanza). */
  conLoQueViene: boolean;
};

/**
 * «Alcanza» o «faltan N m»: el plan contra lo que queda libre en el estante (saldo − lo que otras órdenes abiertas ya comprometieron) MÁS lo que viene en camino (`enCamino`: lo que
 * falta recibir de los pedidos, sin los atrasados; regla de Felipe del 2026-10-16, la cuenta de `fn_tela_en_camino`). Sin `enCamino` es el veredicto de siempre. Un número roto o
 * negativo no cuenta como tela que viene.
 */
export function veredictoTela(plan: number, saldo: number, comprometido: number, enCamino = 0): VeredictoTela {
  const libre = (Number.isFinite(saldo) ? saldo : 0) - (Number.isFinite(comprometido) ? comprometido : 0);
  const viene = Number.isFinite(enCamino) && enCamino > 0 ? enCamino : 0;
  const faltanSinLoQueViene = aMilesimas(Math.max(plan - libre, 0));
  const faltan = aMilesimas(Math.max(plan - libre - viene, 0));
  return { alcanza: faltan === 0, faltan, faltanSinLoQueViene, conLoQueViene: faltan === 0 && faltanSinLoQueViene > 0 };
}

// ---------- Lo que falta (solo lo que la base rechaza) ----------

/** Los `hint` de `fn_produccion_insumos_normalizar`. Todos pueden pasar desde la hoja; la prueba exige que existan en la migración. */
export const HINTS_TELA = ["insumo_invalido", "insumo_archivado", "insumo_color_ajeno", "insumo_consumo_invalido", "insumo_repetido"] as const;
export type HintTela = (typeof HINTS_TELA)[number];

/** Los `hint` que la base dice pero la hoja nunca provoca: `insumo_talla_ajena` (una cifra de una talla que la orden no fabrica) no pasa porque `insumosParaRpc` manda solo las tallas de la fila. */
export const HINTS_SOLO_BASE = ["insumo_talla_ajena"] as const;

/** `indice` es la posición de la fila en `telas` (una fila no tiene otra identidad hasta que se guarda). */
/** `talla` dice de qué talla es la falta cuando el consumo va por talla (la hoja la pone bajo su caja). */
export type ProblemaTela = { indice: number; hint: HintTela; texto: string; talla?: string };

/** El tope de `fn_produccion_insumos_normalizar` (`v_consumo > 9999`): la prueba lo compara con la migración. */
export const CONSUMO_MAXIMO = 9999;

const colorLimpio = (c: string | null) => (c === null ? null : c.trim() === "" ? null : c.trim());

/**
 * Lo que la base rechazaría de las filas que viajan (las que ya tienen tela elegida), en el orden en que la base lo mira: la tela existe y no está
 * archivada → su color es uno que la orden fabrica (con prendas) → el consumo es un número entre 0 y 9999 → la misma tela no se repite para el mismo
 * color. Una fila sin tela no viaja y no es una falta: la orden puede abrirse sin tela declarada.
 */
export function problemasTela(telas: readonly TelaBorrador[], ctx: { insumos: readonly InsumoDelTaller[]; colores: readonly ColorDeLaOrden[] }): ProblemaTela[] {
  const porId = new Map(ctx.insumos.map((i) => [i.id, i] as const));
  const fabrica = new Set(ctx.colores.filter((c) => c.cantidad > 0).map((c) => c.colorCodigo).filter((c): c is string => c !== null));
  const vistas = new Set<string>();
  const problemas: ProblemaTela[] = [];
  telas.forEach((t, indice) => {
    if (!t.insumoId) return;
    const di = (hint: HintTela, texto: string) => problemas.push({ indice, hint, texto });
    const insumo = porId.get(t.insumoId);
    const nombre = insumo ? `«${insumo.nombre}»` : "esa tela";
    if (!insumo) di("insumo_invalido", "Esa tela o avío no está en Insumos.");
    else if (insumo.archivado) di("insumo_archivado", `${nombre} está archivada en Insumos: elige otra o desarchívala.`);

    const color = colorLimpio(t.colorCodigo);
    if (color !== null && !fabrica.has(color)) di("insumo_color_ajeno", `La orden no fabrica el color «${color}»: ${nombre} no tiene a qué aplicarse.`);

    const tallas = tallasDeLaFila(color, ctx.colores);
    if (usaPorTalla(t, tallas)) {
      // Por talla: una cifra por cada talla de la fila (las llaves de más no viajan). El texto dice de qué talla es.
      for (const x of tallas) {
        const lt = leerDinero(t.porTalla?.[x.talla] ?? "");
        const dt = (texto: string) => problemas.push({ indice, hint: "insumo_consumo_invalido", texto, talla: x.talla });
        if (lt.tipo === "coma") dt(`Escribe el consumo de la talla ${x.talla} de ${nombre} con punto, por ejemplo 1.200.`);
        else if (lt.tipo === "invalido") dt(`El consumo de la talla ${x.talla} de ${nombre} tiene que ser un número, por ejemplo 1.200.`);
        else if (lt.tipo === "vacio") dt(`Escribe cuánto lleva cada prenda de la talla ${x.talla} de ${nombre}, por ejemplo 1.200.`);
        else if (lt.tipo === "negativo" || lt.valor <= 0) dt(`El consumo de la talla ${x.talla} de ${nombre} tiene que ser mayor que cero.`);
        else if (lt.valor > CONSUMO_MAXIMO) dt(`El consumo de la talla ${x.talla} de ${nombre} no puede pasar de ${CONSUMO_MAXIMO}.`);
      }
    } else {
      const l = leerDinero(t.consumoPorPrenda);
      if (l.tipo === "coma") di("insumo_consumo_invalido", `Escribe el consumo por prenda de ${nombre} con punto, por ejemplo 1.200.`);
      else if (l.tipo === "invalido") di("insumo_consumo_invalido", `El consumo por prenda de ${nombre} tiene que ser un número, por ejemplo 1.200.`);
      else if (l.tipo === "vacio") di("insumo_consumo_invalido", `Escribe cuánto lleva cada prenda de ${nombre}, por ejemplo 1.200.`);
      else if (l.tipo === "negativo" || l.valor <= 0) di("insumo_consumo_invalido", `El consumo por prenda de ${nombre} tiene que ser mayor que cero.`);
      else if (l.valor > CONSUMO_MAXIMO) di("insumo_consumo_invalido", `El consumo por prenda de ${nombre} no puede pasar de ${CONSUMO_MAXIMO}.`);
    }

    const llave = `${t.insumoId}\u0000${color ?? ""}`;
    if (vistas.has(llave)) di("insumo_repetido", `${nombre} ya está en la orden${color ? ` para el color «${color}»` : ""}: la misma tela va una sola vez por color.`);
    vistas.add(llave);
  });
  return problemas;
}

// ---------- Lo que viaja a la base ----------

export type InsumoRpc = { insumo_id: string; color_codigo: string | null; consumo_por_prenda?: string; consumo_por_talla?: Record<string, string> };

/** El `p_insumos` de `abrir_orden_produccion`: solo las filas con tela elegida; el consumo viaja como texto, tal cual se escribió (recortado), para que la
 *  base lo lea con su propia regla y nunca se «arregle» en silencio. Una fila por talla manda `consumo_por_talla` (solo las tallas que la fila fabrica) y NO
 *  `consumo_por_prenda`: la base calcula el plan por talla y el promedio. */
export function insumosParaRpc(telas: readonly TelaBorrador[], colores: readonly ColorDeLaOrden[] = []): InsumoRpc[] {
  const salida: InsumoRpc[] = [];
  for (const t of telas) {
    if (!t.insumoId) continue;
    const color = colorLimpio(t.colorCodigo);
    const tallas = tallasDeLaFila(color, colores);
    if (usaPorTalla(t, tallas)) {
      salida.push({ insumo_id: t.insumoId, color_codigo: color, consumo_por_talla: Object.fromEntries(tallas.map((x) => [x.talla, (t.porTalla?.[x.talla] ?? "").trim()])) });
    } else {
      salida.push({ insumo_id: t.insumoId, color_codigo: color, consumo_por_prenda: t.consumoPorPrenda.trim() });
    }
  }
  return salida;
}

// ---------- La lista de la hoja: filas por color y avíos ----------

const esAvioElegido = (t: TelaBorrador, insumos: readonly InsumoDelTaller[]): boolean => (t.insumoId ? insumos.find((i) => i.id === t.insumoId)?.tipo === "avio" : false);

/**
 * La lista de tela y avíos que dibuja la hoja de «Nueva orden» (ADR-0510): una fila por color de la orden —lo que la persona tocó, o la tela sugerida si no ha tocado
 * nada de ese color— y después los avíos. Un avío se reconoce por su TIPO en Insumos, no por no tener color: puede ser de toda la orden (color vacío) o de UN color (el hilo
 * del beige), y una fila de avío todavía sin elegir (`insumoId` nulo, recién agregada) sigue ahí para que la persona la llene. Una fila que no es de ningún color de la orden
 * (la tela de un color que ya no se fabrica) se descarta, como una de avío cuyo color ya no se fabrica.
 */
export function telasDeLaHoja(o: { sugeridas: readonly TelaBorrador[]; manual: readonly TelaBorrador[] | null; insumos: readonly InsumoDelTaller[] }): TelaBorrador[] {
  if (o.manual === null) return [...o.sugeridas];
  const filasDeColor = o.sugeridas.map((s) => o.manual?.find((p) => !esAvioElegido(p, o.insumos) && p.colorCodigo === s.colorCodigo) ?? s);
  const elegidas = new Set<TelaBorrador>(filasDeColor);
  const coloresDeLaOrden = new Set(o.sugeridas.map((s) => s.colorCodigo));
  const avios = o.manual.filter((p) => !elegidas.has(p) && (p.insumoId === null ? p.colorCodigo === null : esAvioElegido(p, o.insumos) && (p.colorCodigo === null || coloresDeLaOrden.has(p.colorCodigo))));
  return [...filasDeColor, ...avios];
}

/** Cuántas prendas lleva una fila: las de su color, o todas las de la orden si es de toda la orden (color vacío). Un color que la orden no fabrica no lleva ninguna. */
export function prendasDeLaFila(colorCodigo: string | null, colores: readonly { codigo: string | null; prendas: number }[]): number {
  const total = colores.reduce((s, c) => s + (Number.isFinite(c.prendas) && c.prendas > 0 ? c.prendas : 0), 0);
  if (colorCodigo === null) return total;
  return colores.find((c) => c.codigo === colorCodigo)?.prendas ?? 0;
}

/**
 * Lo que de verdad se pide de un plan: el plan redondeado HACIA ARRIBA a lo que la unidad admite (metros a un decimal, kilos a dos, conos y unidades enteros). Un plan de 0.24 conos de hilo se
 * pide como 1 cono, no como «0 conos»; y 15.12 m se piden como 15.2 m, nunca 15.1 (faltarían 2 cm). El plan guardado en la base no cambia: esto es lo que se dice y lo que se lleva a pedir.
 */
export function cantidadAPedir(n: number, unidad: string): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const decimales = unidad in UNIDADES_INSUMO ? UNIDADES_INSUMO[unidad as keyof typeof UNIDADES_INSUMO].decimales : 1;
  const f = 10 ** decimales;
  // `toPrecision` quita el ruido binario (0.6000000000000001 × 10 no debe subir a 7).
  return Math.ceil(Number((n * f).toPrecision(12))) / f;
}
