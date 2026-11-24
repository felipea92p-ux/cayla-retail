// Margen por rasgos (ADR-0700, Felipe 2026-11-24; maqueta https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx): el precio de venta que se
// sugiere para una prenda de proveedor sale de un margen BASE que fija el Admin, más los puntos de lo que la prenda tiene: «Nadie la tiene»,
// «En tendencia», «Tela que se nota» y «Marca que el cliente conoce». Dos referencias no suman puntos: las parecidas (si se venden más
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

/** Lo que una prenda puede tener que sube su margen. El orden es el de la hoja. Las dos últimas salen de las listas del Admin. */
export const RASGOS = ["nadie_la_tiene", "en_tendencia", "tela_que_se_nota", "marca_conocida"] as const;
export type Rasgo = (typeof RASGOS)[number];

export const NOMBRE_RASGO: Readonly<Record<Rasgo, string>> = {
  nadie_la_tiene: "Nadie la tiene",
  en_tendencia: "En tendencia",
  tela_que_se_nota: "Tela que se nota",
  marca_conocida: "Marca que el cliente conoce",
};

/**
 * La base y lo que suma cada casilla, en puntos de margen enteros (36 = 36 % del precio sin IGV; +3 lleva 36 % a 39 %). En pantalla se dicen
 * «%» (Felipe 2026-11-24: «que en vez de puntos sean porcentajes»): suman al margen, no al precio.
 */
export type ReglasDePrecio = { margenBase: number; puntos: Readonly<Record<Rasgo, number>> };

/**
 * El margen base que recomienda el análisis del 2026-11-24 (ADR-0700): 37 %. Con los gastos y la planilla de octubre de 2026, Trujillo —la
 * tienda que más gasta— paga su propia tienda desde un precio de × 1.87 el costo, que es 36.9 % de margen; Arequipa paga tienda y oficina
 * desde 36.2 %. Es un número con fecha: si los gastos cambian, se rehace el análisis (nadie lo recalcula solo).
 */
export const MARGEN_BASE_RECOMENDADO = 37;

/** Las decisiones del 2026-11-24: la base recomendada y +3 % cada casilla. La base de datos arranca igual. */
export const REGLAS_DE_FABRICA: ReglasDePrecio = {
  margenBase: MARGEN_BASE_RECOMENDADO,
  puntos: { nadie_la_tiene: 3, en_tendencia: 3, tela_que_se_nota: 3, marca_conocida: 3 },
};

// Los mismos candados que la tabla `retail.reglas_de_precio` (20261124170000): la pantalla avisa antes y la base lo vuelve a exigir.
export const MARGEN_BASE_MIN = 20;
export const MARGEN_BASE_MAX = 60;
export const PUNTOS_MAX = 10;
/** La base más todas las casillas: 75 % de margen ya pide un precio de casi × 4.7 el costo. Más arriba es un error de tecleo. */
export const MARGEN_TOPE = 75;

const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** Lo que devuelve `fn_reglas_de_precio()`. Lo que falte o venga roto toma el valor de fábrica: la hoja nunca se queda sin regla. */
export function leerReglas(data: unknown): ReglasDePrecio {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const p = (d.puntos && typeof d.puntos === "object" ? d.puntos : {}) as Record<string, unknown>;
  const puntos = Object.fromEntries(RASGOS.map((r) => [r, entero(p[r]) ?? REGLAS_DE_FABRICA.puntos[r]])) as Record<Rasgo, number>;
  return { margenBase: entero(d.margen_base) ?? REGLAS_DE_FABRICA.margenBase, puntos };
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

/** Lo que marcó la persona. `tela_que_se_nota` sin decir: la decide el tejido de la prenda (la lista del Admin). La marca no se marca a mano. */
export type EleccionDeRasgos = { nadie_la_tiene?: boolean; en_tendencia?: boolean; tela_que_se_nota?: boolean };

/**
 * Lo que la prenda tiene, en el orden de la hoja: lo que marcó la persona, la tela por su tejido si la persona no dijo nada (puede quitarla
 * en una prenda que no la merezca) y la marca por la lista, siempre.
 */
export function rasgosEfectivos(eleccion: EleccionDeRasgos, auto: { tejidoSeNota: boolean; marcaConocida: boolean }): Rasgo[] {
  const tiene: Record<Rasgo, boolean> = {
    nadie_la_tiene: eleccion.nadie_la_tiene === true,
    en_tendencia: eleccion.en_tendencia === true,
    tela_que_se_nota: eleccion.tela_que_se_nota ?? auto.tejidoSeNota,
    marca_conocida: auto.marcaConocida,
  };
  return RASGOS.filter((r) => tiene[r]);
}

/** De vuelta: lo guardado en una línea como lo que había marcado la persona (para corregirla sin perder nada). */
export function eleccionDeRasgos(rasgos: readonly Rasgo[]): EleccionDeRasgos {
  return {
    nadie_la_tiene: rasgos.includes("nadie_la_tiene"),
    en_tendencia: rasgos.includes("en_tendencia"),
    tela_que_se_nota: rasgos.includes("tela_que_se_nota"),
  };
}

/** Lo que viaja a `guardar_rasgos_de_producto` (20261124183000). */
export type RasgosParaGuardar = { p_nadie_la_tiene: boolean; p_en_tendencia: boolean; p_tela_que_se_nota: boolean | null };

/**
 * Lo marcado en Catálogo, como se guarda: `null` si la persona no tocó ninguna casilla (no hay nada que guardar). La tela que no tocó viaja
 * nula: sigue a su tejido, y si el Admin cambia la lista, cambia con ella.
 */
export function eleccionParaGuardar(e: EleccionDeRasgos): RasgosParaGuardar | null {
  if (e.nadie_la_tiene === undefined && e.en_tendencia === undefined && e.tela_que_se_nota === undefined) return null;
  return { p_nadie_la_tiene: e.nadie_la_tiene === true, p_en_tendencia: e.en_tendencia === true, p_tela_que_se_nota: e.tela_que_se_nota ?? null };
}

/** De vuelta: lo guardado de una prenda (`fn_producto_rasgos`) como lo que la persona había marcado. La tela nula queda sin decir. */
export function leerEleccionGuardada(data: unknown): EleccionDeRasgos {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const d = data as Record<string, unknown>;
  return {
    nadie_la_tiene: d.nadie_la_tiene === true,
    en_tendencia: d.en_tendencia === true,
    ...(typeof d.tela_que_se_nota === "boolean" ? { tela_que_se_nota: d.tela_que_se_nota } : {}),
  };
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
  for (const rasgo of RASGOS) {
    const n = r.puntos[rasgo];
    if (!Number.isInteger(n) || n < 0 || n > PUNTOS_MAX) return `«${NOMBRE_RASGO[rasgo]}» suma de 0 a ${PUNTOS_MAX} %.`;
  }
  // La suma sin el tope de `margenObjetivo`: aquí el tope es justo lo que se revisa.
  if (RASGOS.reduce((t, rasgo) => t + r.puntos[rasgo], r.margenBase) > MARGEN_TOPE) return `La base con todas las casillas no puede pasar de ${MARGEN_TOPE} %.`;
  return null;
}

/** El margen objetivo de una prenda: la base más los puntos de lo que tiene (cada rasgo cuenta una vez), con el tope de la base de datos. */
export function margenObjetivo(reglas: ReglasDePrecio, rasgos: Iterable<Rasgo>): number {
  let suma = reglas.margenBase;
  for (const r of new Set(rasgos)) suma += reglas.puntos[r] ?? 0;
  return Math.min(MARGEN_TOPE, suma);
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
