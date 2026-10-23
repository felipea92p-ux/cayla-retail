import { soles } from "./compras-reglas";
import { campoResponsable, problemaDeMonto, type CuentaOpcion } from "./fondos-reglas";
import type { CampoDeGuia } from "./guia-campos";

// Compras simple (ADR-0480, actividad 2): la plata que anota la compradora y la que confirma Compras. Las reglas puras: leer lo que manda
// la base (que puede venir vieja o rota: nunca se cae, descarta lo ilegible), las cifras de «Tu plata para compras», qué falta en cada
// hoja (lo MISMO que rechazan `anotar_plata_compras` y `confirmar_plata_compras`, 20261022235000: la guía no agrega reglas, ADR-0284) y
// la cuenta que se sugiere al confirmar (Felipe 2026-10-22: el BCP). Sin Supabase: lo importan el servidor y las hojas.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_MI_PLATA = "fn_mi_plata_compras";
export const RPC_PLATA_POR_CONFIRMAR = "fn_plata_por_confirmar";
export const RPC_ANOTAR_PLATA = "anotar_plata_compras";
export const RPC_CONFIRMAR_PLATA = "confirmar_plata_compras";

/** La carpeta de los vouchers dentro del depósito de las fotos de los gastos del viaje (la base exige que la ruta empiece así). */
export const CARPETA_VOUCHERS = "plata/";

export type MedioPlata = "transferencia" | "yape_plin" | "efectivo" | "ya_tenia";

/** Cómo le llegó la plata, en palabras de la tienda, con su ejemplo (lo que se lee en la tarjeta de cada opción). */
export const MEDIOS_PLATA: Record<MedioPlata, { nombre: string; ejemplo: string }> = {
  transferencia: { nombre: "Transferencia", ejemplo: "Te depositaron a tu cuenta" },
  yape_plin: { nombre: "Yape o Plin", ejemplo: "Te yapearon al celular" },
  efectivo: { nombre: "Efectivo", ejemplo: "Te dieron billetes en la mano" },
  ya_tenia: { nombre: "Ya tenía plata", ejemplo: "La que te quedó de antes de usar el sistema" },
};

const esMedio = (v: unknown): v is MedioPlata => typeof v === "string" && v in MEDIOS_PLATA;
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export type PlataAnotada = {
  id: string;
  medio: MedioPlata;
  monto: number;
  montoConfirmado: number | null;
  confirmada: boolean;
  fecha: string;
  creadoEn: string;
  conFoto: boolean;
};

/** Una compra que anotó (ADR-0480, actividad 3): el papel con su proveedor, cuántas prendas y a qué tiendas van. */
export type CompraAnotada = {
  id: string;
  proveedor: string;
  tipo: string;
  monto: number;
  porCompletar: boolean;
  fecha: string;
  prendas: number;
  tiendas: string[];
};

export type MiPlata = {
  /** Sin cuenta de persona (una terminal), no hay «tu plata». */
  persona: boolean;
  /** Lo que tiene su fondo (lo confirmado menos lo que pagó). En negativo, CAYLA le debe. */
  saldo: number;
  /** Lo que anotó y Compras todavía no confirma: ya está en su plata y lo puede usar. */
  porConfirmar: number;
  /** Lo que compró con un papel que Compras todavía no completa: ya bajó de su plata (los libros lo mueven al completarlo). */
  comprasPorCompletar: number;
  /** Lo que tiene para comprar: su fondo más lo por confirmar, menos lo comprado por completar. */
  tiene: number;
  puedeYaTenia: boolean;
  anotada: PlataAnotada[];
  compras: CompraAnotada[];
};

function leerAnotada(x: unknown): PlataAnotada | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = texto(o.id);
  const monto = numero(o.monto);
  if (!id || !esMedio(o.medio) || monto == null) return null;
  return {
    id,
    medio: o.medio,
    monto,
    montoConfirmado: numero(o.monto_confirmado),
    confirmada: o.estado === "confirmada",
    fecha: texto(o.fecha) ?? "",
    creadoEn: texto(o.creado_en) ?? "",
    conFoto: o.con_foto === true,
  };
}

function leerCompra(x: unknown): CompraAnotada | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = texto(o.id);
  const monto = numero(o.monto);
  if (!id || monto == null) return null;
  return {
    id,
    proveedor: texto(o.proveedor) ?? "un proveedor",
    tipo: texto(o.tipo) ?? "",
    monto,
    porCompletar: o.estado === "por_completar",
    fecha: texto(o.fecha) ?? "",
    prendas: Math.max(0, Math.trunc(numero(o.prendas) ?? 0)),
    tiendas: Array.isArray(o.tiendas) ? o.tiendas.filter((t): t is string => typeof t === "string") : [],
  };
}

/** Lo que manda `fn_mi_plata_compras`. Ilegible: sin persona (la pantalla dice que no se pudo leer, no inventa cifras). */
export function leerMiPlata(data: unknown): MiPlata | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.persona !== true) return { persona: false, saldo: 0, porConfirmar: 0, comprasPorCompletar: 0, tiene: 0, puedeYaTenia: false, anotada: [], compras: [] };
  const saldo = numero(o.saldo) ?? 0;
  const porConfirmar = numero(o.por_confirmar) ?? 0;
  const comprasPorCompletar = numero(o.compras_por_completar) ?? 0;
  return {
    persona: true,
    saldo,
    porConfirmar,
    comprasPorCompletar,
    tiene: Math.round((saldo + porConfirmar - comprasPorCompletar) * 100) / 100,
    puedeYaTenia: o.puede_ya_tenia === true,
    anotada: (Array.isArray(o.anotada) ? o.anotada : []).map(leerAnotada).filter((a): a is PlataAnotada => a !== null),
    compras: (Array.isArray(o.compras) ? o.compras : []).map(leerCompra).filter((c): c is CompraAnotada => c !== null),
  };
}

export type PlataPorConfirmar = {
  id: string;
  personaId: string;
  persona: string;
  medio: MedioPlata;
  monto: number;
  fecha: string;
  creadoEn: string;
  fotoRuta: string | null;
  /** Es la plata de quien mira: no la puede confirmar (la base tampoco lo deja). */
  esMia: boolean;
};

/** Lo que manda `fn_plata_por_confirmar`, la más vieja primero. */
export function leerPlataPorConfirmar(data: unknown): PlataPorConfirmar[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x): PlataPorConfirmar | null => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const id = texto(o.id);
      const personaId = texto(o.persona_id);
      const monto = numero(o.monto);
      if (!id || !personaId || !esMedio(o.medio) || monto == null) return null;
      const ruta = texto(o.foto_ruta);
      return {
        id,
        personaId,
        persona: texto(o.persona) ?? "Sin nombre",
        medio: o.medio,
        monto,
        fecha: texto(o.fecha) ?? "",
        creadoEn: texto(o.creado_en) ?? "",
        fotoRuta: ruta && ruta.startsWith(CARPETA_VOUCHERS) ? ruta : null,
        esMia: o.es_mia === true,
      };
    })
    .filter((x): x is PlataPorConfirmar => x !== null);
}

/** Las opciones de «¿Cómo te llegó?»: «Ya tenía plata» solo si todavía puede (la primera vez). */
export function mediosParaAnotar(puedeYaTenia: boolean): MedioPlata[] {
  return puedeYaTenia ? ["transferencia", "yape_plin", "efectivo", "ya_tenia"] : ["transferencia", "yape_plin", "efectivo"];
}

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/** Los campos de «Me dieron plata», en el orden de la hoja. La foto del voucher es opcional: no cuenta como «falta». */
export function camposAnotar(v: { medio: MedioPlata | null; monto: string; conFoto?: boolean }, puedeYaTenia: boolean, r: Responsable): CampoDeGuia[] {
  const medioOk = v.medio !== null && mediosParaAnotar(puedeYaTenia).includes(v.medio);
  const monto = problemaDeMonto(v.monto);
  return [
    { id: "medio", nombre: "Cómo te llegó", requerido: true, hecho: medioOk, pendiente: "Elige cómo te llegó la plata." },
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "foto", nombre: "Foto del voucher", requerido: false, hecho: Boolean(v.conFoto), pendiente: "Si tienes el voucher, súmale su foto." },
    ...campoResponsable({ ...r, quien: "Quién anota" }),
  ];
}

/** Los campos de «Confirmar la plata». «Ya tenía» no sale de ninguna cuenta: solo pide el monto. */
export function camposConfirmar(v: { monto: string; cuentaId: string }, medio: MedioPlata, cuentas: readonly CuentaOpcion[], r: Responsable): CampoDeGuia[] {
  const monto = problemaDeMonto(v.monto);
  const cuentaOk = medio === "ya_tenia" || cuentas.some((c) => c.id === v.cuentaId);
  return [
    { id: "monto", nombre: "Cuánto llegó", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    ...(medio === "ya_tenia" ? [] : [{ id: "cuenta", nombre: "De dónde salió", requerido: true, hecho: cuentaOk, pendiente: "Elige de qué cuenta salió la plata." }]),
    ...campoResponsable({ ...r, quien: "Quién confirma" }),
  ];
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * La cuenta que llega elegida al confirmar (Felipe 2026-10-22: «sugerida la de BCP»): el banco que se llama BCP; si no hay, el primer
 * banco; si no hay bancos, ninguna (la persona elige). Se busca por el nombre porque la cuenta la crea cada empresa en Configuración.
 */
export function cuentaSugerida(cuentas: readonly CuentaOpcion[]): string | null {
  const bancos = cuentas.filter((c) => c.tipo === "banco");
  return (bancos.find((c) => /\bbcp\b/.test(normalizar(c.nombre))) ?? bancos[0])?.id ?? null;
}

/** La frase bajo «Tienes para comprar». En negativo gastó más de lo que anotó: lo que sigue es anotar la plata que le dieron. */
export function detalleTienes(tiene: number): string {
  return tiene < 0
    ? `Gastaste ${soles(-tiene)} más de lo que anotaste: anota en «Me dieron plata» la plata que te dieron.`
    : "Tu plata de compras, lista para usar.";
}

/** El botón de la hoja dice lo que va a pasar: «Anotar S/ 300.00». */
export function fraseAnotar(monto: number | null): string {
  return monto != null && monto > 0 ? `Anotar ${soles(monto)}` : "Anotar la plata";
}

/** «Compras está revisando S/ 500…»: lo que se lee en la tarjeta mientras hay plata por confirmar. */
export function textoPorConfirmar(porConfirmar: number): string | null {
  return porConfirmar > 0 ? `Compras está revisando ${soles(porConfirmar)}: ya están en tu plata y puedes usarlos.` : null;
}

/** Lo que dice una fila de «Lo que anotaste»: el monto y, si Compras confirmó otro, los dos. */
export function textoMontoAnotado(a: Pick<PlataAnotada, "monto" | "montoConfirmado" | "confirmada">): string {
  if (a.confirmada && a.montoConfirmado != null && Math.abs(a.montoConfirmado - a.monto) >= 0.005) {
    return `${soles(a.montoConfirmado)} (anotaste ${soles(a.monto)})`;
  }
  return soles(a.monto);
}
