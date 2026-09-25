// Reglas de Finanzas ▸ Reportes: Estado de resultados y Campañas (ADR-0195 F5; retoma ADR-0109/0120 del PR #170).
// Lógica pura: la usan las pantallas y sus pruebas. Qué NO hace este archivo: calcular plata. Toda cifra viene de la base
// (`fn_estado_resultados` sobre el diario `fn_asientos`, y `fn_campanas_reporte`); aquí solo se decide qué columnas y filas
// se muestran, cómo se escriben, qué avisos se levantan y de dónde sale cada número. Si un número está mal, se corrige en
// la base (20260925130000), no aquí. La excepción es la cuenta de «cuánto más hay que vender» de una campaña que viene:
// es un despeje sobre dos datos de la base (su margen normal y su descuento), y vive aquí con sus pruebas.

export type UnidadER = "tienda" | "taller" | "empresa" | "consolidado";
export type DetalleGastoER = { cuenta: string; nombre: string; monto: number };
export type DetalleMermaER = { regla: string; monto: number };

export type FilaER = {
  /** `null` en «De la empresa» y en el consolidado (los distingue `unidad`). */
  ubicacionId: string | null;
  unidad: UnidadER;
  nombre: string;
  orden: number;
  ventas: number;
  costo: number;
  fletes: number;
  mermas: number;
  margen: number;
  planilla: number;
  depreciacion: number;
  gastos: number;
  resultado: number;
  igvVentas: number;
  detalleGastos: DetalleGastoER[];
  detalleMermas: DetalleMermaER[];
  sinCosto: number;
  mermasSinCosto: number;
  descuadres: number;
  planillaVisible: boolean;
  planillaNota: string | null;
};

type Fila = Record<string, unknown>;
const n = (v: unknown): number => (v == null ? 0 : Number(v));
const texto = (v: unknown): string | null => (v == null ? null : String(v));
const UNIDADES: readonly UnidadER[] = ["tienda", "taller", "empresa", "consolidado"];

/** Una fila de `fn_estado_resultados` (los `numeric` viajan como texto) → tipos de la pantalla. */
export function leerFilaER(r: Fila): FilaER {
  const unidad = UNIDADES.includes(r.unidad as UnidadER) ? (r.unidad as UnidadER) : "tienda";
  return {
    ubicacionId: texto(r.ubicacion_id),
    unidad,
    nombre: String(r.nombre ?? ""),
    orden: n(r.orden),
    ventas: n(r.ventas_netas),
    costo: n(r.costo_ventas),
    fletes: n(r.fletes),
    mermas: n(r.mermas),
    margen: n(r.margen_bruto),
    planilla: n(r.planilla),
    depreciacion: n(r.depreciacion),
    gastos: n(r.gastos_operacion),
    resultado: n(r.resultado),
    igvVentas: n(r.igv_ventas),
    detalleGastos: ((r.detalle_gastos as Fila[] | null) ?? []).map((d) => ({
      cuenta: String(d.cuenta),
      nombre: String(d.nombre ?? ""),
      monto: n(d.monto),
    })),
    detalleMermas: ((r.detalle_mermas as Fila[] | null) ?? []).map((d) => ({
      regla: String(d.regla),
      monto: n(d.monto),
    })),
    sinCosto: n(r.unidades_sin_costo),
    mermasSinCosto: n(r.mermas_sin_costo),
    descuadres: n(r.asientos_descuadrados),
    planillaVisible: !!r.planilla_visible,
    planillaNota: texto(r.planilla_nota),
  };
}

/** La llave de una columna: la ubicación, o «empresa» / «consolidado». */
export const claveUnidad = (f: Pick<FilaER, "ubicacionId" | "unidad">): string => f.ubicacionId ?? f.unidad;

/** «Tienda Trujillo» → «Trujillo»; el consolidado se llama CAYLA (como en el spike). */
export function nombreCorto(f: Pick<FilaER, "nombre" | "unidad">): string {
  if (f.unidad === "consolidado") return "CAYLA";
  return f.nombre.replace(/^Tienda\s+/i, "");
}

// ---- «Ver»: qué se mira (la cabecera dice dónde se trabaja) --------------------------------------------------------------

/**
 * `?ver=` → qué columnas. El líder: una ubicación (por defecto, la sede donde trabaja), «todas» o «empresa»; siempre con
 * CAYLA al lado. Quien tiene el módulo sin ser líder ve solo su tienda: la base ya no le manda otra cosa.
 */
export function leerVerER(param: string | undefined, filas: readonly FilaER[], esLider: boolean, sedeActual: string | null): string {
  if (!esLider) return filas.find((f) => f.ubicacionId)?.ubicacionId ?? "todas";
  if (param === "todas" || param === "empresa") return param;
  const candidata = param ?? sedeActual;
  if (candidata && filas.some((f) => f.ubicacionId === candidata)) return candidata;
  return "todas";
}

/** Las columnas del cuadro, en orden: lo que se mira y, si existe, CAYLA al final. */
export function columnasER(filas: readonly FilaER[], ver: string): FilaER[] {
  const cons = filas.find((f) => f.unidad === "consolidado");
  const unidades = filas.filter((f) => f.unidad !== "consolidado");
  const vistas =
    ver === "todas"
      ? unidades
      : ver === "empresa"
        ? unidades.filter((f) => f.unidad === "empresa")
        : unidades.filter((f) => f.ubicacionId === ver);
  return cons ? [...(vistas.length ? vistas : unidades), cons] : vistas.length ? vistas : unidades;
}

// ---- Las filas del cuadro ------------------------------------------------------------------------------------------------

export type ConceptoER = {
  clave: string;
  nombre: string;
  /** La cuenta que se muestra en la columna «Cuenta» (vacía en subtotales). */
  cuenta: string;
  tipo: "linea" | "sub" | "total";
  /** Las cuentas del diario de las que sale (para «de dónde sale»). */
  cuentas: string[];
  /** El valor con el signo con que se muestra: lo que resta, en negativo. */
  valor: (f: FilaER) => number;
};

/** Nombre de cada cuenta de gasto como lo lee quien decide (el orden del spike). */
const NOMBRE_GASTO: Record<string, string> = {
  "62": "Planilla (Dynamic)",
  "635": "Alquileres",
  "636": "Servicios básicos",
  "632": "Honorarios y asesoría",
  "637": "Publicidad",
  "631": "Transporte",
  "656": "Suministros",
  "634": "Mantenimiento",
  "639": "Comisiones bancarias",
  "64": "Tributos y licencias",
  "651": "Seguros",
  "681": "Depreciación",
  "655": "Bajas de activos fijos",
};
/** Siempre se muestran (aunque estén en cero, con «—»): lo que un mes normal tiene. Las demás, solo si hay algo. */
const GASTOS_SIEMPRE = ["62", "635", "636", "632", "637", "631", "656", "634"];
const GASTOS_AL_FINAL = ["681", "655"];

const montoCuenta = (f: FilaER, cuenta: string) => f.detalleGastos.filter((d) => d.cuenta === cuenta).reduce((a, d) => a + d.monto, 0);

export function conceptosER(columnas: readonly FilaER[]): ConceptoER[] {
  const presentes = new Set(columnas.flatMap((f) => f.detalleGastos.filter((d) => d.monto !== 0).map((d) => d.cuenta)));
  const otras = [...presentes].filter((c) => !GASTOS_SIEMPRE.includes(c) && !GASTOS_AL_FINAL.includes(c)).sort();
  const alFinal = GASTOS_AL_FINAL.filter((c) => c === "681" || presentes.has(c));
  const nombreDe = (c: string) =>
    NOMBRE_GASTO[c] ?? columnas.flatMap((f) => f.detalleGastos).find((d) => d.cuenta === c)?.nombre ?? `Cuenta ${c}`;
  const gasto = (c: string): ConceptoER => ({
    clave: `g${c}`,
    nombre: nombreDe(c),
    cuenta: c,
    tipo: "linea",
    cuentas: [c],
    valor: (f) => -montoCuenta(f, c),
  });
  return [
    {
      clave: "ventas",
      nombre: "Ventas",
      cuenta: "7011",
      tipo: "linea",
      cuentas: ["7011", "7012"],
      valor: (f) => f.ventas,
    },
    {
      clave: "costo",
      nombre: "Costo de lo vendido",
      cuenta: "691",
      tipo: "linea",
      cuentas: ["691"],
      valor: (f) => -f.costo,
    },
    {
      clave: "fletes",
      nombre: "Fletes de compra",
      cuenta: "609",
      tipo: "linea",
      cuentas: ["609"],
      valor: (f) => -f.fletes,
    },
    {
      clave: "mermas",
      nombre: "Mermas",
      cuenta: "659",
      tipo: "linea",
      cuentas: ["659"],
      valor: (f) => -f.mermas,
    },
    {
      clave: "margen",
      nombre: "Margen bruto",
      cuenta: "",
      tipo: "sub",
      cuentas: [],
      valor: (f) => f.margen,
    },
    ...[...GASTOS_SIEMPRE, ...otras, ...alFinal].map(gasto),
    {
      clave: "utilidad",
      nombre: "Utilidad operativa",
      cuenta: "",
      tipo: "total",
      cuentas: [],
      valor: (f) => f.resultado,
    },
  ];
}

// ---- Cómo se escribe ------------------------------------------------------------------------------------------------------

/** «S/ 44,100» y «−S/ 19,850» (el signo menos de verdad, no el guion), sin céntimos: como el spike. */
export function solesER(v: number): string {
  const r = Math.round(v);
  return `${r < 0 ? "−" : ""}S/ ${Math.abs(r).toLocaleString("es-PE")}`;
}

/** «53,7 %» (coma decimal, como el spike), o null si no hay base (dividir entre cero no es un porcentaje). */
export function porcentaje(parte: number, base: number): string | null {
  if (!base) return null;
  const p = (parte / base) * 100;
  return `${p < 0 ? "−" : ""}${Math.abs(p).toFixed(1).replace(".", ",")} %`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-08» → «ago.» */
export const mesCorto = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]}.`;
/** «2026-08» → «Agosto 2026» */
export const mesTitulo = (mes: string) => {
  const m = MESES[Number(mes.slice(5, 7)) - 1] ?? "";
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${mes.slice(0, 4)}`;
};
/** «2026-08» → «agosto» */
export const mesNombre = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? "";

/** El mes anterior a «2026-01» es «2025-12». */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** «+S/ 1,200 vs ago.» / «−S/ 300 vs ago.»; null si no hay con qué comparar. */
export function deltaTexto(actual: number, anterior: number | null | undefined, mesPrevio: string): string | null {
  if (anterior == null) return null;
  const d = Math.round(actual - anterior);
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toLocaleString("es-PE")} vs ${mesCorto(mesPrevio)}`;
}

// ---- Avisos: lo que vuelve honestas las cifras ----------------------------------------------------------------------------

export type AvisoER = { tono: "rojo" | "ambar" | "pizarra"; texto: string };

/**
 * Un margen inflado en silencio es peor que un aviso, y un número calculado sobre datos que no cuadran es peor que
 * ninguno. `enCurso`: el mes todavía no termina (la planilla de Dynamic se suma cuando se paga).
 */
export function avisosER(columnas: readonly FilaER[], enCurso: boolean): AvisoER[] {
  const out: AvisoER[] = [];
  const unidades = columnas.filter((f) => f.unidad !== "consolidado");
  const donde = (fs: FilaER[]) => fs.map((f) => nombreCorto(f)).join(", ");
  const descuadradas = unidades.filter((f) => f.descuadres > 0);
  if (descuadradas.length) {
    const total = descuadradas.reduce((a, f) => a + f.descuadres, 0);
    out.push({
      tono: "rojo",
      texto: `${total === 1 ? "Hay 1 operación" : `Hay ${total} operaciones`} cuyo cobro no suma lo que se vendió (${donde(descuadradas)}). Estas cifras no son confiables hasta revisarlo.`,
    });
  }
  const sinCosto = unidades.filter((f) => f.sinCosto > 0);
  if (sinCosto.length) {
    const total = sinCosto.reduce((a, f) => a + f.sinCosto, 0);
    out.push({
      tono: "ambar",
      texto: `${total === 1 ? "1 prenda vendida" : `${total} prendas vendidas`} sin costo cargado (${donde(sinCosto)}): su costo no se resta y el margen sale más alto de lo real.`,
    });
  }
  const mermasSinCosto = unidades.filter((f) => f.mermasSinCosto > 0);
  if (mermasSinCosto.length) {
    const total = mermasSinCosto.reduce((a, f) => a + f.mermasSinCosto, 0);
    out.push({
      tono: "ambar",
      texto: `${total === 1 ? "1 prenda perdida" : `${total} prendas perdidas`} sin costo cargado (${donde(mermasSinCosto)}): las mermas están subestimadas.`,
    });
  }
  const visible = columnas.some((f) => f.planillaVisible);
  if (!visible && columnas.length) {
    out.push({
      tono: "pizarra",
      texto: "La planilla la muestra Dynamic solo a quien la administra: estos números no la restan.",
    });
  } else if (enCurso && columnas.every((f) => f.planilla === 0)) {
    out.push({
      tono: "pizarra",
      texto: "La planilla de este mes se suma cuando Dynamic la pague (su período va del 29 al 28).",
    });
  }
  return out;
}

// ---- De dónde sale cada cifra ---------------------------------------------------------------------------------------------

export type LineaDiario = {
  fecha: string;
  ubicacionId: string | null;
  asiento: string;
  regla: string;
  cuenta: string;
  debe: number;
  haber: number;
  origenTabla: string;
  origenId: string;
  glosa: string;
};

export function leerLineaDiario(r: Fila): LineaDiario {
  return {
    fecha: String(r.fecha ?? ""),
    ubicacionId: texto(r.ubicacion_id),
    asiento: String(r.asiento ?? ""),
    regla: String(r.regla ?? ""),
    cuenta: String(r.cuenta ?? ""),
    debe: n(r.debe),
    haber: n(r.haber),
    origenTabla: String(r.origen_tabla ?? ""),
    origenId: String(r.origen_id ?? ""),
    glosa: String(r.glosa ?? ""),
  };
}

/** Qué operación generó cada línea, en palabras de la tienda. */
export const TEXTO_REGLA: Record<string, string> = {
  venta: "Ventas",
  anulacion: "Ventas anuladas",
  devolucion: "Devoluciones",
  cambio: "Cambios",
  merma_merma: "Mermas registradas a mano",
  merma_cuarentena: "Prendas dañadas botadas o donadas",
  merma_conteo: "Faltantes de conteo",
  anticipo: "Adelantos de separaciones",
  anticipo_devuelto: "Adelantos devueltos",
  gasto: "Gastos",
  compra: "Facturas de mercadería",
  activo: "Activos fijos",
  depreciacion: "Depreciación de activos",
  baja_activo: "Activos dados de baja",
  planilla: "Planilla de Dynamic",
  nota_credito_prov: "Notas de crédito de proveedores",
  pago_proveedor: "Pagos a proveedores",
  reembolso_prov: "Reembolsos de proveedores",
};

/** Las tablas de las que sale cada concepto (lo que el spike llama «De dónde sale»). */
export function fuentesDe(clave: string): string[] {
  if (clave === "ventas")
    return ["venta_items, sin el IGV", "menos las anulaciones, devoluciones y cambios de este mes, aunque la venta sea de otro"];
  if (clave === "costo") return ["venta_items.costo_unitario", "el costo sellado el día de cada venta, no el de hoy"];
  if (clave === "fletes") return ["Todavía no hay dónde registrar el flete de una compra"];
  if (clave === "mermas")
    return ["movimientos (mermas, cuarentena botada o donada, faltantes de conteo)", "al costo que tenía la prenda ese día"];
  if (clave === "g62") return ["planilla_por_sede (Dynamic)", "lo pagado + las provisiones de la sede, del período que termina en el mes"];
  if (clave === "g681") return ["activos_fijos", "costo ÷ vida útil, mes a mes, desde el mes siguiente a la compra"];
  if (clave === "g655") return ["activos_fijos dados de baja", "lo que faltaba depreciar el día de la baja"];
  return ["gastos vigentes con fecha del mes, sin el IGV de su factura", "menos las notas de crédito de su proveedor"];
}

/** El monto de una línea con el signo natural de su cuenta: una venta suma por el haber; un costo o gasto, por el debe. */
export const montoNatural = (l: LineaDiario, cuentasIngreso = ["7011", "7012"]) =>
  cuentasIngreso.includes(l.cuenta) ? l.haber - l.debe : l.debe - l.haber;

/**
 * Las líneas del diario detrás de una cifra: las de esas cuentas y esa columna, agrupadas por la operación que las generó,
 * con las más grandes a la vista. `unidad`: la llave de la columna (una ubicación, «empresa» o «consolidado»).
 */
export function origenDeCifra(lineas: readonly LineaDiario[], cuentas: readonly string[], unidad: string, mayores = 6) {
  const propias = lineas.filter(
    (l) =>
      cuentas.includes(l.cuenta) &&
      (unidad === "consolidado" || (unidad === "empresa" ? l.ubicacionId === null : l.ubicacionId === unidad)),
  );
  const grupos = new Map<string, { regla: string; texto: string; monto: number; n: number }>();
  for (const l of propias) {
    const g = grupos.get(l.regla) ?? {
      regla: l.regla,
      texto: TEXTO_REGLA[l.regla] ?? l.regla,
      monto: 0,
      n: 0,
    };
    g.monto += montoNatural(l);
    g.n += 1;
    grupos.set(l.regla, g);
  }
  return {
    total: propias.reduce((a, l) => a + montoNatural(l), 0),
    porRegla: [...grupos.values()].sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto)),
    mayores: [...propias].sort((a, b) => Math.abs(montoNatural(b)) - Math.abs(montoNatural(a))).slice(0, mayores),
  };
}

// ---- Punto de equilibrio (lo usará el Resumen, F10) ------------------------------------------------------------------------

/**
 * Cuánto hay que vender en el mes para cubrir los gastos con el margen que se tiene: gastos ÷ margen %. `null` si no hubo
 * ventas o el margen no es positivo (con margen cero o negativo, vender más no cubre nada).
 */
export function puntoDeEquilibrio(f: Pick<FilaER, "ventas" | "margen" | "gastos">): { ventas: number; cubre: number } | null {
  if (f.ventas <= 0 || f.margen <= 0) return null;
  const pe = f.gastos / (f.margen / f.ventas);
  return {
    ventas: Math.round(pe * 100) / 100,
    cubre: pe > 0 ? f.ventas / pe : 1,
  };
}

// ---- Descargar (Excel abre el CSV) -----------------------------------------------------------------------------------------

const celdaCsv = (v: string | number) => {
  const s = typeof v === "number" ? v.toFixed(2) : v;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Separado por «;» (Excel en español), con los montos exactos (dos decimales, punto). */
export function csvDe(filas: (string | number)[][]): string {
  return `﻿${filas.map((f) => f.map(celdaCsv).join(";")).join("\r\n")}\r\n`;
}

export function csvEstado(conceptos: readonly ConceptoER[], columnas: readonly FilaER[], mes: string): string {
  return csvDe([
    [`Estado de resultados · ${mesTitulo(mes)}`],
    ["Concepto", "Cuenta", ...columnas.map((c) => nombreCorto(c))],
    ...conceptos.map((k) => [k.nombre, k.cuenta, ...columnas.map((c) => Math.round(k.valor(c) * 100) / 100)]),
  ]);
}

// ---- Campañas -------------------------------------------------------------------------------------------------------------

export type MomentoCampana = "pasada" | "en_curso" | "viene" | "sin_fechas";
export type CampanaFila = {
  id: string;
  nombre: string;
  desde: string | null;
  hasta: string | null;
  descuentoPct: number | null;
  momento: MomentoCampana;
  dias: number | null;
  tiendas: number;
  ventas: number | null;
  normal: number | null;
  descuento: number;
  prendas: number | null;
  margenPct: number | null;
  margenNormalPct: number | null;
  margenExtra: number | null;
  metaPct: number | null;
  metaCampana: number | null;
  metaNormal: number | null;
  conEfecto: boolean;
};

const nulo = (v: unknown): number | null => (v == null ? null : Number(v));
export function leerCampana(r: Fila): CampanaFila {
  const momento = (["pasada", "en_curso", "viene", "sin_fechas"] as const).find((m) => m === r.momento) ?? "sin_fechas";
  return {
    id: String(r.etiqueta_id),
    nombre: String(r.nombre ?? ""),
    desde: texto(r.desde),
    hasta: texto(r.hasta),
    descuentoPct: nulo(r.descuento_pct),
    momento,
    dias: nulo(r.dias),
    tiendas: n(r.tiendas),
    ventas: nulo(r.ventas),
    normal: nulo(r.normal),
    descuento: n(r.descuento),
    prendas: nulo(r.prendas),
    margenPct: nulo(r.margen_pct),
    margenNormalPct: nulo(r.margen_normal_pct),
    margenExtra: nulo(r.margen_extra),
    metaPct: nulo(r.meta_pct),
    metaCampana: nulo(r.meta_campana),
    metaNormal: nulo(r.meta_normal),
    conEfecto: !!r.con_efecto,
  };
}

/**
 * Con un descuento `d` (%), cada prenda deja (m − d) en vez de m (margen sobre el precio sin descuento). Para ganar lo mismo
 * que un día normal hay que vender m ÷ (m − d) veces lo normal: esto devuelve el «más» (0.4 = 40 % más). Con 52 % de margen,
 * 15 % pide +40 % y 30 %, +136 % (los ejemplos del plan). `Infinity` si el descuento se come todo el margen; `null` sin margen.
 */
export function extraNecesario(margenPct: number | null, descuentoPct: number | null): number | null {
  if (!descuentoPct) return 0;
  if (margenPct == null || margenPct <= 0) return null;
  const m = margenPct - descuentoPct / 100;
  return m > 0 ? margenPct / m - 1 : Number.POSITIVE_INFINITY;
}

/** Cuánto margen se pierde por prenda con ese descuento (el pie de la tabla: «con 15 % cada prenda deja 28,8 % menos»). */
export function margenQueSePierde(margenPct: number, descuentoPct: number): number {
  return margenPct > 0 ? Math.min(1, descuentoPct / 100 / margenPct) : 1;
}

export type VeredictoCampana = {
  tono: "verde" | "ambar" | "rojo" | "neutro";
  texto: string;
};

/** «Qué dice el sistema» de una campaña que viene (ADR-0195 K2). */
export function veredictoCampana(c: Pick<CampanaFila, "descuentoPct" | "conEfecto" | "metaPct" | "margenNormalPct">): VeredictoCampana {
  if (!c.descuentoPct) {
    return c.conEfecto ? { tono: "verde", texto: "sin descuento: todo lo extra es ganancia" } : { tono: "neutro", texto: "solo etiqueta" };
  }
  const extra = extraNecesario(c.margenNormalPct, c.descuentoPct);
  if (extra === null) return { tono: "neutro", texto: "sin ventas normales para comparar" };
  if (!Number.isFinite(extra)) return { tono: "rojo", texto: "con este descuento se vende bajo el costo" };
  if (!c.conEfecto || c.metaPct == null) return { tono: "ambar", texto: "la meta no sube: gana menos" };
  return extra <= c.metaPct / 100 + 1e-9
    ? { tono: "verde", texto: "si llega a la meta, gana más" }
    : { tono: "ambar", texto: "aunque llegue a la meta, gana menos" };
}

/** Las que pasaron (con ventas, en orden de fechas, como el spike), las que vienen (incluida la que está en curso) y las
 *  que no tienen fechas (no pueden tener efecto: se avisa). */
export function separarCampanas(lista: readonly CampanaFila[]) {
  return {
    pasadas: lista
      .filter((c) => c.momento === "pasada" && (c.ventas ?? 0) > 0)
      .sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "")),
    vienen: lista
      .filter((c) => c.momento === "viene" || c.momento === "en_curso")
      .sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "")),
    sinFechas: lista.filter((c) => c.momento === "sin_fechas"),
  };
}

/** «Día Internacional del Gato» → «Día del Gato» (el eje del gráfico es angosto, como en el spike). */
export const nombreEje = (nombre: string) => nombre.replace(/^Día Internacional del /, "Día del ");

/** La frase bajo el gráfico: las que dejaron menos que no hacerlas. Null si todas dejaron más. */
export function fraseCampanasMalas(pasadas: readonly CampanaFila[]): string | null {
  const malas = pasadas.filter((c) => (c.margenExtra ?? 0) < 0);
  if (!malas.length) return null;
  const lift = (c: CampanaFila) => (c.normal ? (c.ventas ?? 0) / c.normal - 1 : null);
  const pct = (x: number | null) =>
    x == null
      ? "—"
      : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100)
          .toFixed(1)
          .replace(".", ",")} %`;
  const enLista = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  const lista = enLista(malas.map((c) => nombreEje(c.nombre)));
  const descuento = malas.reduce((a, c) => a + c.descuento, 0);
  const perdido = -malas.reduce((a, c) => a + (c.margenExtra ?? 0), 0);
  return `${lista} ${malas.length === 1 ? "vendió" : "vendieron"} ${enLista(malas.map((c) => pct(lift(c))))} contra un día normal${
    descuento ? ` y se descontaron ${solesER(descuento)}` : ""
  }: ${malas.length === 1 ? "dejó" : "dejaron"} ${solesER(perdido)} menos que no hacerlas.`;
}

export function csvCampanas(pasadas: readonly CampanaFila[], vienen: readonly CampanaFila[]): string {
  return csvDe([
    ["Campañas que pasaron"],
    ["Campaña", "Desde", "Hasta", "Vendió (sin IGV)", "Normal", "Descuento", "Margen extra"],
    ...pasadas.map((c) => [c.nombre, c.desde ?? "", c.hasta ?? "", c.ventas ?? 0, c.normal ?? 0, c.descuento, c.margenExtra ?? 0]),
    [],
    ["Campañas que vienen"],
    ["Campaña", "Desde", "Hasta", "Descuento %", "Vender más para ganar lo mismo %", "La meta sube %", "Meta (sin IGV)", "Meta normal"],
    ...vienen.map((c) => {
      const e = extraNecesario(c.margenNormalPct, c.descuentoPct);
      return [
        c.nombre,
        c.desde ?? "",
        c.hasta ?? "",
        c.descuentoPct ?? 0,
        e == null || !Number.isFinite(e) ? "" : Math.round(e * 1000) / 10,
        c.metaPct ?? 0,
        c.metaCampana ?? 0,
        c.metaNormal ?? 0,
      ];
    }),
  ]);
}
