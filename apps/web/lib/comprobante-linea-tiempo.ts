import type { CompraResumen } from "./compras-reglas";
import { diaMes, diasEntreFechas } from "./fechas-lima";

// Lo que dibuja el detalle de un comprobante como «línea de tiempo» (ADR-0130): Registrado → Mercadería → Pago,
// con un nodo por hito y un conector entre cada par que se llena hasta el avance REAL. Todo sale de datos que
// `CompraResumen` ya trae; acá no se lee nada ni se inventa un dato: solo se decide qué nodo va verde, cuál
// ámbar y cuánto se llena cada barra.
//
// Vive en `lib/` y no dentro del componente por dos razones: se prueba sin montar nada (vitest), y un Server
// Component (`CompraDetalle`) puede llamarla — si esto viviera en un archivo `"use client"`, Next lanzaría
// «Attempted to call X() from the server but X is on the client». El componente cliente solo recibe el
// resultado, que es un objeto plano y serializable.

export type EstadoNodo = "hecho" | "parcial" | "pendiente";
export type TonoAvance = "verde" | "ambar" | "neutro" | "rojo";

export type NodoLinea = {
  clave: "registrado" | "mercaderia" | "pago";
  titulo: string;
  /** Texto bajo el título: una fecha corta, «3 de 10 u.», «Pendiente»… */
  detalle: string;
  estado: EstadoNodo;
};

export type ConectorLinea = {
  /** 0–1: cuánto del tramo se pinta. */
  avance: number;
  tono: "verde" | "ambar";
};

export type LineaTiempo = {
  nodos: [NodoLinea, NodoLinea, NodoLinea];
  conectores: [ConectorLinea, ConectorLinea];
};

export type EntradaLineaTiempo = Pick<
  CompraResumen,
  "fechaEmision" | "estadoPago" | "estadoRecepcion" | "recibidoCantidad" | "cerradoCantidad" | "facturadoCantidad" | "total" | "pagado" | "notasCredito"
> & {
  /** Fecha de la recepción más reciente (`aaaa-mm-dd`), si hubo. */
  fechaUltimaRecepcion: string | null;
  /** Fecha del pago más reciente (`aaaa-mm-dd`), si hubo. */
  fechaUltimoPago: string | null;
  /** «Hoy» en Lima (`hoyLima()`), pasado de afuera para poder probar cualquier día. */
  hoy: string;
};

/** Una fracción acotada a 0–1; con `total` en cero (o inválido) no hay nada que llenar. */
export function fraccion(parte: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(parte)) return 0;
  return Math.min(1, Math.max(0, parte / total));
}

/** Cuánto de lo facturado ya llegó o se cerró por faltante (lo cerrado no va a llegar: cuenta como resuelto). */
export function avanceRecepcion(c: Pick<CompraResumen, "recibidoCantidad" | "cerradoCantidad" | "facturadoCantidad">): number {
  return fraccion(c.recibidoCantidad + c.cerradoCantidad, c.facturadoCantidad);
}

/** Cuánto del total ya está cubierto: lo pagado más lo que bajaron las notas de crédito (igual que el saldo). */
export function avancePago(c: Pick<CompraResumen, "pagado" | "notasCredito" | "total">): number {
  return fraccion(c.pagado + c.notasCredito, c.total);
}

/** «Hoy», «Ayer» o `dd/mm` — como se rotulan las fechas en las listas de Compras. `—` si no hay fecha. */
export function textoFechaHito(fecha: string | null, hoy: string): string {
  if (!fecha) return "—";
  const dias = diasEntreFechas(fecha, hoy);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return diaMes(fecha);
}

const unidades = (n: number) => n.toLocaleString("es-PE");

/**
 * Los tres nodos y los dos conectores. Reglas:
 *  - Registrado siempre está hecho (el comprobante existe).
 *  - Mercadería: verde si llegó todo, ámbar si llegó algo, vacío si nada. Lo cerrado por faltante cuenta como
 *    algo (ya hubo movimiento) y, si es todo lo que faltaba, la base ya marca `recibida`.
 *  - Pago: verde si está saldado, ámbar si hay un pago parcial, vacío si no se pagó nada.
 *  - Un conector se llena por completo solo cuando su hito está hecho; en un hito a medias se llena el avance
 *    real pero nunca menos de la mitad, para que el ojo lo lea «va en camino» y no como un hilo cortado.
 *    Con el hito vacío el conector queda vacío: no se dibuja un avance que no existe.
 */
export function lineaDeTiempo(e: EntradaLineaTiempo): LineaTiempo {
  const recibida = e.estadoRecepcion === "recibida";
  const algoRecibido = e.recibidoCantidad > 0 || e.cerradoCantidad > 0;
  const parcialRecepcion = !recibida && algoRecibido;
  const pagada = e.estadoPago === "pagada";
  const algoPagado = e.pagado > 0 || e.notasCredito > 0;
  const parcialPago = !pagada && algoPagado;

  const estadoRecepcion: EstadoNodo = recibida ? "hecho" : parcialRecepcion ? "parcial" : "pendiente";
  const estadoPago: EstadoNodo = pagada ? "hecho" : parcialPago ? "parcial" : "pendiente";

  const detalleRecepcion = recibida
    ? e.fechaUltimaRecepcion
      ? textoFechaHito(e.fechaUltimaRecepcion, e.hoy)
      : "Recibida"
    : parcialRecepcion
      ? `${unidades(e.recibidoCantidad)} de ${unidades(e.facturadoCantidad)} u.`
      : "Sin recibir";
  const detallePago = pagada ? (e.fechaUltimoPago ? textoFechaHito(e.fechaUltimoPago, e.hoy) : "Saldado") : parcialPago ? "Parcial" : "Pendiente";

  const tramo = (hecho: boolean, parcial: boolean, avance: number): ConectorLinea =>
    hecho ? { avance: 1, tono: "verde" } : parcial ? { avance: Math.max(0.5, avance), tono: "ambar" } : { avance: 0, tono: "ambar" };

  return {
    nodos: [
      { clave: "registrado", titulo: "Registrado", detalle: textoFechaHito(e.fechaEmision, e.hoy), estado: "hecho" },
      { clave: "mercaderia", titulo: "Mercadería", detalle: detalleRecepcion, estado: estadoRecepcion },
      { clave: "pago", titulo: "Pago", detalle: detallePago, estado: estadoPago },
    ],
    conectores: [tramo(recibida, parcialRecepcion, avanceRecepcion(e)), tramo(pagada, parcialPago, avancePago(e))],
  };
}

/** `dd/mm` si la fecha es de este año; `dd/mm/aaaa` si no (un `02/09` de otro año se leería como de este). `—` sin fecha. */
export function fechaDeCabecera(fecha: string | null, hoy: string): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a === hoy.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

export type DatoCabecera = { texto: string; alerta?: boolean };

/**
 * Los datos de la línea gris bajo el nombre del proveedor en el detalle (prototipo: «RUC 20•••••76 · Emitido 02/09 ·
 * Vence 02/10»), más el destino de la mercadería. Cada dato es un texto corto; el que pide actuar (vencida y sin
 * pagar) lleva `alerta` y se pinta en rojo. Lo que no existe no se dibuja (sin RUC, sin destino).
 */
export function datosCabecera(e: {
  ruc: string | null;
  fechaEmision: string | null;
  condicion: "contado" | "credito";
  fechaVencimiento: string | null;
  /** Ya vencida y con saldo (lo calcula la vista de compras). */
  vencida: boolean;
  /** Nombre de la sede destino; «—» o vacío si ya no existe. */
  destino: string;
  hoy: string;
}): DatoCabecera[] {
  const datos: DatoCabecera[] = [];
  if (e.ruc) datos.push({ texto: `RUC ${e.ruc}` });
  datos.push({ texto: `Emitido ${fechaDeCabecera(e.fechaEmision, e.hoy)}` });
  if (e.condicion === "contado") datos.push({ texto: "Contado" });
  else if (e.vencida) datos.push({ texto: `Venció ${fechaDeCabecera(e.fechaVencimiento, e.hoy)}`, alerta: true });
  else datos.push({ texto: e.fechaVencimiento ? `Vence ${fechaDeCabecera(e.fechaVencimiento, e.hoy)}` : "Al crédito" });
  if (e.destino && e.destino !== "—") datos.push({ texto: `Destino ${e.destino}` });
  return datos;
}

/** El cierre de la línea «Saldo pendiente S/ X · …»: «vence 02/10» o «venció 12/09» (alerta). `null` si no hay nada que añadir (al contado o sin fecha). */
export function complementoDeSaldo(e: {
  condicion: "contado" | "credito";
  fechaVencimiento: string | null;
  vencida: boolean;
  hoy: string;
}): { texto: string; alerta: boolean } | null {
  if (e.condicion !== "credito" || !e.fechaVencimiento) return null;
  const fecha = fechaDeCabecera(e.fechaVencimiento, e.hoy);
  return e.vencida ? { texto: `venció ${fecha}`, alerta: true } : { texto: `vence ${fecha}`, alerta: false };
}

/** El tono de una barra de avance: verde al completarse, ámbar a medias, neutro sin nada; rojo si hay que actuar. */
export function tonoDeAvance(avance: number, opciones: { alerta?: boolean } = {}): TonoAvance {
  if (opciones.alerta) return "rojo";
  if (avance >= 1) return "verde";
  if (avance > 0) return "ambar";
  return "neutro";
}

/** Los ids que aparecieron desde la última vez que se miró la lista (para dar entrada solo a los pagos nuevos). */
export function idsNuevos(vistos: ReadonlySet<string>, ids: readonly string[]): string[] {
  return ids.filter((id) => !vistos.has(id));
}

export type ResumenPago = { tono: "neutro" | "verde" | "ambar" | "rojo"; texto: string };

/**
 * La frase que resume un pago en armado, con el tono que la acompaña (verde = cubre justo, ámbar = falta para el
 * total exacto, rojo = hay que corregir, neutro = queda saldo por pagar). `objetivo` es lo que hay que cubrir;
 * `exacto` dice si la suma debe igualarlo (al contado) o solo no pasarse (crédito y pagos posteriores).
 */
export function resumenDePago(o: {
  objetivo: number;
  suma: number;
  exacto: boolean;
  /** Cuántas líneas de medio hay: con más de una se antepone «Suman S/ X · ». */
  lineas: number;
  saldoFavorUsado?: number;
  saldoFavorDisponible?: number;
  formato: (n: number) => string;
}): ResumenPago {
  const dif = Math.round((o.objetivo - o.suma) * 100) / 100;
  const suman = o.lineas > 1 ? `Suman ${o.formato(o.suma)} · ` : "";
  const favorUsado = o.saldoFavorUsado ?? 0;
  const favorDisponible = o.saldoFavorDisponible ?? 0;
  if (dif < 0) return { tono: "rojo", texto: `${suman}Se pasa por ${o.formato(-dif)}.` };
  if (favorUsado > favorDisponible + 0.005) return { tono: "rojo", texto: `Usas ${o.formato(favorUsado)} de saldo a favor y solo tienes ${o.formato(favorDisponible)}.` };
  if (dif === 0) return { tono: "verde", texto: `${suman}${o.exacto ? "Cubre el total." : "Salda el comprobante."}` };
  if (o.exacto) return { tono: "ambar", texto: `${suman}Falta ${o.formato(dif)} para el total.` };
  return { tono: "neutro", texto: `${suman}Quedarán ${o.formato(dif)} por pagar.` };
}

export type Chispa = { angulo: number; distancia: number; duracion: number; color: 0 | 1 | 2 };

/**
 * Dónde y cuánto viaja cada partícula del destello de «comprobante saldado»: `cantidad` puntos repartidos en
 * círculo, con un poco de desorden. Sobrio a propósito (8–12 partículas, ~700 ms): es una confirmación, no una
 * fiesta. `azar` se inyecta para probarlo con números fijos.
 */
export function chispasDe(cantidad: number, azar: () => number = Math.random): Chispa[] {
  const n = Math.min(12, Math.max(8, Math.round(cantidad)));
  return Array.from({ length: n }, (_, i) => ({
    angulo: (Math.PI * 2 * i) / n + azar() * 0.4,
    distancia: 44 + azar() * 40,
    duracion: 700 + azar() * 150,
    color: (i % 3) as 0 | 1 | 2,
  }));
}
