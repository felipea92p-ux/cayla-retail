import { fechaCorta, textoMes } from "./gastos-reglas";
import { hoyLima } from "./fechas-lima";

// Finanzas ▸ Cierre de mes (ADR-0195 F9, ADR-0198): lógica PURA de la pantalla. La base decide qué está cerrado, qué
// chequeos aplican a cada unidad y si pasan (`fn_cierre_panel`, 20260925180000); aquí solo se leen y se ponen en palabras,
// y se arma el enlace a donde se arregla cada cosa. Sin React ni Supabase: se prueba en cierre-reglas.test.ts.

export type Alcance = "ubicacion" | "empresa" | "consolidado";
export type EstadoPeriodo = "abierto" | "cerrado" | "reabierto";
export type ClaveChequeo = "cajas" | "egresos" | "regularizar" | "fijos" | "conciliacion" | "planilla" | "sin_costo" | "diario" | "huella";

/** Un chequeo tal como lo mide la base: si pasa, si bloquea el cierre y los datos para decir qué falta. */
export type Chequeo = { clave: ClaveChequeo | string; ok: boolean; bloquea: boolean; datos: Record<string, unknown> };

export type Cierre = {
  id: string;
  version: number;
  cerradoEn: string;
  cerradoPor: string;
  huella: string;
  lineas: number;
  reabiertoEn: string | null;
  reabiertoPor: string | null;
  motivoReapertura: string | null;
  avisos: Chequeo[];
};

export type Unidad = {
  /** El id de la ubicación, «empresa» o «consolidado»: sirve de llave y de `?u=`. */
  clave: string;
  alcance: Alcance;
  ubicacionId: string | null;
  nombre: string;
  tipo: string;
  estado: EstadoPeriodo;
  /** El cierre vigente o, si se reabrió, el último (con su reapertura). */
  cierre: Cierre | null;
  chequeos: Chequeo[];
  /** Chequeos que no pasan y bloquean el cierre (en el consolidado: unidades sin cerrar). */
  bloqueantes: number;
  /** Chequeos que no pasan pero solo avisan. */
  avisos: number;
};

export type EventoCierre = {
  alcance: Alcance;
  ubicacionId: string | null;
  version: number;
  cerradoEn: string;
  cerradoPor: string;
  huella: string;
  lineas: number;
  reabiertoEn: string | null;
  reabiertoPor: string | null;
  motivoReapertura: string | null;
};

export type MesCierre = { mes: string; cerradas: number; consolidado: boolean };

export type PanelCierre = {
  mes: string;
  mesActual: string;
  unidades: Unidad[];
  consolidado: Unidad;
  historia: EventoCierre[];
  meses: MesCierre[];
};

// ---- Lo que devuelve la base → tipos de la pantalla ---------------------------------------------------------------------

type Fila = Record<string, unknown>;
const texto = (v: unknown): string => (v == null ? "" : String(v));
const textoONulo = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const numero = (v: unknown): number => (v == null || v === "" ? 0 : Number(v));

function leerChequeo(c: Fila): Chequeo {
  return { clave: texto(c.clave), ok: c.ok === true, bloquea: c.bloquea === true, datos: (c.datos as Record<string, unknown>) ?? {} };
}

function leerCierre(c: unknown): Cierre | null {
  if (!c || typeof c !== "object") return null;
  const f = c as Fila;
  return {
    id: texto(f.id),
    version: numero(f.version),
    cerradoEn: texto(f.cerrado_en),
    cerradoPor: texto(f.cerrado_por),
    huella: texto(f.huella),
    lineas: numero(f.lineas),
    reabiertoEn: textoONulo(f.reabierto_en),
    reabiertoPor: textoONulo(f.reabierto_por),
    motivoReapertura: textoONulo(f.motivo_reapertura),
    avisos: Array.isArray(f.avisos) ? (f.avisos as Fila[]).map(leerChequeo) : [],
  };
}

export const claveUnidad = (alcance: Alcance, ubicacionId: string | null): string => ubicacionId ?? alcance;

function leerUnidad(u: Fila): Unidad {
  const alcance = texto(u.alcance) as Alcance;
  const ubicacionId = textoONulo(u.ubicacion_id);
  const estado = texto(u.estado);
  return {
    clave: claveUnidad(alcance, ubicacionId),
    alcance,
    ubicacionId,
    nombre: texto(u.nombre),
    tipo: texto(u.tipo),
    estado: estado === "cerrado" || estado === "reabierto" ? estado : "abierto",
    cierre: leerCierre(u.cierre),
    chequeos: Array.isArray(u.chequeos) ? (u.chequeos as Fila[]).map(leerChequeo) : [],
    bloqueantes: numero(u.bloqueantes),
    avisos: numero(u.avisos),
  };
}

/** `fn_cierre_panel` → la pantalla. `null` si la respuesta no tiene la forma esperada. */
export function leerPanelCierre(data: unknown): PanelCierre | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Fila;
  const todas = Array.isArray(d.unidades) ? (d.unidades as Fila[]).map(leerUnidad) : [];
  const consolidado = todas.find((u) => u.alcance === "consolidado");
  if (!consolidado || typeof d.mes !== "string") return null;
  return {
    mes: d.mes,
    mesActual: texto(d.mes_actual),
    unidades: todas.filter((u) => u.alcance !== "consolidado"),
    consolidado,
    historia: Array.isArray(d.historia)
      ? (d.historia as Fila[]).map((h) => ({
          alcance: texto(h.alcance) as Alcance,
          ubicacionId: textoONulo(h.ubicacion_id),
          version: numero(h.version),
          cerradoEn: texto(h.cerrado_en),
          cerradoPor: texto(h.cerrado_por),
          huella: texto(h.huella),
          lineas: numero(h.lineas),
          reabiertoEn: textoONulo(h.reabierto_en),
          reabiertoPor: textoONulo(h.reabierto_por),
          motivoReapertura: textoONulo(h.motivo_reapertura),
        }))
      : [],
    meses: Array.isArray(d.meses) ? (d.meses as Fila[]).map((m) => ({ mes: texto(m.mes), cerradas: numero(m.cerradas), consolidado: m.consolidado === true })) : [],
  };
}

// ---- Palabras ----------------------------------------------------------------------------------------------------------

/** «agosto» de «2026-08». */
export const nombreMes = (mes: string): string => textoMes(mes).split(" ")[0] ?? mes;
/** «Cerrar agosto 2026». */
export const tituloPantalla = (mes: string): string => `Cerrar ${textoMes(mes)}`;
/** «Agosto 2026», para el selector. */
export const mesEnSelector = (mes: string): string => {
  const t = textoMes(mes);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** La fecha de Lima de un instante (un cierre de las 21:00 del 3 es del 3, no del 4). */
export const diaDe = (instante: string): string => hoyLima(new Date(instante));
/** «19ce…40ab»: la huella corta, como el spike. */
export const huellaCorta = (h: string | null | undefined): string => (h && h.length > 8 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h ?? "");
/** «Felipe» de «Felipe Alvarez». */
export const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? nombre;

/** Cómo se nombra la unidad al final de una frase: «de LIM», «del Taller», «de la empresa». */
export function deUnidad(u: Pick<Unidad, "alcance" | "nombre" | "tipo">): string {
  if (u.alcance === "empresa") return "de la empresa";
  if (u.alcance === "consolidado") return "de CAYLA entera";
  if (u.tipo === "taller") return `del ${u.nombre}`;
  return `de ${u.nombre.replace(/^Tienda\s+/i, "")}`;
}

/** En el título de una hoja, la unidad con su nombre entero: «de Tienda TRU», «del Taller», «de la empresa». */
export function deUnidadLarga(u: Pick<Unidad, "alcance" | "nombre" | "tipo">): string {
  if (u.alcance === "ubicacion" && u.tipo !== "taller") return `de ${u.nombre}`;
  return deUnidad(u);
}

/** «Cerrar agosto de LIM» (el botón). */
export const textoBotonCerrar = (mes: string, u: Pick<Unidad, "alcance" | "nombre" | "tipo">): string => `Cerrar ${nombreMes(mes)} ${deUnidad(u)}`;

/** «Tienda LIM · agosto 2026» (el título del bloque de chequeos). */
export const tituloUnidad = (mes: string, u: Pick<Unidad, "nombre">): string => `${u.nombre} · ${textoMes(mes)}`;

/** Lo que dice el bloque bajo su título: quién cerró, o quién reabrió y por qué, o qué se revisa. */
export function bajadaUnidad(u: Unidad): string {
  if (u.estado === "cerrado" && u.cierre) return `Cerrado el ${fechaCorta(diaDe(u.cierre.cerradoEn))} por ${u.cierre.cerradoPor}.`;
  if (u.estado === "reabierto" && u.cierre?.reabiertoEn)
    return `Reabierto el ${fechaCorta(diaDe(u.cierre.reabiertoEn))} por ${u.cierre.reabiertoPor ?? "—"}: «${u.cierre.motivoReapertura ?? ""}». Lo que el sistema revisa antes de dejarte cerrar.`;
  return "Lo que el sistema revisa antes de dejarte cerrar.";
}

const soles = (n: number): string => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «a, b y c». */
export function enumerar(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const TITULOS: Record<ClaveChequeo, string> = {
  cajas: "Cajas del mes cerradas",
  egresos: "Egresos de caja clasificados",
  regularizar: "Prendas vendidas regularizadas",
  fijos: "Gastos fijos del mes registrados",
  conciliacion: "Bancos conciliados al fin de mes",
  planilla: "Planilla del mes leída de Dynamic",
  sin_costo: "Prendas vendidas con su costo",
  diario: "El diario de la unidad cuadra",
  huella: "Lo congelado sigue igual al diario de hoy",
};

/** El chequeo en palabras: título y lo que pasa (qué falta, o por qué está bien). */
export function textoChequeo(c: Chequeo, mes: string): { titulo: string; detalle: string } {
  const d = c.datos;
  const titulo = TITULOS[c.clave as ClaveChequeo] ?? c.clave;
  const m = nombreMes(mes);
  switch (c.clave) {
    case "cajas": {
      const abiertas = numero(d.abiertas);
      const cerradas = numero(d.cerradas);
      if (c.ok) return { titulo, detalle: cerradas > 0 ? `${plural(cerradas, "cierre de caja", "cierres de caja")} en ${m}, ninguna abierta` : `Ninguna caja de ${m} quedó abierta` };
      const desde = fechaCorta(textoONulo(d.desde));
      return { titulo, detalle: abiertas === 1 ? `Falta cerrar la caja abierta el ${desde}` : `Faltan cerrar ${abiertas} cajas (la primera, abierta el ${desde})` };
    }
    case "egresos": {
      if (c.ok) return { titulo, detalle: "Todos dicen si son gasto, depósito o retiro" };
      const n = numero(d.n);
      const ultimo = `«${texto(d.motivo)}» del ${fechaCorta(textoONulo(d.fecha))}`;
      return { titulo, detalle: n === 1 ? `Falta 1: ${ultimo} por ${soles(numero(d.monto1))}` : `Faltan ${n}, por ${soles(numero(d.monto))} (el último, ${ultimo})` };
    }
    case "regularizar": {
      const n = numero(d.n);
      return { titulo, detalle: c.ok ? "Ninguna prenda por regularizar" : `${plural(n, "prenda vendida sin código", "prendas vendidas sin código")}: después de cerrar ya no se podrían regularizar` };
    }
    case "fijos": {
      const total = numero(d.total);
      const cuales = Array.isArray(d.cuales) ? (d.cuales as unknown[]).map(texto) : [];
      if (c.ok) return { titulo, detalle: total === 1 ? "El gasto fijo del mes está registrado" : `Los ${total} gastos fijos del mes están registrados` };
      return { titulo, detalle: `${cuales.length === 1 ? "Falta" : `Faltan ${cuales.length}:`} ${enumerar(cuales)}. Si ese mes no correspondía, puedes cerrar igual` };
    }
    case "conciliacion": {
      const bancos = numero(d.bancos);
      const faltan = Array.isArray(d.faltan) ? (d.faltan as Fila[]) : [];
      if (c.ok)
        return { titulo, detalle: bancos === 0 ? "Todavía no hay bancos en Cuentas y dinero" : bancos === 1 ? "El banco está conciliado al fin de mes o después" : `Los ${bancos} bancos están conciliados al fin de mes o después` };
      return {
        titulo,
        detalle: faltan
          .map((f) => `${texto(f.nombre)}: ${f.ultima ? `la última conciliación es del ${fechaCorta(texto(f.ultima))}` : "nunca se concilió"}`)
          .join(" · "),
      };
    }
    case "planilla": {
      if (d.visible === false) return { titulo, detalle: "Tu cuenta no ve la planilla en Dynamic: ciérralo con una cuenta que la vea, o el mes quedaría sin sueldos" };
      if (c.ok) return { titulo, detalle: `Del ${fechaCorta(textoONulo(d.ini))} al ${fechaCorta(textoONulo(d.fin))}${d.personas != null ? ` · ${plural(numero(d.personas), "persona", "personas")}` : ""}` };
      return { titulo, detalle: `Dynamic todavía no tiene pagada la planilla que termina en ${m}: si se paga después, el mes cerrado no la tendrá` };
    }
    case "sin_costo": {
      const n = numero(d.n);
      return { titulo, detalle: c.ok ? "Todas las prendas vendidas tienen costo" : `${plural(n, "prenda vendida", "prendas vendidas")} sin costo cargado: el margen del mes sale inflado` };
    }
    case "diario": {
      const asientos = numero(d.asientos);
      const lineas = plural(numero(d.lineas), "línea", "líneas");
      if (c.ok)
        return {
          titulo,
          detalle: asientos > 1 ? `Debe = haber en los ${asientos} asientos (${lineas})` : asientos === 1 ? `Debe = haber en su único asiento (${lineas})` : `Sin movimientos en ${m}`,
        };
      const n = numero(d.descuadrados);
      return { titulo, detalle: `${plural(n, "asiento descuadrado", "asientos descuadrados")}: una fuente no suma lo que debe (míralo en Reportes)` };
    }
    case "huella":
      return c.ok
        ? { titulo, detalle: "El diario de hoy da la misma huella que el congelado" }
        : { titulo, detalle: "El diario de hoy ya no da la misma huella: algo con fecha de ese mes cambió fuera del sistema (¿la planilla en Dynamic?). Lo congelado no cambió; si hay que corregirlo, reábrelo" };
    default:
      return { titulo, detalle: "" };
  }
}

/** Adónde ir a resolver un chequeo que no pasa. `null` si no hay pantalla para eso (la planilla vive en Dynamic). */
export function enlaceChequeo(c: Chequeo, u: Pick<Unidad, "alcance" | "ubicacionId">, mes: string): string | null {
  if (c.ok) return null;
  const ver = u.alcance === "empresa" ? "empresa" : (u.ubicacionId ?? "todas");
  switch (c.clave) {
    case "cajas":
      return "/caja";
    case "egresos":
      return `/finanzas/gastos?tab=egresos&ver=${ver}`;
    case "regularizar":
      return "/recibir";
    case "fijos":
      return `/finanzas/gastos?tab=fijos&mes=${mes}&ver=${ver}`;
    case "conciliacion":
      return "/finanzas/dinero/conciliacion";
    case "sin_costo":
    case "diario":
      return `/finanzas/reportes?mes=${mes}${u.alcance === "ubicacion" && u.ubicacionId ? `&ver=${u.ubicacionId}` : ""}`;
    default:
      return null;
  }
}

// ---- Estados -----------------------------------------------------------------------------------------------------------

export type TonoEstado = "verde" | "ambar" | "pizarra" | "neutro";

/** Lo que dice la insignia de cada tarjeta de la matriz. */
export function estadoTarjeta(u: Unidad): { texto: string; tono: TonoEstado } {
  if (u.estado === "cerrado") return { texto: "cerrado", tono: "verde" };
  if (u.bloqueantes > 0) return { texto: `${u.bloqueantes} pendiente${u.bloqueantes === 1 ? "" : "s"}`, tono: "ambar" };
  return { texto: "lista para cerrar", tono: "pizarra" };
}

/** Se puede cerrar: abierta (o reabierta) y ningún chequeo que bloquee. */
export const puedeCerrar = (u: Unidad): boolean => u.estado !== "cerrado" && u.bloqueantes === 0;

/** Los avisos que quedarían guardados al cerrar (chequeos que no pasan pero no bloquean; la huella no aplica a una abierta). */
export const avisosPendientes = (u: Unidad): Chequeo[] => u.chequeos.filter((c) => !c.ok && !c.bloquea && c.clave !== "huella");

/** El consolidado: cerrado, listo (todas las unidades cerradas) o cuántas faltan. */
export function estadoConsolidado(p: Pick<PanelCierre, "consolidado" | "unidades">): { estado: "cerrado" | "listo" | "faltan"; faltan: number } {
  if (p.consolidado.estado === "cerrado") return { estado: "cerrado", faltan: 0 };
  const faltan = p.unidades.filter((u) => u.estado !== "cerrado").length;
  return faltan === 0 ? { estado: "listo", faltan: 0 } : { estado: "faltan", faltan };
}

/** La unidad que se abre al entrar: la pedida en `?u=`; si no, la primera sin cerrar; si todas cerraron, la primera. */
export function unidadInicial(unidades: readonly Unidad[], pedida?: string | null): string | null {
  if (pedida && unidades.some((u) => u.clave === pedida)) return pedida;
  return (unidades.find((u) => u.estado !== "cerrado") ?? unidades[0])?.clave ?? null;
}

/** El motivo de una reapertura: obligatorio, al menos 5 letras (la base pide lo mismo). */
export function validarMotivo(motivo: string): string | null {
  return motivo.trim().length >= 5 ? null : "Escribe el motivo (al menos 5 letras): queda en la historia.";
}

/** Lo que dice una opción del selector de mes: «Agosto 2026 · CAYLA cerrada», «· 2 cerradas». */
export function textoOpcionMes(m: MesCierre): string {
  const base = mesEnSelector(m.mes);
  if (m.consolidado) return `${base} · cerrado`;
  if (m.cerradas > 0) return `${base} · ${plural(m.cerradas, "cerrada", "cerradas")}`;
  return base;
}

/** La historia de una unidad (o del consolidado) en el mes, en líneas: «3 sep · Felipe cerró (19ce…40ab)», «5 sep · Felipe
 *  reabrió: «llegó una factura tarde»». Del más viejo al más nuevo. */
export function historiaDe(p: Pick<PanelCierre, "historia">, u: Pick<Unidad, "alcance" | "ubicacionId">): string[] {
  const lineas: { cuando: string; texto: string }[] = [];
  for (const e of p.historia) {
    if (e.alcance !== u.alcance || e.ubicacionId !== u.ubicacionId) continue;
    lineas.push({ cuando: e.cerradoEn, texto: `${fechaCorta(diaDe(e.cerradoEn))} · ${primerNombre(e.cerradoPor)} cerró${e.version > 1 ? ` (versión ${e.version})` : ""} · ${huellaCorta(e.huella)}` });
    if (e.reabiertoEn)
      lineas.push({ cuando: e.reabiertoEn, texto: `${fechaCorta(diaDe(e.reabiertoEn))} · ${primerNombre(e.reabiertoPor ?? "—")} reabrió: «${e.motivoReapertura ?? ""}»` });
  }
  return lineas.sort((a, b) => a.cuando.localeCompare(b.cuando)).map((l) => l.texto);
}
