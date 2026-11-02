// Finanzas ▸ Impuestos ▸ Comparar con SUNAT (ADR-0601): leer la PROPUESTA del SIRE que se baja del portal de SUNAT.
//
// Cada mes SUNAT arma una propuesta del Registro de Compras (RCE) y otra del de Ventas (RVIE) con los comprobantes electrónicos
// que recibió a nombre de CAYLA. El contador la acepta, la completa y la genera en el portal; el ERP solo la LEE para compararla
// con lo registrado, antes de que alguien la acepte a ciegas. Lógica pura: el texto del archivo entra, las líneas salen.
//
// El archivo es un txt con una fila de títulos y columnas separadas por «|» (Resolución 112-2021/SUNAT y sus anexos; manuales
// del API SIRE Ventas v31 y Compras v28). Se lee POR EL NOMBRE de la columna, nunca por su posición: SUNAT agrega columnas con
// cada resolución, y un lector por posición se rompería en silencio. Si falta una columna que se necesita, lo dice con su nombre.

import { textoMes as textoDeMes } from "./gastos-reglas";
import type { DecisionSire, ResolucionSire } from "./sire-cruce-reglas";

export type RegistroSire = "compras" | "ventas";

/** Un comprobante de la propuesta, ya normalizado. Montos en la moneda del comprobante (ver `moneda`). */
export type LineaSire = {
  /** Código de Anotación de Registro: el número con que SUNAT identifica la línea. */
  car: string | null;
  fecha: string;
  /** Tabla 10 de SUNAT: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito. */
  tipo: string;
  serie: string;
  /** Sin ceros a la izquierda: «00001234» y «1234» son el mismo comprobante. */
  numero: string;
  /** La otra parte: el proveedor en Compras, el cliente en Ventas. */
  docTipo: string | null;
  docNumero: string | null;
  nombre: string | null;
  base: number;
  igv: number;
  total: number;
  moneda: string;
  tipoCambio: number | null;
  /** El comprobante que modifica una nota de crédito o de débito. */
  refTipo: string | null;
  refSerie: string | null;
  refNumero: string | null;
};

export type PropuestaSire = { registro: RegistroSire; mes: string; rucPropio: string; lineas: LineaSire[] };

export type LecturaSire = { ok: true; propuesta: PropuestaSire } | { ok: false; error: string };

const NOMBRE_REGISTRO: Record<RegistroSire, string> = { compras: "compras", ventas: "ventas" };
/** Un título de columna sin tildes, mayúsculas ni signos: «IGV / IPM DG» → «igv ipm dg». */
export function normalizarTitulo(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** «00001234» → «1234»; «0» se queda en «0». */
export function numeroSinCeros(n: string): string {
  const limpio = n.trim().replace(/^0+(?=\d)/, "");
  return limpio === "" ? "0" : limpio;
}

/** Un monto de SUNAT: punto decimal, a veces con coma de miles. Vacío es 0. */
function monto(t: string | undefined): number {
  const s = (t ?? "").trim();
  if (s === "") return 0;
  const n = Number(s.includes(".") ? s.replace(/,/g, "") : s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** «05/10/2026» → «2026-10-05». Una fecha que ya viene en ISO se respeta. */
function fechaIso(t: string | undefined): string {
  const s = (t ?? "").trim();
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

/** «202610» o «20261000» → «2026-10». */
function mesDePeriodo(t: string | undefined): string | null {
  const m = /^(\d{4})(\d{2})/.exec((t ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

const vacioANull = (t: string | undefined) => {
  const s = (t ?? "").trim();
  return s === "" ? null : s;
};

/** El separador de la fila de títulos: «|» es el de SUNAT; tabulador, «;» o «,» si alguien lo abrió y guardó en Excel. */
function separadorDe(titulos: string): string {
  for (const s of ["|", "\t", ";"]) if (titulos.includes(s)) return s;
  return ",";
}

type Columnas = Record<string, number>;

/** Dónde está cada dato que se usa. `-1` si el archivo no lo trae. */
function ubicarColumnas(titulos: string[]): { col: Columnas; base: number[]; igv: number[]; registro: RegistroSire | null } {
  const n = titulos.map(normalizarTitulo);
  const exacta = (t: string) => n.indexOf(t);
  const empieza = (t: string, sin?: string) => n.findIndex((x) => x.startsWith(t) && (!sin || !x.includes(sin)));
  const col: Columnas = {
    ruc: exacta("ruc"),
    periodo: exacta("periodo"),
    car: empieza("car sunat"),
    fecha: empieza("fecha de emision", "modificado"),
    tipo: empieza("tipo cp doc"),
    serie: empieza("serie del cdp"),
    numero: empieza("nro cp o doc"),
    docTipo: empieza("tipo doc identidad"),
    docNumero: empieza("nro doc identidad"),
    nombre: exacta("apellidos nombres razon social"),
    total: empieza("total cp"),
    moneda: exacta("moneda"),
    tipoCambio: n.findIndex((x) => x === "tipo de cambio" || x === "tipo cambio"),
    refTipo: empieza("tipo cp modificado"),
    refSerie: empieza("serie cp modificado"),
    refNumero: empieza("nro cp modificado"),
  };
  // Compras separa la base y el IGV en tres destinos (DG, DGNG, DNG); Ventas trae una base gravada y su descuento. El IVAP (arroz) no
  // es IGV y CAYLA no lo vende: queda fuera de la base y del IGV, y cae en «otros» por la resta con el total.
  const indices = (pred: (x: string) => boolean) => n.flatMap((x, i) => (pred(x) ? [i] : []));
  const baseCompras = indices((x) => x.startsWith("bi gravado"));
  const baseVentas = indices((x) => (x === "bi gravada" || x === "dscto bi"));
  const igv = indices((x) => (x.startsWith("igv ipm") || x.startsWith("dscto igv")) && !x.includes("ivap"));
  const registro: RegistroSire | null = baseCompras.length > 0 ? "compras" : baseVentas.length > 0 ? "ventas" : null;
  return { col, base: registro === "compras" ? baseCompras : baseVentas, igv, registro };
}

const NECESARIAS: { clave: keyof Columnas; titulo: string }[] = [
  { clave: "ruc", titulo: "RUC" },
  { clave: "fecha", titulo: "Fecha de emisión" },
  { clave: "tipo", titulo: "Tipo CP/Doc." },
  { clave: "serie", titulo: "Serie del CDP" },
  { clave: "numero", titulo: "Nro CP o Doc. Nro Inicial (Rango)" },
  { clave: "total", titulo: "Total CP" },
];

/**
 * Lee el texto de la propuesta y comprueba que sea la que se espera: el registro (compras o ventas), el mes y el RUC de CAYLA.
 * Una propuesta sin comprobantes (solo la fila de títulos) es válida: SUNAT no recibió nada ese mes.
 */
export function leerPropuestaSire(texto: string, esperado: { registro: RegistroSire; mes: string; ruc: string }): LecturaSire {
  const filas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((f) => f.trim() !== "");
  if (filas.length === 0) return { ok: false, error: "El archivo está vacío. Bájalo otra vez del portal SIRE, en formato txt." };
  const sep = separadorDe(filas[0]!);
  const titulos = filas[0]!.split(sep);
  const { col, base, igv, registro } = ubicarColumnas(titulos);

  const falta = NECESARIAS.find((c) => col[c.clave] === -1);
  if (falta || registro === null) {
    return {
      ok: false,
      error: `No parece una propuesta del SIRE: falta la columna «${falta?.titulo ?? "BI Gravado"}». Bájala del portal SIRE en formato txt, sin abrirla en Excel.`,
    };
  }
  if (registro !== esperado.registro) {
    return { ok: false, error: `Este archivo es la propuesta de ${NOMBRE_REGISTRO[registro]}. Aquí va la de ${NOMBRE_REGISTRO[esperado.registro]}.` };
  }

  const lineas: LineaSire[] = [];
  for (const fila of filas.slice(1)) {
    const c = fila.split(sep);
    const v = (k: keyof Columnas) => (col[k] === -1 ? undefined : c[col[k]!]);
    const ruc = (v("ruc") ?? "").trim();
    if (ruc !== esperado.ruc) {
      return { ok: false, error: `Es la propuesta de otro RUC (${ruc || "sin RUC"}). La de CAYLA es la del RUC ${esperado.ruc}.` };
    }
    const mes = mesDePeriodo(v("periodo")) ?? fechaIso(v("fecha")).slice(0, 7);
    if (col.periodo !== -1 && mes !== esperado.mes) {
      return { ok: false, error: `Es la propuesta de ${textoDeMes(mes)} y estás comparando ${textoDeMes(esperado.mes)}. Elige el mes del archivo o baja el de ${textoDeMes(esperado.mes)}.` };
    }
    const tipo = (v("tipo") ?? "").trim().padStart(2, "0");
    const refNumero = vacioANull(v("refNumero"));
    lineas.push({
      car: vacioANull(v("car")),
      fecha: fechaIso(v("fecha")),
      tipo,
      serie: (v("serie") ?? "").trim().toUpperCase(),
      numero: numeroSinCeros(v("numero") ?? ""),
      docTipo: vacioANull(v("docTipo")),
      docNumero: vacioANull(v("docNumero")),
      nombre: vacioANull(v("nombre")),
      base: Math.round(base.reduce((s, i) => s + monto(c[i]), 0) * 100) / 100,
      igv: Math.round(igv.reduce((s, i) => s + monto(c[i]), 0) * 100) / 100,
      total: monto(v("total")),
      moneda: (vacioANull(v("moneda")) ?? "PEN").toUpperCase(),
      tipoCambio: vacioANull(v("tipoCambio")) ? monto(v("tipoCambio")) || null : null,
      refTipo: vacioANull(v("refTipo")),
      refSerie: vacioANull(v("refSerie"))?.toUpperCase() ?? null,
      refNumero: refNumero ? numeroSinCeros(refNumero) : null,
    });
  }
  return { ok: true, propuesta: { registro, mes: esperado.mes, rucPropio: esperado.ruc, lineas } };
}

/**
 * Los bytes del archivo a texto. SUNAT entrega UTF-8; si el archivo pasó por un Excel en Windows llega en Windows-1252 y las tildes
 * de los nombres se romperían: se prueba UTF-8 estricto y, si falla, el otro.
 */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** La propuesta guardada en la base (`fn_sire_propuesta`), con quién y cuándo se subió. */
export type PropuestaGuardada = {
  id: string;
  registro: RegistroSire;
  mes: string;
  origen: "archivo" | "api";
  archivo: string | null;
  subidaAt: string;
  subidaPor: string | null;
  /** Cuántas veces se subió la de ese mes (la vigente es la última). */
  versiones: number;
  lineas: LineaSire[];
  /** Lo decidido sobre las diferencias del mes (actividad 2), por la llave del comprobante. */
  resoluciones: ResolucionSire[];
};

type Fila = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));
const nro = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lo que devuelve `fn_sire_propuesta` (snake_case, montos como texto) a la forma de la web. `null` si nunca se subió. */
export function leerPropuestaGuardada(data: unknown): PropuestaGuardada | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Fila;
  const lineas = Array.isArray(d.lineas) ? (d.lineas as Fila[]) : [];
  return {
    id: String(d.id),
    registro: d.registro === "ventas" ? "ventas" : "compras",
    mes: String(d.mes),
    origen: d.origen === "api" ? "api" : "archivo",
    archivo: txt(d.archivo),
    subidaAt: String(d.subida_at ?? ""),
    subidaPor: txt(d.subida_por),
    versiones: nro(d.versiones),
    lineas: lineas.map((l) => ({
      car: txt(l.car),
      fecha: String(l.fecha ?? "").slice(0, 10),
      tipo: String(l.tipo ?? ""),
      serie: String(l.serie ?? ""),
      numero: String(l.numero ?? ""),
      docTipo: txt(l.doc_tipo),
      docNumero: txt(l.doc_numero),
      nombre: txt(l.nombre),
      base: nro(l.base),
      igv: nro(l.igv),
      total: nro(l.total),
      moneda: String(l.moneda ?? "PEN"),
      tipoCambio: l.tipo_cambio === null || l.tipo_cambio === undefined ? null : nro(l.tipo_cambio),
      refTipo: txt(l.ref_tipo),
      refSerie: txt(l.ref_serie),
      refNumero: txt(l.ref_numero),
    })),
    resoluciones: (Array.isArray(d.resoluciones) ? (d.resoluciones as Fila[]) : []).map((r) => ({
      id: String(r.id),
      clave: String(r.clave),
      decision: String(r.decision) as DecisionSire,
      nota: txt(r.nota),
      resueltaAt: String(r.resuelta_at ?? ""),
      resueltaPor: txt(r.resuelta_por),
    })),
  };
}

/** Las líneas leídas, en la forma que pide `guardar_propuesta_sire` (`p_lineas`). */
export function lineasParaGuardar(lineas: readonly LineaSire[]): Record<string, string | number | null>[] {
  return lineas.map((l) => ({
    car: l.car,
    fecha: l.fecha || null,
    tipo: l.tipo,
    serie: l.serie,
    numero: l.numero,
    doc_tipo: l.docTipo,
    doc_numero: l.docNumero,
    nombre: l.nombre,
    base: l.base,
    igv: l.igv,
    total: l.total,
    moneda: l.moneda,
    tipo_cambio: l.tipoCambio,
    ref_tipo: l.refTipo,
    ref_serie: l.refSerie,
    ref_numero: l.refNumero,
  }));
}
