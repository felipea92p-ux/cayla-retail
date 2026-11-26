import { TIPOS_PAPEL, type TipoPapel } from "./papel-de-compra";
import { leerCuaderno, type CuadernoRonda } from "./revisar-compras-reglas";
import { diasEntreFechas, diaLima } from "./fechas-lima";

// Compras reestructurado (ADR-0704, maqueta docs/maquetas/compras-reestructura-2026-11/, Felipe 2026-11-26). Las reglas puras de las dos
// lecturas nuevas: `fn_compradores` (quién está comprando con plata de CAYLA y en qué la gastó) y `fn_todas_las_compras` (un solo libro:
// lo de «Mis compras» desde que sale en un envío, con su comprobante cuando ya se revisó, y lo que registró la oficina). Leer lo que
// mandan —que puede venir viejo o roto: nunca se cae, descarta lo ilegible— y decir en una frase lo que pide atención en cada ronda.
// Sin Supabase.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_COMPRADORES = "fn_compradores";
export const RPC_TODAS_LAS_COMPRAS = "fn_todas_las_compras";

/** A los cuántos días sin compras una ronda abierta avisa «Cerrar su ronda» (Felipe 2026-11-26: avisa, nadie la cierra sola). */
export const DIAS_RONDA_OLVIDADA = 14;

export type EstadoEnvioCompra = "en_camino" | "abierto" | "cerrado";
export type EnvioDeCompra = { id: string; numero: string; estado: EstadoEnvioCompra; destino: string; salioEn: string };

export type ComprobanteDeCompra = { id: string; documento: string; saldo: number; estadoPago: string };

/** Una compra, venga de «Mis compras» (`origen: "compra"`) o de la oficina (`"comprobante"`): las dos pantallas la leen igual. */
export type CompraDelLibro = {
  id: string;
  origen: "compra" | "comprobante";
  personaId: string | null;
  persona: string | null;
  rondaId: string | null;
  ronda: string | null;
  fecha: string;
  creadoEn: string;
  proveedorId: string;
  proveedor: string;
  proveedorRuc: string | null;
  tipo: TipoPapel | "factura" | "boleta" | "nota_venta" | string;
  monto: number;
  pagado: number;
  medioPago: string | null;
  /** Compras ya pasó su papel a los libros (o es un comprobante de la oficina). */
  revisada: boolean;
  prendas: number;
  comprobante: ComprobanteDeCompra | null;
  envios: EnvioDeCompra[];
};

export type CierreDeRonda = { decision: "devuelve" | "le_deben" | "se_queda" | string; monto: number; resuelto: boolean };

export type RondaDeCompras = {
  id: string;
  texto: string | null;
  personaId: string;
  persona: string;
  abiertaEn: string;
  cerradaEn: string | null;
  cierre: CierreDeRonda | null;
  cuenta: CuadernoRonda;
  ultimaCompraEn: string | null;
  compras: CompraDelLibro[];
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const objeto = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ESTADOS_ENVIO: readonly EstadoEnvioCompra[] = ["en_camino", "abierto", "cerrado"];

function leerEnvio(x: unknown): EnvioDeCompra | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const estado = o?.estado;
  if (!o || !id || !ESTADOS_ENVIO.includes(estado as EstadoEnvioCompra)) return null;
  return { id, numero: texto(o.numero) ?? "", estado: estado as EstadoEnvioCompra, destino: texto(o.destino) ?? "", salioEn: texto(o.salio_en) ?? "" };
}

function leerComprobante(x: unknown): ComprobanteDeCompra | null {
  const o = objeto(x);
  const id = texto(o?.id);
  if (!o || !id) return null;
  return { id, documento: texto(o.documento) ?? "", saldo: numero(o.saldo) ?? 0, estadoPago: texto(o.estado_pago) ?? "" };
}

export function leerCompra(x: unknown): CompraDelLibro | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const fecha = texto(o?.fecha);
  const monto = numero(o?.monto);
  const origen = o?.origen === "comprobante" ? "comprobante" : o?.origen === "compra" ? "compra" : null;
  if (!o || !id || !fecha || monto === null || !origen) return null;
  return {
    id,
    origen,
    personaId: texto(o.persona_id),
    persona: texto(o.persona),
    rondaId: texto(o.ronda_id),
    ronda: texto(o.ronda),
    fecha,
    creadoEn: texto(o.creado_en) ?? fecha,
    proveedorId: texto(o.proveedor_id) ?? "",
    proveedor: texto(o.proveedor) ?? "Proveedor sin nombre",
    proveedorRuc: texto(o.proveedor_ruc),
    tipo: texto(o.tipo) ?? "sin_comprobante",
    monto,
    pagado: numero(o.pagado) ?? 0,
    medioPago: texto(o.medio_pago),
    revisada: o.revisada === true,
    prendas: Math.max(0, Math.trunc(numero(o.prendas) ?? 0)),
    comprobante: leerComprobante(o.comprobante),
    envios: lista(o.envios).map(leerEnvio).filter((e): e is EnvioDeCompra => e !== null),
  };
}

function leerRonda(x: unknown): RondaDeCompras | null {
  const o = objeto(x);
  const id = texto(o?.id);
  const personaId = texto(o?.persona_id);
  const abiertaEn = texto(o?.abierta_en);
  const cuenta = leerCuaderno(o?.cuenta);
  if (!o || !id || !personaId || !abiertaEn || !cuenta) return null;
  const c = objeto(o.cierre);
  return {
    id,
    texto: texto(o.texto),
    personaId,
    persona: texto(o.persona) ?? "Sin nombre",
    abiertaEn,
    cerradaEn: texto(o.cerrada_en),
    cierre: c ? { decision: texto(c.decision) ?? "", monto: numero(c.monto) ?? 0, resuelto: c.resuelto === true } : null,
    cuenta,
    ultimaCompraEn: texto(o.ultima_compra_en),
    compras: lista(o.compras).map(leerCompra).filter((v): v is CompraDelLibro => v !== null),
  };
}

/** `null` si la respuesta no es una lista (función vieja o rota): la pantalla dice que no pudo leer, nunca «nadie compra». */
export function leerCompradores(data: unknown): RondaDeCompras[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(leerRonda).filter((r): r is RondaDeCompras => r !== null);
}

export function leerTodasLasCompras(data: unknown): CompraDelLibro[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(leerCompra).filter((c): c is CompraDelLibro => c !== null);
}

// ---------- la cuenta de una ronda, en palabras de tienda ----------

/** Lo que salió de su plata: lo pagado en compras más los gastos (pasajes, bolsas). */
export const gastoDeRonda = (c: CuadernoRonda): number => c.compraste + c.gastaste;
/** Lo que le queda en la mano: lo que le diste menos lo que salió. Negativo = pagó más de lo que le diste. */
export const quedaDeRonda = (c: CuadernoRonda): number => Math.round((c.dieron - gastoDeRonda(c)) * 100) / 100 || 0; // `|| 0`: nunca «-0»
export const porRevisarDeRonda = (r: Pick<RondaDeCompras, "compras">): number => r.compras.filter((c) => !c.revisada).length;

export type AvisoDeRonda = { tono: "ambar" | "neutro"; texto: string; cerrarRonda?: true };

/**
 * Lo único que pide atención en una ronda, en una frase. Decisiones de Felipe (2026-11-26): si la plata no cuadra, SOLO se avisa (no se
 * pregunta ni se calcula lo que CAYLA le debe); a los 14 días sin compras, se avisa con «Cerrar su ronda» (nadie la cierra sola).
 */
export function avisoDeRonda(r: Pick<RondaDeCompras, "cerradaEn" | "abiertaEn" | "ultimaCompraEn" | "cuenta" | "compras">, hoy: string, soles: (n: number) => string): AvisoDeRonda | null {
  const abierta = r.cerradaEn === null;
  const desde = diaLima(r.ultimaCompraEn ?? r.abiertaEn);
  const quieta = desde ? diasEntreFechas(desde, hoy) : 0;
  if (abierta && quieta >= DIAS_RONDA_OLVIDADA) {
    return { tono: "ambar", texto: r.compras.length === 0 ? `Sin compras hace ${quieta} días.` : `Sin compras nuevas hace ${quieta} días.`, cerrarRonda: true };
  }
  const queda = quedaDeRonda(r.cuenta);
  if (queda < -0.005) {
    const de = soles(-queda);
    return { tono: "ambar", texto: r.cuenta.dieron > 0.005 ? `Pagó ${de} más de lo que le diste.` : `Pagó ${de} sin plata registrada.` };
  }
  if (abierta && r.compras.length === 0) return { tono: "neutro", texto: "Todavía no anota compras." };
  return null;
}

export const nombreDelPapel = (tipo: string): string => (tipo in TIPOS_PAPEL ? TIPOS_PAPEL[tipo as TipoPapel].nombre : tipo);

export type EstadoDeCompra = { tono: "ambar" | "verde"; texto: string };

/** El estado que dice la fila: lo que falta pagar manda; después, si Compras ya la revisó. */
export function estadoDeCompra(c: Pick<CompraDelLibro, "monto" | "pagado" | "revisada" | "comprobante">, soles: (n: number) => string): EstadoDeCompra {
  const falta = c.comprobante ? c.comprobante.saldo : c.monto - c.pagado;
  if (falta > 0.005) return { tono: "ambar", texto: `Falta pagar ${soles(falta)}` };
  return c.revisada ? { tono: "verde", texto: "Revisada" } : { tono: "ambar", texto: "Por revisar" };
}

/** Dónde está la mercadería, por su último envío: «Llegó a Tienda TRU», «Contándose en …», «En camino a …». */
export function llegadaDeCompra(c: Pick<CompraDelLibro, "envios">): string | null {
  const e = c.envios.at(-1);
  if (!e) return null;
  if (e.estado === "cerrado") return `Llegó a ${e.destino}`;
  if (e.estado === "abierto") return `Contándose en ${e.destino}`;
  return `En camino a ${e.destino}`;
}
