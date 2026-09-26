// Reglas de Finanzas ▸ Reportes ▸ Flujo de caja y Escenarios (ADR-0195 F6; spike `vista-reportes.js`, `vistaFlujo` y
// `vistaEscenarios`). Lógica pura: la usan las pantallas y sus pruebas.
//
// La base decide los números (`fn_flujo_caja_real` y `fn_flujo_caja_proyeccion`, 20260925160000): lo que entró y salió de
// la plata de CAYLA, y lo que se espera cobrar y pagar en las próximas semanas, pieza por pieza. Aquí se leen, se rotulan y,
// para Escenarios, se rehace LA MISMA cuenta de la proyección con las palancas («¿y si vendo 10 % más?») sin guardar nada.
// Sin palancas, `proyectar` da exactamente las semanas de la base (lo prueba `flujo-caja-reglas.test.ts`).

import { fechaCorta, solesRedondo } from "./gastos-reglas";
import { sumarDias } from "./fechas-lima";
import { puntoDeEquilibrio, type FilaER } from "./resultados-reglas";

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const fecha = (v: unknown) => String(v ?? "").slice(0, 10);
const lista = (v: unknown): Fila[] => (Array.isArray(v) ? (v as Fila[]) : []);
/** Céntimos exactos: la suma de muchos montos con decimales no arrastra error de coma flotante. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** «S/ 5,472» o «−S/ 2,484» (spike: el signo va delante del símbolo). */
export function soles(n: number): string {
  const v = Math.round(n);
  return v < 0 ? `−${solesRedondo(-v)}` : solesRedondo(v);
}
/** «+S/ 38,200» / «−S/ 41,300»: una línea de la lista de lo que entró o salió. */
export function solesConSigno(n: number): string {
  return Math.round(n) < 0 ? soles(n) : `+${soles(n)}`;
}

// ---- Categorías ---------------------------------------------------------------------------------------------------------

export type Lado = "entra" | "sale" | "ajuste";

/** El orden del spike: primero cómo se cobró, después la plata del dueño y lo demás. */
const ORDEN_ENTRA = ["efectivo", "yape", "plin", "tarjeta", "transferencia", "dueno_pone", "otros_ingresos"];

export const TEXTO_CATEGORIA: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  dueno_pone: "Plata del dueño (aporte o préstamo)",
  otros_ingresos: "Otros ingresos de caja",
  mercaderia: "Proveedores de mercadería",
  gastos: "Gastos",
  activos: "Muebles y equipos",
  dueno_saca: "Retiro del dueño",
  pago_tarjeta: "Pago de la tarjeta de crédito",
  comision_pos: "Comisión del POS",
  deposito_sin_cuenta: "Llevado al banco sin decir a cuál",
  por_clasificar: "Egresos de caja por clasificar",
  otras_salidas: "Otras salidas de caja",
  entre_cuentas: "Plata en camino entre cuentas",
  faltantes_caja: "Faltantes y sobrantes al cerrar la caja",
  aperturas_caja: "Diferencias al abrir la caja",
};
export const textoCategoria = (clave: string) => TEXTO_CATEGORIA[clave] ?? clave;

/** Lo que movió plata sin decir de qué cuenta (F3 todavía no lo sabe): se dice aparte. */
export const TEXTO_SIN_CUENTA: Record<string, string> = {
  cobros: "cobros de un medio que su tienda no dice a qué cuenta entra",
  pago: "pagos a proveedores (en efectivo o de la empresa)",
  gasto: "gastos sin tienda o de un medio sin cuenta",
  activo: "activos sin tienda o de un medio sin cuenta",
  produccion: "pagos de Producción",
  reembolso: "devoluciones de proveedores",
};

// ---- Lo que ya pasó -----------------------------------------------------------------------------------------------------

export type CategoriaFlujo = { clave: string; lado: Lado; monto: number };
export type SemanaReal = { desde: string; hasta: string; entro: number; salio: number; ajustes: number; saldo: number };
export type FlujoReal = {
  desde: string;
  hasta: string;
  hoy: string;
  saldoInicial: number;
  saldoFinal: number;
  entro: number;
  salio: number;
  ajustes: number;
  /** saldo final − (inicial + entró − salió + ajustes). La base lo exige en cero; si no, la pantalla lo dice. */
  descuadre: number;
  categorias: CategoriaFlujo[];
  semanas: SemanaReal[];
  sinCuenta: { origen: string; n: number; monto: number }[];
  planillaVisible: boolean;
  planilla: { nombre: string; fechaFin: string; pagado: number }[];
};

const lado = (v: unknown): Lado => (v === "entra" || v === "ajuste" ? v : "sale");

export function leerFlujoReal(data: unknown): FlujoReal {
  const d = (data ?? {}) as Fila;
  return {
    desde: fecha(d.desde),
    hasta: fecha(d.hasta),
    hoy: fecha(d.hoy),
    saldoInicial: num(d.saldo_inicial),
    saldoFinal: num(d.saldo_final),
    entro: num(d.entro),
    salio: num(d.salio),
    ajustes: num(d.ajustes),
    descuadre: num(d.descuadre),
    categorias: lista(d.categorias).map((c) => ({ clave: String(c.clave), lado: lado(c.lado), monto: num(c.monto) })),
    semanas: lista(d.semanas).map((s) => ({
      desde: fecha(s.desde),
      hasta: fecha(s.hasta),
      entro: num(s.entro),
      salio: num(s.salio),
      ajustes: num(s.ajustes),
      saldo: num(s.saldo),
    })),
    sinCuenta: lista(d.sin_cuenta).map((s) => ({ origen: String(s.origen), n: num(s.n), monto: num(s.monto) })),
    planillaVisible: d.planilla_visible === true,
    planilla: lista(d.planilla).map((p) => ({ nombre: String(p.nombre ?? ""), fechaFin: fecha(p.fecha_fin), pagado: num(p.pagado) })),
  };
}

/** Las listas del spike: lo que entró (en el orden de los medios) y lo que salió (de mayor a menor); los ajustes aparte. */
export function listasDelFlujo(f: Pick<FlujoReal, "categorias">): { entradas: CategoriaFlujo[]; salidas: CategoriaFlujo[]; ajustes: CategoriaFlujo[] } {
  const orden = (c: CategoriaFlujo) => {
    const i = ORDEN_ENTRA.indexOf(c.clave);
    return i < 0 ? ORDEN_ENTRA.length : i;
  };
  const conMonto = f.categorias.filter((c) => Math.round(c.monto * 100) !== 0);
  return {
    entradas: conMonto.filter((c) => c.lado === "entra").sort((a, b) => orden(a) - orden(b)),
    salidas: conMonto.filter((c) => c.lado === "sale").sort((a, b) => b.monto - a.monto),
    ajustes: conMonto.filter((c) => c.lado === "ajuste").sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto)),
  };
}

/** La frase de la nota del spike: por qué la plata subió o bajó en el período. */
export function fraseDelFlujo(f: FlujoReal): { tono: "neutro" | "aviso"; partes: Parte[] } {
  const { salidas } = listasDelFlujo(f);
  const neto = f.entro - f.salio;
  if (neto >= 0) {
    return {
      tono: "neutro",
      partes: [
        "Entró ",
        { b: `${soles(neto)} más de lo que salió` },
        `: la plata disponible pasó de ${soles(f.saldoInicial)} a ${soles(f.saldoFinal)}.`,
      ],
    };
  }
  const mayor = salidas[0];
  const porque =
    mayor?.clave === "mercaderia"
      ? ": pagaste mercadería antes de venderla. Eso es normal en moda; lo que hay que vigilar es que el saldo no baje del mínimo."
      : mayor
        ? `: lo que más sacó plata fue «${textoCategoria(mayor.clave).toLowerCase()}» (${soles(mayor.monto)}).`
        : ".";
  return { tono: "aviso", partes: ["Salió ", { b: `${soles(-neto)} más de lo que entró` }, porque] };
}

/** Un pedazo de texto; `{ b }` va en negrita. Así las frases se arman aquí y la pantalla solo las pinta. */
export type Parte = string | { b: string };

/** «S/ 29,596 en 22 pagos a proveedores · S/ 385 en cobros…»: lo que F3 todavía no sabe de qué cuenta es. */
export function textoSinCuenta(sin: FlujoReal["sinCuenta"]): string | null {
  const partes = sin
    .filter((s) => Math.round(s.monto) !== 0)
    .sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
    .map((s) => `${soles(Math.abs(s.monto))} en ${s.n === 1 ? "1 movimiento" : `${s.n} movimientos`} de ${TEXTO_SIN_CUENTA[s.origen] ?? s.origen}`);
  return partes.length ? partes.join(" · ") : null;
}

// ---- Rótulos de semanas -------------------------------------------------------------------------------------------------

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dia = (iso: string) => Number(iso.slice(8, 10));
const mes = (iso: string) => MESES_CORTOS[Number(iso.slice(5, 7)) - 1];

/** «28 sep – 4 oct», «5 – 11 oct», o un solo día. */
export function etiquetaSemana(desde: string, hasta: string): string {
  if (desde === hasta) return fechaCorta(desde);
  if (desde.slice(0, 7) === hasta.slice(0, 7)) return `${dia(desde)} – ${dia(hasta)} ${mes(hasta)}`;
  return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
}

/** El rótulo corto del eje del gráfico (spike): «28 sep», «5», «12», «26 oct»… el mes solo al empezar o al cambiar. */
export function etiquetasEje(desdes: readonly string[]): string[] {
  return desdes.map((d, i) => (i === 0 || d.slice(0, 7) !== desdes[i - 1]!.slice(0, 7) ? fechaCorta(d) : String(dia(d))));
}

// ---- Lo que viene -------------------------------------------------------------------------------------------------------

export type CampanaDia = { nombre: string; desde: string | null; hasta: string | null; metaPct: number };
export type CobroEsperado = {
  fecha: string;
  ubicacionId: string;
  tienda: string;
  monto: number;
  /** `meta` = la meta del día de Configuración (con su campaña); `promedio` = la tienda no tiene meta. */
  origen: "meta" | "promedio";
  metaPct: number;
  campanas: CampanaDia[];
};
export type TipoSalida = "vencimiento" | "fijo" | "planilla" | "nuevo";
export type SalidaProy = {
  tipo: TipoSalida;
  id: string;
  /** El día en que se cuenta (lo vencido, mañana). */
  fecha: string;
  vence: string | null;
  titulo: string;
  detalle: string;
  /** Naturaleza del comprobante (vencimiento), categoría (fijo) o `planilla`. */
  clase: string;
  ubicacionId: string | null;
  unidad: string | null;
  monto: number;
  /** Vencida o que faltaba registrar: se paga en el primer bloque. */
  atrasada: boolean;
};
export type SemanaProy = { desde: string; hasta: string; entra: number; sale: number; saldo: number; bajoMinimo: boolean };
export type Proyeccion = {
  hoy: string;
  desde: string;
  hasta: string;
  saldoHoy: number;
  minimoCaja: number;
  salidasDiarias: number;
  diasDeCaja: number | null;
  salidas30: { conCuenta: number; sinCuenta: number; planilla: number };
  planillaVisible: boolean;
  semanas: SemanaProy[];
  cobros: CobroEsperado[];
  salidas: SalidaProy[];
};

const TIPOS_SALIDA: readonly TipoSalida[] = ["vencimiento", "fijo", "planilla", "nuevo"];

export function leerProyeccion(data: unknown): Proyeccion {
  const d = (data ?? {}) as Fila;
  const s30 = (d.salidas_30 ?? {}) as Fila;
  return {
    hoy: fecha(d.hoy),
    desde: fecha(d.desde),
    hasta: fecha(d.hasta),
    saldoHoy: num(d.saldo_hoy),
    minimoCaja: num(d.minimo_caja),
    salidasDiarias: num(d.salidas_diarias),
    diasDeCaja: d.dias_de_caja === null || d.dias_de_caja === undefined ? null : num(d.dias_de_caja),
    salidas30: { conCuenta: num(s30.con_cuenta), sinCuenta: num(s30.sin_cuenta), planilla: num(s30.planilla) },
    planillaVisible: d.planilla_visible === true,
    semanas: lista(d.semanas).map((s) => ({
      desde: fecha(s.desde),
      hasta: fecha(s.hasta),
      entra: num(s.entra),
      sale: num(s.sale),
      saldo: num(s.saldo),
      bajoMinimo: s.bajo_minimo === true,
    })),
    cobros: lista(d.cobros).map((c) => ({
      fecha: fecha(c.fecha),
      ubicacionId: String(c.ubicacion_id),
      tienda: String(c.tienda ?? ""),
      monto: num(c.monto),
      origen: c.origen === "meta" ? "meta" : "promedio",
      metaPct: num(c.meta_pct),
      campanas: lista(c.campanas).map((k) => ({ nombre: String(k.nombre ?? ""), desde: txt(k.desde), hasta: txt(k.hasta), metaPct: num(k.meta_pct) })),
    })),
    salidas: lista(d.salidas).map((s) => ({
      tipo: TIPOS_SALIDA.includes(s.tipo as TipoSalida) ? (s.tipo as TipoSalida) : "vencimiento",
      id: String(s.id),
      fecha: fecha(s.fecha),
      vence: txt(s.vence)?.slice(0, 10) ?? null,
      titulo: String(s.titulo ?? ""),
      detalle: String(s.detalle ?? ""),
      clase: String(s.clase ?? ""),
      ubicacionId: txt(s.ubicacion_id),
      unidad: txt(s.unidad),
      monto: num(s.monto),
      atrasada: s.atrasada === true,
    })),
  };
}

/** Las tiendas de la proyección y de dónde sale lo que se espera cobrar de cada una (la meta o el promedio). */
export function tiendasDeLaProyeccion(p: Pick<Proyeccion, "cobros">): { id: string; nombre: string; origen: "meta" | "promedio" | "mixto" }[] {
  const m = new Map<string, { id: string; nombre: string; origenes: Set<string> }>();
  for (const c of p.cobros) {
    const t = m.get(c.ubicacionId) ?? { id: c.ubicacionId, nombre: c.tienda, origenes: new Set<string>() };
    t.origenes.add(c.origen);
    m.set(c.ubicacionId, t);
  }
  return [...m.values()]
    .map((t) => ({ id: t.id, nombre: t.nombre, origen: (t.origenes.size > 1 ? "mixto" : [...t.origenes][0]) as "meta" | "promedio" | "mixto" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Las campañas que rigen en un bloque, con «desde el 1» / «hasta el 14» si empiezan o terminan dentro (spike). */
export function campanasDeSemana(cobros: readonly CobroEsperado[], desde: string, hasta: string): string[] {
  const vistas = new Map<string, CampanaDia>();
  for (const c of cobros) {
    if (c.fecha < desde || c.fecha > hasta) continue;
    for (const k of c.campanas) if (k.nombre && !vistas.has(k.nombre)) vistas.set(k.nombre, k);
  }
  return [...vistas.values()].map((k) => {
    const empieza = k.desde && k.desde > desde ? ` desde el ${dia(k.desde)}` : "";
    const termina = k.hasta && k.hasta < hasta ? ` hasta el ${dia(k.hasta)}` : "";
    return `${k.nombre}${empieza}${termina}`;
  });
}

/** «Qué vence» de un bloque (spike): la planilla junta, y los tres pagos más grandes; el primero con su monto. */
export function queVence(salidas: readonly SalidaProy[], desde: string, hasta: string): string {
  const del = salidas.filter((s) => s.fecha >= desde && s.fecha <= hasta && s.monto > 0);
  if (!del.length) return "Nada vence";
  const grupos = new Map<string, number>();
  for (const s of del) {
    const nombre = s.tipo === "planilla" ? "Planilla" : s.tipo === "fijo" ? s.titulo : s.tipo === "nuevo" ? s.titulo : s.titulo || s.detalle;
    grupos.set(nombre, (grupos.get(nombre) ?? 0) + s.monto);
  }
  const orden = [...grupos.entries()].sort((a, b) => b[1] - a[1]);
  const [primero, ...resto] = orden;
  const textos = [`${primero![0]} ${soles(primero![1])}`, ...resto.slice(0, 2).map(([n]) => n)];
  return textos.join(" · ") + (resto.length > 2 ? ` · y ${resto.length - 2} más` : "");
}

// ---- Escenarios ---------------------------------------------------------------------------------------------------------

/** Las palancas del spike, generalizadas: ventas de todas las tiendas, una tienda (sus ventas, su alquiler, cerrarla),
 *  pasar un pago a otra semana y un gasto nuevo. Nada se guarda. */
export type Palancas = {
  /** −20…+30 %: lo que se espera cobrar de todas las tiendas (y lo que venden en el estado de resultados). */
  ventasTodas: number;
  /** La tienda de las palancas de abajo. */
  tienda: string | null;
  /** −20…+40 %: las ventas de esa tienda. */
  ventasTienda: number;
  /** El alquiler de esa tienda al mes (`null` = como está). */
  alquilerTienda: number | null;
  /** Sin sus ventas ni sus costos; lo que ya se debe, su alquiler y su planilla siguen en estas semanas. */
  cerrarTienda: boolean;
  /** Un pago de la lista, corrido `semanas` semanas (negativo = adelantarlo). */
  moverPago: { id: string; semanas: number } | null;
  /** Un gasto nuevo desde el bloque `semana` (0 = el primero): una vez o cada mes. */
  gastoNuevo: { monto: number; mensual: boolean; semana: number } | null;
};

export const PALANCAS_INICIALES: Palancas = {
  ventasTodas: 0,
  tienda: null,
  ventasTienda: 0,
  alquilerTienda: null,
  cerrarTienda: false,
  moverPago: null,
  gastoNuevo: null,
};

/** ¿Hay alguna palanca movida? («Volver a como está» se habilita.) */
export function hayCambios(p: Palancas, alquilerActual: number | null): boolean {
  return (
    p.ventasTodas !== 0 ||
    p.ventasTienda !== 0 ||
    (p.alquilerTienda !== null && alquilerActual !== null && Math.round(p.alquilerTienda) !== Math.round(alquilerActual)) ||
    p.cerrarTienda ||
    (p.moverPago !== null && p.moverPago.semanas !== 0) ||
    (p.gastoNuevo !== null && p.gastoNuevo.monto > 0)
  );
}

/** El factor de lo que se espera cobrar de una tienda con las palancas. */
function factorVentas(ubicacionId: string, p: Palancas): number {
  let f = 1 + p.ventasTodas / 100;
  if (p.tienda && ubicacionId === p.tienda) f = p.cerrarTienda ? 0 : f * (1 + p.ventasTienda / 100);
  return f;
}

/** El alquiler de una tienda al mes según sus gastos fijos (lo que se usa si no hay estado de resultados). */
export function alquilerDeFijos(salidas: readonly SalidaProy[], tienda: string | null): number | null {
  if (!tienda) return null;
  const porMes = new Map<string, number>();
  for (const s of salidas) {
    if (s.tipo !== "fijo" || s.clase !== "alquileres" || s.ubicacionId !== tienda) continue;
    const m = s.id.split(":")[1] ?? s.fecha.slice(0, 7);
    porMes.set(m, (porMes.get(m) ?? 0) + s.monto);
  }
  const montos = [...porMes.values()];
  return montos.length ? Math.max(...montos) : null;
}

/** `iso` + `k` meses, con el día recortado al último del mes (31 ene + 1 = 28 feb). */
export function sumarMesesIso(iso: string, k: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const base = new Date(Date.UTC(a, m - 1 + k, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(d, ultimo))).toISOString().slice(0, 10);
}

/**
 * Las salidas con las palancas: el pago corrido de semana (si se va más allá de la última semana, sale del horizonte; si se
 * adelanta, no antes de mañana), el alquiler de la tienda escalado al nuevo monto, y el gasto nuevo.
 */
export function salidasConPalancas(p: Proyeccion, palancas: Palancas, alquilerActual: number | null): SalidaProy[] {
  const factorAlquiler =
    palancas.tienda && palancas.alquilerTienda !== null && alquilerActual && alquilerActual > 0 ? palancas.alquilerTienda / alquilerActual : 1;
  const salidas: SalidaProy[] = p.salidas.map((s) => {
    let f = s.fecha;
    if (palancas.moverPago && s.id === palancas.moverPago.id && palancas.moverPago.semanas !== 0) {
      f = sumarDias(s.fecha, 7 * palancas.moverPago.semanas);
      if (f < p.desde) f = p.desde;
    }
    const monto = s.tipo === "fijo" && s.clase === "alquileres" && s.ubicacionId === palancas.tienda ? r2(s.monto * factorAlquiler) : s.monto;
    return { ...s, fecha: f, monto };
  });
  const g = palancas.gastoNuevo;
  if (g && g.monto > 0 && p.semanas.length) {
    const inicio = p.semanas[Math.min(Math.max(g.semana, 0), p.semanas.length - 1)]!.desde;
    for (let k = 0; ; k++) {
      const f = sumarMesesIso(inicio, k);
      if (f > p.hasta || (!g.mensual && k > 0)) break;
      salidas.push({
        tipo: "nuevo",
        id: `nuevo:${k}`,
        fecha: f,
        vence: f,
        titulo: "Gasto nuevo",
        detalle: g.mensual ? "cada mes" : "una vez",
        clase: "nuevo",
        ubicacionId: null,
        unidad: null,
        monto: g.monto,
        atrasada: false,
      });
    }
  }
  return salidas.filter((s) => s.fecha <= p.hasta);
}

/**
 * LA cuenta de la proyección, semana por semana: saldo de hoy + lo que se espera cobrar − lo que sale. Es la misma que hace
 * `fn_flujo_caja_proyeccion`; sin palancas da sus mismas semanas. Con palancas, es Escenarios.
 */
export function proyectar(p: Proyeccion, palancas: Palancas = PALANCAS_INICIALES, alquilerActual: number | null = null): SemanaProy[] {
  const salidas = salidasConPalancas(p, palancas, alquilerActual);
  let saldo = p.saldoHoy;
  return p.semanas.map((w) => {
    const entra = r2(p.cobros.filter((c) => c.fecha >= w.desde && c.fecha <= w.hasta).reduce((a, c) => a + c.monto * factorVentas(c.ubicacionId, palancas), 0));
    const sale = r2(salidas.filter((s) => s.fecha >= w.desde && s.fecha <= w.hasta).reduce((a, s) => a + s.monto, 0));
    saldo = r2(saldo + entra - sale);
    return { desde: w.desde, hasta: w.hasta, entra, sale, saldo, bajoMinimo: saldo < p.minimoCaja };
  });
}

/** Lo más bajo que llega la caja en el horizonte, y en qué semana. */
export function puntoMasBajo(semanas: readonly SemanaProy[]): SemanaProy | null {
  return semanas.reduce<SemanaProy | null>((a, w) => (a === null || w.saldo < a.saldo ? w : a), null);
}

/** «Si mañana no vendieras nada…»: el tono del spike (rojo bajo 10 días, ámbar bajo 20). */
export function tonoDiasDeCaja(dias: number | null): "rojo" | "ambar" | "verde" | "neutro" {
  if (dias === null) return "neutro";
  if (dias < 10) return "rojo";
  if (dias < 20) return "ambar";
  return "verde";
}

// ---- La utilidad (Estado de resultados, F5) -----------------------------------------------------------------------------

/** Lo que la unidad pagó de alquiler en el mes (cuenta 635, «Alquileres»). */
export function alquilerDe(f: Pick<FilaER, "detalleGastos">): number {
  return r2(f.detalleGastos.filter((g) => g.cuenta.startsWith("635")).reduce((a, g) => a + g.monto, 0));
}

export type UtilidadUnidad = {
  ubicacionId: string | null;
  unidad: FilaER["unidad"];
  nombre: string;
  antes: number;
  despues: number;
  ventasDespues: number;
  /** Lo que necesita vender para no perder (gastos ÷ margen %, la regla de F5); `null` si su margen no cubre nada. */
  equilibrio: number | null;
};

type Cifras = { ventas: number; costo: number; fletes: number; mermas: number; gastos: number };
const utilidad = (x: Cifras) => x.ventas - x.costo - x.fletes - x.mermas - x.gastos;

function aplicar(f: FilaER, p: Palancas): Cifras {
  const esLa = !!p.tienda && f.ubicacionId === p.tienda;
  if (esLa && p.cerrarTienda) return { ventas: 0, costo: 0, fletes: 0, mermas: 0, gastos: f.depreciacion };
  let factor = f.unidad === "tienda" ? 1 + p.ventasTodas / 100 : 1;
  if (esLa) factor *= 1 + p.ventasTienda / 100;
  const alquiler = esLa && p.alquilerTienda !== null ? p.alquilerTienda - alquilerDe(f) : 0;
  const nuevo = f.unidad === "empresa" && p.gastoNuevo?.mensual ? p.gastoNuevo.monto : 0;
  return { ventas: f.ventas * factor, costo: f.costo * factor, fletes: f.fletes * factor, mermas: f.mermas * factor, gastos: f.gastos + alquiler + nuevo };
}

/**
 * La utilidad de un mes con las palancas, unidad por unidad y CAYLA (la suma, no la fila consolidada de la base, para que
 * lo cambiado en una tienda se vea en el total). Ventas ±%: ventas, costo, fletes y mermas se mueven juntos. Cerrar una
 * tienda: sin ventas ni costos, pero su depreciación sigue. Un gasto nuevo cada mes cae en «De la empresa».
 */
export function utilidadConCambios(filas: readonly FilaER[], p: Palancas): { unidades: UtilidadUnidad[]; cayla: { antes: number; despues: number } } {
  const unidades = filas
    .filter((f) => f.unidad !== "consolidado")
    .map((f) => {
      const d = aplicar(f, p);
      const eq = f.unidad === "tienda" ? puntoDeEquilibrio({ ventas: d.ventas, margen: d.ventas - d.costo - d.fletes - d.mermas, gastos: d.gastos }) : null;
      return {
        ubicacionId: f.ubicacionId,
        unidad: f.unidad,
        nombre: f.nombre,
        antes: r2(utilidad(f)),
        despues: r2(utilidad(d)),
        ventasDespues: r2(d.ventas),
        equilibrio: eq?.ventas ?? null,
      };
    });
  const suma = (k: "antes" | "despues") => r2(unidades.reduce((a, u) => a + u[k], 0));
  return { unidades, cayla: { antes: suma("antes"), despues: suma("despues") } };
}

/** La tienda que arranca elegida en Escenarios: la que peor le fue en el mes (el spike arranca en LIM, la que pierde). */
export function tiendaInicial(filas: readonly FilaER[], tiendas: readonly { id: string }[]): string | null {
  const conResultado = filas.filter((f) => f.unidad === "tienda" && f.ubicacionId && tiendas.some((t) => t.id === f.ubicacionId));
  if (conResultado.length) return [...conResultado].sort((a, b) => utilidad(a) - utilidad(b))[0]!.ubicacionId;
  return tiendas[0]?.id ?? null;
}

/** Las frases de «Qué pasaría» (spike). La utilidad solo si hay estado de resultados; la caja, siempre. */
export function conclusiones(args: {
  utilidad: ReturnType<typeof utilidadConCambios> | null;
  palancas: Palancas;
  nombreTienda: string | null;
  semanasBase: readonly SemanaProy[];
  semanasNuevas: readonly SemanaProy[];
  minimo: number;
  pagoMovido: { titulo: string; monto: number; de: string; a: string | null } | null;
}): Parte[][] {
  const { utilidad: u, palancas: p, nombreTienda, semanasBase, semanasNuevas, minimo, pagoMovido } = args;
  const salida: Parte[][] = [];
  if (u) {
    const dif = u.cayla.despues - u.cayla.antes;
    salida.push([
      "CAYLA pasaría de ",
      { b: soles(u.cayla.antes) },
      " a ",
      { b: soles(u.cayla.despues) },
      ` al mes (${dif >= 0 ? "+" : "−"}${soles(Math.abs(dif))}).`,
    ]);
    const t = u.unidades.find((x) => x.ubicacionId === p.tienda);
    if (t && nombreTienda) {
      if (p.cerrarTienda) {
        salida.push([
          `Cerrar ${nombreTienda} cambia su resultado de ${soles(t.antes)} a `,
          { b: soles(t.despues) },
          " al mes: sin sus ventas, pero lo que se invirtió en ella se sigue depreciando. También hay que ver a dónde va su mercadería y su equipo.",
        ]);
      } else {
        salida.push([
          `${nombreTienda} ${t.despues >= 0 ? "dejaría" : "perdería"} `,
          { b: soles(Math.abs(t.despues)) },
          t.equilibrio !== null ? ` al mes; necesitaría vender ${soles(t.equilibrio)} para no perder.` : " al mes.",
        ]);
      }
    }
  }
  const bajoN = puntoMasBajo(semanasNuevas);
  const bajoB = puntoMasBajo(semanasBase);
  if (bajoN) {
    if (bajoN.saldo < minimo) {
      salida.push([
        `La caja ${bajoB && bajoB.saldo < minimo ? "seguiría bajando" : "bajaría"} del mínimo: lo más bajo sería `,
        { b: soles(bajoN.saldo) },
        ` la semana del ${etiquetaSemana(bajoN.desde, bajoN.hasta)}.`,
      ]);
    } else {
      salida.push([
        `La caja no bajaría de tu mínimo en ${semanasNuevas.length} semanas (lo más bajo: `,
        { b: soles(bajoN.saldo) },
        bajoB && bajoB.saldo < minimo ? `; hoy bajaría a ${soles(bajoB.saldo)}).` : ").",
      ]);
    }
  }
  if (pagoMovido) {
    salida.push([
      `Pasar ${soles(pagoMovido.monto)} de ${pagoMovido.titulo} del ${fechaCorta(pagoMovido.de)} `,
      pagoMovido.a ? `al ${fechaCorta(pagoMovido.a)}` : "a después de estas semanas",
      ": hay que hablarlo con el proveedor.",
    ]);
  }
  if (p.cerrarTienda && nombreTienda) {
    salida.push([`En estas semanas, sin las ventas de ${nombreTienda}; lo que ya se debe, su alquiler y su planilla siguen hasta que se negocien.`]);
  }
  return salida;
}

// ---- La URL y lo que se descarga ----------------------------------------------------------------------------------------

/** `?semanas=` → 4, 6 u 8 (PLAN-FINANZAS: «a 4–8 semanas»); por defecto 6, como el spike. */
export const SEMANAS_POSIBLES = [4, 6, 8] as const;
export function leerSemanas(x: string | undefined): number {
  const n = Number(x);
  return (SEMANAS_POSIBLES as readonly number[]).includes(n) ? n : 6;
}

/** Los días que mira «lo que ya pasó» para un mes: el mes entero, o hasta hoy si es el mes en curso. */
export function rangoDelMes(mes: string, hoy: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { desde: `${mes}-01`, hasta: ultimo < hoy ? ultimo : hoy };
}

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «septiembre al 24» (el mes en curso) o «agosto» (uno que ya terminó). */
export function textoPeriodo(desde: string, hasta: string, hoy: string): string {
  const nombre = MESES_LARGOS[Number(desde.slice(5, 7)) - 1] ?? "";
  const anio = desde.slice(0, 4) !== hoy.slice(0, 4) ? ` ${desde.slice(0, 4)}` : "";
  return hasta === hoy ? `${nombre}${anio} al ${dia(hasta)}` : `${nombre}${anio}`;
}

const celda = (v: string | number) => {
  const s = typeof v === "number" ? v.toFixed(2) : v;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV separado por «;» (Excel en español), montos exactos con punto: el mismo formato de Reportes (F5). */
const csv = (filas: (string | number)[][]) => "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");

/** Lo que ya pasó (semana por semana y por categoría) y lo que viene, en un archivo. */
export function csvFlujo(real: FlujoReal | null, p: Proyeccion | null): string {
  const filas: (string | number)[][] = [];
  if (real) {
    filas.push(["Lo que ya pasó", real.desde, real.hasta], ["Semana", "Entró", "Salió", "Ajustes", "Quedó"]);
    filas.push(["Saldo al empezar", "", "", "", real.saldoInicial]);
    for (const s of real.semanas) filas.push([etiquetaSemana(s.desde, s.hasta), s.entro, s.salio, s.ajustes, s.saldo]);
    filas.push([], ["Categoría", "Lado", "Monto"]);
    for (const c of real.categorias) filas.push([textoCategoria(c.clave), c.lado, c.monto]);
    filas.push([]);
  }
  if (p) {
    filas.push(["Lo que viene", p.desde, p.hasta], ["Semana", "Entra", "Sale", "Queda", "Bajo el mínimo", "Qué vence"]);
    filas.push(["Hoy", "", "", p.saldoHoy, "", ""]);
    for (const w of p.semanas) filas.push([etiquetaSemana(w.desde, w.hasta), w.entra, w.sale, w.saldo, w.bajoMinimo ? "sí" : "no", queVence(p.salidas, w.desde, w.hasta)]);
  }
  return csv(filas);
}

/** El escenario: la caja semana por semana (hoy y con el cambio) y la utilidad de cada unidad. */
export function csvEscenario(base: readonly SemanaProy[], nuevo: readonly SemanaProy[], u: ReturnType<typeof utilidadConCambios> | null): string {
  const filas: (string | number)[][] = [["Tu caja", "Hoy", "Con el cambio", "Diferencia"]];
  base.forEach((w, i) => {
    const n = nuevo[i]?.saldo ?? w.saldo;
    filas.push([etiquetaSemana(w.desde, w.hasta), w.saldo, n, r2(n - w.saldo)]);
  });
  if (u) {
    filas.push([], ["Utilidad al mes", "Hoy", "Con el cambio", "Diferencia"]);
    for (const x of u.unidades) filas.push([x.nombre, x.antes, x.despues, r2(x.despues - x.antes)]);
    filas.push(["CAYLA", u.cayla.antes, u.cayla.despues, r2(u.cayla.despues - u.cayla.antes)]);
  }
  return csv(filas);
}
