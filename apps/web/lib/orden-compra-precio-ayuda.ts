// La ayuda de precio de «Nueva orden de compra» (Felipe 2026-10-21 y 2026-10-22; diseño `docs/pantallas/compras-ordenes-precio-y-stock.md`,
// §4.2 y §4.5; maqueta `docs/maquetas/ordenes-compra-precio-2026-10/`). La encargada de compras sugiere el PRECIO DE VENTA de cada línea y
// esto le dice, con la cuenta hecha: cuánto le queda, cuánto le quedaría si rebaja, cómo está frente a la categoría y si algo parece un error.
// Lógica pura: sin I/O ni React; la pantalla (actividad 4) la dibuja, y la comparación con la categoría y el último costo se la entregan
// funciones de lectura (actividad 3). NUNCA bloquea: devuelve avisos, no errores de validación. Sin pantalla todavía: `knip.ts` la declara en
// `ignoreFiles` hasta que la actividad 4 la importe (y entonces se saca de ahí).
//
// UNA SOLA BASE (ADR-0417, aprobada). El precio de venta lleva IGV (18 %) y el costo que se escribe también (todas las órdenes lo incluyen,
// Felipe 2026-10-22). Con FACTURA el IGV de la compra se recupera como crédito fiscal: el costo real es lo pagado ÷ 1,18 y el 18 % se
// cancela, así que el margen es (precio − costo) ÷ precio. SIN factura (boleta, nota de venta, sin comprobante) ese IGV queda dentro del
// costo y la ganancia baja 7 a 10 puntos. Todos los soles que se dicen van SIN IGV (la plata que de verdad queda); los porcentajes, con un
// decimal. Al armar la orden aún no hay comprobante: la pantalla supone factura si el proveedor tiene RUC (`conFactura`).
//
// TRES COSAS QUE NO SON LO MISMO. GANANCIA (margen): lo que queda por prenda y qué parte del precio es: la cifra principal. RECARGO
// (markup): cuántas veces el costo; solo se explica en «¿Por qué?» (error típico: creer que ×1.4 da 40 %; da 29 %). REBAJA (markdown): lo
// que queda si el precio baja; el precio rebajado se redondea hacia abajo al S/ 0.10 (ADR-0403), igual que en caja.
//
// QUÉ DESCUENTO DEBE AGUANTAR. El PISO: una rebaja fuerte de 35 % (el tope de un líder a mano en caja, ADR-0054; no es el tope de las
// campañas) y que aún dejen 20 % del precio ya rebajado, antes de pagar alquiler y sueldos. Equivale a ~48 % de ganancia en lista. Es un
// peor caso, no una meta: no hay zona «sana» hasta tener datos propios (ningún gran minorista publica su margen inicial ni su tope de
// rebaja). La prueba se hace con el precio YA redondeado y en céntimos enteros: lo que dice «necesitas un precio desde S/ X» nunca
// contradice a la cuenta.
//
// CORTES QUE SON SUPUESTOS DE DISEÑO (confianza baja; ningún estudio de ropa los respalda): ±10/25/50 % sobre el precio del medio, 8× y 1/8×
// para sospechar un cero, 85 % de ganancia para pedir confirmar, 3 y 10 prendas para la referencia. Viven aquí, en un solo lugar, para
// ajustarlos con datos propios. El único corte que NO es supuesto es el del costo: es la banda de ADR-0298 de la base
// (`fn_costo_fuera_de_banda`: sube > 2×, baja < 2/3), para que la orden avise ANTES de que lo haga la recepción.

import { soles } from "./compras-reglas";

/** La tasa del IGV. */
export const IGV = 1.18;

/** La rebaja fuerte con la que se prueba el piso: el tope de un líder a mano en caja (ADR-0054). */
export const REBAJA_FUERTE_PCT = 35;
/** La rebaja que se muestra al lado: desde ahí caja pide un argumento escrito (2026-09-25). */
export const REBAJA_MEDIA_PCT = 15;
/** Lo que debe quedar del precio ya rebajado, en milésimas (20 %). */
export const GANANCIA_TRAS_REBAJA_POR_MIL = 200;
/** La ganancia en lista a partir de la cual se pide confirmar costo y precio, en milésimas (85 %). */
export const GANANCIA_SOSPECHOSA_POR_MIL = 850;
/** Menos prendas que esto en la categoría y no hay con qué comparar. */
export const MIN_PRENDAS_REFERENCIA = 3;
/** Desde aquí el precio del medio es una referencia estable; entre `MIN_PRENDAS_REFERENCIA` y esto es solo una pista. */
export const PRENDAS_REFERENCIA_ESTABLE = 10;
/** El tope del precio (y del costo) en la base: `variantes_precio_con_tope`. */
const TOPE_SOLES = 5000;
/** La ganancia en lista a partir de la cual el piso se cumple (~48 %): 1 − 0.8·(1 − 0.35). Solo para el aviso de éxito: la prueba real es `aguantaCts`. */
const PISO_DE_GANANCIA_POR_MIL = Math.round((1 - (1 - GANANCIA_TRAS_REBAJA_POR_MIL / 1000) * (1 - REBAJA_FUERTE_PCT / 100)) * 1000);

export type NivelAviso = "error" | "atencion" | "info" | "exito";

/** Las listas cortas que la franja ofrece (el motivo se guarda en la línea; nunca se suma por persona). */
export type ClaveMotivo = "alto" | "bajo" | "perdida" | "cero" | "confirmar" | "sinref" | "costo";

export type Motivos = { pregunta: string; opciones: readonly string[] };

/** Las listas cortas que la franja ofrece cuando un aviso abre una pregunta. */
export const MOTIVOS: Readonly<Record<ClaveMotivo, Motivos>> = {
  alto: {
    pregunta: "¿Qué ve el cliente que justifique pagar más? (puedes marcar varias)",
    opciones: [
      "Diseño propio, no se ve en otras tiendas",
      "Tela o confección mejor, se nota al tocarla",
      "Calce que se nota al probársela",
      "Edición corta: pocas unidades y no se repite",
      "Línea que los clientes ya piden por su nombre",
      "Otro motivo",
      "Aún no lo sé",
    ],
  },
  bajo: {
    pregunta: "¿Qué estrategia aplicas con este precio? (puedes marcar varias)",
    opciones: [
      "Gancho: traer gente para que lleve más",
      "Entrar barato para ganar clientes y subir después",
      "Rotar rápido",
      "Salir de un lote de remate",
      "Básico que el cliente compara con otras tiendas",
      "Mi costo es más bajo (Taller o volumen)",
      "Rebaja planificada: el precio ya la cuenta",
      "Aún no lo sé",
    ],
  },
  perdida: { pregunta: "¿Qué quieres lograr con este precio?", opciones: ["Traer gente con un gancho", "Salir de un lote de remate", "Fue un error, lo corrijo", "Otro"] },
  cero: { pregunta: "¿El precio es correcto?", opciones: ["Sí, es correcto", "Me equivoqué con un cero, lo corrijo", "Aún no lo sé"] },
  confirmar: { pregunta: "¿El costo y el precio son correctos?", opciones: ["Sí, son correctos", "Corrijo el costo", "Corrijo el precio", "Aún no lo sé"] },
  sinref: {
    pregunta: "¿En qué te basas para este precio?",
    opciones: ["Una prenda parecida que ya vendemos", "El precio de otra tienda o de Gamarra", "El costo por un múltiplo (costo por dos, por ejemplo)", "Aún no lo sé"],
  },
  costo: { pregunta: "¿El costo es correcto?", opciones: ["Sí, el proveedor lo subió o lo bajó", "Me equivoqué, lo corrijo", "Aún no lo sé"] },
};

export type IdAviso =
  | "sin-costo"
  | "precio-no-cubre-costo"
  | "cero-de-mas"
  | "cero-de-menos"
  | "margen-muy-alto"
  | "costo-sube"
  | "costo-baja"
  | "rebaja-pierde"
  | "rebaja-poco"
  | "precio-muy-alto"
  | "precio-alto"
  | "precio-algo-alto"
  | "precio-normal"
  | "precio-bajo"
  | "precio-muy-bajo"
  | "cuenta-mas"
  | "cuenta-menos"
  | "sin-referencia"
  | "referencia-debil"
  | "sin-factura"
  | "ayuda-sin-precio"
  | "todo-calza";

export type AvisoDePrecio = {
  id: IdAviso;
  nivel: NivelAviso;
  /** El rótulo corto de arriba del aviso. */
  etiqueta: string;
  texto: string;
  /** Lo que se abre con «¿Por qué?»: la teoría en simple. */
  porQue: string;
  /** El nombre corto de la idea de teoría que hay detrás. */
  teoria: string;
  /** La lista corta de motivos que este aviso abre. Varios avisos pueden compartir la misma: la pantalla la pregunta UNA vez por línea. */
  motivo?: ClaveMotivo;
};

/** Lo que se compara: la categoría, o «categoría marca» cuando hay prendas de esa marca (lo decide la función de lectura, actividad 3). */
export type ReferenciaDePrecio = {
  /** Cómo se le dice en pantalla («Polos» o «Polos CAYLA»). */
  nombre: string;
  /** El precio de etiqueta de la prenda que queda en la mitad (el del medio, no el promedio: un precio fuera de lo normal no lo mueve). */
  precioDelMedio: number | null;
  /** Cuántas prendas lo sustentan. */
  prendas: number;
};

export type EntradaAyudaPrecio = {
  /** «Costo u.» tal como se escribe (con IGV). `null` si está vacío. */
  costo: number | null;
  /** El descuento del proveedor en esa línea, en %. */
  descuentoPct: number;
  /** Con factura el IGV de la compra se recupera; sin ella queda dentro del costo. */
  conFactura: boolean;
  /** El precio sugerido, al público (con IGV). `null` si está vacío. */
  precio: number | null;
  referencia: ReferenciaDePrecio;
  /** El último costo por prenda de esto (ya neto de su descuento), si se conoce: se compara con la banda de ADR-0298. */
  costoDeReferencia?: number | null;
  /** Una familia fuera de los motores (bolsas, cajas, empaque) admite precio 0: ahí no hay promedio ni avisos de margen. */
  fueraDeLosMotores?: boolean;
};

/** La cuenta de una línea, en soles sin IGV. `ganancia` y `margenPorMil` son `null` si no hay precio. */
export type CuentaDeLinea = {
  /** Lo que cuesta cada prenda tras el descuento del proveedor, tal como se paga. */
  costoNeto: number;
  /** El costo sin el IGV que se recupera (con factura). */
  costoReal: number;
  precioSinIgv: number | null;
  ganancia: number | null;
  /** La ganancia sobre el precio sin IGV, en milésimas y redondeada a un decimal de %: 583 = 58.3 %. */
  margenPorMil: number | null;
  /** Cuántas veces el costo (el recargo), p. ej. 2.4. */
  recargo: number | null;
};

/** Lo que queda si el precio baja `pct` %. */
export type Rebaja = { pct: number; precio: number; ganancia: number; margenPorMil: number };

export type AyudaDePrecio = {
  cuenta: CuentaDeLinea | null;
  rebaja15: Rebaja | null;
  rebaja35: Rebaja | null;
  /** El menor precio que aguanta la rebaja fuerte dejando 20 %. `null` si no hay costo. */
  precioMinimo: number | null;
  /** Lo que el botón «Usar el precio habitual» escribe: el precio del medio, si hay prendas para decirlo. */
  precioHabitual: number | null;
  /** El más grave primero (error, atención, información, éxito); dentro de cada nivel, en el orden en que se ocurren. */
  avisos: AvisoDePrecio[];
};

/* ───────────────────────── La cuenta, en céntimos enteros ───────────────────────── */

const cts = (n: number): number => Math.round(n * 100);
const soles2 = (c: number): number => c / 100;

/** Hacia abajo al S/ 0.10 (ADR-0403), en céntimos. */
function conRebajaCts(precioCts: number, pct: number): number {
  return Math.floor((precioCts * (100 - pct)) / 1000) * 10;
}

/** La ganancia sobre el precio sin IGV, en milésimas redondeadas a un decimal de %. `null` si el precio no es positivo. */
function margenPorMilCts(precioCts: number, costoRealCts: number): number | null {
  if (precioCts <= 0) return null;
  const ps = precioCts / IGV;
  return Math.round(((ps - costoRealCts) / ps) * 1000);
}

/** ¿Este precio, ya rebajado `REBAJA_FUERTE_PCT` %, deja al menos `dejando` milésimas? */
function aguantaCts(precioCts: number, costoRealCts: number, dejando: number): boolean {
  const pd = conRebajaCts(precioCts, REBAJA_FUERTE_PCT);
  if (pd <= 0) return false;
  const m = margenPorMilCts(pd, costoRealCts);
  return m !== null && m >= dejando;
}

/** El menor precio (de a S/ 0.10) que aguanta la rebaja fuerte dejando `dejando` milésimas del precio rebajado. */
function precioMinimoCts(costoRealCts: number, dejando: number): number | null {
  if (!(costoRealCts > 0)) return null;
  // El menor precio rebajado que deja `dejando` es ≥ 1.18·costo/(1 − dejando/1000); se arranca por debajo y se sube de a S/ 0.10.
  let p = Math.max(10, Math.floor((costoRealCts * 1.1) / 0.65 / 10) * 10);
  while (p <= TOPE_SOLES * 100) {
    if (aguantaCts(p, costoRealCts, dejando)) return p;
    p += 10;
  }
  return null;
}

function costoRealCtsDe(costoNetoCts: number, conFactura: boolean): number {
  return conFactura ? costoNetoCts / IGV : costoNetoCts;
}

function costoNetoCtsDe(costo: number, descuentoPct: number): number {
  const d = Math.min(100, Math.max(0, Number.isFinite(descuentoPct) ? descuentoPct : 0));
  return cts(costo) * (1 - d / 100);
}

/**
 * La cuenta de una línea (soles sin IGV). `precio` null = todavía no hay: solo costo neto y costo real.
 */
export function cuentaDeLinea(costo: number, descuentoPct: number, conFactura: boolean, precio: number | null): CuentaDeLinea {
  const netoCts = costoNetoCtsDe(costo, descuentoPct);
  const realCts = costoRealCtsDe(netoCts, conFactura);
  const out: CuentaDeLinea = { costoNeto: soles2(netoCts), costoReal: soles2(realCts), precioSinIgv: null, ganancia: null, margenPorMil: null, recargo: null };
  if (precio !== null && precio > 0) {
    const pCts = cts(precio);
    const ps = pCts / IGV;
    out.precioSinIgv = soles2(ps);
    out.ganancia = soles2(ps - realCts);
    out.margenPorMil = margenPorMilCts(pCts, realCts);
    out.recargo = netoCts > 0 ? pCts / netoCts : null;
  }
  return out;
}

/**
 * Lo que queda si el precio baja `pct` %: el precio rebajado se redondea hacia abajo al S/ 0.10. `costoReal` en soles.
 */
export function conRebaja(precio: number, costoReal: number, pct: number): Rebaja {
  const pd = conRebajaCts(cts(precio), pct);
  const realCts = costoReal * 100; // el costo real NO se redondea a céntimos: arrastraría un céntimo de más a la ganancia
  const ps = pd / IGV;
  return { pct, precio: soles2(pd), ganancia: soles2(ps - realCts), margenPorMil: margenPorMilCts(pd, realCts) ?? -1000 };
}

/**
 * El menor precio que aguanta una rebaja de 35 % dejando 20 % del precio rebajado (el PISO), de a S/ 0.10. `null` si no hay costo o ningún
 * precio hasta el tope lo logra.
 */
export function precioMinimoPiso(costoReal: number): number | null {
  const c = precioMinimoCts(costoReal * 100, GANANCIA_TRAS_REBAJA_POR_MIL);
  return c === null ? null : soles2(c);
}

/** El menor precio con el que una rebaja de 35 % no pierde plata (deja 0 % o más). */
function precioMinimoSinPerder(costoReal: number): number | null {
  const c = precioMinimoCts(costoReal * 100, 0);
  return c === null ? null : soles2(c);
}

/**
 * El mayor «Costo u.» que se puede escribir (con el mismo descuento y la misma factura) para que `precio` aguante el piso. `null` si ni un
 * centavo de costo lo logra.
 */
export function costoMaximoQueAguanta(precio: number, descuentoPct: number, conFactura: boolean): number | null {
  const pCts = cts(precio);
  const pd = conRebajaCts(pCts, REBAJA_FUERTE_PCT);
  if (pd <= 0) return null;
  const d = Math.min(100, Math.max(0, descuentoPct));
  if (d >= 100) return null;
  // El costo real más alto con que el precio rebajado aún deja 20 %: 0.8·pd/1.18. Se pasa a lo que se escribe y se afina de a un centavo.
  const typedDe = (realCts: number) => (conFactura ? realCts * IGV : realCts) / (1 - d / 100);
  let t = Math.floor(typedDe((1 - GANANCIA_TRAS_REBAJA_POR_MIL / 1000) * (pd / IGV)));
  const ok = (x: number) => x >= 1 && aguantaCts(pCts, costoRealCtsDe(costoNetoCtsDe(x / 100, d), conFactura), GANANCIA_TRAS_REBAJA_POR_MIL);
  while (t >= 1 && !ok(t)) t -= 1;
  while (ok(t + 1)) t += 1;
  return t >= 1 ? soles2(t) : null;
}

/* ───────────────────────── Dónde está el precio frente a la categoría ───────────────────────── */

export type BandaDePrecio = "cero-de-menos" | "muy-bajo" | "bajo" | "normal" | "algo-alto" | "alto" | "muy-alto" | "cero-de-mas";

/** El precio contra el precio del medio, en milésimas (1000 = igual). En céntimos enteros. */
export function razonPorMil(precio: number, precioDelMedio: number): number {
  return Math.round((cts(precio) * 1000) / cts(precioDelMedio));
}

/**
 * La banda del precio. Cada milésima cae en UNA sola banda: 8× o más (cero de más) · más de 1.50 muy alto · más de 1.25 alto · más de 1.10
 * algo alto · de 0.90 a 1.10 normal · de 0.50 a menos de 0.90 bajo · más de 1/8 y menos de 0.50 muy bajo · 1/8 o menos (cero de menos).
 */
export function bandaDePrecio(razon: number): BandaDePrecio {
  if (razon >= 8000) return "cero-de-mas";
  if (razon > 1500) return "muy-alto";
  if (razon > 1250) return "alto";
  if (razon > 1100) return "algo-alto";
  if (razon >= 900) return "normal";
  if (razon >= 500) return "bajo";
  if (razon > 125) return "muy-bajo";
  return "cero-de-menos";
}

/* ───────────────────────── Los textos ───────────────────────── */

/** Un porcentaje con un decimal y espacio: 583 → «58.3 %». */
const pctTexto = (porMil: number): string => `${(porMil / 10).toFixed(1)} %`;
const vecesTexto = (x: number): string => x.toFixed(1);
const prendasTexto = (n: number): string => (n === 0 ? "0 prendas" : n === 1 ? "solo 1 prenda" : `solo ${n} prendas`);

const RANGO: Readonly<Record<NivelAviso, number>> = { error: 0, atencion: 1, info: 2, exito: 3 };

type Datos = {
  e: EntradaAyudaPrecio;
  costoNeto: number;
  costoReal: number;
  precio: number;
  precioSinIgv: number;
  igv: number;
  ganancia: number;
  margenPorMil: number;
  rebaja35: Rebaja;
  hayReferencia: boolean;
  medio: number;
  banda: BandaDePrecio | null;
  razon: number | null;
  /** Los avisos del costo (más del doble o menos de 2/3 del último): si hay uno, las cuentas no «cierran». */
  previos: readonly AvisoDePrecio[];
};

/** Cobrar más que el precio del medio: cuánto en soles y qué porcentaje. */
function frase(d: Datos): { dif: number; difAbs: number; arriba: boolean; pct: number } {
  const dif = soles2(cts(d.precio) - cts(d.medio));
  const pct = Math.abs((d.razon ?? 1000) - 1000);
  return { dif, difAbs: Math.abs(dif), arriba: dif > 0, pct };
}

function avisosConPrecio(d: Datos): AvisoDePrecio[] {
  const { e } = d;
  const out: AvisoDePrecio[] = [];
  const nombre = e.referencia.nombre;
  const pierde = cts(d.ganancia) <= 0;
  const banda = d.banda;
  const ceroDeMas = banda === "cero-de-mas";
  const ceroDeMenos = banda === "cero-de-menos";
  const r35 = d.rebaja35;
  const aguanta = aguantaCts(cts(d.precio), d.costoReal * 100, GANANCIA_TRAS_REBAJA_POR_MIL);
  const fr = d.hayReferencia ? frase(d) : null;

  /* error */
  if (pierde && !ceroDeMenos) {
    out.push({
      id: "precio-no-cubre-costo",
      nivel: "error",
      etiqueta: "El precio no cubre el costo",
      motivo: "perdida",
      texto: `Con este precio ${d.ganancia < 0 ? `pierdes ${soles(-d.ganancia)}` : "no ganas nada"} por prenda: cobras ${soles(d.precioSinIgv)} sin IGV y la prenda te cuesta ${soles(d.costoReal)}. Conviene revisar el precio o el costo antes de comprar.`,
      porQue: `De los ${soles(d.precio)} que paga el cliente, ${soles(d.igv)} son IGV y van a SUNAT: te quedan ${soles(d.precioSinIgv)}. Si eso es menos de lo que te cuesta la prenda, cada venta resta. Puede ser a propósito (un gancho, un lote de remate) o un descuido al digitar (un cero de más o de menos).`,
      teoria: "Ganancia por prenda",
    });
  }
  if (ceroDeMas && fr) {
    out.push({
      id: "cero-de-mas",
      nivel: "error",
      etiqueta: "Revisa el precio",
      motivo: "cero",
      texto: `Pones ${soles(d.precio)}, que son ${soles(fr.difAbs)} más que el precio del medio de ${nombre} (${soles(d.medio)}) y ${vecesTexto((d.razon ?? 0) / 1000)} veces su valor. ¿Sobra un cero?`,
      porQue:
        "Un cero de más multiplica el precio por 10 y es el error de digitación más caro. Con 8 veces el precio del medio o más, lo primero que conviene descartar es un error al escribir, antes de pensar que es una decisión de precio. Si es correcto, puedes seguir: esto avisa, no bloquea.",
      teoria: "Distancia a la categoría",
    });
  }
  if (ceroDeMenos && fr) {
    out.push({
      id: "cero-de-menos",
      nivel: "error",
      etiqueta: "Revisa el precio",
      motivo: "cero",
      texto: `Pones ${soles(d.precio)}, que son ${soles(fr.difAbs)} menos que el precio del medio de ${nombre} (${soles(d.medio)}) y solo el ${Math.round((d.razon ?? 0) / 10)} % de él. ¿Falta un cero?`,
      porQue:
        "Un cero de menos divide el precio entre 10. Con un octavo del precio del medio o menos, lo primero que conviene descartar es un error de digitación. Si de verdad quieres ese precio, puedes seguir: esto avisa, no bloquea.",
      teoria: "Distancia a la categoría",
    });
  }

  /* atención: la rebaja (si el precio parece tener un cero de menos, la cuenta de la rebaja es ruido: primero se corrige el precio) */
  if (!pierde && !ceroDeMenos) {
    if (cts(r35.ganancia) < 0) {
      const sinPerder = precioMinimoSinPerder(d.costoReal);
      out.push({
        id: "rebaja-pierde",
        nivel: "atencion",
        etiqueta: "No aguanta una rebaja fuerte",
        texto: `Si esta prenda entrara a una rebaja de ${REBAJA_FUERTE_PCT} %, la cobrarías a ${soles(r35.precio)} y perderías ${soles(-r35.ganancia)} por prenda, porque tu costo real es ${soles(d.costoReal)}.${sinPerder !== null ? ` Para no perder, el precio tendría que ser desde ${soles(sinPerder)}.` : ""}`,
        porQue:
          "El 35 % es lo más que un líder puede dar a mano en caja; una campaña puede ser mayor o menor. Un precio que hoy te deja ganancia puede quedar bajo el costo con una rebaja fuerte, y el precio rebajado se redondea hacia abajo a los S/\u00a00.10.",
        teoria: "Margen frente a rebajas",
      });
    } else if (!aguanta) {
      const pmin = precioMinimoPiso(d.costoReal);
      const cmax = costoMaximoQueAguanta(d.precio, e.descuentoPct, e.conFactura);
      const salidas = [pmin !== null ? `un precio desde ${soles(pmin)}` : null, cmax !== null ? `pagar como máximo ${soles(cmax)} por prenda` : null].filter((x): x is string => x !== null);
      const altoYa = banda === "alto" || banda === "muy-alto" || banda === "algo-alto";
      out.push({
        id: "rebaja-poco",
        nivel: "atencion",
        etiqueta: "Aguanta poco una rebaja",
        ...(altoYa ? {} : { motivo: "bajo" as const }),
        texto: `Si llega a ${REBAJA_FUERTE_PCT} % de rebaja, te quedan ${soles(r35.ganancia)} por prenda (${pctTexto(r35.margenPorMil)}) antes de pagar alquiler y sueldos.${salidas.length ? ` Para dejar 20 % del precio ya rebajado necesitas ${salidas.join(" o ")}.` : ""}`,
        porQue:
          "Cuando una prenda sale a rebaja, el margen se come primero. Con menos de ~48 % de ganancia al precio de lista, una rebaja de 35 % deja menos de 20 % del precio rebajado, y de eso aún falta pagar alquiler y sueldos. No es una meta: es el peor caso.",
        teoria: "Margen frente a rebajas",
      });
    }
  }

  /* atención / info: frente a la categoría */
  if (banda && fr && !ceroDeMas && !ceroDeMenos) {
    const base = `${soles(fr.difAbs)} ${fr.arriba ? "más" : "menos"} que el precio del medio de ${nombre} (${soles(d.medio)})`;
    const pctT = pctTexto(fr.pct);
    if (banda === "muy-alto") {
      out.push({
        id: "precio-muy-alto",
        nivel: "atencion",
        etiqueta: "Precio muy alto",
        motivo: "alto",
        texto: `Cobras ${base}, un ${pctT} arriba: queda muy por encima de lo que hoy cobras ahí. Conviene comprar pocas unidades de prueba y poder defender el precio en 10 segundos frente al cliente.`,
        porQue:
          "Las categorías tienen escalones de precio que el cliente reconoce de un vistazo. Una prenda muy por encima del último escalón tiene pocas vecinas con quien compararse: el cliente puede dudar si es cara por buena o por error. Con poca rotación, además, el dinero queda parado.",
        teoria: "Escala de precios",
      });
    } else if (banda === "alto") {
      out.push({
        id: "precio-alto",
        nivel: "atencion",
        etiqueta: "Precio alto",
        motivo: "alto",
        texto: `Cobras ${base}, un ${pctT} arriba. Conviene tener una razón fuerte que las demás prendas no tengan, y saber cómo la vas a mostrar.`,
        porQue:
          "Entre 25 y 50 % arriba, la prenda tiende a dejar de compararse con las de al lado y el cliente decide con menos referencia. Si la razón no se ve, puede leerla como cara sin motivo, rotar lento y terminar en descuentos grandes.",
        teoria: "Diferenciación",
      });
    } else if (banda === "algo-alto") {
      out.push({
        id: "precio-algo-alto",
        nivel: "atencion",
        etiqueta: "Precio algo alto",
        motivo: "alto",
        texto: `Cobras ${base}, un ${pctT} arriba. Conviene poder nombrar dos razones que el cliente vea o toque sin que se las expliquen.`,
        porQue:
          "Si el cliente compara tu prenda con la de al lado y no ve por qué cuesta más, siente que paga de más, y en los estudios eso le pesa más que un ahorro del mismo tamaño. Hasta 10 % arriba no pedimos razón.",
        teoria: "Precio de referencia y diferenciación",
      });
    } else if (banda === "normal") {
      out.push({
        id: "precio-normal",
        nivel: "info",
        etiqueta: "Cerca del precio del medio",
        texto:
          fr.dif === 0
            ? `Tu precio de ${soles(d.precio)} es igual al precio del medio de ${nombre} (${soles(d.medio)}, ${e.referencia.prendas} prendas): se parece a lo que ya cobras en esta categoría.`
            : `Tu precio de ${soles(d.precio)} está ${soles(fr.difAbs)} ${fr.arriba ? "por encima del" : "por debajo del"} precio del medio de ${nombre} (${soles(d.medio)}, ${e.referencia.prendas} prendas), un ${pctT}: se parece a lo que ya cobras en esta categoría.`,
        porQue:
          "El precio del medio es el de la prenda que queda en la mitad: la mitad de la categoría cuesta menos y la otra mitad más. Si estás cerca, el cliente no tiene por qué ver tu prenda como cara ni como barata frente a las de al lado. Eso no dice que sea el precio ideal.",
        teoria: "Precio del medio de la categoría",
      });
    } else if (banda === "bajo" && !pierde) {
      out.push({
        id: "precio-bajo",
        nivel: "info",
        etiqueta: "Precio bajo",
        motivo: "bajo",
        texto: `Cobras ${base}, un ${pctT} abajo, y te quedan ${soles(d.ganancia)} por prenda (${pctTexto(d.margenPorMil)}). Si es a propósito, ¿qué estrategia es?`,
        porQue:
          "Cobrar menos que la categoría tiene sentido cuando trae gente con un gancho, rota más rápido, sale de un lote de remate, o cuando tu costo es de verdad más bajo y compartes esa ventaja con el cliente. Sin una de esas razones, bajar el precio es regalar ganancia.",
        teoria: "Estrategias de margen bajo",
      });
    } else if (banda === "muy-bajo" && !pierde) {
      out.push({
        id: "precio-muy-bajo",
        nivel: "atencion",
        etiqueta: "Precio muy bajo",
        motivo: "bajo",
        texto: `Cobras ${base} y te quedan ${soles(d.ganancia)} por prenda (${pctTexto(d.margenPorMil)}): queda muy por debajo de lo que hoy cobras ahí. ¿Qué estrategia aplicas con este precio?`,
        porQue:
          "Un precio muy bajo puede leerse como menos calidad y, si el margen también es bajo, deja poco espacio para campañas. Tiene sentido si traes gente con un gancho, rotas rápido, sales de un lote de remate, o si tu costo es de verdad más bajo.",
        teoria: "Estrategias de margen bajo",
      });
    }
  }

  /* info: la cuenta de las unidades (no pronostica ventas: solo dice cuánto hace falta) */
  if (!pierde && d.hayReferencia && banda && !ceroDeMas && !ceroDeMenos) {
    const gMedio = d.medio / IGV - d.costoReal;
    if (gMedio > 0) {
      if (banda === "bajo" || banda === "muy-bajo") {
        const mas = gMedio / d.ganancia - 1;
        out.push({
          id: "cuenta-mas",
          nivel: "info",
          etiqueta: "La cuenta de las unidades",
          texto: `Cobrando ${soles(d.precio)} en vez de ${soles(d.medio)}, ganas ${soles(gMedio - d.ganancia)} menos por prenda: para ganar lo mismo tendrías que vender ${mas <= 3 ? `${Math.round(mas * 100)} % más prendas` : "más de 4 veces las prendas"} que al precio del medio.`,
          porQue:
            "Es una cuenta, no un pronóstico: ganando menos en cada prenda, necesitas vender más prendas para llegar a la misma ganancia. Cuanto más bajo es tu margen, más grande es esa diferencia. La cuenta no dice si de verdad venderás más al bajar el precio.",
          teoria: "Equilibrio de unidades",
        });
      } else if (banda === "algo-alto" || banda === "alto" || banda === "muy-alto") {
        const menos = 1 - gMedio / d.ganancia;
        out.push({
          id: "cuenta-menos",
          nivel: "info",
          etiqueta: "La cuenta de las unidades",
          texto: `Cobrando ${soles(d.precio)} en vez de ${soles(d.medio)}, ganas ${soles(d.ganancia - gMedio)} más por prenda: puedes vender hasta ${Math.round(menos * 100)} % menos prendas que al precio del medio y ganar lo mismo.`,
          porQue:
            "Es la misma cuenta al revés: si cada prenda te deja más, necesitas menos ventas para llegar a la misma ganancia. Un precio alto suele venderse más lento, y esta cuenta no dice cuánto más lento ni cuánto te costará rebajar lo que sobre: solo marca hasta dónde te conviene.",
          teoria: "Equilibrio de unidades",
        });
      }
    }
  }

  /* info: ganancia sospechosamente alta, referencia y factura */
  if (!pierde && d.margenPorMil >= GANANCIA_SOSPECHOSA_POR_MIL && !ceroDeMas && !ceroDeMenos) {
    out.push({
      id: "margen-muy-alto",
      nivel: "info",
      etiqueta: "Margen muy alto",
      motivo: "confirmar",
      texto: `Te quedan ${soles(d.ganancia)} por prenda (${pctTexto(d.margenPorMil)}), un margen tan alto que conviene confirmar el costo y el precio. ¿Falta un cero en el costo o sobra uno en el precio?`,
      porQue:
        "Un cero de menos en el costo (S/\u00a02.50 en vez de S/\u00a025.00) o de más en el precio hace que todas las cuentas salgan muy bien por error, y se compra confiando en un margen que no existe. Puede ser real, por ejemplo una prenda del Taller con costo bajo: si lo es, sigue.",
      teoria: "Ganancia por prenda",
    });
  }
  if (!d.hayReferencia) {
    out.push({
      id: "sin-referencia",
      nivel: "info",
      etiqueta: "Sin referencia en la categoría",
      motivo: "sinref",
      texto: `Ganas ${soles(d.ganancia)} por prenda (${pctTexto(d.margenPorMil)}), pero ${nombre} tiene ${prendasTexto(e.referencia.prendas)} para comparar, así que no hay con qué decirte si ${soles(d.precio)} es un precio normal.`,
      porQue:
        "Para saber si un precio es normal hace falta compararlo con prendas parecidas, y aquí no hay suficientes. Sin esa referencia tampoco se puede avisar si sobra o falta un cero en el precio; tu propio costo es la guía. Anota igual en qué te basaste: sirve para revisar después.",
      teoria: "Precio del medio de la categoría",
    });
  } else if (e.referencia.prendas < PRENDAS_REFERENCIA_ESTABLE) {
    out.push({
      id: "referencia-debil",
      nivel: "info",
      etiqueta: "Referencia débil",
      texto: `El precio del medio de ${nombre} (${soles(d.medio)}) sale de solo ${e.referencia.prendas} prendas: úsalo como pista, no como regla.`,
      porQue:
        "El precio del medio es el de la prenda que queda en la mitad. Con pocas prendas ese medio es casi el precio de una sola, así que si está mal puesta, la comparación también. Con 10 o más ya es una referencia más estable.",
      teoria: "Precio del medio de la categoría",
    });
  }
  if (!e.conFactura) {
    const conFacturaCosto = d.costoNeto / IGV;
    const margenConFactura = Math.round((1 - conFacturaCosto / d.precioSinIgv) * 1000);
    out.push({
      id: "sin-factura",
      nivel: "info",
      etiqueta: "Sin factura",
      texto: `Sin factura no recuperas el IGV: tu costo real es ${soles(d.costoReal)} por prenda, ${soles(d.costoReal - conFacturaCosto)} más que con una factura del mismo monto. Por eso tu ganancia es ${pctTexto(d.margenPorMil)} y con esa factura sería ${pctTexto(margenConFactura)}.`,
      porQue:
        "Con factura a nombre de la empresa, el IGV que le pagas al proveedor se resta del IGV que cobras en tus ventas, así que no es un costo. Con boleta, nota de venta o sin comprobante no se resta y ese IGV se queda dentro del costo. La comparación supone que la factura costaría lo mismo que lo que pagas hoy.",
      teoria: "Crédito fiscal del IGV",
    });
  }

  /* éxito: todo cuadra a la vez, y no había nada más que decir sobre el precio */
  if (
    d.hayReferencia &&
    banda === "normal" &&
    d.margenPorMil >= PISO_DE_GANANCIA_POR_MIL &&
    aguanta &&
    ![...d.previos, ...out].some((a) => a.nivel === "error" || a.nivel === "atencion")
  ) {
    const i = out.findIndex((a) => a.id === "precio-normal");
    if (i >= 0) out.splice(i, 1); // «las cuentas cierran» ya dice lo del precio del medio
    out.push({
      id: "todo-calza",
      nivel: "exito",
      etiqueta: "Las cuentas cierran",
      texto: `Las cuentas cierran: ganas ${soles(d.ganancia)} por prenda (${pctTexto(d.margenPorMil)}), con una rebaja de ${REBAJA_FUERTE_PCT} % aún te quedan ${soles(r35.ganancia)}, y tu precio está a un ${pctTexto(Math.abs((d.razon ?? 1000) - 1000))} del precio del medio de ${nombre}.`,
      porQue:
        "Cuatro cosas cuadran a la vez: el precio cubre tu costo real con el IGV bien contado, no pierde ni con una rebaja fuerte, se parece al de las demás prendas de la categoría y deja un margen que aguanta. Eso no asegura que se venda: dice que, si se vende a este precio, la cuenta cuadra.",
      teoria: "Margen frente a rebajas",
    });
  }
  return out;
}

/**
 * La ayuda de una línea: la cuenta, la rebaja y los avisos. Pura y total: cualquier combinación de campos vacíos o raros devuelve algo
 * coherente (sin `NaN` en los textos) y nunca lanza.
 */
export function ayudaDePrecio(e: EntradaAyudaPrecio): AyudaDePrecio {
  const vacia: AyudaDePrecio = { cuenta: null, rebaja15: null, rebaja35: null, precioMinimo: null, precioHabitual: null, avisos: [] };
  if (e.fueraDeLosMotores) return vacia;

  const medioOk = e.referencia.precioDelMedio !== null && Number.isFinite(e.referencia.precioDelMedio) && e.referencia.precioDelMedio > 0;
  const hayReferencia = medioOk && e.referencia.prendas >= MIN_PRENDAS_REFERENCIA;
  const medio = hayReferencia ? (e.referencia.precioDelMedio as number) : 0;
  const precioHabitual = hayReferencia ? medio : null;

  const costoOk = e.costo !== null && Number.isFinite(e.costo) && e.costo > 0 && costoNetoCtsDe(e.costo, e.descuentoPct) > 0;
  if (!costoOk) {
    return {
      ...vacia,
      precioHabitual,
      avisos: [
        {
          id: "sin-costo",
          nivel: "atencion",
          etiqueta: "Falta el costo",
          texto: "Falta el costo: sin él no hay ganancia que calcular. Anótalo y verás al instante cuánto te queda por prenda.",
          porQue:
            "Sin costo, cualquier precio parece ganancia pura y todas las cuentas salen bien por error. Si aún no lo sabes, puedes guardar igual: esto avisa, no bloquea.",
          teoria: "Ganancia por prenda",
        },
      ],
    };
  }

  const costo = e.costo as number;
  const precioOk = e.precio !== null && Number.isFinite(e.precio) && e.precio > 0;
  const cuenta = cuentaDeLinea(costo, e.descuentoPct, e.conFactura, precioOk ? e.precio : null);
  const precioMinimo = precioMinimoPiso(cuenta.costoReal);
  const avisos: AvisoDePrecio[] = [];

  /* El costo contra el último que se pagó: la banda de ADR-0298 (la misma de la base), en céntimos enteros y con comparación estricta. */
  if (e.costoDeReferencia != null && Number.isFinite(e.costoDeReferencia) && e.costoDeReferencia > 0) {
    const nuevo = cts(cuenta.costoNeto);
    const previo = cts(e.costoDeReferencia);
    const nombre = e.referencia.nombre;
    if (nuevo > previo * 2) {
      avisos.push({
        id: "costo-sube",
        nivel: "atencion",
        etiqueta: "El costo subió mucho",
        motivo: "costo",
        texto: `Este costo (${soles(cuenta.costoNeto)}) es más del doble del último que pagaste por ${nombre} (${soles(e.costoDeReferencia)}). ¿Lo subió el proveedor o se escribió un cero de más?`,
        porQue:
          "Un costo con un cero de más contamina el costo de la prenda en todas las tiendas y no se puede deshacer desde la pantalla. Por eso, al recibir la mercadería, la base pide que un líder confirme un costo que pasa del doble: aquí se avisa antes, cuando corregirlo no cuesta nada.",
        teoria: "Costo fuera de lo normal",
      });
    } else if (nuevo * 3 < previo * 2) {
      avisos.push({
        id: "costo-baja",
        nivel: "atencion",
        etiqueta: "El costo bajó mucho",
        motivo: "costo",
        texto: `Este costo (${soles(cuenta.costoNeto)}) es menos de dos tercios del último que pagaste por ${nombre} (${soles(e.costoDeReferencia)}). ¿Te lo bajó el proveedor o falta un cero?`,
        porQue:
          "Un costo con un cero de menos hace que todas las cuentas salgan muy bien por error. Un error hacia abajo mueve poco el total, por eso la base lo mira desde dos tercios del costo anterior. Si el cambio es real, sigue.",
        teoria: "Costo fuera de lo normal",
      });
    }
  }

  let rebaja15: Rebaja | null = null;
  let rebaja35: Rebaja | null = null;

  if (!precioOk) {
    // Antes de escribir el precio: dos puntos de partida, no una recomendación.
    const piso = precioMinimo !== null ? ` Para aguantar una rebaja de ${REBAJA_FUERTE_PCT} % necesitas cobrar desde ${soles(precioMinimo)}.` : "";
    if (hayReferencia) {
      const gMedio = medio / IGV - cuenta.costoReal;
      const mMedio = margenPorMilCts(cts(medio), cuenta.costoReal * 100) ?? 0;
      avisos.push({
        id: "ayuda-sin-precio",
        nivel: "info",
        etiqueta: "Antes de escribir el precio",
        texto:
          gMedio > 0
            ? `A ${soles(medio)}, el precio del medio de ${e.referencia.nombre} (${e.referencia.prendas} prendas), con tu costo real de ${soles(cuenta.costoReal)} te quedarían ${soles(gMedio)} por prenda (${pctTexto(mMedio)}).${piso}`
            : `A ${soles(medio)}, el precio del medio de ${e.referencia.nombre} (${e.referencia.prendas} prendas), no cubrirías tu costo real de ${soles(cuenta.costoReal)}.${piso}`,
        porQue:
          "Son dos puntos de partida, no una recomendación: lo que hoy cobra la categoría y lo que necesitas cobrar para que la prenda aguante una campaña fuerte. Tu precio puede ir arriba o abajo si tienes una razón; al escribirlo verás tu ganancia exacta.",
        teoria: "Precio del medio de la categoría",
      });
    } else {
      avisos.push({
        id: "ayuda-sin-precio",
        nivel: "info",
        etiqueta: "Antes de escribir el precio",
        texto: `Con tu costo real de ${soles(cuenta.costoReal)}${precioMinimo !== null ? `, para aguantar una rebaja de ${REBAJA_FUERTE_PCT} % necesitas cobrar desde ${soles(precioMinimo)}` : ""}. ${e.referencia.nombre} tiene ${prendasTexto(e.referencia.prendas)} para comparar, así que no hay un precio de la categoría que mostrarte.`,
        porQue: "Sin prendas parecidas en la categoría, tu costo es la única guía que hay. Al escribir el precio verás tu ganancia exacta.",
        teoria: "Ganancia por prenda",
      });
    }
  } else {
    const precio = e.precio as number;
    rebaja15 = conRebaja(precio, cuenta.costoReal, REBAJA_MEDIA_PCT);
    rebaja35 = conRebaja(precio, cuenta.costoReal, REBAJA_FUERTE_PCT);
    const razon = hayReferencia ? razonPorMil(precio, medio) : null;
    const precioSinIgv = cuenta.precioSinIgv as number;
    avisos.push(
      ...avisosConPrecio({
        e,
        costoNeto: cuenta.costoNeto,
        costoReal: cuenta.costoReal,
        precio,
        precioSinIgv,
        igv: precio - precioSinIgv,
        ganancia: cuenta.ganancia as number,
        margenPorMil: cuenta.margenPorMil as number,
        rebaja35,
        hayReferencia,
        medio,
        banda: razon === null ? null : bandaDePrecio(razon),
        razon,
        previos: avisos,
      }),
    );
  }

  return {
    cuenta,
    rebaja15,
    rebaja35,
    precioMinimo,
    precioHabitual,
    avisos: avisos.map((a, i) => ({ a, i })).sort((x, y) => RANGO[x.a.nivel] - RANGO[y.a.nivel] || x.i - y.i).map(({ a }) => a),
  };
}
