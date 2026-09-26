// Reglas puras de «Apartados» (ADR-0166): la clienta aparta prendas con un adelanto, las recoge pagando el saldo, o
// vencen y se le devuelve el adelanto. En pantalla el módulo se llama APARTADOS; en la base, `separaciones` (la tabla
// `apartados` ya es la reserva por prenda de ADR-0141). Sin Supabase ni React: se importan desde el servidor y el
// cliente, y se prueban en `separaciones-reglas.test.ts`. La base vuelve a validar todo; esto solo guía a quien atiende.

import type { MetodoPago } from "@cayla-retail/shared";
import { filtrarPrendasV2, type PrendaBuscableV2 } from "./buscar-prenda-v2";

/** D3 (Felipe, 2026-09-22): 7 días para recoger, aviso cuando faltan 2, 2 días para decidir tras vencer. */
export const PLAZO_DIAS = 7;
export const AVISO_DIAS = 2;
export const GRACIA_DIAS = 2;
export const EXTENSIONES_MAX = 1;
/** SUNAT: una boleta de más de S/700 identifica a la compradora. */
export const TOPE_BOLETA_SIN_DNI = 700;

export type EstadoBase = "abierta" | "entregada" | "liberada" | "devuelta";
export type MedioDevolucion = "yape" | "plin" | "transferencia";
export type MedioDevolucionReal = MedioDevolucion | "efectivo" | "tarjeta";

export type PrendaApartada = { varianteId: string; sku: string; referencia: string; cantidad: number; precioUnitario: number; descuentoUnitario: number };

/** Una fila de `buscar_separaciones`, ya con nombres de TypeScript. */
export type Apartado = {
  id: string;
  codigo: string;
  estado: EstadoBase;
  nombres: string;
  apellidos: string;
  celular: string;
  dni: string | null;
  asesora: string | null;
  total: number;
  adelanto: number;
  saldo: number;
  venceEl: string; // YYYY-MM-DD
  extensiones: number;
  creadaEn: string; // ISO
  devolucionMedio: MedioDevolucion;
  devolucionNumero: string | null;
  devolucionCciFinal: string | null;
  liberadaSola: boolean;
  comprobanteAnticipo: string | null;
  comprobanteFinal: string | null;
  notaCredito: string | null;
  prendas: PrendaApartada[];
  pagos: { metodo: MetodoPago; monto: number }[];
};

/** Estado que VE la colaboradora: se calcula contra la fecha de hoy, nunca se guarda. */
export type ClaveEstado = "vigente" | "porvencer" | "vencida" | "devolver" | "cerrada";
export type EstadoVisible = { clave: ClaveEstado; texto: string };

const DIA_MS = 86_400_000;
/** Días entre dos fechas `YYYY-MM-DD` (b − a), sin husos horarios de por medio. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS);
}
export function sumarDiasIso(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

const soles = (n: number) => `S/${n.toFixed(2)}`;

export function estadoVisible(a: Pick<Apartado, "estado" | "venceEl" | "adelanto">, hoy: string): EstadoVisible {
  if (a.estado === "entregada") return { clave: "cerrada", texto: "Entregado" };
  if (a.estado === "devuelta") return { clave: "cerrada", texto: "Devuelto" };
  if (a.estado === "liberada") return { clave: "devolver", texto: `Devolver ${soles(a.adelanto)}` };
  const falta = diasEntre(hoy, a.venceEl);
  if (falta < 0) {
    const quedan = Math.max(0, GRACIA_DIAS + falta + 1);
    return { clave: "vencida", texto: quedan === 1 ? "Vencido · decide hoy" : `Vencido · decide en ${quedan} días` };
  }
  if (falta <= AVISO_DIAS) return { clave: "porvencer", texto: falta === 0 ? "Vence hoy" : falta === 1 ? "Vence mañana" : `Vence en ${falta} días` };
  return { clave: "vigente", texto: `Quedan ${falta} días` };
}

/** Orden de la lista «Todos»: primero lo que exige una acción hoy. */
export const ORDEN_ESTADO: Record<ClaveEstado, number> = { devolver: 0, vencida: 1, porvencer: 2, vigente: 3, cerrada: 4 };

/** La barra del plazo: 7 tramos de plazo + 2 de gracia. `pasado` ya transcurrió, `hoy` es el día actual. */
export type TramoPlazo = { tipo: "plazo" | "gracia"; momento: "pasado" | "hoy" | "futuro" };
export function tramosDelPlazo(creadaEl: string, hoy: string): TramoPlazo[] {
  const dia = diasEntre(creadaEl, hoy);
  return Array.from({ length: PLAZO_DIAS + GRACIA_DIAS }, (_, i) => ({
    tipo: i < PLAZO_DIAS ? "plazo" : "gracia",
    momento: i < dia ? "pasado" : i === dia ? "hoy" : "futuro",
  }));
}

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Lo que se busca en «Entregar» y en «Todos»: código, nombre, DNI, celular o comprobante. */
export function coincide(a: Apartado, texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (!t) return true;
  const d = soloDigitos(t);
  const sinEspacios = t.replace(/\s+/g, "");
  const nombre = `${a.nombres} ${a.apellidos}`.toLowerCase();
  return (
    nombre.includes(t) ||
    a.codigo.toLowerCase().includes(sinEspacios) ||
    (a.comprobanteAnticipo ?? "").toLowerCase().includes(sinEspacios) ||
    (a.comprobanteFinal ?? "").toLowerCase().includes(sinEspacios) ||
    (d.length >= 6 && (a.dni === d || a.celular === d))
  );
}

// ---------------------------------------------------------------------------
// El formulario de «Apartar»
// ---------------------------------------------------------------------------

// ---------- Buscador de prendas (ADR-0168) ----------

/** Cuántas prendas muestra la lista del buscador: las que caben sin bajar, más un margen. */
export const MAX_RESULTADOS_BUSCADOR = 12;

/**
 * Lo que muestra la lista mientras se escribe: primero lo que se puede apartar AQUÍ, después —atenuado y sin poder
 * elegirse— lo que no tiene disponible, para que la colaboradora sepa que la prenda existe y dónde más hay
 * (decisión de Felipe, 2026-09-22). Mismo criterio de coincidencia que el Punto de venta (`filtrarPrendasV2`).
 * Las agotadas solo ocupan el lugar que dejan las disponibles: nunca empujan fuera una que sí se puede apartar.
 */
export function resultadosDelBuscador<T extends PrendaBuscableV2 & { stockAqui: number }>(
  texto: string,
  prendas: readonly T[],
  max = MAX_RESULTADOS_BUSCADOR,
): { disponibles: T[]; agotadas: T[] } {
  const todas = filtrarPrendasV2(texto, prendas as T[], prendas.length);
  const disponibles = todas.filter((p) => p.stockAqui > 0).slice(0, max);
  const agotadas = todas.filter((p) => p.stockAqui <= 0).slice(0, max - disponibles.length);
  return { disponibles, agotadas };
}

/** Flechas ↑/↓ del buscador: se mueven solo entre las que se pueden elegir y no dan la vuelta (igual que el Punto de venta). */
export function moverActivo(actual: number, paso: 1 | -1, cantidad: number): number {
  if (cantidad <= 0) return 0;
  return Math.min(cantidad - 1, Math.max(0, actual + paso));
}

export type PagoAdelanto = { metodo: MetodoPago; monto: number; recibido?: number };

export type FormularioApartado = {
  nombres: string;
  apellidos: string;
  celular: string;
  dni: string;
  comprobante: "boleta" | "factura";
  ruc: string;
  razonSocial: string;
  /** Quién atendió. `null` cuando no hay a quién elegir (nadie de turno): la base lo guarda vacío. */
  asesoraId: string | null;
  /** Hay chips de «Atendió» y falta tocar uno. */
  faltaAsesora: boolean;
  pagos: PagoAdelanto[];
  devolucionMedio: MedioDevolucion;
  devolucionNumero: string;
  devolucionCci: string;
  acepta: boolean;
};

export type CampoApartado = "nombres" | "apellidos" | "celular" | "dni" | "ruc" | "razonSocial" | "asesora" | "pago" | "devolucion" | "acepta";

export const adelantoDe = (pagos: readonly PagoAdelanto[]) => Math.round(pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0) * 100) / 100;

/** El vuelto de un adelanto: solo el efectivo lo tiene (lo recibido menos lo que se queda). */
export function vueltoDelAdelanto(pagos: readonly PagoAdelanto[]): number {
  return Math.round(pagos.reduce((a, p) => a + (p.metodo === "efectivo" && p.recibido && p.recibido > p.monto ? p.recibido - p.monto : 0), 0) * 100) / 100;
}

/** Por qué no se puede confirmar todavía, campo por campo. Vacío = listo. */
/** Celular de Perú: 9 dígitos que empiezan en 9 (espacios y guiones no cuentan). Yape y Plin usan el mismo número. */
export function esCelularPeru(texto: string): boolean {
  return /^9\d{8}$/.test(soloDigitos(texto));
}

export function erroresDelApartado(f: FormularioApartado, total: number): Partial<Record<CampoApartado, string>> {
  const e: Partial<Record<CampoApartado, string>> = {};
  if (!f.nombres.trim()) e.nombres = "Escribe los nombres.";
  if (!f.apellidos.trim()) e.apellidos = "Escribe los apellidos.";
  // Un celular peruano tiene 9 dígitos y empieza en 9: un fijo o un número a medias no recibe el aviso ni el Yape.
  if (!esCelularPeru(f.celular)) e.celular = "9 dígitos y empieza en 9: por aquí se le avisa y se le devuelve.";
  const dni = soloDigitos(f.dni);
  if (dni && dni.length !== 8) e.dni = "El DNI tiene 8 dígitos.";
  if (!dni && f.comprobante === "boleta" && total > TOPE_BOLETA_SIN_DNI) e.dni = `Pasa de S/${TOPE_BOLETA_SIN_DNI}: la boleta lleva DNI.`;
  if (f.comprobante === "factura") {
    if (!/^(10|20)\d{9}$/.test(soloDigitos(f.ruc))) e.ruc = "RUC de 11 dígitos que empieza en 10 o 20.";
    if (!f.razonSocial.trim()) e.razonSocial = "Escribe la razón social.";
  }
  if (f.faltaAsesora) e.asesora = "Toca a quien atendió.";
  const adelanto = adelantoDe(f.pagos);
  if (f.pagos.length === 0) e.pago = "Elige cómo dejó el adelanto.";
  else if (f.pagos.some((p) => !(p.monto > 0))) e.pago = "Cada medio lleva un monto mayor a cero.";
  else if (adelanto > total) e.pago = "El adelanto no puede pasar el total.";
  else if (f.pagos.some((p) => p.metodo === "efectivo" && p.recibido !== undefined && p.recibido < p.monto)) e.pago = "Lo recibido en efectivo no alcanza.";
  if (f.devolucionMedio === "transferencia") {
    if (soloDigitos(f.devolucionCci).length !== 20) e.devolucion = "El CCI tiene 20 dígitos.";
  } else {
    const num = soloDigitos(f.devolucionNumero);
    if (num && !esCelularPeru(num)) e.devolucion = "El número tiene 9 dígitos y empieza en 9 (vacío = su celular).";
  }
  if (!f.acepta) e.acepta = "Falta que la clienta acepte las condiciones.";
  return e;
}

/** La barra de 3 tramos (clienta → adelanto → devolución), igual que el cobro del Punto de venta. */
export type PasoApartado = 0 | 1 | 2;
export const TEXTO_PASO_APARTADO: Record<PasoApartado, string> = {
  0: "Anota a la clienta y elige quién hace el apartado.",
  1: "Registra cuánto deja de adelanto y cómo.",
  2: "Cómo se le devuelve si no recoge, y que acepte.",
};
export function pasoDelApartado(e: Partial<Record<CampoApartado, string>>): PasoApartado {
  if (e.nombres || e.apellidos || e.celular || e.dni || e.ruc || e.razonSocial || e.asesora) return 0;
  if (e.pago) return 1;
  return 2;
}

/** Los pagos tal como los espera `separar_prendas` (y `entregar_separacion`). */
export function pagosParaRpcApartado(pagos: readonly PagoAdelanto[]): { metodo: MetodoPago; monto: number; recibido?: number }[] {
  return pagos.map((p) =>
    p.metodo === "efectivo" && p.recibido !== undefined && p.recibido > p.monto
      ? { metodo: p.metodo, monto: p.monto, recibido: p.recibido }
      : { metodo: p.metodo, monto: p.monto },
  );
}

/** El saldo al entregar: con Yape/tarjeta se cobra justo; solo el efectivo da vuelto. */
export function cobroDelSaldo(pagos: readonly PagoAdelanto[], saldo: number): { falta: number; vuelto: number; excede: boolean; listo: boolean } {
  const pagado = adelantoDe(pagos);
  const hayEfectivo = pagos.some((p) => p.metodo === "efectivo");
  const falta = Math.max(0, Math.round((saldo - pagado) * 100) / 100);
  const recibidoEfectivo = pagos.reduce((a, p) => a + (p.metodo === "efectivo" ? (p.recibido ?? p.monto) : 0), 0);
  const vuelto = hayEfectivo ? Math.max(0, Math.round((recibidoEfectivo - pagos.find((p) => p.metodo === "efectivo")!.monto) * 100) / 100) : 0;
  const excede = pagado > saldo + 0.001;
  return { falta, vuelto, excede, listo: saldo === 0 || (falta === 0 && !excede && pagos.length > 0) };
}

/** Texto de «cómo se le devuelve», para la boleta y las listas. El CCI nunca se muestra completo. */
export function textoDevolucion(a: Pick<Apartado, "devolucionMedio" | "devolucionNumero" | "devolucionCciFinal">): string {
  if (a.devolucionMedio === "transferencia") return `transferencia · CCI …${a.devolucionCciFinal ?? ""}`;
  const medio = a.devolucionMedio === "yape" ? "Yape" : "Plin";
  return `${medio} ${formatoCelular(a.devolucionNumero ?? "")}`;
}

export const formatoCelular = (c: string) => (c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : c);

/** El mensaje de WhatsApp para recordarle a la clienta (se abre en wa.me: lo envía la persona, no el sistema). */
export function mensajeWhatsapp(a: Pick<Apartado, "nombres" | "codigo" | "venceEl" | "saldo">, tienda: string): string {
  const [y, m, d] = a.venceEl.split("-");
  return `Hola ${a.nombres}, tu apartado ${a.codigo} te espera en CAYLA ${tienda} hasta el ${d}/${m}/${y}. Saldo por pagar: S/${a.saldo.toFixed(2)}.`;
}
export function enlaceWhatsapp(celular: string, mensaje: string): string {
  return `https://wa.me/51${soloDigitos(celular)}?text=${encodeURIComponent(mensaje)}`;
}

/** Normaliza una fila cruda de `buscar_separaciones` (numeric llega como texto desde PostgREST). */
export function apartadoDeFila(f: Record<string, unknown>): Apartado {
  const n = (x: unknown) => Number(x ?? 0);
  const items = Array.isArray(f.items) ? (f.items as Record<string, unknown>[]) : [];
  const pagos = Array.isArray(f.pagos) ? (f.pagos as Record<string, unknown>[]) : [];
  return {
    id: String(f.id),
    codigo: String(f.codigo),
    estado: f.estado as EstadoBase,
    nombres: String(f.clienta_nombres ?? ""),
    apellidos: String(f.clienta_apellidos ?? ""),
    celular: String(f.clienta_celular ?? ""),
    dni: (f.clienta_dni as string | null) ?? null,
    asesora: (f.asesora as string | null) ?? null,
    total: n(f.total),
    adelanto: n(f.adelanto),
    saldo: n(f.saldo),
    venceEl: String(f.vence_el),
    extensiones: n(f.extensiones),
    creadaEn: String(f.creada_en),
    devolucionMedio: f.devolucion_medio as MedioDevolucion,
    devolucionNumero: (f.devolucion_numero as string | null) ?? null,
    devolucionCciFinal: (f.devolucion_cci_final as string | null) ?? null,
    liberadaSola: Boolean(f.liberada_sola),
    comprobanteAnticipo: (f.comprobante_anticipo as string | null) ?? null,
    comprobanteFinal: (f.comprobante_final as string | null) ?? null,
    notaCredito: (f.nota_credito as string | null) ?? null,
    prendas: items.map((i) => ({
      varianteId: String(i.variante_id),
      sku: String(i.sku ?? ""),
      referencia: String(i.referencia ?? ""),
      cantidad: n(i.cantidad),
      precioUnitario: n(i.precio_unitario),
      descuentoUnitario: n(i.descuento_unitario),
    })),
    pagos: pagos.map((p) => ({ metodo: p.metodo as MetodoPago, monto: n(p.monto) })),
  };
}


/** `buscar_separaciones` devuelve como mucho 200 (tope dentro de la función, ordenado: liberados, abiertos, y al final
 *  lo ya cerrado). No se pagina (ADR-0192): la lista es el trabajo del mostrador, no un archivo; el resumen de arriba
 *  sale de `resumen_separaciones`, que cuenta todo. Si llegan justo 200 la pantalla AVISA que hay más en vez de callarlo. */
export const TOPE_SEPARACIONES = 200;
