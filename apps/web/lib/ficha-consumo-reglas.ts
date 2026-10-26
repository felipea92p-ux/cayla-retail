import { leerDinero } from "./modelo-nuevo-reglas";
import { CONSUMO_MAXIMO, aMilesimas, leerConsumo, type InsumoDelTaller } from "./orden-tela-reglas";
import { compararTallas } from "./tallas";

// La FICHA DE CONSUMO del modelo (ADR-0513, actividad 4): las reglas puras de la hoja. Sin React ni Supabase.
//
// EL PROBLEMA PRIMERO. Cuánta tela lleva cada talla de un modelo y qué avíos lleva solo se escribía de rebote, con una orden. La hoja «Ficha de consumo» la escribe donde la
// persona la busca (Nueva orden, la orden abierta, Editar producto) y la guarda con `guardar_ficha_consumo`, que la valida otra vez: la base manda. Aquí solo se LEE lo que
// devuelve `fn_ficha_consumo`, se arma el borrador, se avisa antes lo que la base rechazaría y se cuenta en qué escalón está el número (estimado → Audaces → medido).
//
// CONTRATO
//   PROMETE: que `problemasDeFicha` está vacío EXACTAMENTE cuando la base aceptaría lo que `paraRpc` arma (una cifra mayor que cero por cada talla del modelo, ningún avío repetido,
//            ningún color que el modelo no tenga, ningún insumo que no sea un avío vigente); que `hayCambios` ignora diferencias de formato («1.2» y «1.200»); y que `escalon` dice
//            «medido» solo cuando la base dice que manda lo medido (3 órdenes cerradas desde la última declaración).
//   ASUME:   las llaves de la cifra por talla son los nombres de talla del modelo (`tallas.valor`), como en la base.
//   NO HACE: no calcula el plan (eso es de la orden) ni decide el permiso (lo dice `puedeEditar`, que viene de la base); no escribe.

/** Los nombres de las funciones de la base que usa la hoja. */
export const RPC_LEER_FICHA = "fn_ficha_consumo";
export const RPC_GUARDAR_FICHA = "guardar_ficha_consumo";

/** Cuántas órdenes cerradas hacen falta para que lo gastado mande sobre lo declarado (P-21, Felipe 2026-10-16): la prueba lo compara con `fn_consumo_efectivo`. */
export const ORDENES_PARA_QUE_MANDE_LO_MEDIDO = 3;

export type AvioDeLaFicha = { insumoId: string; nombre: string; unidad: string; colorCodigo: string | null; cantidadPorPrenda: number };
export type OrdenCerradaDeLaFicha = { numero: number; cerradaEn: string; buenas: number; metros: number; cuenta: boolean };

export type FichaLeida = {
  productoId: string;
  referencia: string;
  /** Quien lee puede escribirla (Producción parado en el Taller); Catálogo la ve y no la cambia. */
  puedeEditar: boolean;
  tallas: string[];
  colores: { codigo: string; nombre: string }[];
  tela: { porPrenda: number; porTalla: Record<string, number> | null; declaradaEn: string } | null;
  avios: AvioDeLaFicha[];
  medido: { manda: "declarado" | "medido"; porPrenda: number | null; ordenes: number } | null;
  ordenesCerradas: OrdenCerradaDeLaFicha[];
};

type Crudo = Record<string, unknown>;
const esObjeto = (x: unknown): x is Crudo => typeof x === "object" && x !== null && !Array.isArray(x);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
const numero = (x: unknown): number | null => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

/** `fn_ficha_consumo` como lo usa la hoja. Null si no se puede leer (la base devuelve null a quien no puede, o la respuesta no tiene la forma). */
export function leerFicha(crudo: unknown): FichaLeida | null {
  if (!esObjeto(crudo)) return null;
  const productoId = texto(crudo.producto_id);
  const referencia = texto(crudo.referencia);
  if (!productoId || !referencia) return null;
  const tela = esObjeto(crudo.tela) && numero(crudo.tela.por_prenda) !== null ? crudo.tela : null;
  const porTalla = tela && esObjeto(tela.por_talla) ? Object.fromEntries(Object.entries(tela.por_talla).flatMap(([t, v]) => (numero(v) !== null ? [[t, Number(v)] as const] : []))) : null;
  const medido = esObjeto(crudo.medido) ? crudo.medido : null;
  return {
    productoId,
    referencia,
    puedeEditar: crudo.puede_editar === true,
    // De la más chica a la más grande (la base las entrega por nombre: M antes que S).
    tallas: lista(crudo.tallas).flatMap((t) => (texto(t) ? [t as string] : [])).sort(compararTallas),
    colores: lista(crudo.colores).flatMap((c) => (esObjeto(c) && texto(c.codigo) ? [{ codigo: c.codigo as string, nombre: texto(c.nombre) ?? (c.codigo as string) }] : [])),
    tela: tela ? { porPrenda: Number(tela.por_prenda), porTalla: porTalla && Object.keys(porTalla).length > 0 ? porTalla : null, declaradaEn: texto(tela.declarada_en) ?? "" } : null,
    avios: lista(crudo.avios).flatMap((a) =>
      esObjeto(a) && texto(a.insumo_id) && numero(a.cantidad_por_prenda) !== null
        ? [{ insumoId: a.insumo_id as string, nombre: texto(a.nombre) ?? "Avío", unidad: texto(a.unidad) ?? "unidad", colorCodigo: texto(a.color_codigo), cantidadPorPrenda: Number(a.cantidad_por_prenda) }]
        : []
    ),
    medido: medido ? { manda: medido.manda === "medido" ? "medido" : "declarado", porPrenda: numero(medido.por_prenda), ordenes: numero(medido.ordenes) ?? 0 } : null,
    ordenesCerradas: lista(crudo.ordenes_cerradas).flatMap((o) =>
      esObjeto(o) && numero(o.numero) !== null ? [{ numero: Number(o.numero), cerradaEn: texto(o.cerrada_en) ?? "", buenas: numero(o.buenas) ?? 0, metros: numero(o.metros) ?? 0, cuenta: o.cuenta === true }] : []
    ),
  };
}

// ---------- El escalón: de dónde sale el número ----------

/** `sin-ficha`: nadie ha dicho cuánto lleva · `estimado`: una sola cifra para todas las tallas · `audaces`: una cifra por talla · `medido`: manda lo gastado de verdad. */
export type Escalon = "sin-ficha" | "estimado" | "audaces" | "medido";

export function escalon(f: FichaLeida): Escalon {
  if (!f.tela) return "sin-ficha";
  if (f.medido?.manda === "medido") return "medido";
  return f.tela.porTalla ? "audaces" : "estimado";
}

// ---------- El borrador de la hoja ----------

export type FilaAvioBorrador = { clave: string; insumoId: string | null; colorCodigo: string | null; cantidad: string };
export type BorradorFicha = {
  /** «una» = una cifra para todas las tallas (aproximado); «talla» = una cifra por talla. Con menos de dos tallas solo hay «una». */
  modo: "una" | "talla";
  una: string;
  porTalla: Record<string, string>;
  avios: FilaAvioBorrador[];
};

const tresDecimales = (n: number) => aMilesimas(n).toFixed(3);

export function borradorDeFicha(f: FichaLeida): BorradorFicha {
  const porTalla = f.tela?.porTalla ?? null;
  const enTalla = porTalla !== null && f.tallas.length >= 2;
  return {
    modo: enTalla ? "talla" : "una",
    una: f.tela ? tresDecimales(f.tela.porPrenda) : "",
    porTalla: Object.fromEntries(f.tallas.map((t) => [t, porTalla && t in porTalla ? tresDecimales(porTalla[t]) : f.tela && !porTalla ? tresDecimales(f.tela.porPrenda) : ""])),
    avios: f.avios.map((a, i) => ({ clave: `a${i}`, insumoId: a.insumoId, colorCodigo: a.colorCodigo, cantidad: tresDecimales(a.cantidadPorPrenda) })),
  };
}

/** Pasar a «por talla»: cada talla parte de la cifra única que ya había. Con una sola talla no hace nada. */
export function separarFichaPorTalla(b: BorradorFicha, f: FichaLeida): BorradorFicha {
  if (f.tallas.length < 2) return b;
  return { ...b, modo: "talla", porTalla: Object.fromEntries(f.tallas.map((t) => [t, b.porTalla[t]?.trim() ? b.porTalla[t] : b.una])) };
}

/** Volver a una sola cifra: el promedio de lo que había por talla (si se lee entero; si no, la cifra que estaba). */
export function unirFichaEnUnaCifra(b: BorradorFicha, f: FichaLeida): BorradorFicha {
  const cifras = f.tallas.map((t) => leerConsumo(b.porTalla[t] ?? ""));
  const todas = cifras.length > 0 && cifras.every((c): c is number => c !== null);
  const promedio = todas ? tresDecimales((cifras as number[]).reduce((s, c) => s + c, 0) / cifras.length) : b.una;
  return { ...b, modo: "una", una: promedio };
}

// ---------- Lo que la base rechazaría ----------

export type ProblemaFicha = { campo: "tela" | "avios"; texto: string; talla?: string; fila?: string };

/** Las faltas de una cifra de consumo con la MISMA lectura que la base (un número, con punto, mayor que cero y hasta el tope). Null si está bien. */
function faltaDeCifra(valor: string, nombre: string): string | null {
  const l = leerDinero(valor);
  if (l.tipo === "coma") return `Escribe ${nombre} con punto, por ejemplo 1.200.`;
  if (l.tipo === "invalido") return `${nombre[0].toUpperCase()}${nombre.slice(1)} tiene que ser un número, por ejemplo 1.200.`;
  if (l.tipo === "vacio") return `Escribe ${nombre}, por ejemplo 1.200.`;
  if (l.tipo === "negativo" || l.valor <= 0) return `${nombre[0].toUpperCase()}${nombre.slice(1)} tiene que ser mayor que cero.`;
  if (l.valor > CONSUMO_MAXIMO) return `${nombre[0].toUpperCase()}${nombre.slice(1)} no puede pasar de ${CONSUMO_MAXIMO}.`;
  return null;
}

/**
 * Lo que la base rechazaría de este borrador, en el orden en que la base lo mira. La tela es opcional si el modelo todavía no tiene ficha (se pueden guardar solo los avíos), pero
 * una vez declarada no se puede dejar en blanco. Los avíos son una lista completa: vacía está bien (el modelo se queda sin avíos).
 */
export function problemasDeFicha(b: BorradorFicha, f: FichaLeida, insumos: readonly InsumoDelTaller[]): ProblemaFicha[] {
  const problemas: ProblemaFicha[] = [];
  const tallas = f.tallas;
  if (b.modo === "talla" && tallas.length >= 2) {
    for (const t of tallas) {
      const falta = faltaDeCifra(b.porTalla[t] ?? "", `cuánto lleva cada prenda de la talla ${t}`);
      if (falta) problemas.push({ campo: "tela", texto: falta, talla: t });
    }
  } else if (b.una.trim() !== "" || f.tela !== null) {
    const falta = faltaDeCifra(b.una, "cuánto lleva cada prenda");
    if (falta) problemas.push({ campo: "tela", texto: falta });
  }
  const porId = new Map(insumos.map((i) => [i.id, i] as const));
  const colores = new Set(f.colores.map((c) => c.codigo));
  const vistas = new Set<string>();
  for (const fila of b.avios) {
    const dec = (texto: string) => problemas.push({ campo: "avios", texto, fila: fila.clave });
    if (!fila.insumoId) {
      dec("Elige el avío o quítalo de la lista.");
      continue;
    }
    const insumo = porId.get(fila.insumoId);
    if (!insumo) dec("Ese avío no está en Insumos.");
    else if (insumo.archivado) dec(`«${insumo.nombre}» está archivado en Insumos: quítalo o desarchívalo.`);
    else if (insumo.tipo !== "avio") dec(`«${insumo.nombre}» es una tela: aquí solo van avíos.`);
    if (fila.colorCodigo !== null && !colores.has(fila.colorCodigo)) dec("El modelo no tiene ese color: elige otro o «Toda la orden».");
    const falta = faltaDeCifra(fila.cantidad, `cuánto lleva cada prenda de «${insumo?.nombre ?? "este avío"}»`);
    if (falta) dec(falta);
    const llave = `${fila.insumoId}\u0000${fila.colorCodigo ?? ""}`;
    if (vistas.has(llave)) dec(`«${insumo?.nombre ?? "Ese avío"}» ya está${fila.colorCodigo ? " para ese color" : ""}: va una sola vez.`);
    vistas.add(llave);
  }
  return problemas;
}

// ---------- Lo que viaja a la base ----------

export type FichaParaRpc = {
  p_tela: { por_prenda: string } | { por_talla: Record<string, string> } | null;
  p_avios: { insumo_id: string; color_codigo: string | null; consumo_por_prenda: string }[];
};

/** `guardar_ficha_consumo`: la tela solo viaja si hay algo que decir (en blanco y sin ficha previa, no se toca); los avíos siempre van, completos. */
export function paraRpc(b: BorradorFicha, f: FichaLeida): FichaParaRpc {
  let tela: FichaParaRpc["p_tela"] = null;
  if (b.modo === "talla" && f.tallas.length >= 2) tela = { por_talla: Object.fromEntries(f.tallas.map((t) => [t, (b.porTalla[t] ?? "").trim()])) };
  else if (b.una.trim() !== "" || f.tela !== null) tela = { por_prenda: b.una.trim() };
  return {
    p_tela: tela,
    p_avios: b.avios.flatMap((a) => (a.insumoId ? [{ insumo_id: a.insumoId, color_codigo: a.colorCodigo, consumo_por_prenda: a.cantidad.trim() }] : [])),
  };
}

const forma = (b: BorradorFicha, f: FichaLeida): string => {
  const cifra = (v: string) => (leerConsumo(v) === null ? `?${v.trim()}` : String(aMilesimas(leerConsumo(v) as number)));
  const tela = b.modo === "talla" && f.tallas.length >= 2 ? `T:${f.tallas.map((t) => `${t}=${cifra(b.porTalla[t] ?? "")}`).join(";")}` : `U:${b.una.trim() === "" ? "" : cifra(b.una)}`;
  const avios = b.avios
    .flatMap((a) => (a.insumoId ? [`${a.insumoId}|${a.colorCodigo ?? ""}|${cifra(a.cantidad)}`] : []))
    .sort()
    .join(",");
  return `${tela}#${avios}`;
};

/** ¿Lo que hay en la hoja es distinto de lo guardado? Una fila de avío sin elegir no cuenta. */
export function hayCambiosEnLaFicha(b: BorradorFicha, f: FichaLeida): boolean {
  return forma(b, f) !== forma(borradorDeFicha(f), f);
}
