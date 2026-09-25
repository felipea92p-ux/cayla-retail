// Reglas de Finanzas ▸ Resumen (ADR-0195 F10; spike `vista-resumen.js`; contrato en 20260925200000_finanzas_resumen.sql).
// Lógica pura: la usan la pantalla y sus pruebas.
//
// Qué NO hace este archivo: calcular plata. `fn_resumen_finanzas` devuelve, parte por parte, lo que dice la función de cada
// fase (F2b, F3, F4, F5, F6, F8, F9, Presupuesto) con sus mismas columnas, y aquí se leen con los MISMOS lectores de cada
// fase (`leerFilaER`, `leerCuenta`, `leerFilaPorPagar`, `leerProyeccion`, `leerPanelImpuestos`, `leerCampana`,
// `leerFilaPpto`). Las reglas que ya viven en una fase se llaman, no se copian: el punto de equilibrio (`puntoDeEquilibrio`,
// F5), el veredicto de una campaña (`veredictoCampana`, F5), el tono de los días de caja (`tonoDiasDeCaja`, F6), lo que vence
// en una semana (`queVence`, F6), el límite del régimen (`proyectarUmbral`, `tonoAvance`, F8) y el chip del presupuesto
// (`chipPpto`). Lo propio del Resumen es decidir QUÉ se dice primero: las frases de la salud, las cinco cifras, los avisos de
// «Para decidir hoy» con su origen y su enlace, y el orden («primero lo que más cuesta si se deja pasar»).

import { leerCuenta, type CuentaDinero, type SinCuenta } from "./cuentas-dinero-reglas";
import { diasHasta, leerFilaPorPagar, textoVence, type FilaPorPagar } from "./por-pagar-consolidado-reglas";
import {
  etiquetaSemana,
  etiquetasEje,
  leerProyeccion,
  queVence,
  soles,
  TEXTO_SIN_CUENTA,
  tonoDiasDeCaja,
  type Proyeccion,
} from "./flujo-caja-reglas";
import { leerPanelImpuestos, nombreMes, proyectarUmbral, sumarMeses, tonoAvance, type PanelImpuestos } from "./impuestos-reglas";
import { chipPpto, leerFilaPpto, type FilaPpto } from "./presupuesto-reglas";
import {
  extraNecesario,
  leerCampana,
  leerFilaER,
  mesNombre,
  nombreCorto,
  porcentaje,
  puntoDeEquilibrio,
  veredictoCampana,
  type CampanaFila,
  type FilaER,
} from "./resultados-reglas";

type Fila = Record<string, unknown>;
const obj = (v: unknown): Fila => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fila) : {});
const lista = (v: unknown): Fila[] => (Array.isArray(v) ? (v as Fila[]) : []);
const num = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : Number(v));
const txt = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const aMes = (v: unknown): string => String(v ?? "").slice(0, 7);
const r2 = (n: number) => Math.round(n * 100) / 100;
const mayuscula = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

// ---- Lo que devuelve la base ----------------------------------------------------------------------------------------------

/**
 * Cada parte del Resumen: lo que dijo su fase, o por qué no está. `sin_permiso` = la fase dijo 42501 (ese módulo no está en
 * el rol, o es solo del líder); `falla` = no se pudo leer (por ejemplo, la fase todavía no está pegada en producción);
 * `no_aplica` = no corresponde a lo que se mira (el IGV mirando una tienda). Nunca un cero en lugar de un dato que falta.
 */
export type Parte<T> = { estado: "ok"; datos: T } | { estado: "sin_permiso"; mensaje: string } | { estado: "falla"; mensaje: string } | { estado: "no_aplica" };

export type TipoVer = "todas" | "tienda" | "taller" | "almacen" | "empresa";
export type VerResumen = { ubicacionId: string | null; soloEmpresa: boolean; todas: boolean; tipo: TipoVer; nombre: string };
export type UnidadResumen = { id: string; nombre: string; tipo: "tienda" | "taller" };
export type ParametrosResumen = { minimoCaja: number; avisoGastoPct: number; avisoVenceDias: number };
export type PorPagarResumen = { dias: number; total: number; n: number; filas: FilaPorPagar[] };
export type EgresosResumen = { n: number; monto: number; desde: string | null; porUbicacion: { ubicacionId: string; nombre: string; n: number; monto: number }[] };
export type FijoQueFalta = {
  id: string;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  categoriaNombre: string;
  descripcion: string;
  proveedorNombre: string | null;
  monto: number;
  dia: number;
  fechaEsperada: string;
};
export type GastoRaro = {
  llave: string;
  proveedor: string;
  ubicacionId: string | null;
  ubicacionNombre: string;
  categoriaNombre: string;
  mes: string;
  monto: number;
  gastos: number;
  promedio: number;
  mesesBase: number;
  excesoPct: number;
  ultimaFecha: string;
};
export type UnidadCierre = { alcance: "ubicacion" | "empresa"; ubicacionId: string | null; nombre: string; cerrada: boolean };
export type CierreResumen = { mes: string; consolidado: boolean; unidades: UnidadCierre[] };

export type ResumenFinanzas = {
  hoy: string;
  /** «2026-09»: el mes en curso. */
  mes: string;
  /** «2026-08»: el último mes completo (utilidad, punto de equilibrio, cierre). */
  mesAnterior: string;
  lider: boolean;
  ver: VerResumen;
  unidades: UnidadResumen[];
  parametros: Parte<ParametrosResumen>;
  resultadosMes: Parte<FilaER[]>;
  resultadosAnterior: Parte<FilaER[]>;
  presupuesto: Parte<FilaPpto[]>;
  cuentas: Parte<CuentaDinero[]>;
  porPagar: Parte<PorPagarResumen>;
  flujo: Parte<Proyeccion>;
  igv: Parte<PanelImpuestos>;
  campanas: Parte<CampanaFila[]>;
  egresos: Parte<EgresosResumen>;
  fijos: Parte<FijoQueFalta[]>;
  raros: Parte<GastoRaro[]>;
  cierre: Parte<CierreResumen>;
  sinCuenta: Parte<SinCuenta[]>;
  /** Cuánto tardó cada parte en la base, en ms (para ver qué pesa si el tablero se pone lento). */
  ms: Record<string, number>;
};

function parte<T>(v: unknown, leer: (d: Fila) => T): Parte<T> {
  const d = obj(v);
  if (d.no_aplica === true) return { estado: "no_aplica" };
  if (typeof d.sin_permiso === "string") return { estado: "sin_permiso", mensaje: d.sin_permiso };
  if (typeof d.falla === "string") return { estado: "falla", mensaje: d.falla };
  if (v === null || v === undefined) return { estado: "falla", mensaje: "La base no mandó esta parte." };
  try {
    return { estado: "ok", datos: leer(d) };
  } catch (e) {
    return { estado: "falla", mensaje: e instanceof Error ? e.message : String(e) };
  }
}

const TIPOS_VER: readonly TipoVer[] = ["todas", "tienda", "taller", "almacen", "empresa"];

/** El JSON de `fn_resumen_finanzas` → tipos de la pantalla. */
export function leerResumen(data: unknown): ResumenFinanzas {
  const d = obj(data);
  const v = obj(d.ver);
  return {
    hoy: String(d.hoy ?? "").slice(0, 10),
    mes: aMes(d.mes),
    mesAnterior: aMes(d.mes_anterior),
    lider: d.lider === true,
    ver: {
      ubicacionId: txt(v.ubicacion_id),
      soloEmpresa: v.solo_empresa === true,
      todas: v.todas === true,
      tipo: TIPOS_VER.includes(v.tipo as TipoVer) ? (v.tipo as TipoVer) : "tienda",
      nombre: String(v.nombre ?? ""),
    },
    unidades: lista(d.unidades).map((u) => ({ id: String(u.id), nombre: String(u.nombre ?? ""), tipo: u.tipo === "taller" ? "taller" : "tienda" })),
    parametros: parte(d.parametros, (p) => ({
      minimoCaja: num(p.minimo_caja),
      avisoGastoPct: num(p.aviso_gasto_pct),
      avisoVenceDias: p.aviso_vence_dias == null ? 7 : num(p.aviso_vence_dias),
    })),
    resultadosMes: parte(d.resultados_mes, (p) => lista(p.filas).map(leerFilaER)),
    resultadosAnterior: parte(d.resultados_anterior, (p) => lista(p.filas).map(leerFilaER)),
    presupuesto: parte(d.presupuesto, (p) => lista(p.filas).map(leerFilaPpto)),
    cuentas: parte(d.cuentas, (p) => lista(p.filas).map(leerCuenta)),
    porPagar: parte(d.por_pagar, (p) => ({ dias: p.dias == null ? 7 : num(p.dias), total: num(p.total), n: num(p.n), filas: lista(p.filas).map(leerFilaPorPagar) })),
    flujo: parte(d.flujo, (p) => leerProyeccion(p)),
    igv: parte(d.igv, (p) => leerPanelImpuestos(p)),
    campanas: parte(d.campanas, (p) => lista(p.filas).map(leerCampana)),
    egresos: parte(d.egresos, (p) => ({
      n: num(p.n),
      monto: num(p.monto),
      desde: txt(p.desde),
      porUbicacion: lista(p.por_ubicacion).map((x) => ({ ubicacionId: String(x.ubicacion_id), nombre: String(x.nombre ?? ""), n: num(x.n), monto: num(x.monto) })),
    })),
    fijos: parte(d.fijos, (p) =>
      lista(p.filas).map((f) => ({
        id: String(f.id),
        ubicacionId: txt(f.ubicacion_id),
        ubicacionNombre: txt(f.ubicacion_nombre),
        categoriaNombre: String(f.categoria_nombre ?? f.categoria ?? ""),
        descripcion: String(f.descripcion ?? ""),
        proveedorNombre: txt(f.proveedor_nombre),
        monto: num(f.monto),
        dia: num(f.dia_del_mes),
        fechaEsperada: String(f.fecha_esperada ?? "").slice(0, 10),
      }))
    ),
    raros: parte(d.raros, (p) =>
      lista(p.filas).map((r) => ({
        llave: String(r.llave),
        proveedor: String(r.proveedor ?? ""),
        ubicacionId: txt(r.ubicacion_id),
        ubicacionNombre: String(r.ubicacion_nombre ?? "De la empresa"),
        categoriaNombre: String(r.categoria_nombre ?? ""),
        mes: aMes(r.mes),
        monto: num(r.monto),
        gastos: num(r.gastos),
        promedio: num(r.promedio),
        mesesBase: num(r.meses_base),
        excesoPct: num(r.exceso_pct),
        ultimaFecha: String(r.ultima_fecha ?? "").slice(0, 10),
      }))
    ),
    cierre: parte(d.cierre, (p) => ({
      mes: aMes(p.mes),
      consolidado: p.consolidado === true,
      unidades: lista(p.unidades).map((u) => ({
        alcance: u.alcance === "empresa" ? "empresa" : "ubicacion",
        ubicacionId: txt(u.ubicacion_id),
        nombre: String(u.nombre ?? ""),
        cerrada: u.cerrada === true,
      })),
    })),
    sinCuenta: parte(d.sin_cuenta, (p) => lista(p.filas).map((s) => ({ origen: String(s.origen), n: num(s.n), monto: num(s.monto) }))),
    ms: Object.fromEntries(Object.entries(obj(d.ms)).map(([k, x]) => [k, num(x)])),
  };
}

// ---- «Ver» ------------------------------------------------------------------------------------------------------------------

/**
 * `?ver=` → qué pedirle a la base. El líder: «todas» (por defecto: el Resumen es el tablero de CAYLA entera), una ubicación o
 * «empresa». Sin ser líder, su sede y nada más (la base lo impone igual; aquí solo no se le pide otra cosa).
 */
export function leerVerResumen(param: string | undefined, esLider: boolean): { clave: string; ubicacionId: string | null; soloEmpresa: boolean } {
  if (!esLider) return { clave: "propia", ubicacionId: null, soloEmpresa: false };
  if (param === "empresa") return { clave: "empresa", ubicacionId: null, soloEmpresa: true };
  if (param && /^[0-9a-f-]{36}$/i.test(param)) return { clave: param, ubicacionId: param, soloEmpresa: false };
  return { clave: "todas", ubicacionId: null, soloEmpresa: false };
}

/** La clave de «Ver» de lo que la base dijo que se mira (para el selector y los enlaces). */
export const claveVer = (v: VerResumen): string => (v.todas ? "todas" : v.soloEmpresa ? "empresa" : (v.ubicacionId ?? "todas"));

/** «Tienda Trujillo» → «Trujillo»; «De la empresa» se queda. */
export const corto = (nombre: string) => nombre.replace(/^Tienda\s+/i, "");

/** «de TRU», «del Taller», «de la empresa»: el nombre de una unidad dentro de una frase. */
export function deUnidad(nombre: string): string {
  if (/^de la empresa$/i.test(nombre)) return "de la empresa";
  if (/^taller$/i.test(nombre)) return "del Taller";
  return `de ${corto(nombre)}`;
}

// ---- Fechas -----------------------------------------------------------------------------------------------------------------

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Días que tiene el mes «2026-08» (31). */
export function diasDelMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** «al jueves 24 de septiembre» (CAYLA entera) o «al jueves 24» (una unidad), como el spike. */
export function alDia(hoy: string, conMes: boolean): string {
  const [a, m, d] = hoy.split("-").map(Number) as [number, number, number];
  const dia = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `al ${dia} ${d}${conMes ? ` de ${mesNombre(hoy.slice(0, 7))}` : ""}`;
}

// ---- Punto de equilibrio y el día en que se cubre (F5) --------------------------------------------------------------------

export type Equilibrio = {
  /** Lo que hay que vender en el mes para cubrir los costos (sin IGV). */
  pe: number;
  ventas: number;
  /** ventas ÷ pe: 1 = cubre justo. */
  cubre: number;
  /** El día del mes en que se cubre vendiendo parejo; `null` si en el mes no llega. */
  dia: number | null;
  diasMes: number;
  margenPct: number;
};

/**
 * El punto de equilibrio de F5 (`puntoDeEquilibrio`: gastos ÷ margen %) y el día del mes en que se cubre, vendiendo cada día
 * lo mismo (lo del spike: pe ÷ lo vendido por día). `null` si no hubo ventas o el margen no es positivo.
 */
export function equilibrio(f: Pick<FilaER, "ventas" | "margen" | "gastos"> | undefined, diasMes: number): Equilibrio | null {
  if (!f) return null;
  const eq = puntoDeEquilibrio(f);
  if (!eq) return null;
  const porDia = f.ventas / diasMes;
  const dia = eq.cubre >= 1 ? Math.min(diasMes, Math.max(1, Math.ceil(eq.ventas / porDia - 1e-9))) : null;
  return { pe: eq.ventas, ventas: f.ventas, cubre: eq.cubre, dia, diasMes, margenPct: f.margen / f.ventas };
}

// ---- Qué fila es de qué -----------------------------------------------------------------------------------------------------

const filas = <T>(p: Parte<T[]>): T[] => (p.estado === "ok" ? p.datos : []);

/** La fila del Estado de resultados de lo que se mira: CAYLA (el consolidado), la empresa o la ubicación. */
export function filaDeVer(filasER: readonly FilaER[], ver: VerResumen): FilaER | undefined {
  if (ver.todas) return filasER.find((f) => f.unidad === "consolidado");
  if (ver.soloEmpresa) return filasER.find((f) => f.unidad === "empresa");
  return filasER.find((f) => f.ubicacionId === ver.ubicacionId);
}

/** La línea de ventas del presupuesto de lo que se mira (la meta del mes). */
function ventasPpto(r: ResumenFinanzas): FilaPpto | undefined {
  const ps = filas(r.presupuesto).filter((f) => f.linea === "ventas");
  if (r.ver.todas) return ps.find((f) => f.unidad === "consolidado");
  if (r.ver.soloEmpresa) return undefined;
  return ps.find((f) => f.ubicacionId === r.ver.ubicacionId);
}

/** La cuenta 635 (alquileres) del mes: cuánto de lo vendido se va en alquiler. */
export function pesoAlquiler(f: FilaER | undefined): number | null {
  if (!f || f.ventas <= 0) return null;
  const alquiler = f.detalleGastos.filter((g) => g.cuenta === "635").reduce((a, g) => a + g.monto, 0);
  return alquiler > 0 ? alquiler / f.ventas : null;
}

// ---- Por qué falta una parte (lo que es de otro módulo o solo del líder se explica, no se esconde) ----------------------------

export function motivoAusencia(p: Parte<unknown>, modulo?: string): string | null {
  if (p.estado === "sin_permiso") return modulo ? `Lo ve quien tiene ${modulo}` : p.mensaje;
  if (p.estado === "falla") return "No se pudo leer";
  return null;
}

// ---- 1. La salud, en frases (lo primero que se lee) --------------------------------------------------------------------------

export type Tono = "rojo" | "ambar" | "verde" | "pizarra";
export type Frase = { clave: string; n: string; t: string; d: string; tono: Tono; origen: string };

const tonoDe = (t: "rojo" | "ambar" | "verde" | "neutro"): Tono => (t === "neutro" ? "pizarra" : t);

function fraseDiasDeCaja(r: ResumenFinanzas): Frase {
  const origen = "Reportes ▸ Flujo de caja";
  if (r.flujo.estado !== "ok")
    return { clave: "dias", n: "—", t: "Días de caja", d: motivoAusencia(r.flujo) ?? "El flujo de caja es de CAYLA entera.", tono: "pizarra", origen };
  const p = r.flujo.datos;
  if (p.diasDeCaja === null || p.salidasDiarias <= 0)
    return { clave: "dias", n: "—", t: "Días de caja", d: `${soles(p.saldoHoy)} disponibles; todavía no hay salidas de los últimos 30 días para medir un día normal.`, tono: "pizarra", origen };
  const bajo = p.semanas.find((w) => w.bajoMinimo);
  const cola = p.saldoHoy < p.minimoCaja ? ` Hoy ya estás bajo tu mínimo de ${soles(p.minimoCaja)}.` : bajo ? ` La semana del ${etiquetaSemana(bajo.desde, bajo.hasta)} bajas de tu mínimo.` : "";
  return {
    clave: "dias",
    n: `${p.diasDeCaja} ${p.diasDeCaja === 1 ? "día" : "días"}`,
    t: "Si mañana no vendieras nada, tu plata alcanza para pagar esto",
    d: `${soles(p.saldoHoy)} disponibles contra ${soles(p.salidasDiarias)} que salen en un día normal.${cola}`,
    tono: tonoDe(tonoDiasDeCaja(p.diasDeCaja)),
    origen,
  };
}

function fraseEquilibrio(r: ResumenFinanzas, quien: string, holgura: number): Frase | null {
  const origen = "Reportes ▸ Estado de resultados";
  if (r.resultadosAnterior.estado !== "ok") return null;
  const f = filaDeVer(r.resultadosAnterior.datos, r.ver);
  const mes = mesNombre(r.mesAnterior);
  const eq = equilibrio(f, diasDelMes(r.mesAnterior));
  if (!f || !eq) {
    const ventas = f?.ventas ?? 0;
    return {
      clave: "equilibrio",
      n: "—",
      t: `Cuándo ${quien} cubre sus costos`,
      d: ventas > 0 ? `En ${mes} vendió ${soles(ventas)} sin margen: vender más no cubre nada.` : `Sin ventas en ${mes} para calcularlo.`,
      tono: ventas > 0 ? "rojo" : "pizarra",
      origen,
    };
  }
  if (eq.dia === null)
    return {
      clave: "equilibrio",
      n: porcentaje(eq.cubre, 1) ?? "—",
      t: `${quien} no llegó a cubrir sus costos en ${mes}`,
      d: `Necesita vender ${soles(eq.pe)} al mes para no perder; vendió ${soles(eq.ventas)}: le faltaron ${soles(eq.pe - eq.ventas)}.`,
      tono: "rojo",
      origen,
    };
  const resto = eq.diasMes - eq.dia;
  const despues = resto <= 0 ? "No le sobró ningún día." : `Lo que vende después ${resto === 1 ? `del día ${eq.dia} (solo 1 día)` : `(los últimos ${resto} días)`} es la ganancia.`;
  return {
    clave: "equilibrio",
    n: `día ${eq.dia}`,
    t: `${quien} cubre sus costos del mes ese día`,
    d: `Necesita vender ${soles(eq.pe)} al mes; en ${mes} vendió ${soles(eq.ventas)}. ${despues}`,
    tono: eq.dia > eq.diasMes - holgura ? "ambar" : "verde",
    origen,
  };
}

function fraseMeta(r: ResumenFinanzas): Frase | null {
  const origen = "Reportes ▸ Presupuesto";
  const v = ventasPpto(r);
  if (!v || v.proyeccion === null) return null;
  const mes = mesNombre(r.mes);
  if (!v.presupuesto)
    return {
      clave: "meta",
      n: "sin meta",
      t: `Las tiendas no tienen meta de ventas para ${mes}`,
      d: `Vas en ${soles(v.aLaFecha)} y al ritmo de hoy cerrarías en ${soles(v.proyeccion)}. La meta de cada día se pone en Configuración ▸ Tiendas y caja.`,
      tono: "pizarra",
      origen,
    };
  const avance = v.proyeccion / v.presupuesto;
  return {
    clave: "meta",
    n: porcentaje(v.proyeccion, v.presupuesto) ?? "—",
    t: `de la meta de ventas de ${mes}, al ritmo de hoy`,
    d: `Meta ${soles(v.presupuesto)}; vas en ${soles(v.aLaFecha)} y al cierre llegarías a ${soles(v.proyeccion)}.`,
    tono: avance < 0.9 ? "ambar" : "verde",
    origen,
  };
}

/** «Planilla S/ 9,600 · Alquileres S/ 1,800 · Servicios básicos S/ 710»: en qué se fue lo que costó una unidad sin ventas. */
function mayores(f: FilaER | undefined): string | null {
  const ds = (f?.detalleGastos ?? []).filter((g) => g.monto > 0).sort((a, b) => b.monto - a.monto);
  if (!ds.length) return null;
  const resto = ds.slice(3).reduce((a, g) => a + g.monto, 0);
  return `${ds
    .slice(0, 3)
    .map((g) => `${g.nombre} ${soles(g.monto)}`)
    .join(" · ")}${resto > 0 ? ` · lo demás ${soles(resto)}` : ""}.`;
}

/** Las frases de arriba: qué tan sano está lo que se mira, en palabras (spike). */
export function frasesSalud(r: ResumenFinanzas): Frase[] {
  const fs: (Frase | null)[] = [];
  if (r.ver.todas) {
    fs.push(fraseDiasDeCaja(r), fraseEquilibrio(r, "CAYLA", 4), fraseMeta(r));
  } else if (r.ver.tipo === "tienda") {
    fs.push(fraseEquilibrio(r, r.ver.nombre, 6));
    const f = r.resultadosAnterior.estado === "ok" ? filaDeVer(r.resultadosAnterior.datos, r.ver) : undefined;
    const alq = pesoAlquiler(f);
    if (alq !== null)
      fs.push({
        clave: "alquiler",
        n: porcentaje(alq, 1) ?? "—",
        t: "de lo que vende se va en alquiler",
        d:
          alq > 0.15
            ? "Por encima de lo que suele considerarse sano en tiendas de ropa (alrededor de 10–15 %). Es la palanca más grande que tiene."
            : "Dentro de lo que suele considerarse sano en tiendas de ropa (alrededor de 10–15 %).",
        tono: alq > 0.2 ? "rojo" : alq > 0.15 ? "ambar" : "verde",
        origen: "Reportes ▸ Estado de resultados",
      });
  } else if (r.resultadosAnterior.estado === "ok") {
    const f = filaDeVer(r.resultadosAnterior.datos, r.ver);
    const mes = mesNombre(r.mesAnterior);
    const taller = r.ver.tipo === "taller";
    fs.push({
      clave: "costo",
      n: soles(f?.gastos ?? 0),
      t: taller ? `costó el Taller en ${mes}` : `costó lo de la empresa en ${mes}`,
      d: mayores(f) ?? (taller ? "Sin gastos registrados ese mes." : "Sin gastos de la empresa ese mes."),
      tono: "pizarra",
      origen: "Reportes ▸ Estado de resultados",
    });
  }
  return fs.filter((f): f is Frase => f !== null);
}

// ---- 2. Las cinco cifras ---------------------------------------------------------------------------------------------------

export type Cifra = { clave: string; etiqueta: string; valor: string; rojo?: boolean; detalle: string; origen: string };

const DINERO = "Cuentas y dinero";

/** «Debes en 7 días»: lo vencido y lo que vence en `aviso_vence_dias` (F4), más la planilla de esos días si se ve (F6). */
export function debesPronto(r: ResumenFinanzas): { monto: number; vencidas: FilaPorPagar[]; proximas: FilaPorPagar[]; planilla: { monto: number; fecha: string } | null } | null {
  if (r.porPagar.estado !== "ok") return null;
  const { filas: fs, dias } = r.porPagar.datos;
  const vencidas = fs.filter((f) => diasHasta(f.vence, r.hoy) < 0);
  const proximas = fs.filter((f) => {
    const d = diasHasta(f.vence, r.hoy);
    return d >= 0 && d <= dias;
  });
  let planilla: { monto: number; fecha: string } | null = null;
  if (r.flujo.estado === "ok") {
    const pl = r.flujo.datos.salidas.filter((s) => s.tipo === "planilla" && diasHasta(s.fecha, r.hoy) <= dias);
    if (pl.length) planilla = { monto: r2(pl.reduce((a, s) => a + s.monto, 0)), fecha: pl[0]!.fecha };
  }
  const monto = r2([...vencidas, ...proximas].reduce((a, f) => a + f.saldo, 0) + (planilla?.monto ?? 0));
  return { monto, vencidas, proximas, planilla };
}

/** La plata disponible de CAYLA: la de F6 (los saldos de F3 sin la tarjeta de crédito); si el flujo no se pudo leer, la
 *  misma suma sobre los saldos de F3. */
function plataDisponible(r: ResumenFinanzas): number | null {
  if (r.flujo.estado === "ok") return r.flujo.datos.saldoHoy;
  if (r.cuentas.estado !== "ok") return null;
  return r2(r.cuentas.datos.filter((c) => c.tipo !== "tarjeta_credito").reduce((a, c) => a + (c.saldo ?? 0), 0));
}

function sumaTipos(cs: readonly CuentaDinero[], tipos: readonly CuentaDinero["tipo"][]): { monto: number; hay: boolean; ocultas: boolean } {
  const del = cs.filter((c) => tipos.includes(c.tipo));
  return { monto: r2(del.reduce((a, c) => a + (c.saldo ?? 0), 0)), hay: del.length > 0, ocultas: del.some((c) => c.saldo === null) };
}

export function cifrasResumen(r: ResumenFinanzas): Cifra[] {
  const mesAnt = mesNombre(r.mesAnterior);
  const out: Cifra[] = [];

  // 1 · Lo vendido en el mes (F5, sin IGV).
  const erMes = r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : [];
  const fMes = filaDeVer(erMes, r.ver);
  const vende = r.ver.todas || r.ver.tipo === "tienda";
  out.push({
    clave: "vendido",
    etiqueta: "Vendido en el mes",
    valor: r.resultadosMes.estado !== "ok" ? "—" : vende ? soles(fMes?.ventas ?? 0) : "—",
    detalle:
      r.resultadosMes.estado !== "ok"
        ? (motivoAusencia(r.resultadosMes) ?? "")
        : r.ver.todas
          ? erMes
              .filter((f) => f.unidad === "tienda")
              .map((f) => `${nombreCorto(f)} ${soles(f.ventas)}`)
              .join(" · ") || "Sin IGV"
          : vende
            ? "Sin IGV"
            : r.ver.tipo === "taller"
              ? "El Taller no vende"
              : "La empresa no vende",
    origen: "Estado de resultados (F5), sin IGV",
  });

  // 2 · La plata (F3; en CAYLA entera, la disponible de F6).
  if (r.ver.todas || r.ver.soloEmpresa) {
    const cs = r.cuentas.estado === "ok" ? r.cuentas.datos : [];
    const disp = r.ver.todas ? plataDisponible(r) : r.cuentas.estado === "ok" ? r2(cs.filter((c) => c.tipo !== "tarjeta_credito").reduce((a, c) => a + (c.saldo ?? 0), 0)) : null;
    const bancos = sumaTipos(cs, ["banco"]);
    const efectivo = sumaTipos(cs, r.ver.todas ? ["cajon", "caja_fuerte", "por_rendir"] : ["por_rendir"]);
    const pos = sumaTipos(cs, ["por_abonar"]);
    const partes = [
      bancos.hay ? `Bancos ${soles(bancos.monto)}` : null,
      efectivo.hay ? `${r.ver.todas ? "cajones y cajas fuertes" : "efectivo con el líder"} ${soles(efectivo.monto)}` : null,
      pos.hay ? `tarjeta por abonar ${soles(pos.monto)}` : null,
    ].filter(Boolean);
    out.push({
      clave: "plata",
      etiqueta: r.ver.todas ? "Plata disponible" : "Bancos y cuentas",
      valor: disp === null ? "—" : soles(disp),
      detalle:
        disp === null
          ? (motivoAusencia(r.cuentas, DINERO) ?? "")
          : bancos.hay
            ? mayuscula(partes.join(" · "))
            : `${partes.length ? `${mayuscula(partes.join(" · "))}. ` : ""}Sin bancos todavía: se agregan en Configuración ▸ Cuentas y cobros.`,
      origen: "Cuentas y dinero (F3); sin la tarjeta de crédito, que es deuda",
    });
  } else {
    const cs = r.cuentas.estado === "ok" ? r.cuentas.datos.filter((c) => c.tipo === "cajon" || c.tipo === "caja_fuerte") : [];
    const oculto = cs.some((c) => c.saldo === null);
    out.push({
      clave: "plata",
      etiqueta: r.ver.tipo === "taller" ? "Efectivo en el Taller" : "Efectivo en la tienda",
      valor: r.cuentas.estado === "ok" ? soles(cs.reduce((a, c) => a + (c.saldo ?? 0), 0)) : "—",
      detalle:
        r.cuentas.estado !== "ok"
          ? (motivoAusencia(r.cuentas, DINERO) ?? "")
          : oculto
            ? "Caja fuerte. El cajón abierto lo ve quien cierra la caja"
            : "Cajón y caja fuerte. Los bancos son de CAYLA entera",
      origen: "Cuentas y dinero (F3)",
    });
  }

  // 3 · Lo que se debe pronto (F4 + la planilla de F6).
  const deb = debesPronto(r);
  const dias = r.porPagar.estado === "ok" ? r.porPagar.datos.dias : r.parametros.estado === "ok" ? r.parametros.datos.avisoVenceDias : 7;
  out.push({
    clave: "debes",
    etiqueta: `Debes en ${dias} ${dias === 1 ? "día" : "días"}`,
    valor: deb ? soles(deb.monto) : "—",
    rojo: !!deb && deb.vencidas.length > 0,
    detalle: deb
      ? `${deb.planilla ? `Incluye la planilla del ${Number(deb.planilla.fecha.slice(8, 10))}. ` : ""}${deb.vencidas.length ? `${deb.vencidas.length} ${deb.vencidas.length === 1 ? "vencida" : "vencidas"}` : "Nada vencido"}`
      : (motivoAusencia(r.porPagar, DINERO) ?? ""),
    origen: "Cuentas y dinero ▸ Por pagar (F4)",
  });

  // 4 · La utilidad del último mes completo (F5), con el mes en curso a la fecha.
  const erAnt = r.resultadosAnterior.estado === "ok" ? r.resultadosAnterior.datos : [];
  const fAnt = filaDeVer(erAnt, r.ver);
  out.push({
    clave: "utilidad",
    etiqueta: `Utilidad de ${mesAnt}`,
    valor: r.resultadosAnterior.estado === "ok" ? soles(fAnt?.resultado ?? 0) : "—",
    rojo: (fAnt?.resultado ?? 0) < 0,
    detalle:
      r.resultadosAnterior.estado !== "ok"
        ? (motivoAusencia(r.resultadosAnterior) ?? "")
        : fAnt && fAnt.ventas > 0
          ? `Margen bruto ${porcentaje(fAnt.margen, fAnt.ventas)}`
          : vende
            ? `Sin ventas en ${mesAnt}`
            : "Unidad sin ventas propias",
    origen: "Estado de resultados (F5)",
  });

  // 5 · CAYLA entera: el IGV (F8). Una tienda: su meta (Presupuesto). El Taller y la empresa: sus gastos (F5).
  if (r.ver.todas) {
    const foco = r.igv.estado === "ok" ? r.igv.datos.foco : null;
    const anterior = r.igv.estado === "ok" ? r.igv.datos.historial.find((m) => m.mes === r.mesAnterior) : undefined;
    const siguiente = nombreMes(sumarMeses(r.mes, 1));
    out.push({
      clave: "igv",
      etiqueta: `IGV estimado de ${mesCortoDe(r.mes)}`,
      valor: foco ? soles(foco.aPagar) : "—",
      detalle: !foco
        ? (motivoAusencia(r.igv) ?? "")
        : [
            foco.aPagar > 0 ? `Se declara en ${siguiente}` : foco.saldoAFavor > 0 ? `Saldo a favor ${soles(foco.saldoAFavor)}` : `Se declara en ${siguiente}`,
            anterior && anterior.aPagar > 0 ? `${mesAnt}: ${soles(anterior.aPagar)} por declarar` : null,
          ]
            .filter(Boolean)
            .join(" · "),
      origen: "Impuestos (F8)",
    });
  } else if (r.ver.tipo === "tienda") {
    const v = ventasPpto(r);
    out.push({
      clave: "meta",
      etiqueta: "Meta de ventas",
      valor: v && v.presupuesto && v.proyeccion !== null ? (porcentaje(v.proyeccion, v.presupuesto) ?? "—") : "—",
      detalle:
        r.presupuesto.estado !== "ok"
          ? (motivoAusencia(r.presupuesto) ?? "")
          : v && v.presupuesto && v.proyeccion !== null
            ? `Proyección al cierre ${soles(v.proyeccion)} de ${soles(v.presupuesto)}`
            : "Sin meta: se pone en Configuración ▸ Tiendas y caja",
      origen: "Reportes ▸ Presupuesto",
    });
  } else {
    out.push({
      clave: "gastos",
      etiqueta: `Gastos de ${mesAnt}`,
      valor: r.resultadosAnterior.estado === "ok" ? soles(fAnt?.gastos ?? 0) : "—",
      detalle: r.ver.tipo === "taller" ? "No entran al costo de las prendas" : "Lo pagan las tiendas con su margen",
      origen: "Estado de resultados (F5)",
    });
  }
  return out;
}

const MESES_CORTOS = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];
const mesCortoDe = (mes: string) => MESES_CORTOS[Number(mes.slice(5, 7)) - 1] ?? mes;

// ---- 3. Para decidir hoy -----------------------------------------------------------------------------------------------------

export type Aviso = {
  clave: string;
  tono: "rojo" | "ambar" | "pizarra";
  titulo: string;
  detalle: string;
  /** Cuánto está en juego, en palabras («S/ 6,400 en juego»). */
  impacto: string | null;
  /** A dónde se va a actuar; `null` si la cuenta no ve ese módulo (el aviso se lee igual). */
  href: string | null;
  boton: string;
  /** De qué pantalla sale (lo que la fase calculó). */
  origen: string;
  /** «fuera de lo normal» (spike). */
  raro?: boolean;
  /** Para ordenar dentro de un mismo tono: qué clase de aviso es (lo que más cuesta dejar pasar, primero; el orden del
   *  spike) y, dentro de la misma clase, los soles en juego. */
  orden: number;
  peso: number;
};

/** Lo que la cuenta ve (sus módulos), para ofrecer solo los enlaces que puede abrir. */
export type Acceso = { lider: boolean; modulos: readonly string[] };

const RANGO: Record<Aviso["tono"], number> = { rojo: 0, ambar: 1, pizarra: 2 };
/** La clase de cada aviso, en el orden del spike: deudas vencidas, la caja bajo el mínimo, lo que vence, una tienda que
 *  pierde, un fijo que falta, un rubro que se pasa, una campaña que viene, el mes sin cerrar, lo fuera de lo normal, los
 *  egresos sin clasificar, lo que no tiene cuenta y el límite del régimen. */
const CLASE = { vencida: 0, minimo: 1, vencen: 2, pierde: 3, fijo: 4, ppto: 5, campana: 6, cierre: 7, raro: 8, egresos: 9, sin_cuenta: 10, umbral: 11 } as const;
const MAX_POR_TIPO = 3;

/** «Primero lo que más cuesta si se deja pasar»: rojo, ámbar, informativo; dentro de cada tono, la clase (el orden del
 *  spike) y, dentro de la clase, más soles primero. */
export function ordenarAvisos(avisos: readonly Aviso[]): Aviso[] {
  return avisos
    .map((a, i) => ({ a, i }))
    .sort((x, y) => RANGO[x.a.tono] - RANGO[y.a.tono] || x.a.orden - y.a.orden || y.a.peso - x.a.peso || x.i - y.i)
    .map((x) => x.a);
}

function verParam(r: ResumenFinanzas, ubicacionId?: string | null): string {
  if (!r.lider) return "";
  if (ubicacionId !== undefined) return ubicacionId ? `ver=${ubicacionId}` : "ver=empresa";
  return `ver=${claveVer(r.ver)}`;
}
const conQuery = (ruta: string, ...qs: string[]) => {
  const q = qs.filter(Boolean).join("&");
  return q ? `${ruta}?${q}` : ruta;
};

/** Los avisos de «Para decidir hoy», cada uno con su origen y su enlace (spike, y las reglas de la fase F10). */
export function avisosParaDecidir(r: ResumenFinanzas, acceso: Acceso): Aviso[] {
  const ve = (modulo: string) => acceso.lider || acceso.modulos.includes(modulo);
  const enlace = (modulo: string, href: string) => (ve(modulo) ? href : null);
  const out: Aviso[] = [];

  // Vencidas (F4): cada una, las más grandes primero; el resto, juntas.
  const deb = debesPronto(r);
  if (deb) {
    const vencidas = [...deb.vencidas].sort((a, b) => b.saldo - a.saldo);
    for (const f of vencidas.slice(0, MAX_POR_TIPO)) {
      const hace = -diasHasta(f.vence, r.hoy);
      out.push({
        clave: `vencida:${f.id}`,
        orden: CLASE.vencida,
        tono: "rojo",
        titulo: `${f.tipo === "factura" ? "Factura vencida" : "Deuda vencida"}: ${f.proveedor}`,
        detalle: `Saldo ${soles(f.saldo)}${f.concepto ? ` (${f.concepto})` : ""}, venció ${hace === 1 ? "ayer" : `hace ${hace} días`}.`,
        impacto: `${soles(f.saldo)} en juego`,
        href: enlace("cuentas_dinero", conQuery("/finanzas/dinero/por-pagar", verParam(r), `pagar=${f.id}`)),
        boton: "Pagar",
        origen: "Cuentas y dinero ▸ Por pagar",
        peso: f.saldo,
      });
    }
    if (vencidas.length > MAX_POR_TIPO) {
      const resto = vencidas.slice(MAX_POR_TIPO);
      const monto = r2(resto.reduce((a, f) => a + f.saldo, 0));
      out.push({
        clave: "vencidas:resto",
        orden: CLASE.vencida,
        tono: "rojo",
        titulo: `${resto.length} deudas vencidas más`,
        detalle: `Por ${soles(monto)} en total.`,
        impacto: `${soles(monto)} en juego`,
        href: enlace("cuentas_dinero", conQuery("/finanzas/dinero/por-pagar", verParam(r))),
        boton: "Ver",
        origen: "Cuentas y dinero ▸ Por pagar",
        peso: monto,
      });
    }
    // Lo que vence pronto (en `aviso_vence_dias`): uno solo, con la primera.
    if (deb.proximas.length) {
      const monto = r2(deb.proximas.reduce((a, f) => a + f.saldo, 0));
      const primera = deb.proximas[0]!;
      const dias = r.porPagar.estado === "ok" ? r.porPagar.datos.dias : 7;
      out.push({
        clave: "vencen",
        orden: CLASE.vencen,
        tono: "ambar",
        titulo: `${deb.proximas.length === 1 ? "Vence 1 deuda" : `Vencen ${deb.proximas.length} deudas`} en los próximos ${dias} días`,
        detalle: `Por ${soles(monto)}. La primera: ${primera.proveedor}, ${soles(primera.saldo)}, ${textoVence(primera, r.hoy)}.`,
        impacto: `${soles(monto)} por pagar`,
        href: enlace("cuentas_dinero", conQuery("/finanzas/dinero/por-pagar", verParam(r))),
        boton: "Ver",
        origen: "Cuentas y dinero ▸ Por pagar",
        peso: monto,
      });
    }
  }

  // La caja bajo el mínimo (F6).
  if (r.flujo.estado === "ok") {
    const p = r.flujo.datos;
    const bajo = p.semanas.find((w) => w.bajoMinimo);
    if (bajo) {
      const peor = p.semanas.reduce((a, w) => (w.saldo < a.saldo ? w : a), bajo);
      const yaHoy = p.saldoHoy < p.minimoCaja;
      out.push({
        clave: "minimo",
        orden: CLASE.minimo,
        tono: peor.saldo < 0 ? "rojo" : "ambar",
        titulo: yaHoy ? "Hoy ya estás bajo tu mínimo de caja" : `La semana del ${etiquetaSemana(bajo.desde, bajo.hasta)} quedas bajo tu mínimo de caja`,
        detalle: yaHoy
          ? `Tienes ${soles(p.saldoHoy)} y tu mínimo es ${soles(p.minimoCaja)}.${peor.saldo < p.saldoHoy ? ` La semana del ${etiquetaSemana(peor.desde, peor.hasta)} llegarías a ${soles(peor.saldo)}: ${queVence(p.salidas, peor.desde, peor.hasta)}.` : ""}`
          : `Quedarías con ${soles(bajo.saldo)} (tu mínimo es ${soles(p.minimoCaja)}). Lo que más sale esa semana: ${queVence(p.salidas, bajo.desde, bajo.hasta)}.`,
        impacto: `faltan ${soles(p.minimoCaja - peor.saldo)}`,
        href: enlace("reportes_financieros", "/finanzas/reportes/escenarios"),
        boton: "Probar escenario",
        origen: "Reportes ▸ Flujo de caja",
        peso: p.minimoCaja - peor.saldo,
      });
    }
  }

  // Una tienda que perdió plata el último mes (F5).
  if (r.resultadosAnterior.estado === "ok") {
    const mes = mesNombre(r.mesAnterior);
    const tiendas = r.resultadosAnterior.datos.filter((f) => f.unidad === "tienda" && (r.ver.todas || f.ubicacionId === r.ver.ubicacionId));
    for (const f of tiendas.filter((x) => x.resultado < 0).sort((a, b) => a.resultado - b.resultado)) {
      const eq = equilibrio(f, diasDelMes(r.mesAnterior));
      out.push({
        clave: `pierde:${f.ubicacionId}`,
        orden: CLASE.pierde,
        tono: "ambar",
        titulo: `${nombreCorto(f)} perdió ${soles(-f.resultado)} en ${mes}`,
        detalle: eq
          ? `Necesita vender ${soles(eq.pe)} al mes y vendió ${soles(eq.ventas)}.`
          : `Vendió ${soles(f.ventas)} y sus gastos fueron ${soles(f.gastos)}.`,
        impacto: `${soles(-f.resultado)} al mes`,
        href: acceso.lider ? "/finanzas/reportes/escenarios" : enlace("reportes_financieros", "/finanzas/reportes"),
        boton: acceso.lider ? "Probar escenario" : "Ver resultados",
        origen: "Reportes ▸ Estado de resultados",
        peso: -f.resultado,
      });
    }
  }

  // Gastos fijos que ya debieron llegar (F2b).
  if (r.fijos.estado === "ok") {
    const fs = r.fijos.datos;
    for (const f of fs.slice(0, MAX_POR_TIPO)) {
      out.push({
        clave: `fijo:${f.id}`,
        orden: CLASE.fijo,
        tono: "ambar",
        titulo: `Falta registrar: ${f.descripcion} ${deUnidad(f.ubicacionNombre ?? "De la empresa")}`,
        detalle: `Suele llegar el día ${f.dia} por unos ${soles(f.monto)}. Si no está, el resultado del mes sale mejor de lo que es.`,
        impacto: `~${soles(f.monto)}`,
        href: enlace("gastos", conQuery("/finanzas/gastos", "tab=fijos", `mes=${r.mes}`, verParam(r))),
        boton: "Ver fijos",
        origen: "Gastos ▸ Fijos del mes",
        peso: f.monto,
      });
    }
    if (fs.length > MAX_POR_TIPO) {
      const resto = fs.slice(MAX_POR_TIPO);
      out.push({
        clave: "fijos:resto",
        orden: CLASE.fijo,
        tono: "ambar",
        titulo: `${resto.length} gastos fijos más sin registrar`,
        detalle: `Por unos ${soles(resto.reduce((a, f) => a + f.monto, 0))}.`,
        impacto: null,
        href: enlace("gastos", conQuery("/finanzas/gastos", "tab=fijos", `mes=${r.mes}`, verParam(r))),
        boton: "Ver fijos",
        origen: "Gastos ▸ Fijos del mes",
        peso: resto.reduce((a, f) => a + f.monto, 0),
      });
    }
  }

  // Gastos fuera de lo normal (la regla de F10, en la base).
  if (r.raros.estado === "ok") {
    const pct = r.parametros.estado === "ok" ? r.parametros.datos.avisoGastoPct : null;
    for (const g of r.raros.datos.slice(0, MAX_POR_TIPO)) {
      out.push({
        clave: `raro:${g.llave}:${g.ubicacionId ?? "empresa"}:${g.mes}`,
        orden: CLASE.raro,
        tono: "pizarra",
        raro: true,
        titulo: `${g.proveedor} ${deUnidad(g.ubicacionNombre)} vino ${porcentaje(g.excesoPct / 100, 1)} más alto que su promedio`,
        detalle: `${soles(g.monto)} en ${mesNombre(g.mes)} contra ${soles(g.promedio)} de promedio en ${g.mesesBase} ${g.mesesBase === 1 ? "mes" : "meses"} (${g.categoriaNombre.toLowerCase()}). ¿Cambió algo o es un error del recibo?`,
        impacto: pct !== null ? `${soles(g.monto - g.promedio)} más de lo normal (avisa desde +${pct} %)` : `${soles(g.monto - g.promedio)} más de lo normal`,
        href: enlace("gastos", conQuery("/finanzas/gastos", `mes=${g.mes}`, verParam(r, g.ubicacionId))),
        boton: "Revisar",
        origen: "Gastos (promedio de 6 meses del mismo proveedor y tienda)",
        peso: g.monto - g.promedio,
      });
    }
  }

  // Egresos de caja sin clasificar (F2).
  if (r.egresos.estado === "ok" && r.egresos.datos.n > 0) {
    const e = r.egresos.datos;
    const donde = r.ver.todas && e.porUbicacion.length > 1 ? ` ${e.porUbicacion.map((u) => `${corto(u.nombre)} ${u.n}`).join(" · ")}.` : "";
    out.push({
      clave: "egresos",
      orden: CLASE.egresos,
      tono: "pizarra",
      titulo: `${e.n} ${e.n === 1 ? "egreso" : "egresos"} de caja sin clasificar`,
      detalle: `Mientras no se diga si son gasto, depósito o retiro, no cuentan en ningún número.${donde}`,
      impacto: `${soles(e.monto)} sin clasificar`,
      href: enlace("gastos", conQuery("/finanzas/gastos", "tab=egresos", verParam(r))),
      boton: "Clasificar",
      origen: "Gastos ▸ Egresos de caja",
      peso: e.monto,
    });
  }

  // Una campaña que empieza en dos semanas y cuya meta sube menos de lo que su descuento exige (F5).
  if (r.campanas.estado === "ok") {
    for (const c of r.campanas.datos) {
      const v = veredictoCampana(c);
      if (v.tono !== "ambar" && v.tono !== "rojo") continue;
      const dias = c.desde ? diasHasta(c.desde, r.hoy) : null;
      const extra = extraNecesario(c.margenNormalPct, c.descuentoPct);
      const sube = c.conEfecto && c.metaPct != null ? `la meta sube ${porcentaje(c.metaPct, 100)}` : "la meta no sube";
      out.push({
        clave: `campana:${c.id}`,
        orden: CLASE.campana,
        tono: v.tono,
        titulo: `${c.nombre} empieza ${dias === 1 ? "mañana" : `en ${dias} días`}`,
        detalle:
          extra !== null && Number.isFinite(extra)
            ? `Con ${c.descuentoPct} % de descuento, para ganar lo mismo que un día normal hay que vender ${porcentaje(extra, 1)} más; ${sube}. ${mayuscula(v.texto)}.`
            : `Con ${c.descuentoPct} % de descuento y un margen normal de ${porcentaje(c.margenNormalPct ?? 0, 1)}: ${v.texto}.`,
        impacto: null,
        href: enlace("reportes_financieros", "/finanzas/reportes/campanas"),
        boton: "Ver campaña",
        origen: "Reportes ▸ Campañas",
        peso: 0,
      });
    }
  }

  // El mes anterior sin cerrar (F9).
  if (r.cierre.estado === "ok" && !r.cierre.datos.consolidado) {
    const c = r.cierre.datos;
    const abiertas = c.unidades.filter((u) => !u.cerrada);
    const mes = mesNombre(c.mes);
    const primeraSemana = Number(r.hoy.slice(8, 10)) <= 5;
    const href = enlace("cierre_mes", `/finanzas/cierre?mes=${c.mes}`);
    if (r.ver.todas) {
      const cerradas = c.unidades.length - abiertas.length;
      out.push({
        clave: "cierre",
        orden: CLASE.cierre,
        tono: primeraSemana ? "pizarra" : "ambar",
        titulo: abiertas.length ? `${mayuscula(mes)} sigue abierto` : `Falta cerrar ${mes} de CAYLA entera`,
        detalle: abiertas.length
          ? `${cerradas} de ${c.unidades.length} ${c.unidades.length === 1 ? "unidad cerrada" : "unidades cerradas"}; faltan ${abiertas.map((u) => corto(u.nombre)).join(", ")}. Mientras siga abierto, se puede registrar con fecha de ${mes} y sus números pueden cambiar.`
          : "Todas las unidades están cerradas: falta el consolidado para entregarle el mes al contador.",
        impacto: null,
        href,
        boton: "Cerrar el mes",
        origen: "Cierre de mes",
        peso: 0,
      });
    } else if (abiertas.length) {
      out.push({
        clave: "cierre",
        orden: CLASE.cierre,
        tono: primeraSemana ? "pizarra" : "ambar",
        titulo: `${mayuscula(mes)} ${deUnidad(r.ver.nombre)} sigue abierto`,
        detalle: `Mientras siga abierto, se puede registrar con fecha de ${mes} y sus números pueden cambiar.`,
        impacto: null,
        href,
        boton: "Cerrar el mes",
        origen: "Cierre de mes",
        peso: 0,
      });
    }
  }

  // Presupuesto que se pasa (Presupuesto): cada rubro de cada unidad; en CAYLA entera no se repite la suma.
  if (r.presupuesto.estado === "ok") {
    const pasan = r.presupuesto.datos.filter((f) => f.sePasa && f.tipo === "tope" && f.unidad !== "consolidado" && f.presupuesto && f.proyeccion !== null);
    for (const f of pasan.sort((a, b) => (b.proyeccion ?? 0) - (b.presupuesto ?? 0) - ((a.proyeccion ?? 0) - (a.presupuesto ?? 0))).slice(0, MAX_POR_TIPO)) {
      const chip = chipPpto(f);
      const cerrado = f.momento === "cerrado";
      out.push({
        clave: `ppto:${f.ubicacionId ?? f.unidad}:${f.linea}`,
        orden: CLASE.ppto,
        tono: "ambar",
        titulo: `${f.lineaNombre} ${deUnidad(f.nombre)} ${cerrado ? "se pasó" : "va a pasarse"} de su tope`,
        detalle: `${cerrado ? "Cerró" : "Al cierre llegaría"} en ${soles(f.proyeccion ?? 0)} contra un tope de ${soles(f.presupuesto ?? 0)} (${chip.texto}); lleva ${soles(f.aLaFecha)}.`,
        impacto: `${soles((f.proyeccion ?? 0) - (f.presupuesto ?? 0))} sobre el tope`,
        href: enlace("reportes_financieros", conQuery("/finanzas/reportes/presupuesto", verParam(r, f.unidad === "empresa" ? null : f.ubicacionId))),
        boton: "Ver presupuesto",
        origen: "Reportes ▸ Presupuesto",
        peso: (f.proyeccion ?? 0) - (f.presupuesto ?? 0),
      });
    }
  }

  // Lo que movió plata sin decir de qué cuenta (F3).
  if (r.sinCuenta.estado === "ok" && r.sinCuenta.datos.length) {
    const s = r.sinCuenta.datos;
    const n = s.reduce((a, x) => a + x.n, 0);
    const monto = r2(s.reduce((a, x) => a + Math.abs(x.monto), 0));
    out.push({
      clave: "sin_cuenta",
      orden: CLASE.sin_cuenta,
      tono: "pizarra",
      titulo: `${n} ${n === 1 ? "movimiento" : "movimientos"} de plata sin cuenta este mes`,
      detalle: `No suman en ningún saldo: ${s.map((x) => `${TEXTO_SIN_CUENTA[x.origen] ?? x.origen} (${soles(Math.abs(x.monto))})`).join("; ")}.`,
      impacto: `${soles(monto)} sin cuenta`,
      href: enlace("cuentas_dinero", "/finanzas/dinero?ver=todas"),
      boton: "Ver cuentas",
      origen: "Cuentas y dinero",
      peso: 0,
    });
  }

  // El límite del régimen (F8), desde el ámbar de Impuestos.
  if (r.igv.estado === "ok" && r.igv.datos.umbral.avance !== null) {
    const u = r.igv.datos.umbral;
    const tono = tonoAvance(u.avance);
    if (tono === "ambar" || tono === "rojo") {
      const proy = proyectarUmbral(u.ventasMeses, r.hoy, u.umbralSoles, u.primerMes);
      const uit = r.igv.datos.parametros.umbralUit?.valor;
      out.push({
        clave: "umbral",
        orden: CLASE.umbral,
        tono: tono === "rojo" ? "rojo" : "pizarra",
        titulo: u.cruzado ? `Cruzaste el límite de ${uit ?? 300} UIT` : `Vas al ${porcentaje(u.avance ?? 0, 1)} del límite de ${uit ?? 300} UIT`,
        detalle: u.cruzado
          ? "Cambian el régimen y los libros que exige SUNAT: conviene verlo con el contador."
          : `Al cruzarlo cambian el régimen y los libros que exige SUNAT.${proy.mesCruce ? ` A este ritmo, en ${nombreMes(proy.mesCruce)}.` : ""}`,
        impacto: null,
        href: enlace("impuestos", "/finanzas/impuestos"),
        boton: "Ver",
        origen: "Impuestos",
        peso: 0,
      });
    }
  }

  return ordenarAvisos(out);
}

/** Lo que no se pudo revisar para «Para decidir hoy»: se dice, no se esconde (una cuenta sin Gastos no ve los egresos). */
export function noRevisado(r: ResumenFinanzas): string[] {
  const partes: [Parte<unknown>, string, string][] = [
    [r.porPagar, "lo que vence", DINERO],
    [r.egresos, "los egresos de caja", "Gastos"],
    [r.fijos, "los gastos fijos", "Gastos"],
    [r.raros, "los gastos fuera de lo normal", "Reportes financieros"],
    [r.presupuesto, "el presupuesto", "Reportes financieros"],
    [r.campanas, "las campañas", "Reportes financieros"],
    [r.flujo, "la caja de las próximas semanas", "el líder"],
    [r.cierre, "el cierre del mes", "el líder"],
  ];
  return partes
    .filter(([p]) => p.estado === "sin_permiso" || p.estado === "falla")
    .map(([p, que, quien]) => (p.estado === "sin_permiso" ? `${mayuscula(que)}: lo ve ${quien === "el líder" ? "el líder" : `quien tiene ${quien}`}.` : `${mayuscula(que)}: no se pudo leer.`));
}

// ---- 4. La columna derecha ----------------------------------------------------------------------------------------------------

export type BarraResumen = { nombre: string; valor: number; mala: boolean; malaTexto: string; titulo: string; lineas: string[] };

/** «¿Cada tienda cubre sus costos?»: lo vendido el último mes contra lo que necesitaba vender (100 %). */
export function coberturaTiendas(r: ResumenFinanzas): { barras: BarraResumen[]; sinDatos: string[] } {
  if (r.resultadosAnterior.estado !== "ok") return { barras: [], sinDatos: [] };
  const dias = diasDelMes(r.mesAnterior);
  const barras: BarraResumen[] = [];
  const sinDatos: string[] = [];
  for (const f of r.resultadosAnterior.datos.filter((x) => x.unidad === "tienda")) {
    const eq = equilibrio(f, dias);
    if (!eq) {
      sinDatos.push(nombreCorto(f));
      continue;
    }
    barras.push({
      nombre: nombreCorto(f),
      valor: Math.round(eq.cubre * 100),
      mala: eq.cubre < 1,
      malaTexto: "no cubre",
      titulo: f.nombre,
      lineas: [`Necesita ${soles(eq.pe)} · vendió ${soles(eq.ventas)}`, eq.dia !== null ? `Cubre sus costos el día ${eq.dia}` : `Le faltan ${soles(eq.pe - eq.ventas)} al mes`],
    });
  }
  return { barras, sinDatos };
}

/** «Saldo de las próximas 6 semanas» (F6): lo que queda cada semana contra el mínimo de caja. */
export function barrasSemanas(p: Proyeccion): BarraResumen[] {
  const eje = etiquetasEje(p.semanas.map((w) => w.desde));
  return p.semanas.map((w, i) => ({
    nombre: eje[i] ?? "",
    valor: w.saldo,
    mala: w.bajoMinimo,
    malaTexto: "bajo el mínimo",
    titulo: etiquetaSemana(w.desde, w.hasta),
    lineas: [`Entra ${soles(w.entra)} · Sale ${soles(w.sale)}`, queVence(p.salidas, w.desde, w.hasta)],
  }));
}

/** «Camino al punto de equilibrio» de una tienda: lo vendido este mes contra lo que necesita (según el último mes). */
export function caminoEquilibrio(r: ResumenFinanzas): { vendido: number; pe: number; ancho: number; texto: string } | null {
  if (r.resultadosMes.estado !== "ok" || r.resultadosAnterior.estado !== "ok") return null;
  const eq = equilibrio(filaDeVer(r.resultadosAnterior.datos, r.ver), diasDelMes(r.mesAnterior));
  if (!eq || eq.pe <= 0) return null;
  const vendido = filaDeVer(r.resultadosMes.datos, r.ver)?.ventas ?? 0;
  const dia = Number(r.hoy.slice(8, 10));
  const quedan = diasDelMes(r.mes) - dia;
  const falta = eq.pe - vendido;
  const texto =
    falta <= 0
      ? "Ya cubrió los costos del mes: desde aquí, cada sol de margen es ganancia."
      : quedan > 0
        ? `Le faltan ${soles(falta)} en ${quedan} ${quedan === 1 ? "día" : "días"}: unos ${soles(falta / quedan)} diarios. Hoy vende ${soles(vendido / Math.max(1, dia))} al día.`
        : `Le faltan ${soles(falta)} y hoy termina el mes.`;
  return { vendido, pe: eq.pe, ancho: Math.max(0, Math.min(100, (vendido / eq.pe) * 100)), texto };
}

/** «Presupuesto del mes» de una unidad: cada rubro con tope, lo gastado a la fecha y el % de la proyección al cierre. */
export function miniPresupuesto(r: ResumenFinanzas): { nombre: string; real: number; tope: number; pct: string; tono: "rojo" | "ambar" | "verde" }[] {
  return filas(r.presupuesto)
    .filter((f) => f.tipo === "tope" && f.presupuesto && f.unidad !== "consolidado")
    .map((f) => {
      const p = (f.proyeccion ?? f.aLaFecha) / (f.presupuesto ?? 1);
      return {
        nombre: f.lineaNombre,
        real: f.aLaFecha,
        tope: f.presupuesto ?? 0,
        pct: porcentaje(p, 1) ?? "—",
        tono: p > 1.05 ? "rojo" : p > 1 ? "ambar" : "verde",
      };
    });
}

// ---- 5. Cabecera -------------------------------------------------------------------------------------------------------------

export function tituloResumen(r: ResumenFinanzas): string {
  return r.ver.todas ? `CAYLA, ${alDia(r.hoy, true)}` : `${r.ver.nombre}, ${alDia(r.hoy, false)}`;
}

export function bajadaResumen(r: ResumenFinanzas): string {
  if (r.ver.todas) return "Cómo está el negocio y qué conviene decidir hoy. Todo sale de lo que ya registran Ventas, Caja, Compras, Producción y Dynamic.";
  if (!r.lider) return `Lo de ${r.ver.nombre}: sus ventas, sus gastos y lo que conviene decidir hoy.`;
  return `Solo ${r.ver.soloEmpresa ? "lo de la empresa" : r.ver.nombre}. Para ver el negocio entero, elige «Todas las tiendas».`;
}

/** La nota del Taller y de la empresa (spike), dicha con lo que hoy es cierto (F5, decisión 8). */
export function notaUnidad(r: ResumenFinanzas): string | null {
  if (r.ver.tipo === "taller")
    return "El Taller no vende: se mide por lo que cuesta. Su planilla y sus gastos no se reparten en las prendas (su costo es tela, avíos y maquila); CAYLA los paga con el margen de las tiendas. El costo de cada prenda se ve en Producción.";
  if (r.ver.soloEmpresa)
    return "Lo de la empresa no es de ninguna tienda y no se reparte (D-32). Las tiendas lo pagan con su margen: por eso el punto de equilibrio de CAYLA entera es más alto que la suma de las tiendas.";
  return null;
}
