// Reglas de Finanzas ▸ Resumen (ADR-0195 F10; spike `vista-resumen.js`; contrato en 20260925200000_finanzas_resumen.sql).
// Lógica pura: la usan la pantalla y sus pruebas.
//
// Qué NO hace este archivo: calcular plata. `fn_resumen_finanzas` devuelve, parte por parte, lo que dice la función de cada
// fase (F2b, F3, F4, F5, F6, F8, F9, Presupuesto) con sus mismas columnas, y aquí se leen con los MISMOS lectores de cada
// fase (`leerFilaER`, `leerCuenta`, `leerFilaPorPagar`, `leerProyeccion`, `leerPanelImpuestos`, `leerCampana`,
// `leerFilaPpto`). Las reglas que ya viven en una fase se llaman, no se copian: el punto de equilibrio (`puntoDeEquilibrio`,
// F5), el veredicto de una campaña (`veredictoCampana`, F5), lo que vence
// en una semana (`queVence`, F6), el límite del régimen (`proyectarUmbral`, `tonoAvance`, F8) y el chip del presupuesto
// (`chipPpto`). Lo propio del Resumen es decidir QUÉ se dice primero: las frases de la salud, las cinco cifras, los avisos de
// «Para decidir hoy» con su origen y su enlace, y el orden («primero lo que más cuesta si se deja pasar»).

import { leerCuenta, type CuentaDinero, type SinCuenta } from "./cuentas-dinero-reglas";
import { leerInicioFinanzas, mesAntesDelCorte } from "./finanzas-arranque-reglas";
import { diasHasta, leerFilaPorPagar, textoVence, type FilaPorPagar } from "./por-pagar-consolidado-reglas";
import {
  etiquetaSemana,
  leerProyeccion,
  queVence,
  soles,
  TEXTO_SIN_CUENTA,
  type Proyeccion,
} from "./flujo-caja-reglas";
import { avisoUmbral, leerPanelImpuestos, nombreMes, proyectarUmbral, tonoAvance, type PanelImpuestos } from "./impuestos-reglas";
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
  /**
   * «2026-10-01» si Finanzas cuenta desde un día POSTERIOR al fin de `mesAnterior` (ADR-0332): ese mes no se mide, así que
   * `resultadosAnterior` y `cierre` vuelven «no aplica» y las frases lo explican en vez de mostrar ceros. Null = sin corte
   * o el último mes completo ya cuenta.
   */
  antesDelCorte: string | null;
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

/**
 * El JSON de `fn_resumen_finanzas` → tipos de la pantalla. Si Finanzas cuenta desde un día posterior al fin del último mes
 * completo (ADR-0332), esa utilidad y ese cierre no existen: se leen como «no aplica» y `antesDelCorte` dice desde cuándo.
 */
export function leerResumen(data: unknown): ResumenFinanzas {
  const r = leerResumenBruto(data);
  const inicio = leerInicioFinanzas(obj(obj(data).parametros));
  if (!inicio || !mesAntesDelCorte(r.mesAnterior, inicio)) return r;
  return { ...r, antesDelCorte: inicio, resultadosAnterior: { estado: "no_aplica" }, cierre: { estado: "no_aplica" } };
}

function leerResumenBruto(data: unknown): ResumenFinanzas {
  const d = obj(data);
  const v = obj(d.ver);
  return {
    hoy: String(d.hoy ?? "").slice(0, 10),
    mes: aMes(d.mes),
    mesAnterior: aMes(d.mes_anterior),
    antesDelCorte: null,
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

// ---- Cuando una lectura falla ----------------------------------------------------------------------------------------------

/**
 * Lo que la pantalla dice cuando una lectura del Resumen falla: qué no se pudo, qué significa y qué hacer, sin el texto crudo de
 * la base («Could not find the function … in the schema cache» salía tal cual: auditoría v3, hallazgo 4; ley 9 de Formidable).
 * El detalle técnico va al aviso de errores (`capturarError`), no a la colaboradora.
 */
export function explicarFallaLectura(error: { message?: string | null; code?: string | null } | null, que: string): string {
  const m = (error?.message ?? "").toLowerCase();
  if (error?.code === "PGRST202" || error?.code === "42883" || m.includes("schema cache") || m.includes("does not exist"))
    return `No se pudo ${que}: esta parte todavía no está instalada en la base. Lo demás del Resumen sigue al día. Avisa a Felipe.`;
  if (error?.code === "42501") return `No se pudo ${que}: tu cuenta no tiene permiso para verlo. Si lo necesitas, pídeselo a tu líder.`;
  if (m.includes("fetch") || m.includes("network")) return `No se pudo ${que}: se cortó la conexión. Revisa el internet y vuelve a cargar la página.`;
  return `No se pudo ${que}. Vuelve a cargar la página; si sigue igual, avisa a Felipe.`;
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


/** Días que tiene el mes «2026-08» (31). */
export function diasDelMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
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
export function equilibrio(f: (Pick<FilaER, "ventas" | "margen" | "gastos"> & { detalleGastos?: FilaER["detalleGastos"] }) | undefined, diasMes: number): Equilibrio | null {
  if (!f || motivoSinEquilibrio(f)) return null;
  const eq = puntoDeEquilibrio(f);
  if (!eq) return null;
  const porDia = f.ventas / diasMes;
  const dia = eq.cubre >= 1 ? Math.min(diasMes, Math.max(1, Math.ceil(eq.ventas / porDia - 1e-9))) : null;
  return { pe: eq.ventas, ventas: f.ventas, cubre: eq.cubre, dia, diasMes, margenPct: f.margen / f.ventas };
}

/** La cuenta de las diferencias de caja (faltantes y sobrantes): no es un gasto que la tienda cause. */
const CUENTA_DIFERENCIAS_CAJA = "6599";

/**
 * Por qué no hay punto de equilibrio: sin ventas, sin margen o SIN GASTOS registrados. Sin gastos, `puntoDeEquilibrio` da 0 (o
 * menos, con un sobrante de caja) y «cubre» salía 100 % o «desde el día 1»: en local, Trujillo sin alquiler ni sueldos cargados,
 * solo con un sobrante de S/ 139.90, parecía sana (auditoría v3 del Resumen, hallazgo 1). Lo que cuenta es lo registrado SIN las
 * diferencias de caja; si eso es 0, no se sabe si cubre y se dice eso, no un número. Un sobrante sobre gastos reales sigue
 * contando como antes.
 */
export function motivoSinEquilibrio(f: Pick<FilaER, "ventas" | "margen" | "gastos"> & { detalleGastos?: FilaER["detalleGastos"] }): "sin_ventas" | "sin_margen" | "sin_gastos" | null {
  if (f.ventas <= 0) return "sin_ventas";
  if (f.margen <= 0) return "sin_margen";
  const caja = (f.detalleGastos ?? []).filter((g) => g.cuenta === CUENTA_DIFERENCIAS_CAJA).reduce((s, g) => s + g.monto, 0);
  if (f.gastos - caja <= 0) return "sin_gastos";
  return null;
}

// ---- Qué fila es de qué -----------------------------------------------------------------------------------------------------

/** La fila del Estado de resultados de lo que se mira: CAYLA (el consolidado), la empresa o la ubicación. */
export function filaDeVer(filasER: readonly FilaER[], ver: VerResumen): FilaER | undefined {
  if (ver.todas) return filasER.find((f) => f.unidad === "consolidado");
  if (ver.soloEmpresa) return filasER.find((f) => f.unidad === "empresa");
  return filasER.find((f) => f.ubicacionId === ver.ubicacionId);
}

// ---- Por qué falta una parte (lo que es de otro módulo o solo del líder se explica, no se esconde) ----------------------------

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

  // Gastos fijos que ya vencieron sin registrarse (F2b; ADR-0487).
  if (r.fijos.estado === "ok") {
    const fs = r.fijos.datos;
    for (const f of fs.slice(0, MAX_POR_TIPO)) {
      out.push({
        clave: `fijo:${f.id}`,
        orden: CLASE.fijo,
        tono: "ambar",
        titulo: `Falta registrar: ${f.descripcion} ${deUnidad(f.ubicacionNombre ?? "De la empresa")}`,
        detalle: `Venció el día ${Number(f.fechaEsperada.slice(8, 10)) || f.dia} por unos ${soles(f.monto)}. Si no está, el resultado del mes sale mejor de lo que es.`,
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

  // El aviso anticipado del límite (250 UIT, parámetro): «Llevas S/ X vendidos este año, a S/ Y de las 300 UIT: habla con tu contador». Mide el año calendario, la misma cifra que la
  // tarjeta del límite, y dice que cuenta lo registrado en el sistema. Mientras no llegue al límite REEMPLAZA al «Vas al X % del límite» de abajo (mismo tema, menos preciso);
  // pasado el límite manda el aviso rojo de siempre.
  const datosIgv = r.igv.estado === "ok" ? r.igv.datos : null;
  const anticipado = datosIgv ? avisoUmbral(datosIgv) : null;
  const tituloAnticipado = anticipado?.nivel === "aviso" ? anticipado.titulo : null;
  const hayAnticipado = tituloAnticipado !== null;
  if (anticipado && tituloAnticipado) {
    out.push({
      clave: "umbral_aviso",
      orden: CLASE.umbral,
      tono: "ambar",
      titulo: tituloAnticipado,
      detalle: [anticipado.detalle, anticipado.alcance].filter(Boolean).join(" "),
      impacto: null,
      href: enlace("impuestos", "/finanzas/impuestos"),
      boton: "Ver",
      origen: "Impuestos",
      peso: 0,
    });
  }

  // El límite del régimen (F8), desde el ámbar de Impuestos.
  if (r.igv.estado === "ok" && r.igv.datos.umbral.avance !== null) {
    const u = r.igv.datos.umbral;
    const tono = tonoAvance(u.avance);
    if (tono === "rojo" || (tono === "ambar" && !hayAnticipado)) {
      const proy = proyectarUmbral(u.ventasMeses, r.hoy, u.umbralSoles, u.primerMes, u.ajuste);
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

// ---- 5. Cabecera -------------------------------------------------------------------------------------------------------------

