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
export const RPC_COMPRADORES_SIN_RONDA = "fn_compradores_sin_ronda";
export const RPC_TODAS_LAS_COMPRAS = "fn_todas_las_compras";
export const RPC_CERRAR_RONDA_SIN_MOVIMIENTO = "cerrar_ronda_sin_movimiento";

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
  /**
   * Lo que tiene hoy en la mano, de su fondo (`fn_mi_plata_tiene`, 20261126223000): la misma cifra que la persona ve en «Mis compras».
   * Solo con la ronda abierta; `null` en una cerrada (ya hizo su cuenta) o si la base todavía no lo manda.
   */
  tiene: number | null;
  ultimaCompraEn: string | null;
  compras: CompraDelLibro[];
};

/** Quien tiene plata de CAYLA en la mano y todavía no abrió su ronda (`fn_compradores_sin_ronda`). */
export type CompradorSinRonda = { personaId: string; persona: string; tiene: number; ultimaEntrega: string | null };

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
    tiene: texto(o.cerrada_en) ? null : numero(o.tiene),
    ultimaCompraEn: texto(o.ultima_compra_en),
    compras: lista(o.compras).map(leerCompra).filter((v): v is CompraDelLibro => v !== null),
  };
}

/** `null` si la respuesta no es una lista (función vieja o rota): la pantalla dice que no pudo leer, nunca «nadie compra». */
export function leerCompradores(data: unknown): RondaDeCompras[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(leerRonda).filter((r): r is RondaDeCompras => r !== null);
}

/** `null` si la respuesta no es una lista: la pantalla no dibuja el grupo, nunca inventa «nadie más tiene plata». Sin plata a favor, no entra. */
export function leerCompradoresSinRonda(data: unknown): CompradorSinRonda[] | null {
  if (!Array.isArray(data)) return null;
  return data
    .map((x): CompradorSinRonda | null => {
      const o = objeto(x);
      const personaId = texto(o?.persona_id);
      const tiene = numero(o?.tiene);
      if (!o || !personaId || tiene === null || tiene <= 0.005) return null;
      return { personaId, persona: texto(o.persona) ?? "Sin nombre", tiene, ultimaEntrega: texto(o.ultima_entrega) };
    })
    .filter((p): p is CompradorSinRonda => p !== null);
}

export function leerTodasLasCompras(data: unknown): CompraDelLibro[] | null {
  if (!Array.isArray(data)) return null;
  return data.map(leerCompra).filter((c): c is CompraDelLibro => c !== null);
}

// ---------- la cuenta de una ronda, en palabras de tienda ----------

/** Lo que salió de su plata: lo pagado en compras más los gastos (pasajes, bolsas). */
export const gastoDeRonda = (c: CuadernoRonda): number => c.compraste + c.gastaste;
const centimos = (n: number): number => Math.round(n * 100) / 100 || 0; // `|| 0`: nunca «-0»
type CuentaDeRonda = Pick<RondaDeCompras, "cuenta" | "tiene">;
/**
 * Lo que le queda en la mano. Con la ronda abierta es lo que dice su fondo (`tiene`): ahí entra toda la plata, también la que la oficina le
 * entregó sin que ella la anotara y la que traía de antes. Sin ese dato (ronda cerrada, base de antes), lo anotado en la ronda menos lo que
 * salió. Negativo = pagó más de lo que tenía.
 */
export const quedaDeRonda = (r: CuentaDeRonda): number => centimos(r.tiene ?? r.cuenta.dieron - gastoDeRonda(r.cuenta));
/**
 * Lo que tuvo para comprar. Se despeja de lo que le queda, como en «Mis compras» (`resumenRonda`): le queda más lo que gastó, así la cuenta
 * siempre cierra. Sumar solo lo anotado en la ronda dejaba en S/ 0 a quien recibió su plata por «Entregar plata» (Felipe 2026-11-26).
 */
export const dieronDeRonda = (r: CuentaDeRonda): number => (r.tiene === null ? r.cuenta.dieron : centimos(r.tiene + gastoDeRonda(r.cuenta)));
/** Sin plata en la mano, ni a favor ni en contra. Sin el dato, no se sabe y no estorba. */
const sinPlataEnLaMano = (r: Pick<RondaDeCompras, "tiene">): boolean => Math.abs(r.tiene ?? 0) <= 0.005;
export const porRevisarDeRonda = (r: Pick<RondaDeCompras, "compras">): number => r.compras.filter((c) => !c.revisada).length;

export type AvisoDeRonda = { tono: "ambar" | "neutro"; texto: string; cerrarRonda?: true };

/**
 * Lo único que pide atención en una ronda, en una frase. Decisiones de Felipe (2026-11-26): si la plata no cuadra, SOLO se avisa (no se
 * pregunta ni se calcula lo que CAYLA le debe); a los 14 días sin compras, se avisa con «Cerrar su ronda» (nadie la cierra sola).
 */
/**
 * Compras puede cerrar la ronda de otra persona solo si no tiene nada adentro (`cerrar_ronda_sin_movimiento`, 20261126152000): ni plata
 * anotada, ni compras, ni gastos. Es lo que la pantalla ofrece; la base además mira que la persona no tenga plata en la mano.
 */
export const puedeCerrarseDesdeCompras = (r: Pick<RondaDeCompras, "cerradaEn" | "compras" | "cuenta" | "tiene">): boolean =>
  r.cerradaEn === null && r.compras.length === 0 && r.cuenta.dieron === 0 && r.cuenta.gastos === 0 && r.cuenta.compras === 0 && sinPlataEnLaMano(r);

/** La ronda que muestra el detalle de una persona: la pedida por la URL, si es suya; si no, la abierta; si no, la más reciente. */
export function rondaElegida<T extends Pick<RondaDeCompras, "id" | "cerradaEn" | "abiertaEn">>(rondas: readonly T[], pedida: string | null | undefined): T | null {
  const porUrl = pedida ? rondas.find((r) => r.id === pedida) : undefined;
  if (porUrl) return porUrl;
  return rondas.find((r) => r.cerradaEn === null) ?? [...rondas].sort((a, b) => b.abiertaEn.localeCompare(a.abiertaEn))[0] ?? null;
}

export function avisoDeRonda(r: Pick<RondaDeCompras, "cerradaEn" | "abiertaEn" | "ultimaCompraEn" | "cuenta" | "compras" | "tiene">, hoy: string, soles: (n: number) => string): AvisoDeRonda | null {
  const abierta = r.cerradaEn === null;
  const desde = diaLima(r.ultimaCompraEn ?? r.abiertaEn);
  const quieta = desde ? diasEntreFechas(desde, hoy) : 0;
  if (abierta && quieta >= DIAS_RONDA_OLVIDADA) {
    // Vacía, Compras la cierra desde el detalle; con algo adentro, la cierra su dueña desde «Mis compras» (decide qué hace con la plata).
    return r.compras.length === 0 && r.cuenta.dieron === 0 && r.cuenta.gastos === 0 && sinPlataEnLaMano(r)
      ? { tono: "ambar", texto: `Sin compras hace ${quieta} días.`, cerrarRonda: true }
      : { tono: "ambar", texto: `Sin compras nuevas hace ${quieta} días. Pídele que cierre su ronda en «Mis compras».` };
  }
  const queda = quedaDeRonda(r);
  if (queda < -0.005) {
    const de = soles(-queda);
    return { tono: "ambar", texto: dieronDeRonda(r) > 0.005 ? `Pagó ${de} más de lo que le diste.` : `Pagó ${de} sin plata registrada.` };
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
