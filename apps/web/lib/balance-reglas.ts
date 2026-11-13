// Reglas de Finanzas ▸ Reportes ▸ Balance (ADR-0195 F7; retoma ADR-0198). Lógica pura: la usan la pantalla, el modal de
// los saldos de arranque y sus pruebas. Qué NO hace este archivo: calcular plata. El Balance, la comprobación y lo que es de
// cada tienda vienen de la base (`fn_balance_general`, `fn_conciliacion_contable`, `fn_balance_por_tienda`, migración
// 20260925170000); aquí solo se decide si se dibuja, cómo se escribe cada cifra, qué fechas se ofrecen y cómo se arma lo
// que se manda al registrar el arranque. La única cuenta es la del modal: sumar lo que el líder escribe para decirle, antes
// de guardar, si cuadra (la base vuelve a comprobarlo y no deja guardar un arranque que no cuadra).

import { leerMontoPlata } from "./monto-plata-reglas";

type Fila = Record<string, unknown>;
const n = (v: unknown): number => (v == null || v === "" ? 0 : Number(v));
const nulo = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const texto = (v: unknown): string | null => (v == null ? null : String(v));

// ---- Tipos (lo que devuelve la base, ya con números) ----------------------------------------------------------------------

export type EstadoChequeo = "ok" | "nota" | "no_cuadra" | "revisar" | "falta";
export type Causa = { clave: string; texto: string; monto: number; acepta: boolean };
export type Chequeo = {
  orden: number;
  clave: string;
  titulo: string;
  contra: string;
  diario: number | null;
  otro: number | null;
  diferencia: number | null;
  estado: EstadoChequeo;
  bloquea: boolean;
  causas: Causa[];
  arranque: string | null;
  corte: string;
};

export type Seccion = "activo" | "pasivo" | "patrimonio";
export type LineaBalance = { seccion: Seccion; cuenta: string; nombre: string; monto: number; orden: number; detalle: Fila };

export type UnidadBalance = {
  ubicacionId: string;
  nombre: string;
  tipo: "tienda" | "taller";
  /** `null` = una caja abierta que solo ve quien la puede cerrar (ADR-0186). */
  caja: number | null;
  mercaderia: number;
  activosFijos: number;
  activosCosto: number;
  activosDepreciacion: number;
  facturasPorPagar: number;
  invertido: number;
  ventasMes: number;
  utilidadMes: number;
  /** Utilidad del mes ÷ lo invertido (fracción). `null` si no vende o no hay nada invertido. */
  rinde: number | null;
  desde: string;
  hasta: string;
  planillaVisible: boolean;
  /** Lo que `utilidadMes` ya resta de sueldos que Dynamic todavía no paga (tarea 23). */
  sueldosEstimados: number;
};

export type SaldoInicial = {
  id: string;
  fecha: string;
  cuenta: string;
  nombre: string;
  tipo: string;
  monto: number;
  origen: "sistema" | "manual";
  nota: string | null;
  motivo: string | null;
  reemplazaId: string | null;
  vigente: boolean;
  registradoPor: string | null;
  creadoEn: string;
};

export type LineaPropuesta = {
  cuenta: string;
  nombre: string;
  tipo: string;
  /** Lo que el sistema calcula hoy para el día de arranque (o, en las manuales, lo vigente o una sugerencia). */
  monto: number;
  origen: "sistema" | "manual";
  detalle: string;
  /** Lo registrado y vigente, si ya hay arranque. */
  vigente: number | null;
  orden: number;
};

const ESTADOS: readonly EstadoChequeo[] = ["ok", "nota", "no_cuadra", "revisar", "falta"];
const SECCIONES: readonly Seccion[] = ["activo", "pasivo", "patrimonio"];

export function leerChequeo(r: Fila): Chequeo {
  const causas = Array.isArray(r.causas) ? (r.causas as Fila[]) : [];
  return {
    orden: n(r.orden),
    clave: String(r.clave ?? ""),
    titulo: String(r.titulo ?? ""),
    contra: String(r.contra ?? ""),
    diario: nulo(r.diario),
    otro: nulo(r.otro),
    diferencia: nulo(r.diferencia),
    estado: ESTADOS.includes(r.estado as EstadoChequeo) ? (r.estado as EstadoChequeo) : "no_cuadra",
    bloquea: r.bloquea !== false,
    causas: causas.map((c) => ({ clave: String(c.clave ?? ""), texto: String(c.texto ?? ""), monto: n(c.monto), acepta: c.acepta === true })),
    arranque: texto(r.arranque),
    corte: String(r.corte ?? ""),
  };
}

export function leerLinea(r: Fila): LineaBalance {
  return {
    seccion: SECCIONES.includes(r.seccion as Seccion) ? (r.seccion as Seccion) : "activo",
    cuenta: String(r.cuenta ?? ""),
    nombre: String(r.nombre ?? ""),
    monto: n(r.monto),
    orden: n(r.orden),
    detalle: (r.detalle as Fila | null) ?? {},
  };
}

export function leerUnidad(r: Fila): UnidadBalance {
  return {
    ubicacionId: String(r.ubicacion_id ?? ""),
    nombre: String(r.nombre ?? ""),
    tipo: r.tipo === "taller" ? "taller" : "tienda",
    caja: nulo(r.caja),
    mercaderia: n(r.mercaderia),
    activosFijos: n(r.activos_fijos),
    activosCosto: n(r.activos_costo),
    activosDepreciacion: n(r.activos_depreciacion),
    facturasPorPagar: n(r.facturas_por_pagar),
    invertido: n(r.invertido),
    ventasMes: n(r.ventas_mes),
    utilidadMes: n(r.utilidad_mes),
    rinde: nulo(r.rinde),
    desde: String(r.desde ?? ""),
    hasta: String(r.hasta ?? ""),
    planillaVisible: r.planilla_visible === true,
    sueldosEstimados: 0,
  };
}

/**
 * La utilidad de cada tienda con los sueldos que Dynamic todavía no paga, igual que Ganancias y pérdidas (tarea 23). La base da la utilidad del diario; el rinde se vuelve a
 * dividir con la misma regla de `fn_balance_por_tienda` (solo una tienda, con algo invertido, a 4 decimales). Lo de la empresa no es de ninguna tienda: no se le reparte (ADR-0485).
 */
export function unidadesConSueldos(unidades: readonly UnidadBalance[], provision: readonly { ubicacionId: string | null; devengado: number }[]): UnidadBalance[] {
  return unidades.map((u) => {
    const sueldos = provision.reduce((a, p) => (p.ubicacionId === u.ubicacionId && p.devengado > 0 ? a + p.devengado : a), 0);
    if (sueldos <= 0) return u;
    const utilidadMes = Math.round((u.utilidadMes - sueldos) * 100) / 100;
    return {
      ...u,
      utilidadMes,
      rinde: u.tipo === "tienda" && u.invertido > 0 ? Math.round((utilidadMes / u.invertido) * 10000) / 10000 : u.rinde,
      sueldosEstimados: Math.round(sueldos * 100) / 100,
    };
  });
}

export function leerSaldoInicial(r: Fila): SaldoInicial {
  return {
    id: String(r.id ?? ""),
    fecha: String(r.fecha ?? ""),
    cuenta: String(r.cuenta ?? ""),
    nombre: String(r.nombre ?? ""),
    tipo: String(r.tipo ?? ""),
    monto: n(r.monto),
    origen: r.origen === "sistema" ? "sistema" : "manual",
    nota: texto(r.nota),
    motivo: texto(r.motivo),
    reemplazaId: texto(r.reemplaza_id),
    vigente: r.vigente === true,
    registradoPor: texto(r.registrado_por_nombre),
    creadoEn: String(r.creado_en ?? ""),
  };
}

export function leerPropuesta(r: Fila): LineaPropuesta {
  return {
    cuenta: String(r.cuenta ?? ""),
    nombre: String(r.nombre ?? ""),
    tipo: String(r.tipo ?? ""),
    monto: n(r.monto),
    origen: r.origen === "sistema" ? "sistema" : "manual",
    detalle: String(r.detalle ?? ""),
    vigente: nulo(r.vigente),
    orden: n(r.orden),
  };
}

// ---- ¿Se dibuja? ----------------------------------------------------------------------------------------------------------

export type Situacion =
  | { tipo: "sin_arranque" }
  /** La comprobación no se pudo leer (`fn_conciliacion_contable` falló): no se sabe nada del arranque ni de si cuadra (tarea 87 y 157). */
  | { tipo: "sin_comprobar" }
  /** La comprobación respondió sin ninguna fila. La base siempre devuelve al menos el arranque o el corte, así que esto no dice que falte el arranque. */
  | { tipo: "sin_chequeos" }
  | { tipo: "antes_del_arranque"; arranque: string | null }
  | { tipo: "no_cuadra"; bloqueos: Chequeo[] }
  | { tipo: "con_diferencias"; diferencias: Chequeo[] }
  | { tipo: "cuadra"; notas: Chequeo[] };

/**
 * ADR-0619 (corrige a ADR-0198): lo de fondo (el arranque, el diario y que Activo = Pasivo + Patrimonio) decide si hay Balance. Una cuenta que no coincide con su otro camino
 * no lo esconde: sale con un aviso que dice cuál y por cuánto. Antes, S/ 88 sobre S/ 150 mil dejaban a Felipe sin Activo, Pasivo ni Patrimonio.
 */
export function situacion(chequeos: readonly Chequeo[], opciones: { lecturaFallo?: boolean } = {}): Situacion {
  // Una lectura caída llega con los chequeos vacíos: leerla como «falta el arranque» le pedía al líder volver a cargar lo que ya registró.
  if (opciones.lecturaFallo) return { tipo: "sin_comprobar" };
  if (chequeos.some((c) => c.clave === "arranque" && c.estado === "falta")) return { tipo: "sin_arranque" };
  const corte = chequeos.find((c) => c.clave === "corte" && c.estado === "falta");
  if (corte) return { tipo: "antes_del_arranque", arranque: corte.arranque };
  if (!chequeos.length) return { tipo: "sin_chequeos" };
  const bloqueos = chequeos.filter((c) => c.bloquea && (c.estado === "no_cuadra" || c.estado === "falta"));
  if (bloqueos.some((c) => !esCuenta(c))) return { tipo: "no_cuadra", bloqueos };
  if (bloqueos.length) return { tipo: "con_diferencias", diferencias: bloqueos };
  return { tipo: "cuadra", notas: chequeos.filter((c) => c.estado === "nota" || c.estado === "revisar") };
}

/** ¿Hay Balance que dibujar? Sí si cuadra y también con diferencias en una cuenta, con su aviso (ADR-0619). */
export const seDibuja = (s: Situacion) => s.tipo === "cuadra" || s.tipo === "con_diferencias";

/**
 * Lo que dice un archivo o ¿Lo tuyo? cuando el Balance no cuadra del todo (tarea 28): el Excel imprimía la cifra igual y ¿Lo tuyo? la daba sin avisar.
 * `null` si cuadra.
 */
export function avisoBalanceSinCuadrar(chequeos: readonly Chequeo[]): string | null {
  const s = situacion(chequeos);
  if (s.tipo === "cuadra") return null;
  const pendientes = s.tipo === "no_cuadra" ? s.bloqueos : s.tipo === "con_diferencias" ? s.diferencias : null;
  if (s.tipo === "sin_comprobar" || s.tipo === "sin_chequeos") return "No se pudo comprobar si el Balance cuadra: estas cifras pueden cambiar.";
  return pendientes
    ? `No cuadra: el Balance tiene ${pendientes.length === 1 ? "1 comprobación pendiente" : `${pendientes.length} comprobaciones pendientes`} y estas cifras pueden cambiar.`
    : "No cuadra todavía: faltan los saldos de arranque de esta fecha y estas cifras pueden cambiar.";
}

/** Las cuentas se muestran con su código delante («101 Caja…»); las comprobaciones generales, sin él. */
export const esCuenta = (c: Pick<Chequeo, "clave">) => /^\d+$/.test(c.clave);
export const tituloChequeo = (c: Pick<Chequeo, "clave" | "titulo">) => (esCuenta(c) ? `${c.clave} ${c.titulo}` : c.titulo);

/** Lo que se escribe a la derecha de un chequeo: la cifra si cuadra; «a ≠ b» si no; el número de asientos del diario. */
export function cifraChequeo(c: Chequeo): string {
  if (c.estado === "falta") return "falta";
  if (c.clave === "diario") return c.estado === "ok" ? "cuadra" : `${solesBalance(c.diferencia ?? 0)} de diferencia`;
  if (c.diario == null || c.otro == null) return "—";
  // Con una aclaración, cuadra: la cifra es la del diario (la que va al Balance) y la aclaración va debajo.
  if (c.estado === "ok" || c.estado === "nota") return solesBalance(c.diario);
  return `${solesBalance(c.diario)} ≠ ${solesBalance(c.otro)}`;
}

export type IconoChequeo = { signo: string; tono: "verde" | "ambar" | "rojo"; texto: string };
export function iconoChequeo(estado: EstadoChequeo): IconoChequeo {
  if (estado === "ok") return { signo: "✓", tono: "verde", texto: "cuadra" };
  if (estado === "nota") return { signo: "✓", tono: "ambar", texto: "cuadra, con una aclaración" };
  if (estado === "revisar") return { signo: "?", tono: "ambar", texto: "para revisar" };
  return { signo: "!", tono: "rojo", texto: estado === "falta" ? "falta" : "no cuadra" };
}

/** A dónde ir a arreglar cada causa. `accion: "arranque"` = abrir los saldos de arranque en esta misma pantalla. */
export type Enlace = { texto: string; href?: string; accion?: "arranque" };
export function enlaceDeCausa(clave: string): Enlace | null {
  switch (clave) {
    case "sin_clasificar":
    case "no_es_gasto":
      return { texto: "Ir a Egresos por clasificar", href: "/finanzas/gastos?tab=egresos&ver=todas" };
    case "sin_cuenta":
    case "cuenta_nueva":
      return { texto: "Ir a Cuentas y dinero", href: "/finanzas/dinero" };
    case "antes_del_arranque":
      return { texto: "Corregir los saldos de arranque", accion: "arranque" };
    case "produccion":
      return { texto: "Ir a Producción", href: "/produccion" };
    case "igv_comprobantes":
    case "igv_taller":
      return { texto: "Ir a Impuestos", href: "/finanzas/impuestos" };
    default:
      return null;
  }
}

/** Cómo se nombra cada cuenta en la guía, y su otro camino (el spike: «la 421 dice X, pero la suma de las facturas da Y»). */
const QUE_ES: Record<string, [string, string]> = {
  "101": ["caja", "lo que dice cada caja"],
  "104": ["bancos", "el saldo de cada cuenta en Cuentas y dinero"],
  "105": ["tarjeta por abonar", "el POS en Cuentas y dinero"],
  "451": ["tarjeta de crédito", "la tarjeta en Cuentas y dinero"],
  // ADR-0362 fase 6 · actividad 7.
  "1413": ["fondos por rendir", "lo que tiene cada persona en Fondos por rendir"],
  "1419": ["faltantes que debe el personal", "lo que falta pagar de cada rendición con deuda"],
  "201": ["mercaderías", "el stock × costo de cada prenda"],
  "33": ["activos fijos", "la suma de los activos fijos"],
  "421": ["facturas por pagar", "la suma de las facturas"],
  "122": ["adelantos de clientes", "la suma de las separaciones pendientes"],
};


/** Lo que dice la guía cuando el Balance no se dibuja: la primera cuenta que no cuadra, por cuánto y su causa más grande. */
export function motivoNoCuadra(bloqueos: readonly Chequeo[]): { titulo: string; texto: string; causa: Causa | null; enlace: Enlace | null; otros: number } {
  const c = bloqueos[0];
  if (!c) return { titulo: "", texto: "", causa: null, enlace: null, otros: 0 };
  const causa = c.causas.find((x) => x.clave !== "sin_explicar" && !x.acepta) ?? c.causas[0] ?? null;
  let t: string;
  if (c.clave === "diario") {
    t = `${c.contra}. Cada asiento tiene que tener el debe igual al haber; si no, lo que se calcule encima miente.`;
  } else if (c.clave === "arranque") {
    t = `Lo que tenía CAYLA al arrancar suma ${solesBalance(c.diario ?? 0)} y lo que debía más lo tuyo, ${solesBalance(c.otro ?? 0)}.`;
  } else if (c.clave === "ecuacion") {
    t = `Lo que tiene suma ${solesBalance(c.diario ?? 0)} y lo que debe más lo tuyo, ${solesBalance(c.otro ?? 0)}.`;
  } else {
    const [corto, otro] = QUE_ES[c.clave] ?? [c.titulo.toLowerCase(), c.contra.replace(/^contra /, "")];
    t = `La cuenta ${c.clave} (${corto}) dice ${solesBalance(c.diario ?? 0)}, pero ${otro} da ${solesBalance(c.otro ?? 0)}.`;
  }
  return {
    titulo: tituloChequeo(c),
    texto: t,
    causa,
    enlace: causa ? enlaceDeCausa(causa.clave) : null,
    otros: bloqueos.length - 1,
  };
}

// ---- Cómo se escribe ------------------------------------------------------------------------------------------------------

/** «S/ 5,420» y «−S/ 1,778» (el signo menos de verdad), sin céntimos salvo que la cifra sea chica: como el spike. */
export function solesBalance(v: number): string {
  // Siempre con céntimos, como el resto de Estados financieros (Felipe 2026-11-06): antes S/ 147,468 y S/ 25.50 convivían en la misma lista.
  const abs = Math.abs(v);
  const cuerpo = abs.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cero = Math.round(abs * 100) === 0;
  return `${v < 0 && !cero ? "−" : ""}S/\u00a0${cuerpo}`;
}

/**
 * La cifra exacta, con céntimos si los tiene: la que el líder tiene que escribir para que el arranque cuadre. Con
 * `solesBalance` una diferencia de 67,928.73 se leía «S/ 67,929»; quien la copiaba seguía sin poder guardar.
 */
export function solesExactos(v: number): string {
  const centimos = Math.round(Math.abs(v) * 100);
  if (centimos % 100 === 0) return solesBalance(v);
  const cuerpo = (centimos / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}S/\u00a0${cuerpo}`;
}

/** «7,2 % al mes» (coma decimal, como el resto de Reportes). */
export function textoRinde(r: number | null): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${r < 0 ? "−" : ""}${Math.abs(r * 100)
    .toFixed(1)
    .replace(".", ",")} % al mes`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «Al 31 de agosto» · «Hoy, 24 de septiembre» (con el año si no es el de hoy). */
export function tituloCorte(corte: string, hoy: string): string {
  const [a, m, d] = corte.split("-").map(Number);
  const anio = corte.slice(0, 4) === hoy.slice(0, 4) ? "" : ` de ${a}`;
  return `${corte === hoy ? "Hoy," : "Al"} ${d} de ${MESES[m - 1]}${anio}`;
}

/** El nombre de cada línea del Balance como lo lee quien decide (el del spike); si no está, el del plan de cuentas. */
const NOMBRE_LINEA: Record<string, string> = {
  "101": "Caja (cajones, cajas fuertes y lo entregado al líder)",
  "104": "Bancos y billeteras",
  "105": "Tarjeta por abonar",
  "1413": "Fondos por rendir (la plata de quien compra)",
  "1419": "Faltantes que debe el personal",
  "201": "Mercaderías",
  "211": "Productos terminados del Taller",
  "231": "Ropa en proceso en el Taller",
  "241": "Telas e insumos del Taller",
  "332": "Mejoras del local",
  "333": "Máquinas y equipos del Taller",
  "334": "Vehículos",
  "335": "Muebles",
  "336": "Equipos",
  "391": "Depreciación acumulada",
  "4017": "Impuesto a la renta",
  "41": "Planilla por pagar",
  "421": "Facturas por pagar",
  "451": "Tarjeta de crédito",
  "47": "Préstamo del dueño (por devolver)",
  "479": "Por pagar a Claudia (lo cobrado de sus ventas)",
  "4699": "Por liquidar a CLAURE (lo vendido de su mercadería)",
  "122": "Adelantos de clientes",
  "50": "Capital",
  "52": "Aportes del dueño",
  "591": "Resultados acumulados",
};
export function nombreLinea(l: Pick<LineaBalance, "cuenta" | "nombre" | "seccion" | "monto" | "detalle">): string {
  if (l.cuenta === "4011") return l.seccion === "activo" ? "Crédito fiscal de IGV (SUNAT le debe a CAYLA)" : "IGV por pagar";
  if (l.cuenta === "resultado_mes") {
    const desde = String(l.detalle?.desde ?? "");
    const mes = desde ? MESES[Number(desde.slice(5, 7)) - 1] : "el mes";
    return `${l.monto < 0 ? "Pérdida" : "Utilidad"} de ${mes}`;
  }
  if (l.cuenta === MERCADERIA_PAGADA) return nombreMercaderiaPagada(l.detalle);
  if (l.cuenta === MERCADERIA_PAGADA_IGV) return "IGV de esas compras (se descuenta cuando entre la factura)";
  return NOMBRE_LINEA[l.cuenta] ?? l.nombre;
}

/** Las dos líneas calculadas del Balance (ADR-0636): lo que la compradora ya pagó y el libro todavía no ve. No son cuentas del plan. */
export const MERCADERIA_PAGADA = "mercaderia_pagada";
export const MERCADERIA_PAGADA_IGV = "mercaderia_pagada_igv";
const compras = (k: number) => (k === 1 ? "1 compra" : `${k} compras`);
/** «Mercadería pagada, en camino (35 compras)»: dice dónde está, porque ese es el paso que falta (cerrar el conteo o completar el papel). */
function nombreMercaderiaPagada(detalle: Fila | undefined): string {
  const papeles = n(detalle?.papeles);
  const enCamino = n(detalle?.en_camino);
  const enTienda = n(detalle?.en_tienda);
  const cuantas = papeles > 0 ? ` (${compras(papeles)})` : "";
  if (enTienda > 0 && enCamino > 0) return `Mercadería pagada: ${solesExactos(enCamino)} en camino y ${solesExactos(enTienda)} ya en tienda${cuantas}`;
  if (enTienda > 0) return `Mercadería pagada, ya en tienda: falta su papel${cuantas}`;
  return `Mercadería pagada, en camino${cuantas}`;
}
/** El nombre de una cuenta en los saldos de arranque (la ayuda de cada una, p. ej. que el IGV a favor va en negativo, la da la base). */
export function nombreDeCuenta(cuenta: string, nombre: string): string {
  if (cuenta === "4011") return "IGV por pagar";
  return NOMBRE_LINEA[cuenta] ?? nombre;
}

/** El código que se muestra a la izquierda. El resultado del mes y la mercadería pagada (ADR-0636) no son cuentas del plan: van sin código. */
export const cuentaLinea = (l: Pick<LineaBalance, "cuenta">) => (/^\d+$/.test(l.cuenta) ? l.cuenta : "");


export type BalanceAgrupado = {
  tiene: LineaBalance[];
  debe: LineaBalance[];
  tuyo: LineaBalance[];
  totalTiene: number;
  totalDebe: number;
  totalTuyo: number;
};
export function agrupar(lineas: readonly LineaBalance[]): BalanceAgrupado {
  const orden = (a: LineaBalance, b: LineaBalance) => a.orden - b.orden || a.cuenta.localeCompare(b.cuenta);
  const tiene = lineas.filter((l) => l.seccion === "activo").sort(orden);
  const debe = lineas.filter((l) => l.seccion === "pasivo").sort(orden);
  const tuyo = lineas.filter((l) => l.seccion === "patrimonio").sort(orden);
  const suma = (xs: LineaBalance[]) => Math.round(xs.reduce((a, l) => a + l.monto, 0) * 100) / 100;
  return { tiene, debe, tuyo, totalTiene: suma(tiene), totalDebe: suma(debe), totalTuyo: suma(tuyo) };
}

// ---- Fechas del Balance -------------------------------------------------------------------------------------------------


// ---- Los saldos de arranque (el modal) ------------------------------------------------------------------------------------

/** De qué lado del Balance va cada cuenta del arranque. La depreciación acumulada (39x) resta dentro de lo que tiene. */
export function ladoDeCuenta(cuenta: string, tipo: string): "tiene" | "debe" | "tuyo" {
  if (tipo === "activo") return "tiene";
  if (tipo === "pasivo") return "debe";
  return cuenta.startsWith("39") ? "tiene" : "tuyo";
}
export const restaEnLoQueTiene = (cuenta: string) => cuenta.startsWith("39");

export type CuadreArranque = { tiene: number; debe: number; tuyo: number; diferencia: number; cuadra: boolean };
/** Suma lo que se va a registrar para decirle al líder, antes de guardar, si cuadra (la base lo vuelve a comprobar). */
export function cuadreArranque(lineas: readonly { cuenta: string; tipo: string; monto: number }[]): CuadreArranque {
  let tiene = 0;
  let debe = 0;
  let tuyo = 0;
  for (const l of lineas) {
    const lado = ladoDeCuenta(l.cuenta, l.tipo);
    if (lado === "tiene") tiene += restaEnLoQueTiene(l.cuenta) ? -l.monto : l.monto;
    else if (lado === "debe") debe += l.monto;
    else tuyo += l.monto;
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  const diferencia = r(tiene - debe - tuyo);
  return { tiene: r(tiene), debe: r(debe), tuyo: r(tuyo), diferencia, cuadra: Math.abs(diferencia) < 0.005 };
}

/** Un monto escrito por el líder («1,250.50», «648,50», «−300», vacío = 0), con la regla única de `leerMontoPlata`. `null` si no se entiende. */
export function leerMontoArranque(texto: string): number | null {
  // El menos tipográfico (U+2212) se normaliza aquí; los blancos NO se tocan: los decide `leerMontoPlata` con la regla única.
  // Borrarlos antes la dejaba ciega, y un pegado de varias celdas entraba como el saldo de arranque de todo el Balance.
  const limpio = texto.trim().replace(/−/g, "-");
  if (limpio === "" || limpio === "-") return 0;
  return leerMontoPlata(limpio);
}

export type LineaArranque = { cuenta: string; monto: number; origen: "sistema" | "manual"; nota?: string };
/**
 * Lo que se manda a `registrar_saldo_inicial`. La primera vez: todas las líneas del sistema (con lo que calculó) y las
 * que el líder escribió, sin las manuales en cero. Después (una corrección): solo las que cambiaron contra lo vigente.
 */
export function lineasParaRegistrar(
  propuesta: readonly LineaPropuesta[],
  valores: Record<string, number>,
  hayArranque: boolean,
): LineaArranque[] {
  const out: LineaArranque[] = [];
  for (const p of propuesta) {
    const monto = Math.round((valores[p.cuenta] ?? (hayArranque ? (p.vigente ?? 0) : p.monto)) * 100) / 100;
    if (hayArranque) {
      if (monto !== Math.round((p.vigente ?? 0) * 100) / 100) out.push({ cuenta: p.cuenta, monto, origen: p.origen });
    } else if (p.origen === "sistema" || monto !== 0) {
      out.push({ cuenta: p.cuenta, monto, origen: p.origen });
    }
  }
  return out;
}

/** El valor de cada línea en el modal: lo que el líder escribió o, si no tocó nada, lo registrado (o la propuesta). */
export function valoresIniciales(propuesta: readonly LineaPropuesta[], hayArranque: boolean): Record<string, number> {
  return Object.fromEntries(propuesta.map((p) => [p.cuenta, hayArranque ? (p.vigente ?? 0) : p.monto]));
}

/** Las líneas del sistema cuyo cálculo de hoy ya no es lo registrado: algo se registró con fecha anterior al arranque. */
export function cambiosDelSistema(propuesta: readonly LineaPropuesta[]): LineaPropuesta[] {
  return propuesta.filter((p) => p.origen === "sistema" && p.vigente != null && Math.abs(p.monto - p.vigente) >= 0.005);
}

/** El primer día del mes de hoy: la fecha de arranque que se propone la primera vez. */
export const arranquePropuesto = (hoy: string) => `${hoy.slice(0, 7)}-01`;

// ---- Descargar Excel --------------------------------------------------------------------------------------------------------

const celda = (v: string | number) => {
  const s = typeof v === "number" ? v.toFixed(2) : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** El Balance y su comprobación en un CSV separado por «;» (Excel en español lo abre en columnas). */
export function csvBalance(lineas: readonly LineaBalance[], chequeos: readonly Chequeo[], unidades: readonly UnidadBalance[], corte: string): string {
  const filas: (string | number)[][] = [["Balance al", corte], [], ["Sección", "Cuenta", "Concepto", "Monto"]];
  const g = agrupar(lineas);
  const sec = { tiene: "Activo", debe: "Pasivo", tuyo: "Patrimonio" } as const;
  for (const [k, xs] of [["tiene", g.tiene], ["debe", g.debe], ["tuyo", g.tuyo]] as const) {
    for (const l of xs) filas.push([sec[k], cuentaLinea(l), nombreLinea(l), l.monto]);
  }
  if (lineas.length) filas.push([], ["Total activo", "", "", g.totalTiene], ["Total pasivo", "", "", g.totalDebe], ["Total patrimonio", "", "", g.totalTuyo], ["Total pasivo + patrimonio", "", "", g.totalDebe + g.totalTuyo]);
  filas.push([], ["Comprobación", "Contra", "Diario", "Otro camino", "Diferencia", "Estado"]);
  for (const c of chequeos) filas.push([tituloChequeo(c), c.contra, c.diario ?? "", c.otro ?? "", c.diferencia ?? "", iconoChequeo(c.estado).texto]);
  if (unidades.length) {
    filas.push([], ["Lo que es de cada tienda", "Cajón y caja fuerte", "Mercadería", "Muebles (neto)", "Facturas por pagar", "Invertido", "Utilidad del mes", "Rinde"]);
    for (const u of unidades) filas.push([u.nombre, u.caja ?? "", u.mercaderia, u.activosFijos, u.facturasPorPagar, u.invertido, u.utilidadMes, u.rinde == null ? "" : textoRinde(u.rinde)]);
  }
  return `﻿${filas.map((f) => f.map(celda).join(";")).join("\n")}\n`;
}

/**
 * Las cuentas que empiezan después del día de arranque (tarea 4 de «Las 36»). Antes de su `saldo_desde` no tienen plata para el sistema: arrancar antes dejaría
 * esa cuenta en cero y todo lo de ese tramo sin explicar. Se corrige diciendo cuánto tenía ese día en Editar cuenta, o eligiendo un arranque posterior.
 */
export function cuentasQueEmpiezanDespues<T extends { saldoDesde: string | null; archivada: boolean }>(cuentas: readonly T[], fecha: string): T[] {
  return cuentas.filter((c) => !c.archivada && c.saldoDesde !== null && c.saldoDesde > fecha);
}
