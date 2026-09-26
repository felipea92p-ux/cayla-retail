// Finanzas ▸ Impuestos (ADR-0195 F8, 20260925140000): la lógica pura de la pantalla. Lee lo que devuelven las funciones de
// la base, proyecta el límite de ventas del régimen, dice el estado de cada mes y arma los registros para el contador
// (CSV). Sin React ni Supabase: se prueba con vitest y se usa desde el servidor y desde el navegador.

import { mesDe, textoMes } from "./gastos-reglas";

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numONull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** «2026-08-01» → «2026-08». */
const aMes = (v: unknown) => texto(v).slice(0, 7);

// ---- El IGV de cada mes ------------------------------------------------------------------------------------------------

export type MesIgv = {
  mes: string;
  comprobantes: number;
  baseVentas: number;
  igvVentas: number;
  igvNotasCredito: number;
  debito: number;
  creditoMercaderia: number;
  creditoGastos: number;
  creditoActivos: number;
  creditoTaller: number;
  creditoNotas: number;
  credito: number;
  saldoAnterior: number;
  aPagar: number;
  saldoAFavor: number;
};

export function leerMesIgv(f: Fila): MesIgv {
  return {
    mes: aMes(f.mes),
    comprobantes: num(f.comprobantes),
    baseVentas: num(f.base_ventas),
    igvVentas: num(f.igv_ventas),
    igvNotasCredito: num(f.igv_notas_credito),
    debito: num(f.debito),
    creditoMercaderia: num(f.credito_mercaderia),
    creditoGastos: num(f.credito_gastos),
    creditoActivos: num(f.credito_activos),
    creditoTaller: num(f.credito_taller),
    creditoNotas: num(f.credito_notas),
    credito: num(f.credito),
    saldoAnterior: num(f.saldo_anterior),
    aPagar: num(f.a_pagar),
    saldoAFavor: num(f.saldo_a_favor),
  };
}

export type Regimen = "rmt" | "general" | "rer" | "nrus";
export const REGIMENES: readonly Regimen[] = ["rmt", "general", "rer", "nrus"];
export const TEXTO_REGIMEN: Record<Regimen, string> = {
  rmt: "Régimen MYPE Tributario",
  general: "Régimen General",
  rer: "Régimen Especial (RER)",
  nrus: "Nuevo RUS",
};

type Vigente = { valor: number; provisional: boolean };
export type PanelImpuestos = {
  hoy: string;
  /** El mes que se mira («2026-08»). */
  mes: string;
  mesActual: string;
  foco: MesIgv | null;
  historial: MesIgv[];
  parametros: {
    igv: Vigente | null;
    uit: (Vigente & { anio: number }) | null;
    umbralUit: Vigente | null;
    regimen: { texto: Regimen; provisional: boolean } | null;
    renta: Vigente | null;
  };
  umbral: {
    ventas12m: number;
    umbralSoles: number | null;
    avance: number | null;
    cruzado: boolean;
    primerMes: string | null;
    ventasMeses: { mes: string; base: number }[];
  };
  renta: { base: number; tasa: number | null; monto: number | null };
  revisar: {
    boletas: { n: number; total: number; gastos: number; proveedores: string[] };
    sinAceptar: { n: number; total: number };
    rechazados: { n: number; total: number };
    sinComprobante: { n: number; total: number; alegra: number };
    honorarios: { n: number; total: number; mayores: number };
  };
};

const obj = (v: unknown): Fila => (v && typeof v === "object" ? (v as Fila) : {});
const vigente = (v: unknown): Vigente | null => (v && typeof v === "object" ? { valor: num(obj(v).valor), provisional: obj(v).provisional === true } : null);

export function leerPanelImpuestos(data: unknown): PanelImpuestos {
  const d = obj(data);
  const p = obj(d.parametros);
  const u = obj(d.umbral);
  const r = obj(d.renta);
  const rv = obj(d.revisar);
  const par = (k: string) => obj(rv[k]);
  const uit = vigente(p.uit);
  const reg = p.regimen ? obj(p.regimen) : null;
  return {
    hoy: texto(d.hoy),
    mes: aMes(d.mes),
    mesActual: aMes(d.mes_actual),
    foco: d.foco ? leerMesIgv(obj(d.foco)) : null,
    historial: (Array.isArray(d.historial) ? d.historial : []).map((m) => leerMesIgv(obj(m))),
    parametros: {
      igv: vigente(p.igv),
      uit: uit ? { ...uit, anio: num(obj(p.uit).anio) } : null,
      umbralUit: vigente(p.umbral_uit),
      regimen: reg && REGIMENES.includes(texto(reg.texto) as Regimen) ? { texto: texto(reg.texto) as Regimen, provisional: reg.provisional === true } : null,
      renta: vigente(p.renta),
    },
    umbral: {
      ventas12m: num(u.ventas_12m),
      umbralSoles: numONull(u.umbral_soles),
      avance: numONull(u.avance),
      cruzado: u.cruzado === true,
      primerMes: u.primer_mes ? aMes(u.primer_mes) : null,
      ventasMeses: (Array.isArray(u.ventas_meses) ? u.ventas_meses : []).map((m) => ({ mes: aMes(obj(m).mes), base: num(obj(m).base) })),
    },
    renta: { base: num(r.base), tasa: numONull(r.tasa), monto: numONull(r.monto) },
    revisar: {
      boletas: {
        n: num(par("boletas").n),
        total: num(par("boletas").total),
        gastos: num(par("boletas").gastos),
        proveedores: (Array.isArray(par("boletas").proveedores) ? (par("boletas").proveedores as unknown[]) : []).map(texto),
      },
      sinAceptar: { n: num(par("sin_aceptar").n), total: num(par("sin_aceptar").total) },
      rechazados: { n: num(par("rechazados").n), total: num(par("rechazados").total) },
      sinComprobante: { n: num(par("sin_comprobante").n), total: num(par("sin_comprobante").total), alegra: num(par("sin_comprobante").alegra) },
      honorarios: { n: num(par("honorarios").n), total: num(par("honorarios").total), mayores: num(par("honorarios").mayores) },
    },
  };
}

// ---- Meses -------------------------------------------------------------------------------------------------------------

/** «2026-08» + n meses. */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** «agosto». */
export function nombreMes(mes: string): string {
  return textoMes(mes).split(" ")[0]!;
}

/** «Ago», como la tabla del spike. */
export function mesCorto(mes: string): string {
  const n = nombreMes(mes);
  return n.charAt(0).toUpperCase() + n.slice(1, 3);
}

// ---- Estado de cada mes en el historial ----------------------------------------------------------------------------------

export type EstadoMesIgv = "en_curso" | "por_declarar" | "a_favor" | "sin_pago" | "sin_movimiento";
export const TEXTO_ESTADO_MES: Record<EstadoMesIgv, { texto: string; tono: "pizarra" | "ambar" | "verde" | "neutro" | "apagado" }> = {
  en_curso: { texto: "en curso", tono: "pizarra" },
  por_declarar: { texto: "por declarar", tono: "ambar" },
  a_favor: { texto: "a favor", tono: "verde" },
  // El pago a SUNAT todavía no se registra aquí (necesita Cuentas y dinero): no se afirma que se declaró.
  sin_pago: { texto: "sin pago registrado", tono: "neutro" },
  sin_movimiento: { texto: "sin movimiento", tono: "apagado" },
};

/** El mes en curso todavía cambia; el anterior es el que se declara ahora (se declara aunque quede a favor); los de antes
 *  dicen si dejaron algo a pagar o a favor. «Declarado» no se afirma: el pago a SUNAT no se registra todavía. */
export function estadoMes(m: Pick<MesIgv, "mes" | "aPagar" | "saldoAFavor" | "debito" | "credito">, mesActual: string): EstadoMesIgv {
  if (m.mes >= mesActual) return "en_curso";
  if (m.mes === sumarMeses(mesActual, -1)) return "por_declarar";
  if (m.aPagar > 0) return "sin_pago";
  if (m.saldoAFavor > 0) return "a_favor";
  return "sin_movimiento";
}

// ---- El límite del régimen: cuánto falta y cuándo se cruza -------------------------------------------------------------

export type Proyeccion = {
  /** Promedio de venta sin IGV de los últimos meses completos (hasta 3) con datos. */
  ritmoMensual: number;
  /** Ventas de los 12 meses a diciembre de este año si se sigue a este ritmo (a diciembre, los 12 meses son el año). */
  proyectadoDiciembre: number;
  /** El primer mes en que los 12 meses pasarían el límite (hasta 24 meses adelante); null si no llega. */
  mesCruce: string | null;
  yaCruzado: boolean;
  /** Cuántos meses de ventas tiene el sistema (menos de 12: la cifra de 12 meses todavía se queda corta). */
  mesesConDatos: number;
};

/**
 * Proyecta el límite con lo que hay, sin inventar crecimiento: los meses que ya pasaron cuentan lo vendido; el mes en curso,
 * lo vendido o el ritmo (lo que sea mayor); los que vienen, el ritmo. El ritmo es el promedio de hasta 3 meses completos
 * con ventas; si el sistema recién empieza, el mes en curso llevado a mes completo.
 */
export function proyectarUmbral(ventasMeses: readonly { mes: string; base: number }[], hoy: string, umbralSoles: number | null, primerMes: string | null): Proyeccion {
  const actual = mesDe(hoy);
  const venta = new Map(ventasMeses.map((v) => [v.mes, v.base]));
  const desde = primerMes && primerMes <= actual ? primerMes : actual;
  const completos = ventasMeses.filter((v) => v.mes < actual && v.mes >= desde).map((v) => v.base).slice(-3);
  const diaHoy = Number(hoy.slice(8, 10)) || 1;
  const [a, m] = actual.split("-").map(Number) as [number, number];
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const ritmoMensual = completos.length ? completos.reduce((s, x) => s + x, 0) / completos.length : ((venta.get(actual) ?? 0) / diaHoy) * diasMes;

  const ventaDe = (mes: string) => {
    if (mes < actual) return venta.get(mes) ?? 0;
    if (mes === actual) return Math.max(venta.get(actual) ?? 0, ritmoMensual);
    return ritmoMensual;
  };
  const doceHasta = (mes: string) => Array.from({ length: 12 }, (_, i) => ventaDe(sumarMeses(mes, -i))).reduce((s, x) => s + x, 0);
  const vendido12 = Array.from({ length: 12 }, (_, i) => venta.get(sumarMeses(actual, -i)) ?? 0).reduce((s, x) => s + x, 0);
  const yaCruzado = umbralSoles !== null && umbralSoles > 0 && vendido12 >= umbralSoles;

  let mesCruce: string | null = null;
  if (!yaCruzado && umbralSoles !== null && umbralSoles > 0) {
    for (let i = 0; i <= 24; i++) {
      const mes = sumarMeses(actual, i);
      if (doceHasta(mes) >= umbralSoles) {
        mesCruce = mes;
        break;
      }
    }
  }
  const [anio, mesNum] = actual.split("-").map(Number) as [number, number];
  const diciembre = `${anio}-12`;
  const mesesConDatos = primerMes && primerMes <= actual ? 12 * (anio - Number(primerMes.slice(0, 4))) + (mesNum - Number(primerMes.slice(5, 7))) + 1 : 0;
  return { ritmoMensual, proyectadoDiciembre: doceHasta(diciembre), mesCruce, yaCruzado, mesesConDatos };
}

/** El tono del avance hacia el límite: verde lejos, ámbar desde el 60 %, rojo al cruzarlo. */
export function tonoAvance(avance: number | null): "verde" | "ambar" | "rojo" | "neutro" {
  if (avance === null) return "neutro";
  if (avance >= 1) return "rojo";
  if (avance >= 0.6) return "ambar";
  return "verde";
}

/** «73,6 %». */
export function porcentaje(fraccion: number, decimales = 1): string {
  return `${(fraccion * 100).toLocaleString("es-PE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

// ---- Parámetros (Configuración ▸ Impuestos) -----------------------------------------------------------------------------

export type NombreParametro = "igv" | "uit" | "umbral_uit" | "renta_pago_cuenta" | "regimen";
export type ParametroFila = {
  nombre: NombreParametro;
  /** «2026-01-01». */
  vigenteDesde: string;
  valor: number | null;
  texto: string | null;
  nota: string | null;
  provisional: boolean;
  registradoPor: string | null;
  registradoEn: string | null;
  correcciones: number;
};

export function leerParametro(f: Fila): ParametroFila {
  return {
    nombre: texto(f.nombre) as NombreParametro,
    vigenteDesde: texto(f.vigente_desde).slice(0, 10),
    valor: numONull(f.valor),
    texto: f.texto === null || f.texto === undefined ? null : String(f.texto),
    nota: f.nota === null || f.nota === undefined ? null : String(f.nota),
    provisional: f.provisional === true,
    registradoPor: f.registrado_por ? String(f.registrado_por) : null,
    registradoEn: f.registrado_en ? String(f.registrado_en) : null,
    correcciones: num(f.correcciones),
  };
}

/** Lo que se muestra en la casilla: la tasa en % («18»), la UIT en soles («5500»), el límite en UIT («300»). */
export function valorEnCasilla(p: Pick<ParametroFila, "nombre" | "valor">): string {
  if (p.valor === null) return "";
  const v = p.nombre === "igv" || p.nombre === "renta_pago_cuenta" ? p.valor * 100 : p.valor;
  return String(Number(v.toFixed(4)));
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Lo tipeado en una casilla → lo que se guarda (la tasa, como fracción). Mismos límites que la base, con otras palabras. */
export function parsearParametro(nombre: Exclude<NombreParametro, "regimen">, tipeado: string): Resultado<number> {
  const limpio = tipeado.replace(/[S/%\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  if (!limpio) return { ok: false, error: "Escribe un valor." };
  const n = Number(limpio);
  if (!Number.isFinite(n)) return { ok: false, error: "Escribe solo el número." };
  if (nombre === "igv") {
    if (n < 1 || n >= 100) return { ok: false, error: "La tasa de IGV va en %, entre 1 y 100 (18, no 0.18)." };
    return { ok: true, valor: Number((n / 100).toFixed(4)) };
  }
  if (nombre === "renta_pago_cuenta") {
    if (n < 0 || n >= 100) return { ok: false, error: "El pago a cuenta va en % de la venta, entre 0 y 100." };
    return { ok: true, valor: Number((n / 100).toFixed(4)) };
  }
  if (nombre === "uit") {
    if (n < 1000 || n > 100000) return { ok: false, error: "La UIT va en soles (5500)." };
    return { ok: true, valor: n };
  }
  if (n <= 0 || n > 100000) return { ok: false, error: "El límite va en UIT (300), no en soles." };
  return { ok: true, valor: n };
}

/** El parámetro de un año (el que rige desde el 1 de enero de ese año). */
export function delAnio(parametros: readonly ParametroFila[], nombre: NombreParametro, anio: number): ParametroFila | null {
  return parametros.find((p) => p.nombre === nombre && p.vigenteDesde === `${anio}-01-01`) ?? null;
}

/** El que rige ese año: el suyo o, si no tiene, el último de antes (así rige hasta que se cambie). */
export function vigenteEnAnio(parametros: readonly ParametroFila[], nombre: NombreParametro, anio: number): ParametroFila | null {
  return (
    parametros
      .filter((p) => p.nombre === nombre && p.vigenteDesde <= `${anio}-12-31`)
      .sort((x, y) => (x.vigenteDesde < y.vigenteDesde ? 1 : -1))[0] ?? null
  );
}

/** Los años que la tabla del régimen muestra: los que tienen algo y el año en curso, del más nuevo al más viejo. */
export function aniosDeRegimen(parametros: readonly ParametroFila[], anioActual: number, extra: readonly number[] = []): number[] {
  const anios = new Set<number>([anioActual, ...extra]);
  for (const p of parametros) if (p.nombre !== "igv" && p.nombre !== "uit") anios.add(Number(p.vigenteDesde.slice(0, 4)));
  return [...anios].sort((a, b) => b - a);
}

// ---- Registros para el contador (insumo del PLE 14.1 y 8.1 simplificado, D-36) ------------------------------------------

export type FilaRegistroVentas = {
  fecha: string;
  tipo: string;
  serie: string;
  numero: number;
  clienteTipoDoc: string;
  clienteNumDoc: string | null;
  clienteNombre: string | null;
  base: number;
  igv: number;
  total: number;
  estado: string;
  anulado: boolean;
  refFecha: string | null;
  refTipo: string | null;
  refSerie: string | null;
  refNumero: number | null;
  tienda: string | null;
  observacion: string | null;
};

export function leerFilaVentas(f: Fila): FilaRegistroVentas {
  return {
    fecha: texto(f.fecha).slice(0, 10),
    tipo: texto(f.tipo),
    serie: texto(f.serie),
    numero: num(f.numero),
    clienteTipoDoc: texto(f.cliente_tipo_doc),
    clienteNumDoc: f.cliente_num_doc ? String(f.cliente_num_doc) : null,
    clienteNombre: f.cliente_nombre ? String(f.cliente_nombre) : null,
    base: num(f.base),
    igv: num(f.igv),
    total: num(f.total),
    estado: texto(f.estado),
    anulado: f.anulado === true,
    refFecha: f.ref_fecha ? texto(f.ref_fecha).slice(0, 10) : null,
    refTipo: f.ref_tipo ? String(f.ref_tipo) : null,
    refSerie: f.ref_serie ? String(f.ref_serie) : null,
    refNumero: numONull(f.ref_numero),
    tienda: f.tienda ? String(f.tienda) : null,
    observacion: f.observacion ? String(f.observacion) : null,
  };
}

export type FilaRegistroCompras = {
  origen: "compra" | "taller" | "nota_credito";
  naturaleza: string;
  fecha: string;
  vencimiento: string | null;
  tipo: string;
  serie: string;
  numero: string;
  proveedorRuc: string | null;
  proveedor: string;
  base: number;
  igv: number;
  noGravado: number;
  total: number;
  daCredito: boolean;
  refFecha: string | null;
  refTipo: string | null;
  refSerie: string | null;
  refNumero: string | null;
  tienda: string | null;
};

export function leerFilaCompras(f: Fila): FilaRegistroCompras {
  return {
    origen: texto(f.origen) as FilaRegistroCompras["origen"],
    naturaleza: texto(f.naturaleza),
    fecha: texto(f.fecha).slice(0, 10),
    vencimiento: f.vencimiento ? texto(f.vencimiento).slice(0, 10) : null,
    tipo: texto(f.tipo),
    serie: texto(f.serie),
    numero: texto(f.numero),
    proveedorRuc: f.proveedor_ruc ? String(f.proveedor_ruc) : null,
    proveedor: texto(f.proveedor),
    base: num(f.base),
    igv: num(f.igv),
    noGravado: num(f.no_gravado),
    total: num(f.total),
    daCredito: f.da_credito === true,
    refFecha: f.ref_fecha ? texto(f.ref_fecha).slice(0, 10) : null,
    refTipo: f.ref_tipo ? String(f.ref_tipo) : null,
    refSerie: f.ref_serie ? String(f.ref_serie) : null,
    refNumero: f.ref_numero ? String(f.ref_numero) : null,
    tienda: f.tienda ? String(f.tienda) : null,
  };
}

/** Tipo de comprobante, tabla 10 de SUNAT. */
export const CODIGO_COMPROBANTE: Record<string, string> = {
  factura: "01",
  recibo_por_honorarios: "02",
  boleta: "03",
  nota_credito: "07",
  nota_debito: "08",
};
/** Tipo de documento de identidad, tabla 2 de SUNAT (0 = sin documento). */
export const CODIGO_DOCUMENTO: Record<string, string> = { dni: "1", ruc: "6", sin_documento: "0" };
export const TEXTO_NATURALEZA: Record<string, string> = { mercaderia: "Mercadería", gasto: "Gasto", activo: "Activo fijo", taller: "Insumos del Taller" };

/** «2026-08» → «20260800»: el período como lo pide el PLE. */
export function periodoPle(mes: string): string {
  return `${mes.replace("-", "")}00`;
}
/** «2026-08-05» → «05/08/2026». */
export function fechaPle(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
const monto = (n: number) => n.toFixed(2);
/** El documento del proveedor según su largo: 11 dígitos = RUC, 8 = DNI. */
export function tipoDocProveedor(ruc: string | null): string {
  if (!ruc) return "0";
  if (/^\d{11}$/.test(ruc)) return "6";
  if (/^\d{8}$/.test(ruc)) return "1";
  return "0";
}

export type Csv = { encabezados: string[]; filas: (string | number)[][] };

export const COLUMNAS_VENTAS = [
  "Periodo",
  "Fecha de emisión",
  "Tipo de comprobante (tabla 10)",
  "Serie",
  "Número",
  "Tipo de documento del cliente (tabla 2)",
  "Número de documento del cliente",
  "Cliente",
  "Base imponible gravada",
  "IGV",
  "Importe total",
  "Moneda",
  "Estado (1 registrado, 2 anulado)",
  "Fecha del comprobante que modifica",
  "Tipo del comprobante que modifica",
  "Serie del comprobante que modifica",
  "Número del comprobante que modifica",
  "Estado en SUNAT",
  "Tienda",
  "Observación",
] as const;

export function csvRegistroVentas(filas: readonly FilaRegistroVentas[], mes: string): Csv {
  return {
    encabezados: [...COLUMNAS_VENTAS],
    filas: filas.map((f) => [
      periodoPle(mes),
      fechaPle(f.fecha),
      CODIGO_COMPROBANTE[f.tipo] ?? f.tipo,
      f.serie,
      f.numero,
      CODIGO_DOCUMENTO[f.clienteTipoDoc] ?? "0",
      f.clienteNumDoc ?? "",
      f.clienteNombre ?? "",
      monto(f.base),
      monto(f.igv),
      monto(f.total),
      "PEN",
      f.anulado ? "2" : "1",
      fechaPle(f.refFecha),
      f.refTipo ? (CODIGO_COMPROBANTE[f.refTipo] ?? f.refTipo) : "",
      f.refSerie ?? "",
      f.refNumero ?? "",
      f.estado,
      f.tienda ?? "",
      f.observacion ?? "",
    ]),
  };
}

export const COLUMNAS_COMPRAS = [
  "Periodo",
  "Fecha de emisión",
  "Fecha de vencimiento",
  "Tipo de comprobante (tabla 10)",
  "Serie",
  "Número",
  "Tipo de documento del proveedor (tabla 2)",
  "Número de documento del proveedor",
  "Proveedor",
  "Base imponible gravada",
  "IGV",
  "No gravado",
  "Importe total",
  "Moneda",
  "Da crédito fiscal",
  "Fecha del comprobante que modifica",
  "Tipo del comprobante que modifica",
  "Serie del comprobante que modifica",
  "Número del comprobante que modifica",
  "Qué es",
  "Tienda",
] as const;

export function csvRegistroCompras(filas: readonly FilaRegistroCompras[], mes: string): Csv {
  return {
    encabezados: [...COLUMNAS_COMPRAS],
    filas: filas.map((f) => [
      periodoPle(mes),
      fechaPle(f.fecha),
      fechaPle(f.vencimiento),
      CODIGO_COMPROBANTE[f.tipo] ?? f.tipo,
      f.serie,
      f.numero,
      tipoDocProveedor(f.proveedorRuc),
      f.proveedorRuc ?? "",
      f.proveedor,
      monto(f.base),
      monto(f.igv),
      monto(f.noGravado),
      monto(f.total),
      "PEN",
      f.daCredito ? "Sí" : "No",
      fechaPle(f.refFecha),
      f.refTipo ? (CODIGO_COMPROBANTE[f.refTipo] ?? f.refTipo) : "",
      f.refSerie ?? "",
      f.refNumero ?? "",
      TEXTO_NATURALEZA[f.naturaleza] ?? f.naturaleza,
      f.tienda ?? "",
    ]),
  };
}

/** El resumen del mes que acompaña a los dos registros en el paquete para el contador. */
export function csvResumenIgv(panel: Pick<PanelImpuestos, "mes" | "foco" | "parametros" | "renta">): Csv {
  const f = panel.foco;
  const v = (n: number | null | undefined) => (n === null || n === undefined ? "" : monto(n));
  const p = panel.parametros;
  const filas: (string | number)[][] = [
    ["Periodo", periodoPle(panel.mes)],
    ["IGV de boletas, facturas y notas de débito", v(f?.igvVentas)],
    ["IGV de notas de crédito emitidas (resta)", v(f?.igvNotasCredito)],
    ["IGV cobrado (débito)", v(f?.debito)],
    ["IGV de facturas de mercadería", v(f?.creditoMercaderia)],
    ["IGV de facturas de gastos", v(f?.creditoGastos)],
    ["IGV de facturas de activos fijos", v(f?.creditoActivos)],
    ["IGV de facturas del Taller", v(f?.creditoTaller)],
    ["IGV de notas de crédito de proveedores (resta)", v(f?.creditoNotas)],
    ["IGV que se descuenta (crédito)", v(f?.credito)],
    ["Saldo a favor del mes anterior", v(f?.saldoAnterior)],
    ["IGV a pagar", v(f?.aPagar)],
    ["Saldo a favor que pasa al mes siguiente", v(f?.saldoAFavor)],
    ["Ventas sin IGV (base imponible neta)", v(f?.baseVentas)],
    ["Tasa del pago a cuenta de renta", p.renta ? `${(p.renta.valor * 100).toFixed(2)} %${p.renta.provisional ? " (por confirmar)" : ""}` : "sin configurar"],
    ["Pago a cuenta de renta", v(panel.renta.monto)],
    ["Régimen", p.regimen ? `${TEXTO_REGIMEN[p.regimen.texto]}${p.regimen.provisional ? " (por confirmar)" : ""}` : "sin configurar"],
    ["UIT", p.uit ? `${monto(p.uit.valor)} (${p.uit.anio})${p.uit.provisional ? " (por confirmar)" : ""}` : "sin configurar"],
  ];
  return { encabezados: ["Concepto", "Monto (S/)"], filas };
}

/** Nombres de archivo con el mes: «registro-ventas-2026-08.csv». */
export const nombreArchivo = (que: "registro-ventas" | "registro-compras" | "resumen-igv", mes: string) => `${que}-${mes}.csv`;
