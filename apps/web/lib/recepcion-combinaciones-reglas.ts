// Costo y precio de venta por COMBINACIÓN (color y talla) al cerrar un envío (Inventario ▸ Recibir mercadería ▸ Cerrar; ADR-0393 / ADR-0519 /
// ADR-0370, Felipe 2026-10-28). Reglas puras, sin red: la pantalla de «Cerrar» las usa para armar la matriz de cada prenda, aplicar un valor con su
// alcance (esta combinación, ese color, esa talla, todas), decirle a quien cierra qué va a cambiar, y armar lo que se manda a la base.
//
// Lo que la base hace (migración `20261028234000_recepcion_costo_y_precio_por_combinacion.sql`) y aquí se refleja sin repetir sus candados:
//   · COSTO: `costos_prendas` acepta `{ producto_id | variante_id: costo }`; manda la combinación, luego la prenda, luego la línea.
//   · PRECIO: `cambiar_precios_en_recepcion(envío, prenda, { variante_id: precio }, 'todas' | 'sede')`. «todas» cambia el precio general de cada
//     combinación; «sede» el de esta tienda: la PRENDA entera si se eligieron todas sus tallas activas al mismo precio, y si no una excepción por
//     combinación. Esa predicción (`seraPrecioDePrendaEntera`) es del texto: quien decide es la base.
//   · Un precio nunca queda bajo el costo de esa talla, ni pasa de S/ 5 000, ni toca la talla de obsequio: lo rechaza la base y la pantalla lo
//     dice junto a la casilla (`validar_precios_en_recepcion`); no se repite aquí.
import { compararTallas } from "./tallas";
import { leerCostoCierre, leerPrecioNuevo, type PrendaSeparada } from "./recepcion-conteo-reglas";

const NBSP = " ";

/** Lo que se escribe en la matriz: el costo de compra o el precio de venta. */
export type Cifra = "costo" | "precio";
/** Hasta dónde llega lo que se escribió en una casilla. */
export type Alcance = "esta" | "color" | "talla" | "todas";
/** Dónde vale un precio de venta: en todas las sedes (el general) o solo en esta tienda. */
export type ValeEn = "todas" | "sede";

export const ALCANCES: readonly Alcance[] = ["esta", "color", "talla", "todas"];
export const MENSAJE_SIN_CONTEO = "Aún no se realizó el conteo por color y talla de esta prenda.";

/** Una combinación contada de una prenda, con lo que hoy vale. */
export type Combinacion = {
  varianteId: string;
  color: string | null;
  talla: string | null;
  /** Cuántas se contaron de esta combinación. */
  cantidad: number;
  /** El precio general de hoy (`variantes.precio`); `null` mientras no se lee. */
  precioGeneral: number | null;
  /** Lo que se cobra hoy en ESTA tienda (su excepción, el precio de la prenda aquí o el general); `null` mientras no se lee. */
  precioSede: number | null;
  /** El costo que tendría si no se escribe nada: el de su prenda, o el de su línea. */
  costoHeredado: number | null;
};

/** El precio de hoy de una variante, tal como lo leyó la pantalla. */
export type PrecioDeHoy = { general: number | null; sede: number | null };

export const montoTexto = (n: number): string => `S/${NBSP}${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const claveColor = (c: Pick<Combinacion, "color">): string => (c.color ?? "").trim().toLowerCase();
const claveTalla = (c: Pick<Combinacion, "talla">): string => (c.talla ?? "").trim().toUpperCase();
const nombreColor = (c: Pick<Combinacion, "color">): string => c.color?.trim() || "Sin color";
const nombreTalla = (c: Pick<Combinacion, "talla">): string => c.talla?.trim() || "Única";

/** «Negro · M». */
export const etiquetaDe = (c: Pick<Combinacion, "color" | "talla">): string => `${nombreColor(c)} · ${nombreTalla(c)}`;

// ---------------------------------------------------------------------------------------------------------------------------------
// La matriz
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Las combinaciones contadas de una prenda separada (las de cantidad mayor que cero). Una prenda que se separó sin color y talla no tiene
 * ninguna: la pantalla dice `MENSAJE_SIN_CONTEO` y no dibuja cajas.
 */
export function combinacionesContadas(
  prenda: Pick<PrendaSeparada, "variantes">,
  hoy: Readonly<Record<string, PrecioDeHoy | undefined>>,
  costoHeredado: number | null,
): Combinacion[] {
  const r: Combinacion[] = [];
  for (const v of prenda.variantes ?? []) {
    if (v.cantidad <= 0) continue;
    const h = hoy[v.varianteId];
    r.push({ varianteId: v.varianteId, color: v.color, talla: v.talla, cantidad: v.cantidad, precioGeneral: h?.general ?? null, precioSede: h?.sede ?? h?.general ?? null, costoHeredado });
  }
  return r;
}

/** La matriz que se dibuja: colores en filas (por nombre, «Sin color» al final), tallas en columnas (S · M · L, 36 · 38…), y `null` donde no se contó esa pareja. */
export type Matriz = { tallas: string[]; filas: { color: string; celdas: (Combinacion | null)[] }[] };

export function matrizDe(combinaciones: readonly Combinacion[]): Matriz {
  const tallas = new Map<string, string>();
  const colores = new Map<string, string>();
  for (const c of combinaciones) {
    tallas.set(claveTalla(c), nombreTalla(c));
    colores.set(claveColor(c), nombreColor(c));
  }
  const columnas = [...tallas.entries()].sort((a, b) => compararTallas(a[1], b[1]));
  const filas = [...colores.entries()].sort((a, b) => (a[1] === "Sin color" ? 1 : b[1] === "Sin color" ? -1 : a[1].localeCompare(b[1], "es")));
  return {
    tallas: columnas.map(([, nombre]) => nombre),
    filas: filas.map(([clave, nombre]) => ({
      color: nombre,
      celdas: columnas.map(([t]) => combinaciones.find((c) => claveColor(c) === clave && claveTalla(c) === t) ?? null),
    })),
  };
}

/** Las combinaciones a las que llega lo escrito en la casilla de `origenId`. Siempre incluye al origen; sin él en la lista, ninguna. */
export function destinosDelAlcance(combinaciones: readonly Combinacion[], origenId: string, alcance: Alcance): string[] {
  const origen = combinaciones.find((c) => c.varianteId === origenId);
  if (!origen) return [];
  const mismo = (c: Combinacion): boolean =>
    alcance === "esta" ? c.varianteId === origenId : alcance === "color" ? claveColor(c) === claveColor(origen) : alcance === "talla" ? claveTalla(c) === claveTalla(origen) : true;
  return combinaciones.filter(mismo).map((c) => c.varianteId);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo escrito (los borradores de quien cierra)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Costo escrito por combinación: `{ variante_id: costo }`. */
export type CambiosDeCosto = Readonly<Record<string, number>>;
/** Precio escrito por combinación, con dónde vale. */
export type CambiosDePrecio = Readonly<Record<string, { valor: number; valeEn: ValeEn }>>;

export function ponerCosto(cambios: CambiosDeCosto, ids: readonly string[], valor: number): CambiosDeCosto {
  const r: Record<string, number> = { ...cambios };
  for (const id of ids) r[id] = valor;
  return r;
}

export function ponerPrecio(cambios: CambiosDePrecio, ids: readonly string[], valor: number, valeEn: ValeEn): CambiosDePrecio {
  const r: Record<string, { valor: number; valeEn: ValeEn }> = { ...cambios };
  for (const id of ids) r[id] = { valor, valeEn };
  return r;
}

/** Quita lo escrito de esas combinaciones (vuelven a lo que traían). */
export function quitarCambios<T>(cambios: Readonly<Record<string, T>>, ids: readonly string[]): Record<string, T> {
  const fuera = new Set(ids);
  return Object.fromEntries(Object.entries(cambios).filter(([id]) => !fuera.has(id)));
}

/** Lo que se lee de lo escrito en una caja: vacío es «no lo cambio»; algo mal escrito, un problema que se dice junto a la casilla. */
export function leerCifra(cifra: Cifra, texto: string): { valor: number | null; problema: string | null } {
  return cifra === "costo" ? leerCostoCierre(texto) : leerPrecioNuevo(texto);
}

/** El costo que lleva hoy una combinación en la pantalla: lo escrito, o lo que heredaba. */
export const costoEfectivo = (c: Pick<Combinacion, "varianteId" | "costoHeredado">, cambios: CambiosDeCosto): number | null => cambios[c.varianteId] ?? c.costoHeredado;

/** El precio que lleva hoy una combinación en la pantalla: lo escrito, o lo que se cobra hoy en esta tienda. */
export const precioEfectivo = (c: Pick<Combinacion, "varianteId" | "precioSede">, cambios: CambiosDePrecio): number | null => cambios[c.varianteId]?.valor ?? c.precioSede;

/** El valor que más se repite (el «normal» de la prenda); si empatan, el menor. Sin ningún valor, `null`. */
export function valorMasComun(valores: readonly (number | null)[]): number | null {
  const cuenta = new Map<number, number>();
  for (const v of valores) if (v !== null) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: number | null = null;
  let veces = 0;
  for (const [v, n] of [...cuenta.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > veces) {
      mejor = v;
      veces = n;
    }
  }
  return mejor;
}

/** Las combinaciones cuyo valor se sale del normal de su prenda (las que la pantalla marca en amarillo). */
export function combinacionesDistintas(combinaciones: readonly Combinacion[], valorDe: (c: Combinacion) => number | null): Set<string> {
  const normal = valorMasComun(combinaciones.map(valorDe));
  return new Set(combinaciones.filter((c) => valorDe(c) !== null && normal !== null && valorDe(c) !== normal).map((c) => c.varianteId));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Decirle a quien cierra qué va a cambiar
// ---------------------------------------------------------------------------------------------------------------------------------

export type DescripcionDelCambio = {
  /** «Cambia 1 precio:» / «Cambian 4 precios de Negro:». */
  titulo: string;
  /** «Negro · M pasa de S/ 99.00 a S/ 109.00. Las otras 11 combinaciones no se tocan.» */
  detalle: string;
  /** Cosas que quien cierra tiene que saber además (un precio que seguirá distinto en esta tienda, lo que hereda lo que llegue después). */
  avisos: string[];
  /** Cuántas combinaciones cambian de verdad (las que ya valían eso no cuentan). */
  cuantas: number;
  /** Cuántas de la prenda no se tocan. */
  sinTocar: number;
};

const listar = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * Qué cambia al escribir `valor` en `destinos`: agrupa lo que pasa del mismo valor al nuevo («S, M y L pasan de S/ 99.00 a S/ 109.00, y XL pasa
 * de S/ 105.00 a S/ 109.00 (tenía un precio propio)») y nombra las que ya valían eso (no cambian). `antes` es lo que hoy muestra la pantalla de CADA
 * combinación de la prenda (también las que no se tocan: de ahí sale lo «normal»).
 */
export function describirCambio(a: {
  cifra: Cifra;
  todas: readonly Combinacion[];
  destinos: readonly Combinacion[];
  valor: number;
  valeEn: ValeEn;
  sede: string;
  antes: Readonly<Record<string, number | null>>;
  /** Cuántas tallas activas tiene la prenda en el catálogo (menos la de obsequio), si se sabe: con ella se sabe si «solo esta tienda» queda como el precio de la prenda. */
  totalActivas?: number | null;
}): DescripcionDelCambio {
  const cambian = a.destinos.filter((c) => (a.antes[c.varianteId] ?? null) !== a.valor);
  const cuantas = cambian.length;
  const sinTocar = a.todas.length - cuantas;
  const plural = a.cifra === "costo" ? "costos" : "precios";
  const singular = a.cifra === "costo" ? "costo" : "precio";
  const avisos: string[] = [];

  if (cuantas === 0) {
    return { titulo: "No cambia nada:", detalle: `${a.destinos.length === 1 ? "Esa combinación ya vale" : "Ya valen"} ${montoTexto(a.valor)}.`, avisos, cuantas, sinTocar };
  }

  const mismoColor = cambian.every((c) => claveColor(c) === claveColor(cambian[0]));
  const mismaTalla = cambian.every((c) => claveTalla(c) === claveTalla(cambian[0]));
  const etiqueta = (c: Combinacion): string => (cuantas === 1 ? etiquetaDe(c) : mismoColor ? nombreTalla(c) : mismaTalla ? nombreColor(c) : etiquetaDe(c));
  const de = cuantas === 1 ? "" : mismoColor ? ` de ${nombreColor(cambian[0])}` : mismaTalla ? ` de la talla ${nombreTalla(cambian[0])}` : "";
  const titulo = cuantas === 1 ? `Cambia 1 ${singular}:` : `Cambian ${cuantas} ${plural}${de}:`;

  const normal = valorMasComun(a.todas.map((c) => a.antes[c.varianteId] ?? null));
  const grupos = new Map<number | null, Combinacion[]>();
  for (const c of cambian) {
    const antes = a.antes[c.varianteId] ?? null;
    grupos.set(antes, [...(grupos.get(antes) ?? []), c]);
  }
  const frases = [...grupos.entries()].map(([antes, cs]) => {
    const verbo = cs.length === 1 ? "pasa" : "pasan";
    const quienes = listar(cs.map(etiqueta));
    const propio = antes !== null && normal !== null && antes !== normal ? ` (tenía un ${a.cifra === "costo" ? "costo" : "precio"} propio)` : "";
    return antes === null ? `${quienes} ${verbo} a ${montoTexto(a.valor)}` : `${quienes} ${verbo} de ${montoTexto(antes)} a ${montoTexto(a.valor)}${propio}`;
  });
  const resto = sinTocar === 0 ? "" : sinTocar === 1 ? " La otra no se toca." : cuantas === 1 ? ` Las otras ${sinTocar} combinaciones no se tocan.` : ` Las otras ${sinTocar} no se tocan.`;
  const detalle = `${frases.length === 1 ? frases[0] : `${frases.slice(0, -1).join(", ")}, y ${frases[frases.length - 1]}`}.${resto}`;

  if (a.cifra === "precio" && a.valeEn === "todas") {
    // El precio general cambia en todas las sedes, pero una tienda con precio propio para esa combinación sigue cobrando el suyo.
    const siguen = cambian.filter((c) => c.precioSede !== null && c.precioGeneral !== null && c.precioSede !== c.precioGeneral);
    if (siguen.length === 1) avisos.push(`En ${a.sede}, ${etiquetaDe(siguen[0])} seguirá en ${montoTexto(siguen[0].precioSede as number)}: tiene un precio propio ahí.`);
    else if (siguen.length > 1) avisos.push(`En ${a.sede}, ${siguen.length} de estas combinaciones seguirán con su precio propio.`);
  }
  if (a.cifra === "precio" && a.valeEn === "sede" && seraPrecioDePrendaEntera(Object.fromEntries(a.destinos.map((c) => [c.varianteId, a.valor])), a.totalActivas ?? null)) {
    avisos.push(`Queda como el precio de la prenda en ${a.sede}: las tallas que lleguen después lo heredan.`);
  }
  return { titulo, detalle, avisos, cuantas, sinTocar };
}

/**
 * ¿«Solo esta tienda» con estos precios queda como el precio de la PRENDA (y no como excepciones por combinación)? Lo mismo que decide la base:
 * se eligieron TODAS las tallas activas de la prenda y valen lo mismo. Es el texto; quien decide es `cambiar_precios_en_recepcion`.
 */
export function seraPrecioDePrendaEntera(precios: Readonly<Record<string, number>>, totalActivas: number | null): boolean {
  const ids = Object.keys(precios);
  return totalActivas !== null && totalActivas > 0 && ids.length === totalActivas && new Set(Object.values(precios)).size === 1;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que se muestra de toda la prenda (su fila) y lo que se manda
// ---------------------------------------------------------------------------------------------------------------------------------

/** El valor de una prenda como se ve en su fila: «S/ 45.00», o «S/ 45.00 – 52.00» si sus combinaciones valen distinto; `null` si no hay ninguno. */
export function textoDeRango(valores: readonly (number | null)[]): string | null {
  const v = valores.filter((x): x is number => x !== null);
  if (v.length === 0) return null;
  const desde = Math.min(...v);
  const hasta = Math.max(...v);
  return desde === hasta ? montoTexto(desde) : `${montoTexto(desde)} – ${hasta.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Los costos propios de las combinaciones de UNA línea, como los espera `costos_prendas`. Solo cuenta lo que cambió respecto de lo que ya
 * heredaba. Si quien cierra le puso el mismo costo a TODAS las combinaciones de una prenda, se manda el de la prenda (`producto_id`: lo que se
 * detalle después también lo hereda); si no, el de cada combinación escrita (`variante_id`).
 */
export function costosParaLinea(
  prendas: readonly { productoId: string; combinaciones: readonly Combinacion[] }[],
  cambios: CambiosDeCosto,
): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of prendas) {
    const propios = p.combinaciones.filter((c) => cambios[c.varianteId] !== undefined && cambios[c.varianteId] !== c.costoHeredado);
    if (propios.length === 0) continue;
    const valores = new Set(propios.map((c) => cambios[c.varianteId]));
    if (propios.length === p.combinaciones.length && valores.size === 1) r[p.productoId] = cambios[propios[0].varianteId];
    else for (const c of propios) r[c.varianteId] = cambios[c.varianteId];
  }
  return r;
}

/** Una llamada a `cambiar_precios_en_recepcion`: una por prenda y por dónde vale. */
export type LlamadaDePrecio = { productoId: string; alcance: ValeEn; precios: Record<string, number> };

/**
 * Los precios escritos, agrupados en las llamadas que pide la base: una por prenda y por dónde vale. Una llamada en la que NINGÚN precio cambia
 * lo que se cobra hoy se omite (no hay nada que guardar; con todas las tallas al precio general la base respondería «ese ya es el precio»). Si
 * alguno cambia, van todos los escritos de ese grupo: así «todas las tallas al mismo precio» sigue siendo un precio de prenda, aunque alguna
 * ya valiera eso.
 */
export function llamadasDePrecio(
  prendas: readonly { productoId: string; combinaciones: readonly Combinacion[] }[],
  cambios: CambiosDePrecio,
): LlamadaDePrecio[] {
  const r: LlamadaDePrecio[] = [];
  for (const p of prendas) {
    for (const alcance of ["todas", "sede"] as const) {
      const precios: Record<string, number> = {};
      let algunoCambia = false;
      for (const c of p.combinaciones) {
        const e = cambios[c.varianteId];
        if (!e || e.valeEn !== alcance) continue;
        precios[c.varianteId] = e.valor;
        if ((alcance === "sede" ? c.precioSede : c.precioGeneral) !== e.valor) algunoCambia = true;
      }
      if (algunoCambia) r.push({ productoId: p.productoId, alcance, precios });
    }
  }
  return r;
}
