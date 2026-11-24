// Margen por rasgos (ADR-0700, Felipe 2026-11-24; maqueta https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx): el precio de venta que se
// sugiere para una prenda de proveedor sale de un margen BASE que fija el Admin, más los puntos de lo que la prenda tiene: una lista de
// casillas que también edita el Admin («Nadie la tiene», «En tendencia», «Tela que se nota», «Detalle de diseño», «Acabado y confección»,
// «Marca que el cliente conoce»… desde 20261124201000; antes eran cuatro fijas). Dos referencias no suman puntos: las parecidas (si se venden más
// caras, se sugiere ese precio) y el precio que se vio afuera (un techo: el sugerido no lo pasa). El Taller va aparte.
//
// EL PROBLEMA. Hasta ADR-0668 el ERP solo sabía un número para toda prenda: el piso que aguanta una rebaja de 35 % (≈ costo × 2.27). Un
// polo liso que el cliente compara con otras tiendas y una blusa que nadie más tiene salían con la misma vara. Felipe quiere que lo que la
// prenda tiene suba el margen, y que el +3 de cada casilla se pueda medir después con las ventas (por eso las reglas se guardan con fecha).
//
// CONTRATO
//   PROMETE: un precio con IGV terminado en .90 que deja al menos el margen objetivo sobre el precio SIN IGV (la cuenta de «Te quedan»,
//            `cuentaDelPrecio`), y nunca un precio que pierde. Todo en céntimos enteros.
//   ASUME:   costo y precios con IGV, como se escriben en todo el ERP (el total del papel, la etiqueta); márgenes y puntos enteros.
//   NO HACE: no lee la base ni guarda nada; no baja un precio que ya existe (eso lo decide la pantalla que lo usa).

import { MAX_PRECIO_PRENDA } from "./catalogo-topes";
import { aNoventaCts, conRebajaCts, cts, cuentaDelPrecio, pierdeConElPrecio } from "./cuenta-de-precio";

/**
 * De dónde sale una casilla: la marca la persona (`a_mano`), llega marcada por la lista de tejidos y se puede quitar (`por_tejido`), o sale
 * sola de la lista de marcas (`por_marca`). Hay a lo más una de cada una de las dos últimas.
 */
export type OrigenCasilla = "a_mano" | "por_tejido" | "por_marca";
const ORIGENES: readonly OrigenCasilla[] = ["a_mano", "por_tejido", "por_marca"];

/** El código de una casilla de la lista del Admin (`retail.rasgos_de_precio`, 20261124201000): «nadie_la_tiene», «detalle_de_diseno»… */
export type Rasgo = string;

/** Una casilla de «¿Qué tiene esta prenda?»: cuánto suma al margen (en %, entero) y de dónde sale. La lista la edita el Admin. */
export type Casilla = { codigo: Rasgo; nombre: string; ayuda: string | null; puntos: number; origen: OrigenCasilla };

/**
 * La base y las casillas prendidas, en el orden de la hoja. Todo en puntos de margen enteros (36 = 36 % del precio sin IGV; +3 lleva 36 % a
 * 39 %). En pantalla se dicen «%» (Felipe 2026-11-24: «que en vez de puntos sean porcentajes»): suman al margen, no al precio.
 */
export type ReglasDePrecio = { margenBase: number; casillas: readonly Casilla[] };

/**
 * El margen base que recomienda el análisis del 2026-11-24 (ADR-0700): 37 %. Con los gastos y la planilla de octubre de 2026, Trujillo —la
 * tienda que más gasta— paga su propia tienda desde un precio de × 1.87 el costo, que es 36.9 % de margen; Arequipa paga tienda y oficina
 * desde 36.2 %. Es un número con fecha: si los gastos cambian, se rehace el análisis (nadie lo recalcula solo).
 */
export const MARGEN_BASE_RECOMENDADO = 37;

/** Las seis casillas con las que nace la lista (20261124201000), a +3 % cada una. La base de datos arranca igual. */
export const CASILLAS_DE_FABRICA: readonly Casilla[] = [
  { codigo: "nadie_la_tiene", nombre: "Nadie la tiene", ayuda: "La tienda nunca la tuvo y no la venden al lado.", puntos: 3, origen: "a_mano" },
  { codigo: "en_tendencia", nombre: "En tendencia", ayuda: "La piden o se ve en redes esta temporada.", puntos: 3, origen: "a_mano" },
  { codigo: "tela_que_se_nota", nombre: "Tela que se nota", ayuda: "Se siente distinta: más peso, mejor caída o más suave.", puntos: 3, origen: "por_tejido" },
  { codigo: "detalle_de_diseno", nombre: "Detalle de diseño", ayuda: "Bordado, corte o estampado propio que se ve de lejos.", puntos: 3, origen: "a_mano" },
  { codigo: "acabado_y_confeccion", nombre: "Acabado y confección", ayuda: "Forro, costuras limpias o botones buenos que se ven.", puntos: 3, origen: "a_mano" },
  { codigo: "marca_conocida", nombre: "Marca que el cliente conoce", ayuda: "Sale sola de tu lista de marcas.", puntos: 3, origen: "por_marca" },
];

/** Las decisiones del 2026-11-24: la base recomendada y +3 % cada casilla. */
export const REGLAS_DE_FABRICA: ReglasDePrecio = { margenBase: MARGEN_BASE_RECOMENDADO, casillas: CASILLAS_DE_FABRICA };

// Los mismos candados que la base (`reglas_de_precio`, `rasgos_de_precio`): la pantalla avisa antes y la base lo vuelve a exigir.
export const MARGEN_BASE_MIN = 20;
export const MARGEN_BASE_MAX = 60;
export const PUNTOS_MAX = 10;
/** La base más todas las casillas: 75 % de margen ya pide un precio de casi × 4.7 el costo. Más arriba es un error de tecleo. */
export const MARGEN_TOPE = 75;
/** El nombre de una casilla, como lo pide la base. */
export const NOMBRE_CASILLA_MIN = 2;
export const NOMBRE_CASILLA_MAX = 40;
export const AYUDA_CASILLA_MAX = 120;

const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const CODIGO = /^[a-z][a-z0-9_]{1,39}$/;

function leerCasilla(x: unknown): Casilla | null {
  const f = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const puntos = entero(f.puntos);
  if (typeof f.codigo !== "string" || !CODIGO.test(f.codigo) || typeof f.nombre !== "string" || f.nombre.trim() === "") return null;
  if (puntos === null || puntos < 0 || puntos > PUNTOS_MAX || !ORIGENES.includes(f.origen as OrigenCasilla)) return null;
  return { codigo: f.codigo, nombre: f.nombre, ayuda: typeof f.ayuda === "string" && f.ayuda.trim() !== "" ? f.ayuda : null, puntos, origen: f.origen as OrigenCasilla };
}

/**
 * Lo que devuelve `fn_reglas_de_precio()`. Desde 20261124201000 trae `casillas` (las prendidas, en orden; puede venir vacía si el Admin las
 * apagó todas). Sin `casillas` (la base todavía con la función de antes) se arma con las de fábrica y los puntos que mande; lo roto toma el
 * valor de fábrica: la hoja nunca se queda sin regla.
 */
export function leerReglas(data: unknown): ReglasDePrecio {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const margenBase = entero(d.margen_base) ?? REGLAS_DE_FABRICA.margenBase;
  if (Array.isArray(d.casillas)) {
    const vistas = new Set<string>();
    const casillas = d.casillas.flatMap((x) => {
      const c = leerCasilla(x);
      if (!c || vistas.has(c.codigo)) return [];
      vistas.add(c.codigo);
      return [c];
    });
    return { margenBase, casillas };
  }
  const p = (d.puntos && typeof d.puntos === "object" ? d.puntos : null) as Record<string, unknown> | null;
  const conPuntos = p ? CASILLAS_DE_FABRICA.flatMap((c) => (entero(p[c.codigo]) === null ? [] : [{ ...c, puntos: entero(p[c.codigo])! }])) : [];
  return { margenBase, casillas: conPuntos.length > 0 ? conPuntos : CASILLAS_DE_FABRICA };
}

/** Las casillas apagadas (`apagadas` de `fn_reglas_de_precio`): no suman, y en Configuración ▸ Precios se pueden volver a prender. */
export function leerApagadas(data: unknown): Casilla[] {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return (Array.isArray(d.apagadas) ? d.apagadas : []).flatMap((x) => {
    const c = leerCasilla(x);
    return c ? [c] : [];
  });
}

/** De dónde sale una casilla, en una línea (Configuración ▸ Precios). */
export const DE_DONDE_SALE: Readonly<Record<OrigenCasilla, string>> = {
  a_mano: "La marca quien compra.",
  por_tejido: "Llega marcada por tu lista de tejidos.",
  por_marca: "Sale sola de tu lista de marcas.",
};

/** Lo que suma cada casilla, por código: lo que viaja a `guardar_reglas_de_precio` (la base pide una por cada casilla prendida). */
export function puntosPorCasilla(reglas: ReglasDePrecio): Record<Rasgo, number> {
  return Object.fromEntries(reglas.casillas.map((c) => [c.codigo, c.puntos]));
}

/** La regla y las dos listas, como las manda `fn_reglas_de_precio()` desde 20261124174000 (las listas como ids). */
export type ReglasYListas = { reglas: ReglasDePrecio; marcasConocidas: string[]; tejidosQueSeNotan: string[] };

export function leerReglasYListas(data: unknown): ReglasYListas {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { reglas: leerReglas(data), marcasConocidas: ids(d.marcas_conocidas), tejidosQueSeNotan: ids(d.tejidos_que_se_notan) };
}

/** Las dos listas, para preguntar rápido si la marca o el tejido de una prenda suman su casilla. */
export type ListasDeRasgos = { marcasConocidas: ReadonlySet<string>; tejidosQueSeNotan: ReadonlySet<string> };

/**
 * Lo que decidió la persona, casilla por casilla: `true` marcada, `false` quitada. Sin decir: una casilla a mano queda sin marcar y la de la
 * tela sigue al tejido de la prenda (la lista del Admin). La de la marca no se decide: sale de la lista.
 */
export type EleccionDeRasgos = Readonly<Record<Rasgo, boolean | undefined>>;

/**
 * Lo que la prenda tiene, en el orden de la hoja: lo que marcó la persona, la tela por su tejido si la persona no dijo nada (puede quitarla
 * en una prenda que no la merezca) y la marca por la lista, siempre. Solo cuenta lo que está en la lista prendida.
 */
export function rasgosEfectivos(
  eleccion: EleccionDeRasgos,
  casillas: readonly Casilla[],
  auto: { tejidoSeNota: boolean; marcaConocida: boolean },
): Rasgo[] {
  return casillas
    .filter((c) => (c.origen === "por_marca" ? auto.marcaConocida : c.origen === "por_tejido" ? (eleccion[c.codigo] ?? auto.tejidoSeNota) : eleccion[c.codigo] === true))
    .map((c) => c.codigo);
}

/** De vuelta: lo guardado en una línea de compra como lo que había marcado la persona (para corregirla sin perder nada). */
export function eleccionDeRasgos(rasgos: readonly Rasgo[]): EleccionDeRasgos {
  return Object.fromEntries(rasgos.map((r) => [r, true]));
}

/** Lo que viaja a `guardar_rasgos_de_producto` (20261124201000): lo marcado y lo quitado de lo que llega por el tejido. */
export type RasgosParaGuardar = { p_marcados: Rasgo[]; p_quitados: Rasgo[] };

/**
 * Lo marcado en Catálogo, como se guarda: `null` si la persona no decidió ninguna casilla (no hay nada que guardar). La tela que no tocó no
 * viaja: sigue a su tejido, y si el Admin cambia la lista, cambia con ella. Lo de una casilla apagada no viaja: la base lo conserva.
 */
export function eleccionParaGuardar(e: EleccionDeRasgos, casillas: readonly Casilla[]): RasgosParaGuardar | null {
  if (!Object.values(e).some((v) => v !== undefined)) return null;
  return {
    p_marcados: casillas.filter((c) => c.origen !== "por_marca" && e[c.codigo] === true).map((c) => c.codigo),
    p_quitados: casillas.filter((c) => c.origen === "por_tejido" && e[c.codigo] === false).map((c) => c.codigo),
  };
}

/** De vuelta: lo guardado de una prenda (`fn_producto_rasgos`: `{ marcados, quitados }`) como lo que la persona había decidido. */
export function leerEleccionGuardada(data: unknown): EleccionDeRasgos {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const d = data as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { ...Object.fromEntries(lista(d.quitados).map((r) => [r, false])), ...Object.fromEntries(lista(d.marcados).map((r) => [r, true])) };
}

/** Un tejido o una marca de las listas del Admin, con cuántos modelos activos lo llevan (para elegir mirando lo que más pesa). */
export type ItemDeLista = { id: string; nombre: string; marcado: boolean; modelos: number };
export type ListasDePrecio = { tejidos: ItemDeLista[]; marcas: ItemDeLista[] };

/** Lo que devuelve `fn_listas_de_precio()`. Una fila rota se salta: no se dibuja una casilla que no se puede guardar. */
export function leerListas(data: unknown): ListasDePrecio {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const lista = (v: unknown): ItemDeLista[] =>
    (Array.isArray(v) ? v : []).flatMap((x) => {
      const f = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      if (typeof f.id !== "string" || typeof f.nombre !== "string") return [];
      return [{ id: f.id, nombre: f.nombre, marcado: f.marcado === true, modelos: typeof f.modelos === "number" ? f.modelos : 0 }];
    });
  return { tejidos: lista(d.tejidos), marcas: lista(d.marcas) };
}

/** Por qué estas reglas no se pueden guardar (lo mismo que rechaza la base), o `null`. */
export function problemaDeReglas(r: ReglasDePrecio): string | null {
  if (!Number.isInteger(r.margenBase) || r.margenBase < MARGEN_BASE_MIN || r.margenBase > MARGEN_BASE_MAX) {
    return `El margen base va de ${MARGEN_BASE_MIN} a ${MARGEN_BASE_MAX} %.`;
  }
  for (const c of r.casillas) {
    if (!Number.isInteger(c.puntos) || c.puntos < 0 || c.puntos > PUNTOS_MAX) return `«${c.nombre}» suma de 0 a ${PUNTOS_MAX} %.`;
  }
  // La suma sin el tope de `margenObjetivo`: aquí el tope es justo lo que se revisa.
  if (r.casillas.reduce((t, c) => t + c.puntos, r.margenBase) > MARGEN_TOPE) return `La base con todas las casillas no puede pasar de ${MARGEN_TOPE} %.`;
  return null;
}

/** Por qué una casilla nueva o renombrada no se puede guardar (lo mismo que rechaza `guardar_casilla_de_precio`), o `null`. */
export function problemaDeCasilla(
  reglas: ReglasDePrecio,
  c: { codigo: Rasgo | null; nombre: string; ayuda?: string | null; puntos: number; activa: boolean },
): string | null {
  const nombre = c.nombre.replace(/\s+/g, " ").trim();
  if (nombre.length < NOMBRE_CASILLA_MIN || nombre.length > NOMBRE_CASILLA_MAX) {
    return `El nombre de la casilla va de ${NOMBRE_CASILLA_MIN} a ${NOMBRE_CASILLA_MAX} letras.`;
  }
  if ((c.ayuda ?? "").trim().length > AYUDA_CASILLA_MAX) return `La ayuda de la casilla va hasta ${AYUDA_CASILLA_MAX} letras.`;
  if (!Number.isInteger(c.puntos) || c.puntos < 0 || c.puntos > PUNTOS_MAX) return `Cada casilla suma de 0 a ${PUNTOS_MAX} %.`;
  const otra = reglas.casillas.find((x) => x.codigo !== c.codigo && x.nombre.trim().toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"));
  if (otra) return `Ya hay una casilla «${otra.nombre}».`;
  const demas = reglas.casillas.reduce((t, x) => t + (x.codigo === c.codigo ? 0 : x.puntos), reglas.margenBase);
  if (c.activa && demas + c.puntos > MARGEN_TOPE) return `La base con todas las casillas no puede pasar de ${MARGEN_TOPE} %.`;
  return null;
}

/** El margen objetivo de una prenda: la base más los puntos de lo que tiene (cada casilla cuenta una vez), con el tope de la base de datos. */
export function margenObjetivo(reglas: ReglasDePrecio, rasgos: Iterable<Rasgo>): number {
  const tiene = new Set(rasgos);
  return Math.min(MARGEN_TOPE, reglas.casillas.reduce((t, c) => t + (tiene.has(c.codigo) ? c.puntos : 0), reglas.margenBase));
}

/**
 * El precio con IGV terminado en .90 más bajo que deja `margen` % sobre el precio sin IGV. En céntimos enteros: precio ≥ costo × 1.18 ÷
 * (1 − margen) ⇔ precioCts ≥ costoCts × 118 ÷ (100 − margen). `null` sin costo, con un margen imposible o si pasa del tope de la base.
 */
export function precioConMargen(costo: number, margen: number): number | null {
  if (!Number.isFinite(costo) || costo <= 0 || !Number.isInteger(margen) || margen < 0 || margen >= 100) return null;
  const precio = aNoventaCts(Math.ceil((cts(costo) * 118) / (100 - margen))) / 100;
  return precio <= MAX_PRECIO_PRENDA ? precio : null;
}

/**
 * Desde qué precio no se pierde, con la MISMA cuenta que dice «Pierdes» en la línea del margen (`pierdeConElPrecio`): lo que queda,
 * redondeado al céntimo, no es negativo. Por el redondeo, el .90 de abajo puede no perder aunque la fórmula diga que sí: se prueba.
 */
function desdeSinPerder(costo: number): number | null {
  const precio = precioConMargen(costo, 0);
  if (precio === null) return null;
  return precio > 1 && !pierdeConElPrecio(Math.round((precio - 1) * 100) / 100, costo) ? Math.round((precio - 1) * 100) / 100 : precio;
}

/** El precio terminado en .90 más alto que queda por DEBAJO de `monto` (un techo: S/ 60 → S/ 59.90). `null` si no hay ninguno. */
function bajo90(monto: number): number | null {
  const n = cts(monto) - 1;
  const resto = ((n % 100) + 100) % 100;
  const c = resto >= 90 ? n - (resto - 90) : n - resto - 10;
  return c > 0 ? c / 100 : null;
}

const montoValido = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= MAX_PRECIO_PRENDA;

/** Por qué el sugerido es ese: la regla (base + casillas), las parecidas que se venden a más, el techo de afuera o el piso de no perder. */
export type MotivoSugerido = "regla" | "parecidas" | "afuera" | "pierdes";

export type PrecioSugerido = {
  precio: number;
  /** Lo que da la regla sola (base + casillas), antes de las referencias. */
  regla: number;
  /** El margen objetivo, en %. */
  margen: number;
  /** El primer precio que no pierde. */
  desde: number;
  /** El .90 justo debajo del precio que se vio afuera, o `null` si no se vio ninguno. */
  techo: number | null;
  motivo: MotivoSugerido;
};

/**
 * El precio que se sugiere. En orden: la regla (base + casillas); si las parecidas se venden más caras, ese precio (no se deja plata en la
 * mesa); si se vio la prenda afuera, nunca por encima (queda en el .90 justo debajo); y nunca bajo el precio que pierde. `null` sin costo
 * o si ningún precio hasta el tope de la base lo logra.
 */
export function sugerirPrecio(e: {
  costo: number;
  reglas: ReglasDePrecio;
  rasgos: Iterable<Rasgo>;
  parecidas?: number | null;
  afuera?: number | null;
}): PrecioSugerido | null {
  const desde = desdeSinPerder(e.costo);
  const margen = margenObjetivo(e.reglas, e.rasgos);
  const regla = precioConMargen(e.costo, margen);
  if (desde === null || regla === null) return null;
  let precio = regla;
  let motivo: MotivoSugerido = "regla";
  const parecidas = montoValido(e.parecidas) ? aNoventaCts(cts(e.parecidas)) / 100 : null;
  if (parecidas !== null && parecidas > precio) {
    precio = parecidas;
    motivo = "parecidas";
  }
  const techo = montoValido(e.afuera) ? bajo90(e.afuera) : null;
  if (techo !== null && precio > techo) {
    precio = techo;
    motivo = "afuera";
  }
  if (precio < desde) {
    precio = desde;
    motivo = "pierdes";
  }
  return { precio, regla, margen, desde, techo, motivo };
}

/**
 * La rebaja más grande, en % entero, que este precio aguanta sin perder, con el precio rebajado hacia abajo al S/ 0.10 como en caja
 * (ADR-0403). Es casi el mismo número que el margen: con 33 % de margen, una rebaja de 35 % ya pierde. `null` sin costo o sin precio.
 */
export function rebajaQueAguanta(costo: number, precio: number): number | null {
  const cuenta = cuentaDelPrecio(costo, precio);
  if (!cuenta) return null;
  for (let pct = Math.min(99, Math.max(0, Math.floor(cuenta.margenPorMil / 10) + 1)); pct >= 0; pct--) {
    const rebajado = conRebajaCts(cts(precio), pct) / 100;
    if (rebajado > 0 && !pierdeConElPrecio(rebajado, costo)) return pct;
  }
  return 0;
}
