import { NOMBRES_MES, mesDeParametro, paramDeMes, type Mes } from "./facturacion-reglas";
import { nombreDeMetodo } from "./reportes-ventas-reglas";

// Ventas ▸ Reportes ▸ «CAYLA y CLAURE» (ADR-0667): las ventas de una tienda donde venden dos empresas (hoy Tienda LIM), separadas por empresa. Lógica pura,
// sin React ni Supabase: la lectura vive en `lib/reportes-por-empresa.ts` y la base (`fn_reporte_ventas_por_empresa`, 20261115042000) entrega las ventas FILA
// POR FILA, cada una con sus prendas (la empresa de cada línea) y sus pagos (la parte de cada empresa en cada medio, con la cuenta donde entró).
//
// PROMETE: (1) cada cifra de la pantalla sale de esas mismas filas, así que al bajar del total al detalle se ven exactamente las ventas que lo suman;
// (2) un dato roto no entra (una venta sin id, una prenda sin empresa o un pago sin medio se descartan; un número que no es número vale 0);
// (3) todo se suma en céntimos enteros, así S/ 0.10 + S/ 0.20 da S/ 0.30 y no S/ 0.30000000000000004.
// ASUME: que la base ya repartió cada pago entre las empresas (`fn_pago_de_la_empresa`): aquí no se reparte nada, solo se suma y se cuenta.

/* ==================== Lo que llega de la base ==================== */

export type EmpresaDelReporte = { id: string; clave: string; nombre: string; casa: boolean };
export type TipoComprobante = "boleta" | "factura" | "nota_venta";
export type ComprobanteDeVenta = { tipo: TipoComprobante; serie: string; numero: number };
export type PrendaVendida = {
  id: string;
  empresaId: string;
  producto: string;
  codigo: string | null;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  categoria: string | null;
  categoriaPrefijo: string | null;
  categoriaFamilia: string | null;
  foto: string | null;
  cantidad: number;
  subtotal: number;
};
export type PagoDeVenta = {
  metodo: string;
  monto: number;
  cuentaId: string | null;
  cuenta: string | null;
  /** `cajon`, `banco`, `por_abonar`…: qué clase de cuenta es. */
  cuentaTipo: string | null;
  /** La cuenta es de la casa (CAYLA). Lo que la otra empresa cobra en una cuenta de la casa es lo que se le debe. */
  cuentaDeLaCasa: boolean;
  /** El banco al que abona una cuenta «por depositar» (la de una máquina del POS). */
  abonaA: string | null;
  variasCuentas: boolean;
  /** La parte de cada empresa (id → soles). Suman `monto`. */
  partes: Record<string, number>;
};
export type VentaDelReporte = {
  id: string;
  /** El instante de la venta (ISO con zona). */
  creada: string;
  /** El día de Lima, `aaaa-mm-dd`. */
  fecha: string;
  comprobante: ComprobanteDeVenta | null;
  prendas: PrendaVendida[];
  pagos: PagoDeVenta[];
};
export type ComisionEstimada = { empresaId: string; metodo: string; cuentaId: string | null; comision: number | null };
export type ReportePorEmpresa = {
  desde: string;
  hasta: string;
  hoy: string;
  /** El día en que la otra empresa empezó a vender aquí; `null` si no se sabe (no se ofrece «desde que llegó»). */
  inicio: string | null;
  empresas: EmpresaDelReporte[];
  ventas: VentaDelReporte[];
  comisiones: ComisionEstimada[];
};

const numero = (v: unknown): number => {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : 0;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS: readonly TipoComprobante[] = ["boleta", "factura", "nota_venta"];

/** Lo que devuelve `fn_reporte_ventas_por_empresa`, ya validado. `null` si la forma no es la esperada (sin fechas o sin empresas). */
export function leerReportePorEmpresa(v: unknown): ReportePorEmpresa | null {
  const o = objeto(v);
  if (!o) return null;
  const desde = texto(o.desde);
  const hasta = texto(o.hasta);
  const hoy = texto(o.hoy);
  if (!desde || !hasta || !hoy || !DIA.test(desde) || !DIA.test(hasta) || !DIA.test(hoy)) return null;
  const empresas = lista(o.empresas).flatMap((x): EmpresaDelReporte[] => {
    const e = objeto(x);
    const id = texto(e?.id);
    const clave = texto(e?.clave);
    const nombre = texto(e?.nombre);
    return e && id && clave && nombre ? [{ id, clave, nombre, casa: e.casa === true }] : [];
  });
  if (empresas.length === 0) return null;
  const ids = new Set(empresas.map((e) => e.id));
  const casa = empresas.find((e) => e.casa)?.id ?? empresas[0].id;

  const ventas = lista(o.ventas).flatMap((x): VentaDelReporte[] => {
    const vt = objeto(x);
    const id = texto(vt?.id);
    const creada = texto(vt?.creada);
    const fecha = texto(vt?.fecha);
    if (!vt || !id || !creada || !fecha || !DIA.test(fecha)) return [];
    const c = objeto(vt.comprobante);
    const tipo = c && TIPOS.includes(c.tipo as TipoComprobante) ? (c.tipo as TipoComprobante) : null;
    const comprobante = c && tipo ? { tipo, serie: texto(c.serie) ?? "", numero: Math.trunc(numero(c.numero)) } : null;
    const prendas = lista(vt.items).flatMap((y): PrendaVendida[] => {
      const i = objeto(y);
      const iid = texto(i?.id);
      if (!i || !iid) return [];
      // Una prenda sin empresa conocida es de la casa, como en la base (`coalesce(fn_empresa_de_la_linea, casa)`).
      const empresa = texto(i.empresa_id);
      return [
        {
          id: iid,
          empresaId: empresa && ids.has(empresa) ? empresa : casa,
          producto: texto(i.producto) ?? "Prenda",
          codigo: texto(i.codigo),
          talla: texto(i.talla),
          color: texto(i.color),
          colorHex: texto(i.color_hex),
          categoria: texto(i.categoria),
          categoriaPrefijo: texto(i.categoria_prefijo),
          categoriaFamilia: texto(i.categoria_familia),
          foto: texto(i.foto),
          cantidad: Math.trunc(numero(i.cantidad)),
          subtotal: numero(i.subtotal),
        },
      ];
    });
    const pagos = lista(vt.pagos).flatMap((y): PagoDeVenta[] => {
      const p = objeto(y);
      const metodo = texto(p?.metodo);
      if (!p || !metodo) return [];
      const crudas = objeto(p.partes) ?? {};
      const partes: Record<string, number> = {};
      for (const [k, m] of Object.entries(crudas)) if (ids.has(k) && numero(m) !== 0) partes[k] = numero(m);
      return [
        {
          metodo,
          monto: numero(p.monto),
          cuentaId: texto(p.cuenta_id),
          cuenta: texto(p.cuenta),
          cuentaTipo: texto(p.cuenta_tipo),
          cuentaDeLaCasa: p.cuenta_de_la_casa === true,
          abonaA: texto(p.abona_a),
          variasCuentas: p.varias_cuentas === true,
          partes,
        },
      ];
    });
    return [{ id, creada, fecha, comprobante, prendas, pagos }];
  });

  const comisiones = lista(o.comisiones).flatMap((x): ComisionEstimada[] => {
    const c = objeto(x);
    const empresaId = texto(c?.empresa_id);
    const metodo = texto(c?.metodo);
    if (!c || !empresaId || !metodo || !ids.has(empresaId)) return [];
    return [{ empresaId, metodo, cuentaId: texto(c.cuenta_id), comision: c.comision === null || c.comision === undefined ? null : numero(c.comision) }];
  });
  const inicio = texto(o.inicio);
  return { desde, hasta, hoy, inicio: inicio && DIA.test(inicio) ? inicio : null, empresas, ventas, comisiones };
}

/* ==================== Céntimos ==================== */

const aCent = (n: number): number => Math.round(n * 100);
const deCent = (c: number): number => c / 100;

/* ==================== El período (en la URL) ==================== */

/**
 * Qué se mira: un mes («‹ Noviembre 2026 ›»), desde que la otra empresa empezó a vender en la tienda, o dos fechas libres. Vive en la URL: `?m=2026-11`,
 * `?desde-inicio=1` o `?desde=2026-10-23&hasta=2026-11-14`. Las fechas son días de Lima, las dos incluidas. «Desde que llegó» no trae fechas: ese día lo
 * sabe la base (la web no puede leer `empresas`) y la respuesta dice qué tramo usó.
 */
export type Periodo = { modo: "mes"; mes: Mes; desde: string; hasta: string } | { modo: "inicio" } | { modo: "fechas"; desde: string; hasta: string };

/** El tope de la base: 186 días (seis meses). Más que eso se pide por partes. */
export const DIAS_MAXIMOS = 186;

const ISO_DIA = (anio: number, mes: number, dia: number): string => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const ultimoDia = (anio: number, mes: number): number => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const esDia = (v: string | null | undefined): v is string => {
  if (!v || !DIA.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= ultimoDia(a, m);
};
/** Días entre dos fechas `aaaa-mm-dd` (b − a). */
export const diasEntre = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const sumarDias = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** El tramo de un mes: del día 1 al último, o hasta hoy si es el mes en curso. */
export function tramoDelMes(mes: Mes, hoy: string): { desde: string; hasta: string } {
  const desde = ISO_DIA(mes.anio, mes.mes, 1);
  const fin = ISO_DIA(mes.anio, mes.mes, ultimoDia(mes.anio, mes.mes));
  return { desde, hasta: fin < hoy ? fin : hoy < desde ? desde : hoy };
}

/**
 * El período de la URL. Lo que no se entiende cae al mes en curso; un mes futuro, al de hoy; unas fechas al revés se dan vuelta; una fecha futura se queda
 * en hoy; un tramo de más de seis meses se acorta desde el principio (lo más reciente es lo que se pidió ver).
 */
export function periodoDeUrl(sp: { m?: string; desde?: string; hasta?: string; "desde-inicio"?: string }, hoy: string): Periodo {
  const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
  if (sp["desde-inicio"]) return { modo: "inicio" };
  if (esDia(sp.desde) && esDia(sp.hasta)) {
    let [desde, hasta] = sp.desde <= sp.hasta ? [sp.desde, sp.hasta] : [sp.hasta, sp.desde];
    if (hasta > hoy) hasta = hoy;
    if (desde > hasta) desde = hasta;
    if (diasEntre(desde, hasta) >= DIAS_MAXIMOS) desde = sumarDias(hasta, -(DIAS_MAXIMOS - 1));
    return { modo: "fechas", desde, hasta };
  }
  const mes = mesDeParametro(sp.m, actual);
  const futuro = mes.anio * 12 + mes.mes > actual.anio * 12 + actual.mes;
  const elegido = futuro ? actual : mes;
  return { modo: "mes", mes: elegido, ...tramoDelMes(elegido, hoy) };
}

/** Las fechas que se le mandan a la base: «desde que llegó» va sin fechas. */
export const fechasParaLaBase = (p: Periodo): { desde: string | null; hasta: string | null } => (p.modo === "inicio" ? { desde: null, hasta: null } : { desde: p.desde, hasta: p.hasta });

/** El enlace de esta pestaña con lo que se está mirando. Lo que vale lo de siempre (el mes en curso, la única tienda) no se escribe. */
export function hrefPorEmpresa(p: { periodo?: Periodo | null; tienda?: string | null }, ruta = "/vender/reportes/empresas"): string {
  const q: string[] = [];
  const per = p.periodo;
  if (per?.modo === "mes") q.push(`m=${paramDeMes(per.mes)}`);
  else if (per?.modo === "inicio") q.push("desde-inicio=1");
  else if (per?.modo === "fechas") q.push(`desde=${per.desde}`, `hasta=${per.hasta}`);
  if (p.tienda) q.push(`tienda=${p.tienda}`);
  return q.length ? `${ruta}?${q.join("&")}` : ruta;
}

const fechaCorta = (iso: string): string => `${Number(iso.slice(8, 10))} ${NOMBRES_MES[Number(iso.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}`;

/** «Noviembre 2026 (al día 14)», «Del 23 oct al 14 nov»: de qué se habla. `tramo` son las fechas que usó la base (en «desde que llegó», las únicas que hay). */
export function periodoEnPalabras(p: Periodo, tramo: { desde: string; hasta: string }, hoy: string): string {
  if (p.modo === "mes") {
    const nombre = `${NOMBRES_MES[p.mes.mes - 1]} ${p.mes.anio}`;
    const enCurso = p.hasta === hoy && Number(hoy.slice(8, 10)) !== ultimoDia(p.mes.anio, p.mes.mes);
    return enCurso ? `${nombre} (al día ${Number(hoy.slice(8, 10))})` : nombre;
  }
  const { desde, hasta } = tramo;
  if (desde === hasta) return `El ${fechaCorta(desde)}`;
  const [a1, a2] = [desde.slice(0, 4), hasta.slice(0, 4)];
  return a1 === a2 ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : `Del ${fechaCorta(desde)} de ${a1} al ${fechaCorta(hasta)} de ${a2}`;
}

/** «CAYLA y CLAURE», «CAYLA, CLAURE y OTRA»: cómo se nombran juntas las empresas de una tienda. */
export function nombresDeEmpresas(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/* ==================== Las cifras ==================== */

export type CifrasDeEmpresa = {
  empresa: EmpresaDelReporte;
  /** Lo cobrado de sus prendas. */
  vendido: number;
  /** Ventas con al menos una prenda suya. Una mixta cuenta en las dos empresas. */
  ventas: number;
  prendas: number;
};
export type CifrasDeLaTienda = {
  vendido: number;
  ventas: number;
  prendas: number;
  /** Ventas con prendas de dos empresas o más. */
  mixtas: number;
  /** Cada empresa, en el orden de la base (la casa primero). */
  empresas: CifrasDeEmpresa[];
};

/** Las empresas de una venta (las de sus prendas), sin repetir. */
export const empresasDeLaVenta = (v: VentaDelReporte): string[] => [...new Set(v.prendas.map((p) => p.empresaId))];
export const esMixta = (v: VentaDelReporte): boolean => empresasDeLaVenta(v).length > 1;

/** Lo que muestran las cuatro tarjetas: la tienda entera, cada empresa y cuántas ventas fueron mixtas. */
export function cifrasDeLaTienda(r: ReportePorEmpresa): CifrasDeLaTienda {
  const por = new Map(r.empresas.map((e) => [e.id, { vendido: 0, ventas: 0, prendas: 0 }]));
  let vendido = 0;
  let prendas = 0;
  let mixtas = 0;
  for (const v of r.ventas) {
    for (const p of v.prendas) {
      const e = por.get(p.empresaId);
      if (!e) continue;
      e.vendido += aCent(p.subtotal);
      e.prendas += p.cantidad;
      vendido += aCent(p.subtotal);
      prendas += p.cantidad;
    }
    const suyas = empresasDeLaVenta(v);
    for (const id of suyas) {
      const e = por.get(id);
      if (e) e.ventas += 1;
    }
    if (suyas.length > 1) mixtas += 1;
  }
  return {
    vendido: deCent(vendido),
    ventas: r.ventas.length,
    prendas,
    mixtas,
    empresas: r.empresas.map((empresa) => {
      const e = por.get(empresa.id)!;
      return { empresa, vendido: deCent(e.vendido), ventas: e.ventas, prendas: e.prendas };
    }),
  };
}

/** «S/ 1,953.86 · 28 ventas · 33 prendas»: el pie de la tarjeta de una empresa, con la parte de la tienda. */
export function pieDeEmpresa(c: { ventas: number; prendas: number }): string {
  return `${c.ventas} ${c.ventas === 1 ? "venta" : "ventas"} · ${c.prendas} ${c.prendas === 1 ? "prenda" : "prendas"}`;
}

/** Qué parte de lo vendido en la tienda es de una empresa, en %, con un decimal. `null` si la tienda no vendió nada. */
export function parteDeLaTienda(empresa: number, tienda: number): number | null {
  return tienda > 0 ? Math.round((empresa / tienda) * 1000) / 10 : null;
}

/* ==================== ¿Dónde está la plata? ==================== */

/** Una fila: lo cobrado con un medio que entró a una cuenta, partido por empresa. */
export type FilaDePlata = {
  /** `cuentaId|metodo`: la llave de la fila y del filtro de «Venta por venta». */
  clave: string;
  cuentaId: string | null;
  /** «Por depositar Izipay», «Varias cuentas» o «Sin cuenta». */
  cuenta: string;
  cuentaTipo: string | null;
  abonaA: string | null;
  metodo: string;
  /** Lo de cada empresa (id → soles), con todas las empresas (0 si no tiene). */
  porEmpresa: Record<string, number>;
  total: number;
  /** Cuántas ventas tienen un pago en esta fila. */
  ventas: number;
};
export type PlataPorCuenta = {
  filas: FilaDePlata[];
  /** Lo de cada empresa en todas las filas. */
  totales: Record<string, number>;
  total: number;
  /** La comisión estimada del POS de cada empresa que no es la casa (id → soles; `null` si alguna máquina no tiene tarifa). */
  comisiones: Record<string, number | null>;
};

/** La llave de una fila: la cuenta y el medio. Un pago en varias cuentas va aparte, con su medio. */
export const claveDePlata = (p: Pick<PagoDeVenta, "cuentaId" | "metodo" | "variasCuentas">): string => `${p.variasCuentas ? "varias" : (p.cuentaId ?? "sin")}|${p.metodo}`;

const ORDEN_TIPO: Record<string, number> = { cajon: 0, caja_fuerte: 1, banco: 2, por_abonar: 3 };
const ORDEN_MEDIO: Record<string, number> = { efectivo: 0, redondeo: 1, yape: 2, plin: 3, transferencia: 4, tarjeta: 5, qr: 6 };

/**
 * Cada cobro, en la cuenta donde entró y partido por empresa: la tabla «¿Dónde está la plata?». Las filas van en el orden en que se mueve la plata (el cajón,
 * los bancos, lo que espera que la máquina deposite) y, dentro de una cuenta, por medio. Todo en céntimos: la suma de las filas es la suma de los pagos.
 */
export function plataPorCuenta(r: ReportePorEmpresa): PlataPorCuenta {
  const filas = new Map<string, { base: Omit<FilaDePlata, "porEmpresa" | "total" | "ventas">; cent: Map<string, number>; ventas: Set<string> }>();
  for (const v of r.ventas) {
    for (const p of v.pagos) {
      const clave = claveDePlata(p);
      let f = filas.get(clave);
      if (!f) {
        const cuenta = p.variasCuentas ? "Varias cuentas" : (p.cuenta ?? "Sin cuenta");
        f = { base: { clave, cuentaId: p.variasCuentas ? null : p.cuentaId, cuenta, cuentaTipo: p.cuentaTipo, abonaA: p.abonaA, metodo: p.metodo }, cent: new Map(), ventas: new Set() };
        filas.set(clave, f);
      }
      f.ventas.add(v.id);
      for (const [id, monto] of Object.entries(p.partes)) f.cent.set(id, (f.cent.get(id) ?? 0) + aCent(monto));
    }
  }
  const totalesCent = new Map<string, number>();
  const lista = [...filas.values()].map(({ base, cent, ventas }) => {
    const porEmpresa: Record<string, number> = {};
    let total = 0;
    for (const e of r.empresas) {
      const c = cent.get(e.id) ?? 0;
      porEmpresa[e.id] = deCent(c);
      total += c;
      totalesCent.set(e.id, (totalesCent.get(e.id) ?? 0) + c);
    }
    return { ...base, porEmpresa, total: deCent(total), ventas: ventas.size };
  });
  lista.sort(
    (a, b) =>
      (ORDEN_TIPO[a.cuentaTipo ?? ""] ?? 9) - (ORDEN_TIPO[b.cuentaTipo ?? ""] ?? 9) ||
      a.cuenta.localeCompare(b.cuenta, "es") ||
      (ORDEN_MEDIO[a.metodo] ?? 9) - (ORDEN_MEDIO[b.metodo] ?? 9),
  );
  const totales: Record<string, number> = {};
  let total = 0;
  for (const e of r.empresas) {
    totales[e.id] = deCent(totalesCent.get(e.id) ?? 0);
    total += totalesCent.get(e.id) ?? 0;
  }
  const comisiones: Record<string, number | null> = {};
  for (const e of r.empresas.filter((x) => !x.casa)) {
    const suyas = r.comisiones.filter((c) => c.empresaId === e.id);
    comisiones[e.id] = suyas.some((c) => c.comision === null) ? null : deCent(suyas.reduce((a, c) => a + aCent(c.comision ?? 0), 0));
  }
  return { filas: lista, totales, total: deCent(total), comisiones };
}

/**
 * Los medios con los que la plata de otra empresa entra a una cuenta de la casa y queda debiéndosele: los mismos de `fn_claure_filas`. El efectivo no: se
 * queda en el cajón y lo administra Claudia (ADR-0560), así que no es una deuda de CAYLA.
 */
const MEDIOS_QUE_SE_DEBEN = new Set(["yape", "plin", "tarjeta", "transferencia", "qr"]);

/** Cuánto de lo de una empresa entró a cuentas de la casa (Yape, tarjeta, QR…): lo que la cuenta con ella cuenta como cobrado por CAYLA. */
export function cobradoEnCuentasDeLaCasa(r: ReportePorEmpresa, empresaId: string): number {
  let c = 0;
  for (const v of r.ventas) for (const p of v.pagos) if (p.cuentaDeLaCasa && MEDIOS_QUE_SE_DEBEN.has(p.metodo)) c += aCent(p.partes[empresaId] ?? 0);
  return deCent(c);
}

/* ==================== Lado a lado ==================== */

/** Un mes de una empresa: cuánto vendió, en cuántas ventas y prendas, y con qué comprobante. */
export type MesDeEmpresa = {
  /** `aaaa-mm`. */
  mes: string;
  nombre: string;
  vendido: number;
  ventas: number;
  prendas: number;
  boletas: number;
  facturas: number;
  notas: number;
  /** Ventas sin comprobante que las ampare. */
  sinComprobante: number;
};
export type MedioDeEmpresa = { metodo: string; monto: number };
export type LadoDeEmpresa = { empresa: EmpresaDelReporte; medios: MedioDeEmpresa[]; meses: MesDeEmpresa[]; total: MesDeEmpresa };

/** «Octubre» si todo el período es de un año; «Dic 2025» si cruza de año (la columna es angosta). */
const nombreDeMes = (m: string, conAnio: boolean): string => {
  const nombre = NOMBRES_MES[Number(m.slice(5, 7)) - 1];
  return conAnio ? `${nombre.slice(0, 3)} ${m.slice(0, 4)}` : nombre;
};
const mesVacio = (mes: string, nombre: string): MesDeEmpresa => ({ mes, nombre, vendido: 0, ventas: 0, prendas: 0, boletas: 0, facturas: 0, notas: 0, sinComprobante: 0 });

/**
 * Cada empresa por su lado: cómo le pagaron (lo suyo de cada medio, del que más al que menos) y mes a mes con el comprobante. Una venta mixta cuenta en las
 * dos con su comprobante (es UN papel que ampara prendas de las dos); lo vendido es solo lo de sus prendas.
 */
export function ladoALado(r: ReportePorEmpresa): LadoDeEmpresa[] {
  const conAnio = r.desde.slice(0, 4) !== r.hasta.slice(0, 4);
  return r.empresas.map((empresa) => {
    const medios = new Map<string, number>();
    const meses = new Map<string, MesDeEmpresa & { cent: number }>();
    const total = { ...mesVacio("total", "Total"), cent: 0 };
    for (const v of r.ventas) {
      const suyas = v.prendas.filter((p) => p.empresaId === empresa.id);
      if (suyas.length === 0) continue;
      const mes = v.fecha.slice(0, 7);
      let m = meses.get(mes);
      if (!m) meses.set(mes, (m = { ...mesVacio(mes, nombreDeMes(mes, conAnio)), cent: 0 }));
      for (const fila of [m, total]) {
        fila.ventas += 1;
        for (const p of suyas) {
          fila.cent += aCent(p.subtotal);
          fila.prendas += p.cantidad;
        }
        const tipo = v.comprobante?.tipo;
        if (tipo === "boleta") fila.boletas += 1;
        else if (tipo === "factura") fila.facturas += 1;
        else if (tipo === "nota_venta") fila.notas += 1;
        else fila.sinComprobante += 1;
      }
      for (const p of v.pagos) {
        const parte = p.partes[empresa.id];
        if (parte) medios.set(p.metodo, (medios.get(p.metodo) ?? 0) + aCent(parte));
      }
    }
    const cerrar = ({ cent, ...f }: MesDeEmpresa & { cent: number }): MesDeEmpresa => ({ ...f, vendido: deCent(cent) });
    return {
      empresa,
      medios: [...medios.entries()].filter(([, c]) => c !== 0).sort((a, b) => b[1] - a[1]).map(([metodo, c]) => ({ metodo, monto: deCent(c) })),
      meses: [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map(cerrar),
      total: cerrar(total),
    };
  });
}

/* ==================== Venta por venta ==================== */

/** Qué ventas se ven abajo. `cuenta` es la llave de una fila de «¿Dónde está la plata?» (`claveDePlata`): la cuenta y el medio juntos. */
export type FiltroVentas = {
  empresa: string | null;
  metodo: string | null;
  cuenta: string | null;
  comprobante: TipoComprobante | "sin" | null;
  soloMixtas: boolean;
};
export const SIN_FILTRO: FiltroVentas = { empresa: null, metodo: null, cuenta: null, comprobante: null, soloMixtas: false };

/** ¿Hay algún filtro puesto? */
export const hayFiltro = (f: FiltroVentas): boolean => !!(f.empresa || f.metodo || f.cuenta || f.comprobante || f.soloMixtas);

/**
 * Las ventas que cumplen TODOS los filtros. La empresa elige las ventas con al menos una prenda suya (una mixta sale en las dos); el medio y la cuenta, las que
 * tienen un pago así con una parte de esa empresa si hay una elegida (así la fila «Yape → BCP» de CLAURE lleva justo a las ventas que la suman).
 */
export function filtrarVentas(r: ReportePorEmpresa, f: FiltroVentas): VentaDelReporte[] {
  return r.ventas.filter((v) => {
    if (f.empresa && !v.prendas.some((p) => p.empresaId === f.empresa)) return false;
    if (f.soloMixtas && !esMixta(v)) return false;
    if (f.comprobante && (f.comprobante === "sin" ? v.comprobante !== null : v.comprobante?.tipo !== f.comprobante)) return false;
    if (f.metodo || f.cuenta) {
      const toca = v.pagos.some(
        (p) => (!f.metodo || p.metodo === f.metodo) && (!f.cuenta || claveDePlata(p) === f.cuenta) && (!f.empresa || (p.partes[f.empresa] ?? 0) !== 0),
      );
      if (!toca) return false;
    }
    return true;
  });
}

/** Lo de una empresa en una venta: lo cobrado de sus prendas. */
export function parteDeLaVenta(v: VentaDelReporte, empresaId: string): number {
  return deCent(v.prendas.reduce((a, p) => a + (p.empresaId === empresaId ? aCent(p.subtotal) : 0), 0));
}
export const totalDeLaVenta = (v: VentaDelReporte): number => deCent(v.prendas.reduce((a, p) => a + aCent(p.subtotal), 0));

/** La suma de una lista de ventas, por empresa y en total: el pie de la tabla filtrada. */
export function sumaDeVentas(ventas: readonly VentaDelReporte[], empresas: readonly EmpresaDelReporte[]): { porEmpresa: Record<string, number>; total: number; prendas: number } {
  const porEmpresa: Record<string, number> = {};
  let total = 0;
  let prendas = 0;
  for (const e of empresas) porEmpresa[e.id] = 0;
  for (const v of ventas)
    for (const p of v.prendas) {
      porEmpresa[p.empresaId] = (porEmpresa[p.empresaId] ?? 0) + aCent(p.subtotal);
      total += aCent(p.subtotal);
      prendas += p.cantidad;
    }
  for (const k of Object.keys(porEmpresa)) porEmpresa[k] = deCent(porEmpresa[k]);
  return { porEmpresa, total: deCent(total), prendas };
}

/** «B004-31»: el comprobante como lo busca Historial (sin ceros a la izquierda). */
export const numeroDeComprobante = (c: ComprobanteDeVenta): string => `${c.serie}-${c.numero}`;

/** El enlace a la venta en Historial, que busca por el número del comprobante. Sin comprobante no hay con qué buscarla: `null`. */
export const hrefEnHistorial = (v: VentaDelReporte): string | null =>
  v.comprobante ? `/vender/historial?q=${encodeURIComponent(numeroDeComprobante(v.comprobante))}` : null;

/** Los medios y las cuentas que aparecen en el período, para los filtros (en el orden de «¿Dónde está la plata?»). */
export function opcionesDeVentas(plata: PlataPorCuenta): { metodos: string[]; cuentas: { clave: string; texto: string }[] } {
  const metodos = [...new Set(plata.filas.map((f) => f.metodo))];
  return { metodos, cuentas: plata.filas.map((f) => ({ clave: f.clave, texto: `${f.cuenta} · ${nombreDeMetodo(f.metodo)}` })) };
}

/**
 * Con un medio o una cuenta elegidos: cuánto entró de verdad así en esas ventas (de la empresa elegida, si hay una). Es la cifra de la fila tocada en «¿Dónde
 * está la plata?»; las ventas pueden sumar más, porque una venta se pudo pagar en parte con otro medio. Sin medio ni cuenta, `null`.
 */
export function cobradoDelFiltro(ventas: readonly VentaDelReporte[], f: FiltroVentas): number | null {
  if (!f.metodo && !f.cuenta) return null;
  let c = 0;
  for (const v of ventas)
    for (const p of v.pagos)
      if ((!f.metodo || p.metodo === f.metodo) && (!f.cuenta || claveDePlata(p) === f.cuenta)) c += aCent(f.empresa ? (p.partes[f.empresa] ?? 0) : p.monto);
  return deCent(c);
}
