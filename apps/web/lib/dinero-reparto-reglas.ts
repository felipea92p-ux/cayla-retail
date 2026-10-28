// Cuentas y dinero ▸ Dónde está: el resumen de arriba, un círculo que es TODA la plata de CAYLA y se parte en los lugares donde está
// (Felipe 2026-10-28, que pidió presentarla como un informe y, al verla con datos reales, que cada parte se viera con su color y que
// «CAYLA entera» no fuera un solo bloque). Lógica pura: no suma plata que la base no haya sumado, solo toma las cuentas que ya armó
// `gruposDeDinero` y decide qué porción del círculo le toca a cada una y de qué color.
//
// Cada porción es una cuenta (un banco, el efectivo de una tienda, lo que está en camino): así el banco grande no se esconde detrás de
// un rótulo de «CAYLA entera». El color dice a qué familia pertenece: verdes para CAYLA entera (los bancos), terracotas para las
// tiendas y el Taller (una pareja de tonos por sede) y pizarra para lo que está en camino. Siempre tokens (ADR-0169), nunca un hex.
//
// Un círculo reparte un total entre partes que valen MÁS que cero. Una cuenta con saldo negativo no cabe en una porción: se dice aparte, y
// el total resta lo negativo para que coincida con el «Tienes» de la cabecera. Una cuenta en cero no se dibuja. El círculo está siempre,
// también con una sola cuenta con plata (un anillo entero) o con ninguna (un anillo vacío): que el gráfico desaparezca al cambiar de
// sede confunde más que un anillo que dice «toda la plata está en un solo lugar» (Felipe, 2026-10-28, viendo Lima).

import { GRUPO_CAMINO, GRUPO_EMPRESA, type GrupoCuentas } from "./dinero-telar-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PorcionReparto = {
  id: string;
  titulo: string;
  /** La sede a la que pertenece («Tienda TRU»), o nulo si se explica sola («BCP Empresa»). */
  lugar: string | null;
  monto: number;
  /** Cuánto del círculo, de 0 a 100, exacto. */
  pct: number;
  /** El mismo porcentaje en enteros que SUMAN 100 (si no, un círculo de tres tercios diría 33 + 33 + 33). Cero si pesa menos de 1 %. */
  pctEntero: number;
  /** Un color hecho con tokens de la paleta, nunca un hex. */
  color: string;
  /** Dónde empieza y termina en grados desde arriba, en el sentido del reloj; la primera empieza en 0 y la última acaba en 360. */
  desde: number;
  hasta: number;
};

export type RepartoDeDinero = {
  /** De quién es la plata: el nombre de la sede cuando se mira una sola («Tienda LIM»), nulo cuando se miran todas (CAYLA entera). */
  alcance: string | null;
  /** Agrupadas por sede (la que más tiene primero) y, dentro de cada una, de la que más tiene a la que menos: así se lee un informe. */
  porciones: PorcionReparto[];
  /** Las cuentas con saldo negativo: no entran al círculo. */
  aparte: { id: string; titulo: string; lugar: string | null; monto: number }[];
  /** Lo que suman las porciones. */
  enCuentas: number;
  /** Todo, restando lo negativo: es el «Tienes» de la cabecera. */
  neto: number;
  /** Alguna cuenta tiene un saldo que no le toca ver a quien mira: lo que suma no lo incluye. */
  ocultos: boolean;
};

// ---- El color --------------------------------------------------------------------------------------------------------------------

type Familia = { principal: string; cuentas: readonly string[] };

/** CAYLA entera en verdes: el hondo de los bancos grandes, el verde claro de CAYLA y la menta para lo que suma poco (el efectivo del líder). */
const VERDES: Familia = { principal: "verde", cuentas: ["reparto-menta", "verde", "reparto-verde-claro"] };
/** Lo que viene en camino, en pizarra. */
const PIZARRAS: Familia = { principal: "pizarra", cuentas: ["pizarra", "reparto-pizarra-claro"] };
/** Una pareja de terracotas por sede, en el orden de la lista de ubicaciones: el cajón y, junto a él, su caja fuerte. Con más sedes que parejas se repiten desde la primera. */
const PAREJAS_DE_SEDE: readonly (readonly [string, string])[] = [
  ["rojo", "reparto-arcilla"],
  ["rojo-profundo", "taupe"],
  ["reparto-ocre", "reparto-terracota"],
  ["taupe", "reparto-ocre"],
];

/** La familia de color de un grupo: CAYLA entera en verdes, lo que está en camino en pizarra y cada sede en su pareja de terracotas. */
function familiaDe(g: Pick<GrupoCuentas, "clave" | "posicion">): Familia {
  if (g.clave === GRUPO_EMPRESA) return VERDES;
  if (g.clave === GRUPO_CAMINO) return PIZARRAS;
  if (g.posicion < 0) return { principal: "taupe", cuentas: ["taupe"] };
  const pareja = PAREJAS_DE_SEDE[g.posicion % PAREJAS_DE_SEDE.length]!;
  return { principal: pareja[0], cuentas: pareja };
}

const token = (nombre: string) => `var(--color-${nombre})`;

/** El color con el que se distingue un grupo: el más firme de su familia. Es el de su punto en la tarjeta. */
export function colorDeGrupoEnReparto(g: Pick<GrupoCuentas, "clave" | "posicion">): string {
  return token(familiaDe(g).principal);
}

/** El color de la cuenta que ocupa el lugar `indice` (0, 1, 2…, en el orden en que la tarjeta la lista) dentro de su grupo. No depende del saldo: una cuenta no cambia de color porque hoy tenga más o menos plata. */
export function colorDeCuentaEnReparto(g: Pick<GrupoCuentas, "clave" | "posicion">, indice: number): string {
  const { cuentas } = familiaDe(g);
  return token(cuentas[indice % cuentas.length]!);
}

// ---- El reparto ------------------------------------------------------------------------------------------------------------------

/**
 * Reparte 100 en enteros por el método del mayor resto: la suma da siempre 100 y a nadie se le quita de más. Lo que pesa menos de
 * 1 % queda en cero (el círculo dice «<1 %») y no participa del reparto: no se le regala un punto que otra porción necesita.
 */
export function porcentajesEnteros(partes: readonly number[]): number[] {
  const total = partes.reduce((a, b) => a + b, 0);
  if (total <= 0) return partes.map(() => 0);
  const exactos = partes.map((p) => (p / total) * 100);
  const base = exactos.map((e) => (e < 1 ? 0 : Math.floor(e)));
  let faltan = 100 - base.reduce((a, b) => a + b, 0);
  const porResto = exactos
    .map((e, i) => ({ i, e, resto: e - base[i]! }))
    .filter((x) => x.e >= 1)
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    base[i]! += 1;
    faltan -= 1;
  }
  return base;
}

/** Lo que dice de dónde es una cuenta: la sede, si es de una; las de CAYLA entera y las que están en camino se explican solas. */
const lugarDe = (g: Pick<GrupoCuentas, "clave" | "titulo">) => (g.clave === GRUPO_EMPRESA || g.clave === GRUPO_CAMINO ? null : g.titulo);

/** El resumen de «Dónde está», o nulo si no hay ningún grupo de cuentas (la pantalla dice entonces que faltan las cuentas). */
export function repartoDeDinero(grupos: readonly GrupoCuentas[]): RepartoDeDinero | null {
  if (grupos.length === 0) return null;
  type Cuenta = { id: string; titulo: string; lugar: string | null; monto: number; color: string; suma: number };
  const positivas: Cuenta[][] = [];
  const aparte: RepartoDeDinero["aparte"] = [];
  for (const g of grupos) {
    const lugar = lugarDe(g);
    const mias: Cuenta[] = [];
    g.filas.forEach((f, i) => {
      if (f.saldo === null) return;
      if (f.saldo < 0) aparte.push({ id: f.id, titulo: f.nombre, lugar, monto: f.saldo });
      else if (f.saldo > 0) mias.push({ id: f.id, titulo: f.nombre, lugar, monto: f.saldo, color: colorDeCuentaEnReparto(g, i), suma: 0 });
    });
    if (mias.length === 0) continue;
    const suma = r2(mias.reduce((a, c) => a + c.monto, 0));
    positivas.push(mias.map((c) => ({ ...c, suma })).sort((a, b) => b.monto - a.monto));
  }
  const cuentas = positivas.sort((a, b) => b[0]!.suma - a[0]!.suma).flat();
  const enCuentas = r2(cuentas.reduce((a, c) => a + c.monto, 0));
  const enteros = porcentajesEnteros(cuentas.map((c) => c.monto));
  let acumulado = 0;
  const porciones = cuentas.map((c, i) => {
    const desde = acumulado;
    acumulado += (c.monto / enCuentas) * 360;
    return {
      id: c.id,
      titulo: c.titulo,
      lugar: c.lugar,
      monto: c.monto,
      pct: (c.monto / enCuentas) * 100,
      pctEntero: enteros[i]!,
      color: c.color,
      desde,
      hasta: i === cuentas.length - 1 ? 360 : acumulado,
    };
  });
  return {
    alcance: grupos.length === 1 ? grupos[0]!.titulo : null,
    porciones,
    aparte,
    enCuentas,
    neto: r2(grupos.reduce((a, g) => a + g.total, 0)),
    ocultos: grupos.some((g) => g.ocultos),
  };
}

/**
 * El trazo de una porción del anillo, de `desde` a `hasta` grados (0 = arriba, en el sentido del reloj) sobre un radio `r` con el
 * centro en `c`. Deja un hueco entre porciones —de `hueco` grados, nunca más de dos quintos de la porción: una rebanada fina no
 * puede desaparecer ni voltearse—, así se ve de dónde a dónde va cada una.
 */
export function trazoDeArco(desde: number, hasta: number, r: number, c = 100, hueco = 2.4): string {
  // Una sola porción es el círculo entero: un arco no puede acabar donde empieza, así que se traza en dos medias vueltas y sin hueco.
  if (hasta - desde >= 359.99) return `M${c} ${r2(c - r)}A${r} ${r} 0 1 1 ${c} ${r2(c + r)}A${r} ${r} 0 1 1 ${c} ${r2(c - r)}`;
  const h = Math.min(hueco, (hasta - desde) * 0.4) / 2;
  const a0 = desde + h;
  const a1 = hasta - h;
  const punto = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${r2(c + r * Math.sin(rad))} ${r2(c - r * Math.cos(rad))}`;
  };
  return `M${punto(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${punto(a1)}`;
}
