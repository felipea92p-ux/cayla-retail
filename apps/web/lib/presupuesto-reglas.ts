// Reglas del Presupuesto (ADR-0195, capa «para decidir»; contrato en 20260925190000_finanzas_presupuesto.sql). Lógica
// pura: la usan las dos pantallas (Reportes ▸ Presupuesto y Configuración ▸ Presupuesto) y sus pruebas.
// Qué NO hace este archivo: calcular plata. El tope, lo real, la proyección al cierre y el estado de cada línea vienen de
// `fn_presupuesto_vs_real`; la meta de ventas es la de las metas del día (`fn_meta_mes`, F1). Aquí solo se decide qué
// bloques y filas se muestran, cómo se escribe cada cifra y cada estado, y cómo se lee una casilla antes de ir a la base.

import { parsearMonto, type Resultado } from "./configuracion-reglas";
import { solesRedondo } from "./gastos-reglas";
import { csvDe, mesAnterior, mesNombre } from "./resultados-reglas";

export type UnidadPpto = "tienda" | "taller" | "empresa" | "consolidado";
export type MomentoPpto = "en_curso" | "cerrado" | "por_venir";
export type EstadoPpto = "se_pasa" | "al_filo" | "dentro" | "bajo_meta" | "en_camino" | "cumplida" | "sin_tope" | "sin_meta" | "por_empezar";

export type FilaPpto = {
  /** `null` en «De la empresa» y en CAYLA (los distingue `unidad`). */
  ubicacionId: string | null;
  unidad: UnidadPpto;
  nombre: string;
  orden: number;
  /** 'ventas' o la cuenta de gasto (635, 636…). */
  linea: string;
  lineaNombre: string;
  tipo: "meta" | "tope";
  ordenLinea: number;
  /** El tope o la meta; `null` = sin tope / sin meta. */
  presupuesto: number | null;
  aLaFecha: number;
  /** `null` en un mes que todavía no empieza. */
  proyeccion: number | null;
  /** De la proyección, cuánto es fijo (lo que ya llegó de Gastos fijos y lo que falta). Solo en el mes en curso. */
  fijo: number | null;
  avance: number | null;
  sePasa: boolean;
  estado: EstadoPpto;
  momento: MomentoPpto;
  dia: number;
  dias: number;
};

type Fila = Record<string, unknown>;
const n = (v: unknown): number => (v == null ? 0 : Number(v));
const nulo = (v: unknown): number | null => (v == null ? null : Number(v));
const UNIDADES: readonly UnidadPpto[] = ["tienda", "taller", "empresa", "consolidado"];
const ESTADOS: readonly EstadoPpto[] = ["se_pasa", "al_filo", "dentro", "bajo_meta", "en_camino", "cumplida", "sin_tope", "sin_meta", "por_empezar"];
const MOMENTOS: readonly MomentoPpto[] = ["en_curso", "cerrado", "por_venir"];

/** Una fila de `fn_presupuesto_vs_real` (los `numeric` viajan como texto) → tipos de la pantalla. */
export function leerFilaPpto(r: Fila): FilaPpto {
  return {
    ubicacionId: r.ubicacion_id == null ? null : String(r.ubicacion_id),
    unidad: UNIDADES.includes(r.unidad as UnidadPpto) ? (r.unidad as UnidadPpto) : "tienda",
    nombre: String(r.nombre ?? ""),
    orden: n(r.orden),
    linea: String(r.linea ?? ""),
    lineaNombre: String(r.linea_nombre ?? ""),
    tipo: r.tipo === "meta" ? "meta" : "tope",
    ordenLinea: n(r.orden_linea),
    presupuesto: nulo(r.presupuesto),
    aLaFecha: n(r.a_la_fecha),
    proyeccion: nulo(r.proyeccion),
    fijo: nulo(r.fijo),
    avance: nulo(r.avance),
    sePasa: !!r.se_pasa,
    estado: ESTADOS.includes(r.estado as EstadoPpto) ? (r.estado as EstadoPpto) : "dentro",
    momento: MOMENTOS.includes(r.momento as MomentoPpto) ? (r.momento as MomentoPpto) : "en_curso",
    dia: n(r.dia),
    dias: n(r.dias),
  };
}

/** La llave de una unidad: la ubicación, o «empresa» / «consolidado». */
export const claveUnidadPpto = (f: Pick<FilaPpto, "ubicacionId" | "unidad">): string => f.ubicacionId ?? f.unidad;

// ---- «Ver» y los bloques ------------------------------------------------------------------------------------------------

/**
 * `?ver=` → qué unidades se miran. El líder: una ubicación (por defecto, la sede donde trabaja), «todas» o «empresa». Quien
 * tiene el módulo sin ser líder ve solo su tienda: la base ya no le manda otra cosa.
 */
export function leerVerPpto(param: string | undefined, filas: readonly FilaPpto[], esLider: boolean, sedeActual: string | null): string {
  if (!esLider) return filas.find((f) => f.ubicacionId)?.ubicacionId ?? "todas";
  if (param === "todas" || param === "empresa") return param;
  const candidata = param ?? sedeActual;
  if (candidata && filas.some((f) => f.ubicacionId === candidata)) return candidata;
  return "todas";
}

export type SinTope = { aLaFecha: number; proyeccion: number | null; nombres: string[] };
export type BloquePpto = {
  clave: string;
  unidad: UnidadPpto;
  nombre: string;
  /** Las filas que se dibujan: la de ventas (si la unidad vende o tiene meta) y cada rubro con tope. */
  filas: FilaPpto[];
  /** Lo gastado en rubros sin tope (no tiene fila: se dice al pie para que no se esconda). */
  sinTope: SinTope | null;
};

/**
 * Los bloques del cuadro, uno por unidad, en el orden de la base (tiendas, Taller, empresa y CAYLA al final). Con «todas»,
 * todas las unidades y CAYLA; con una ubicación o «empresa», solo esa. Como el spike: dentro de cada bloque, las ventas y
 * luego cada rubro que tiene tope; lo gastado sin tope no tiene fila, se suma al pie.
 */
export function bloquesPpto(filas: readonly FilaPpto[], ver: string): BloquePpto[] {
  const vistas = filas.filter((f) =>
    ver === "todas" ? true : ver === "empresa" ? f.unidad === "empresa" : f.ubicacionId === ver && f.unidad !== "consolidado",
  );
  const grupos = new Map<string, FilaPpto[]>();
  for (const f of [...vistas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es") || a.ordenLinea - b.ordenLinea)) {
    const k = claveUnidadPpto(f);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.entries()].map(([clave, fs]) => {
    const libres = fs.filter((f) => f.tipo === "tope" && f.presupuesto === null);
    const proyecciones = libres.map((f) => f.proyeccion);
    return {
      clave,
      unidad: fs[0]!.unidad,
      nombre: fs[0]!.unidad === "consolidado" ? "CAYLA" : fs[0]!.nombre,
      filas: fs.filter((f) => f.tipo === "meta" || f.presupuesto !== null),
      sinTope: libres.length
        ? {
            aLaFecha: libres.reduce((a, f) => a + f.aLaFecha, 0),
            proyeccion: proyecciones.some((p) => p === null) ? null : proyecciones.reduce<number>((a, p) => a + (p ?? 0), 0),
            nombres: libres.map((f) => f.lineaNombre),
          }
        : null,
    };
  });
}

/** Las unidades por las que se puede elegir en «Ver» (sin CAYLA), en su orden. */
export function unidadesParaVer(filas: readonly FilaPpto[]): { clave: string; nombre: string; unidad: UnidadPpto }[] {
  const vistas = new Map<string, { clave: string; nombre: string; unidad: UnidadPpto; orden: number }>();
  for (const f of filas) {
    if (f.unidad === "consolidado") continue;
    const clave = f.unidad === "empresa" ? "empresa" : (f.ubicacionId ?? "");
    if (!vistas.has(clave)) vistas.set(clave, { clave, nombre: f.nombre, unidad: f.unidad, orden: f.orden });
  }
  return [...vistas.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
}

// ---- Cómo se escribe ------------------------------------------------------------------------------------------------------

/** «18,8 %» (coma decimal, como el spike). */
export const pctPpto = (p: number) => `${(p * 100).toFixed(1).replace(".", ",")} %`;

export type TonoPpto = "rojo" | "ambar" | "verde" | "pizarra";

/** El chip de estado de una fila, como el spike: «te pasas 18,8 %», «al filo», «dentro del tope», «en camino»… */
export function chipPpto(f: Pick<FilaPpto, "estado" | "avance" | "momento">): { texto: string; tono: TonoPpto } {
  const cerrado = f.momento === "cerrado";
  switch (f.estado) {
    case "se_pasa":
      return { texto: `${cerrado ? "te pasaste" : "te pasas"} ${pctPpto((f.avance ?? 1) - 1)}`, tono: "rojo" };
    case "al_filo":
      return { texto: cerrado ? "apenas pasado" : "al filo", tono: "ambar" };
    case "dentro":
      return { texto: "dentro del tope", tono: "verde" };
    case "bajo_meta":
      return { texto: "bajo la meta", tono: "ambar" };
    case "en_camino":
      return { texto: "en camino", tono: "verde" };
    case "cumplida":
      return { texto: "meta cumplida", tono: "verde" };
    case "sin_meta":
      return { texto: "sin meta", tono: "pizarra" };
    case "sin_tope":
      return { texto: "sin tope", tono: "pizarra" };
    case "por_empezar":
      return { texto: "por empezar", tono: "pizarra" };
  }
}

/** El ancho de la barra de avance (0–100): la proyección contra el tope o la meta. */
export function anchoBarra(f: Pick<FilaPpto, "presupuesto" | "proyeccion">): number {
  if (!f.presupuesto || f.proyeccion === null) return 0;
  return Math.max(0, Math.min(100, (f.proyeccion / f.presupuesto) * 100));
}

const MAYUS = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** La franja de arriba: «Septiembre · al día 24 de 30», «Agosto · mes cerrado», «Octubre · todavía no empieza». */
export function tituloAvance(mes: string, filas: readonly Pick<FilaPpto, "momento" | "dia" | "dias">[]): string {
  const nombre = MAYUS(mesNombre(mes));
  const f = filas[0];
  if (!f) return nombre;
  if (f.momento === "cerrado") return `${nombre} · mes cerrado`;
  if (f.momento === "por_venir") return `${nombre} · todavía no empieza`;
  return `${nombre} · al día ${f.dia} de ${f.dias}`;
}

/** La bajada de la franja: la regla de la proyección, dicha según el momento del mes. */
export function bajadaAvance(momento: MomentoPpto | undefined): string {
  if (momento === "cerrado") return "El mes ya terminó: «al cierre» es lo que pasó.";
  if (momento === "por_venir") return "Todavía no empieza: se ven las metas y los topes; lo real llega con el mes.";
  return "«Al cierre» proyecta lo variable al ritmo de hoy; lo fijo (alquiler, luz de Gastos fijos) entra entero. Las ventas, al mismo % de la meta que llevas.";
}

/** De dónde sale «al cierre» de una fila (el `title` de la celda): la regla con sus números. */
export function explicarProyeccion(f: FilaPpto): string {
  if (f.proyeccion === null) return "El mes todavía no empieza.";
  if (f.momento === "cerrado") return "El mes ya terminó: es lo que pasó.";
  if (f.tipo === "meta") {
    return f.presupuesto
      ? `Vas al ${pctPpto(f.presupuesto ? f.proyeccion / f.presupuesto : 0)} de la meta de estos ${f.dia} días; al mismo ritmo cierras en ${solesRedondo(f.proyeccion)}.`
      : `Sin meta: lo vendido en ${f.dia} días llevado a los ${f.dias} del mes.`;
  }
  const fijo = f.fijo ?? 0;
  if (fijo <= 0) return `Lo gastado en ${f.dia} días llevado a los ${f.dias} del mes.`;
  return `${solesRedondo(fijo)} fijos (Gastos fijos: lo que llegó y lo que falta) + lo demás al ritmo de hoy.`;
}

/** Nombre de la columna o del bloque: «Tienda Trujillo» → «Trujillo». */
export const nombreCortoPpto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");

/** El pie de un bloque cuando hay gasto sin tope: «Además, S/ 50 sin tope (Transporte y movilidad)». */
export function fraseSinTope(s: SinTope | null): string | null {
  if (!s || Math.round(s.aLaFecha) === 0) return null;
  return `Además, ${solesRedondo(s.aLaFecha)} en rubros sin tope (${s.nombres.join(", ")}).`;
}

/** Las filas del cuadro que se pasan (la base las marca): para el resumen de arriba. */
export const filasQueSePasan = (bloques: readonly BloquePpto[]) =>
  bloques.filter((b) => b.unidad !== "consolidado").flatMap((b) => b.filas.filter((f) => f.sePasa));

/** «Descargar Excel»: un CSV separado por «;», una fila por línea del cuadro. */
export function csvPresupuesto(bloques: readonly BloquePpto[]): string {
  const filas: (string | number)[][] = [["Unidad", "Rubro", "Meta o tope", "A la fecha", "Al cierre", "Avance", "Estado"]];
  for (const b of bloques) {
    for (const f of b.filas) {
      filas.push([
        b.nombre,
        f.tipo === "meta" ? "Ventas (sin IGV)" : f.lineaNombre,
        f.presupuesto ?? "",
        f.aLaFecha,
        f.proyeccion ?? "",
        f.avance === null ? "" : pctPpto(f.avance),
        chipPpto(f).texto,
      ]);
    }
  }
  return csvDe(filas);
}

// ---- Configuración ▸ Presupuesto ----------------------------------------------------------------------------------------

export type UnidadConfigPpto = { id: string | null; nombre: string; unidad: Exclude<UnidadPpto, "consolidado">; metaVentas: number | null };
export type LineaConfigPpto = { cuenta: string; nombre: string; ejemplos: string };
export type ConfigPpto = {
  mes: string;
  unidades: UnidadConfigPpto[];
  lineas: LineaConfigPpto[];
  /** `claveCelda(ubicación, cuenta)` → tope. */
  montos: Record<string, number>;
  /** Cuántos topes tiene el mes anterior (para «Copiar de…»). */
  anterior: number;
};

/** La llave de una casilla: la ubicación (o «empresa») y la cuenta. */
export const claveCelda = (ubicacionId: string | null, cuenta: string) => `${ubicacionId ?? "empresa"}|${cuenta}`;

/** `fn_presupuesto_configuracion` → la tabla de la pantalla. */
export function leerConfigPpto(data: unknown): ConfigPpto {
  const d = (data ?? {}) as Fila;
  const montos: Record<string, number> = {};
  for (const m of (d.montos as Fila[] | null) ?? []) {
    if (m.monto == null) continue;
    montos[claveCelda(m.ubicacion_id == null ? null : String(m.ubicacion_id), String(m.cuenta))] = Number(m.monto);
  }
  return {
    mes: String(d.mes ?? "").slice(0, 7),
    unidades: ((d.unidades as Fila[] | null) ?? []).map((u) => ({
      id: u.id == null ? null : String(u.id),
      nombre: String(u.nombre ?? ""),
      unidad: u.unidad === "taller" ? "taller" : u.unidad === "empresa" ? "empresa" : "tienda",
      metaVentas: nulo(u.meta_ventas),
    })),
    lineas: ((d.lineas as Fila[] | null) ?? []).map((l) => ({ cuenta: String(l.cuenta), nombre: String(l.nombre ?? ""), ejemplos: String(l.ejemplos ?? "") })),
    montos,
    anterior: n(d.anterior),
  };
}

/** Una casilla: vacío o 0 = sin tope (`null`); «1,500» o «S/ 300» = el tope; negativo o letras, un error claro. */
export function parsearTope(texto: string): Resultado<number | null> {
  const r = parsearMonto(texto);
  if (!r.ok) return r;
  return { ok: true, valor: r.valor === 0 ? null : r.valor };
}

/** Cómo se muestra un tope dentro de su casilla: «4500» (sin separador, como el spike) o vacío. */
export const textoTope = (v: number | undefined | null) => (v == null ? "" : String(Math.round(v * 100) / 100));

/** Los meses que se pueden presupuestar: dos atrás, el de hoy y tres adelante (del más viejo al más nuevo). */
export function mesesParaPresupuestar(hoy: string): string[] {
  const [a, m] = hoy.slice(0, 7).split("-").map(Number) as [number, number];
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 3 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

// ---- Proponer: «Copiar de…» y «Sugerir según los últimos 3 meses» -----------------------------------------------------------

export type OrigenPropuesta = "mes_anterior" | "promedio_3_meses";
export type PropuestaFila = { ubicacionId: string | null; cuenta: string; actual: number | null; propuesto: number };

export function leerPropuesta(r: Fila): PropuestaFila {
  return {
    ubicacionId: r.ubicacion_id == null ? null : String(r.ubicacion_id),
    cuenta: String(r.cuenta),
    actual: nulo(r.actual),
    propuesto: n(r.propuesto),
  };
}

/** El botón: «Copiar de agosto» (el mes anterior al elegido) o «Sugerir según los últimos 3 meses». */
export function textoOrigen(origen: OrigenPropuesta, mes: string): string {
  return origen === "mes_anterior" ? `Copiar de ${mesNombre(mesAnterior(mes))}` : "Sugerir según los últimos 3 meses";
}

/** Solo lo que cambia: una casilla que ya tiene ese mismo tope no se vuelve a guardar. */
export const cambiosDePropuesta = (filas: readonly PropuestaFila[]) => filas.filter((f) => f.actual !== f.propuesto);

/** Lo que se manda a `guardar_presupuesto_lote`: exactamente lo que se vio. */
export const lotePropuesta = (filas: readonly PropuestaFila[]) =>
  cambiosDePropuesta(filas).map((f) => ({ ubicacion_id: f.ubicacionId, cuenta: f.cuenta, monto: f.propuesto }));
