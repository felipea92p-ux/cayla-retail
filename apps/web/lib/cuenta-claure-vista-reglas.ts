import { soles } from "./compras-reglas";
import {
  cambiosPorRevisar,
  seLeDebeDeFila,
  textoMedioClaure,
  textoOrigenClaure,
  type FilaClaure,
  type GastoClaure,
  type PagoClaure,
  type ResumenClaure,
} from "./cuenta-claure-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE, rediseño de Felipe 2026-10-31 (docs/maquetas/finanzas-claure-rediseno-2026-10/, vista «B+C · Fusión»).
// Lógica pura: no calcula plata nueva. Ordena en un libro (cada movimiento y cuánto se le debía después), reparte lo cobrado por medio, por cuenta
// y por semana, y dice qué pide atención. El saldo sigue saliendo de `resumenClaure`: el libro termina en esa misma cifra (lo comprueba la prueba).

const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- El libro: lo que mueve lo que se le debe, con el saldo después de cada movimiento ----------------------------------------

export type TipoLibro = "cobro" | "dev" | "gasto" | "pago";
export type FiltroLibro = "todo" | TipoLibro;

export type MovimientoLibro = {
  clave: string;
  /** El día (`aaaa-mm-dd`). */
  fecha: string;
  tipo: TipoLibro;
  titulo: string;
  detalle: string;
  /** Cuánto sube (+) o baja (−) lo que se le debe. */
  efecto: number;
  /** Lo que pasó por la cuenta antes de IGV y comisión (lo cobrado, lo pagado, la parte del gasto). */
  bruto: number;
  /** Lo que se le debía después de este movimiento. */
  saldo: number;
};

export const FILTROS_LIBRO: { clave: FiltroLibro; texto: string }[] = [
  { clave: "todo", texto: "Todo" },
  { clave: "cobro", texto: "Cobros" },
  { clave: "dev", texto: "Devoluciones" },
  { clave: "gasto", texto: "Gastos suyos" },
  { clave: "pago", texto: "Pagos" },
];

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El libro, del movimiento más nuevo al más viejo. En un mismo día los cobros van antes que lo que se descuenta. */
export function libroClaure(filas: readonly FilaClaure[], pagos: readonly PagoClaure[], gastos: readonly GastoClaure[]): MovimientoLibro[] {
  type Sin = Omit<MovimientoLibro, "saldo">;
  const l: Sin[] = [];
  filas.forEach((f, i) => {
    if (!f.contado) return;
    const devolucion = f.origen === "devolucion" || f.monto < 0;
    const palabra = devolucion ? (f.nPagos === 1 ? "devolución" : "devoluciones") : f.origen === "cambio" ? (f.nPagos === 1 ? "cambio" : "cambios") : f.nPagos === 1 ? "pago" : "pagos";
    l.push({
      clave: `f-${i}`,
      fecha: f.fecha,
      tipo: devolucion ? "dev" : "cobro",
      titulo: `${textoOrigenClaure(f.origen)} · ${textoMedioClaure(f.medio)}`,
      detalle: `${f.nPagos} ${palabra} · ${f.cuentaNombre ?? "Sin cuenta asignada"}${f.comision === null ? " · sin tarifa" : ""}`,
      efecto: seLeDebeDeFila(f),
      bruto: f.monto,
    });
  });
  pagos.forEach((p) =>
    l.push({
      clave: `p-${p.id}`,
      fecha: p.fecha,
      tipo: "pago",
      titulo: "Pago a CLAURE",
      detalle: ["Desde " + (p.cuentaNombre ?? "—"), p.referencia ? `op. ${p.referencia}` : null, p.registradoPor].filter(Boolean).join(" · "),
      efecto: -p.monto,
      bruto: p.monto,
    }),
  );
  gastos.forEach((g) =>
    l.push({
      clave: `g-${g.gastoId}`,
      fecha: g.fecha,
      tipo: "gasto",
      titulo: g.descripcion || g.categoriaNombre,
      detalle: `CAYLA pagó ${soles(g.montoTotal)} · ${Math.round(g.pct)} % es de CLAURE`,
      efecto: -g.parte,
      bruto: g.parte,
    }),
  );
  l.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === "cobro" ? -1 : 0) - (b.tipo === "cobro" ? -1 : 0));
  let saldo = 0;
  const conSaldo = l.map((m) => {
    saldo = redondear(saldo + m.efecto);
    return { ...m, saldo };
  });
  return conSaldo.reverse();
}

export function filtrarLibro(libro: readonly MovimientoLibro[], filtro: FiltroLibro): MovimientoLibro[] {
  return filtro === "todo" ? [...libro] : libro.filter((m) => m.tipo === filtro);
}

export function contarLibro(libro: readonly MovimientoLibro[], filtro: FiltroLibro): number {
  return filtro === "todo" ? libro.length : libro.filter((m) => m.tipo === filtro).length;
}

/** Los movimientos de una página, agrupados por día (el día más nuevo primero), con cuántos movimientos y qué neto tiene ese día entre TODOS los que se ven con el filtro puesto (no solo los de la página). */
export function agruparPorDia(visibles: readonly MovimientoLibro[], delPeriodo: readonly MovimientoLibro[]): { fecha: string; movimientos: MovimientoLibro[]; total: number; neto: number }[] {
  const dias = new Map<string, MovimientoLibro[]>();
  for (const m of visibles) dias.set(m.fecha, [...(dias.get(m.fecha) ?? []), m]);
  return [...dias.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, movimientos]) => {
      const todos = delPeriodo.filter((m) => m.fecha === fecha);
      return { fecha, movimientos, total: todos.length, neto: redondear(todos.reduce((a, m) => a + m.efecto, 0)) };
    });
}

// ---- Períodos del historial: día, semana, mes o todo ---------------------------------------------------------------------------

export type PeriodoLibro = "dia" | "semana" | "mes" | "todo";
export const PERIODOS_LIBRO: { clave: PeriodoLibro; texto: string }[] = [
  { clave: "dia", texto: "Día" },
  { clave: "semana", texto: "Semana" },
  { clave: "mes", texto: "Mes" },
  { clave: "todo", texto: "Todo" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const aFecha = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const aIso = (d: Date): string => d.toISOString().slice(0, 10);
const sumarDias = (iso: string, n: number): string => {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
};
/** El lunes de la semana de ese día. */
export function lunesDe(iso: string): string {
  return sumarDias(iso, -((aFecha(iso).getUTCDay() + 6) % 7));
}

export function rangoDelPeriodo(periodo: PeriodoLibro, ref: string): { desde: string; hasta: string } {
  if (periodo === "dia") return { desde: ref, hasta: ref };
  if (periodo === "semana") {
    const lunes = lunesDe(ref);
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  if (periodo === "mes") {
    const d = aFecha(ref);
    return { desde: aIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12))), hasta: aIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12))) };
  }
  return { desde: "0000-01-01", hasta: "9999-12-31" };
}

/** «viernes 30 de octubre», con el año aparte si hace falta. */
export function fechaLargaClaure(iso: string): string {
  const d = aFecha(iso);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

export function etiquetaPeriodo(periodo: PeriodoLibro, ref: string): string {
  const { desde, hasta } = rangoDelPeriodo(periodo, ref);
  if (periodo === "dia") return `${fechaLargaClaure(desde)} de ${desde.slice(0, 4)}`;
  if (periodo === "semana") return `${aFecha(desde).getUTCDate()} – ${fechaLargaClaure(hasta)}`;
  if (periodo === "mes") return `${MESES[aFecha(desde).getUTCMonth()]} ${desde.slice(0, 4)}`;
  return "Todo el historial";
}

/** Un día, una semana o un mes atrás (`-1`) o adelante (`1`); nunca más allá de hoy. */
export function moverPeriodo(periodo: PeriodoLibro, ref: string, paso: -1 | 1, hoy: string): string {
  let nueva = ref;
  if (periodo === "dia") nueva = sumarDias(ref, paso);
  else if (periodo === "semana") nueva = sumarDias(ref, 7 * paso);
  else if (periodo === "mes") {
    const d = aFecha(ref);
    nueva = aIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + paso, 1, 12)));
  }
  return nueva > hoy ? hoy : nueva;
}

/** ¿Hay un período después de este? (el que contiene a hoy es el último). */
export function hayPeriodoSiguiente(periodo: PeriodoLibro, ref: string, hoy: string): boolean {
  return periodo !== "todo" && rangoDelPeriodo(periodo, ref).hasta < hoy;
}

export function delPeriodo(libro: readonly MovimientoLibro[], periodo: PeriodoLibro, ref: string): MovimientoLibro[] {
  const { desde, hasta } = rangoDelPeriodo(periodo, ref);
  return libro.filter((m) => m.fecha >= desde && m.fecha <= hasta);
}

// ---- Páginas de 30 o 40 --------------------------------------------------------------------------------------------------------

export const TAMANOS_PAGINA_CLAURE = [30, 40] as const;
export type TamanoPaginaClaure = (typeof TAMANOS_PAGINA_CLAURE)[number];

export type PaginaClaure<T> = { pagina: number; totalPaginas: number; total: number; desde: number; hasta: number; visibles: T[] };
/** Una página de una lista que ya está en memoria (`pagina` empieza en 1 y se acomoda si se pasa del final). */
export function paginarClaure<T>(filas: readonly T[], pagina: number, tamano: number): PaginaClaure<T> {
  const total = filas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const ini = (p - 1) * tamano;
  return { pagina: p, totalPaginas, total, desde: total === 0 ? 0 : ini + 1, hasta: Math.min(ini + tamano, total), visibles: filas.slice(ini, ini + tamano) };
}

// ---- Por dónde entra la plata ---------------------------------------------------------------------------------------------------

export type RepartoMedio = {
  medio: string;
  texto: string;
  /** El token de color del medio (`--color-metodo-…`), el mismo de Ventas. */
  color: string;
  cobrado: number;
  comision: number;
  igv: number;
  /** Cobrado − IGV − comisión, antes de devoluciones, gastos y pagos. */
  paraClaudia: number;
  /** Qué parte de lo cobrado es de este medio (0–100). */
  pct: number;
};

const COLOR_MEDIO: Record<string, string> = {
  yape: "var(--color-metodo-yape)",
  plin: "var(--color-metodo-plin)",
  tarjeta: "var(--color-metodo-tarjeta)",
  qr: "var(--color-metodo-qr)",
  transferencia: "var(--color-metodo-transferencia)",
};

/** Lo cobrado (sin devoluciones) por medio, de mayor a menor. */
export function repartoPorMedio(filas: readonly FilaClaure[]): RepartoMedio[] {
  const por = new Map<string, { cobrado: number; comision: number; igv: number }>();
  for (const f of filas) {
    if (!f.contado || f.monto <= 0) continue;
    const a = por.get(f.medio) ?? { cobrado: 0, comision: 0, igv: 0 };
    a.cobrado += f.monto;
    a.comision += f.comision ?? 0;
    a.igv += f.igv ?? 0;
    por.set(f.medio, a);
  }
  const total = [...por.values()].reduce((s, a) => s + a.cobrado, 0);
  return [...por.entries()]
    .map(([medio, a]) => ({
      medio,
      texto: textoMedioClaure(medio),
      color: COLOR_MEDIO[medio] ?? "var(--color-taupe)",
      cobrado: redondear(a.cobrado),
      comision: redondear(a.comision),
      igv: redondear(a.igv),
      paraClaudia: redondear(a.cobrado - a.comision - a.igv),
      pct: total > 0 ? (a.cobrado / total) * 100 : 0,
    }))
    .sort((a, b) => b.cobrado - a.cobrado || a.texto.localeCompare(b.texto, "es"));
}

export type RepartoCuenta = { nombre: string; monto: number; sinCuenta: boolean; pct: number };

/** Lo cobrado (sin devoluciones) por cuenta de CAYLA donde llegó; «Sin cuenta asignada» al final de su monto, marcada. */
export function repartoPorCuenta(filas: readonly FilaClaure[]): RepartoCuenta[] {
  const por = new Map<string, { monto: number; sin: boolean }>();
  for (const f of filas) {
    if (!f.contado || f.monto <= 0) continue;
    const nombre = f.cuentaNombre ?? "Sin cuenta asignada";
    por.set(nombre, { monto: (por.get(nombre)?.monto ?? 0) + f.monto, sin: f.cuentaNombre === null });
  }
  const mayor = Math.max(0, ...[...por.values()].map((a) => a.monto));
  return [...por.entries()]
    .map(([nombre, a]) => ({ nombre, monto: redondear(a.monto), sinCuenta: a.sin, pct: mayor > 0 ? (a.monto / mayor) * 100 : 0 }))
    .sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es"));
}

export type SemanaClaure = { lunes: string; cobrado: number; pagado: number };

/** Las últimas semanas (por lunes) de lo cobrado y de lo pagado a CLAURE; solo las que tuvieron algo. */
export function semanasClaure(filas: readonly FilaClaure[], pagos: readonly PagoClaure[], cuantas = 6): SemanaClaure[] {
  const por = new Map<string, SemanaClaure>();
  const de = (fecha: string): SemanaClaure => {
    const lunes = lunesDe(fecha);
    const s = por.get(lunes) ?? { lunes, cobrado: 0, pagado: 0 };
    por.set(lunes, s);
    return s;
  };
  for (const f of filas) if (f.contado && f.monto > 0) de(f.fecha).cobrado += f.monto;
  for (const p of pagos) de(p.fecha).pagado += p.monto;
  return [...por.values()]
    .sort((a, b) => a.lunes.localeCompare(b.lunes))
    .slice(-cuantas)
    .map((s) => ({ ...s, cobrado: redondear(s.cobrado), pagado: redondear(s.pagado) }));
}

// ---- Pide tu atención -----------------------------------------------------------------------------------------------------------

/** Pasados estos días sin pagarle, aparece el aviso «Hace N días que no se le paga». Regla propuesta: Felipe aún no fija el umbral. */
export const DIAS_SIN_PAGAR_AVISO = 5;

export type AvisoClaure = {
  clave: "cambios" | "sin-tarifa" | "sin-cuenta" | "sin-pago";
  /** Cuántos cobros, cambios o pagos junta (para «N por revisar»; el aviso de pago atrasado no cuenta). */
  cuantos: number;
  tono: "atencion" | "info";
  /** Una marca corta dentro del círculo del aviso. */
  marca: string;
  titulo: string;
  detalle: string;
  accion: { texto: string; href: string } | { texto: string; pagar: true };
};

/** Cuántos días pasaron entre dos días (`aaaa-mm-dd`). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 864e5);
}

export function avisosClaure(filas: readonly FilaClaure[], pagos: readonly PagoClaure[], r: ResumenClaure, hoy: string, puedePagar: boolean): AvisoClaure[] {
  const a: AvisoClaure[] = [];
  const cambios = cambiosPorRevisar(filas);
  if (cambios.length > 0) {
    const c = cambios[0];
    a.push({
      clave: "cambios",
      cuantos: cambios.length,
      tono: "atencion",
      marca: "⇄",
      titulo: `${plural(cambios.length, "cambio", "cambios")} con prendas de CLAURE por revisar`,
      detalle: `${cambios.length === 1 ? "" : "El último: "}${fechaCortaIso(c.fecha)} · ${soles(c.monto)}. No entra al saldo todavía: un cambio mueve plata sin mover cuentas y falta decidir cómo contarlo.`,
      accion: { texto: cambios.length === 1 ? "Ver el cambio" : "Ver los cambios", href: "/cambios" },
    });
  }
  if (r.sinTarifa > 0)
    a.push({
      clave: "sin-tarifa",
      cuantos: r.sinTarifa,
      tono: "atencion",
      marca: "%",
      titulo: `${plural(r.sinTarifa, "cobro", "cobros")} con tarjeta sin tarifa`,
      detalle: "Su comisión no está en la cuenta: el saldo está de más hasta cargar la tarifa de la máquina.",
      accion: { texto: "Cargar la tarifa", href: "/configuracion?tab=cuentas" },
    });
  const sinCuenta = filas.filter((f) => f.contado && f.monto > 0 && f.cuentaNombre === null).length;
  if (sinCuenta > 0)
    a.push({
      clave: "sin-cuenta",
      cuantos: sinCuenta,
      tono: "info",
      marca: "?",
      titulo: `${plural(sinCuenta, "cobro", "cobros")} sin cuenta asignada`,
      detalle: "Entró plata de CLAURE a un medio que no tiene cuenta en Configuración.",
      accion: { texto: "Asignar la cuenta", href: "/configuracion?tab=cuentas" },
    });
  const ultimo = pagos.reduce<PagoClaure | null>((m, p) => (!m || p.fecha > m.fecha ? p : m), null);
  if (ultimo && puedePagar && r.saldo > 0) {
    const dias = diasEntre(ultimo.fecha, hoy);
    if (dias >= DIAS_SIN_PAGAR_AVISO)
      a.push({
        clave: "sin-pago",
        cuantos: 0,
        tono: "info",
        marca: "S/",
        titulo: `Hace ${dias} días que no se le paga`,
        detalle: `El último pago fue el ${fechaLargaClaure(ultimo.fecha)} (${soles(ultimo.monto)}). Hoy se le deben ${soles(r.saldo)}.`,
        accion: { texto: "Pagar a CLAURE", pagar: true },
      });
  }
  return a;
}

/** «vie 23», como se lee en las listas cortas. */
export function fechaCortaIso(iso: string): string {
  const d = aFecha(iso);
  return `${DIAS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}`;
}

/** «21 sep» para el pie de cada semana. */
export function fechaDiaMes(iso: string): string {
  const d = aFecha(iso);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
}

// ---- Las fichas: cada término de la cuenta abre el historial ya filtrado ------------------------------------------------------

export type TerminoCuenta = { clave: "cobrado" | "devuelto" | "igv" | "comision" | "gastos" | "pagado"; titulo: string; valor: number; detalle: string; filtro: FiltroLibro; punto: "verde" | "ambar" | "neutro" };

export function terminosClaure(r: ResumenClaure, nCobros: number, nGastos: number, nPagos: number): TerminoCuenta[] {
  return [
    { clave: "cobrado", titulo: "Cobrado en tus cuentas", valor: r.cobrado, detalle: `${plural(nCobros, "pago", "pagos")} de prendas de CLAURE`, filtro: "cobro", punto: "verde" },
    { clave: "devuelto", titulo: "Devuelto", valor: r.devuelto, detalle: "reembolsado desde una cuenta de CAYLA", filtro: "dev", punto: "ambar" },
    { clave: "igv", titulo: "IGV (lo paga CAYLA)", valor: r.igv, detalle: "de lo cobrado menos lo devuelto", filtro: "cobro", punto: "neutro" },
    { clave: "comision", titulo: "Comisión del POS", valor: r.comision, detalle: "estimada con la tarifa; la asume CLAURE", filtro: "cobro", punto: "neutro" },
    { clave: "gastos", titulo: "Gastos suyos que pagó CAYLA", valor: r.gastos, detalle: plural(nGastos, "gasto", "gastos"), filtro: "gasto", punto: "neutro" },
    { clave: "pagado", titulo: "Ya pagado", valor: r.pagado, detalle: plural(nPagos, "pago", "pagos") + " a CLAURE", filtro: "pago", punto: "neutro" },
  ];
}

/** Cuántas cosas faltan revisar (lo que la ficha oscura dice bajo la cifra). */
export function porRevisar(avisos: readonly AvisoClaure[]): number {
  return avisos.reduce((a, x) => a + x.cuantos, 0);
}
