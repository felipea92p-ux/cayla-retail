import { diaLima, diaMes, horaLima } from "./fechas-lima";
import { soles } from "./compras-reglas";
import { MONTO_MAXIMO_GASTO, MONTO_MAXIMO_PLATA, campoResponsable, problemaDeMonto, type CuentaOpcion } from "./fondos-reglas";
import type { CampoDeGuia } from "./guia-campos";
import { TIPOS_PAPEL, type TipoPapel } from "./compra-rapida-reglas";

// Compras simple (ADR-0480, actividad 2): la plata que anota la compradora y la que confirma Compras. Las reglas puras: leer lo que manda
// la base (que puede venir vieja o rota: nunca se cae, descarta lo ilegible), las cifras de «Tu plata para compras», qué falta en cada
// hoja (lo MISMO que rechazan `anotar_plata_compras` y `confirmar_plata_compras`, 20261022235000: la guía no agrega reglas, ADR-0284) y
// la cuenta que se sugiere al confirmar (Felipe 2026-10-22: el BCP). Sin Supabase: lo importan el servidor y las hojas.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_MI_PLATA = "fn_mi_plata_compras";
export const RPC_PLATA_POR_CONFIRMAR = "fn_plata_por_confirmar";
export const RPC_ANOTAR_PLATA = "anotar_plata_compras";
export const RPC_CONFIRMAR_PLATA = "confirmar_plata_compras";
// Actividad 5 (20261023114000): el resto del día de compras.
export const RPC_GASTO_RAPIDO = "registrar_gasto_rapido";
export const RPC_MANDAR_A_TIENDA = "mandar_compras_a_tienda";
// Cerrar la ronda (20261023183000): la función conserva su nombre de «Terminé por hoy», al que reemplaza.
export const RPC_TERMINAR_DIA = "terminar_dia_compras";
export const RPC_ABRIR_RONDA = "abrir_ronda_compras";
// «¿De qué banco salió?» (20261026170000): los bancos de la empresa, para quien anota plata por transferencia.
export const RPC_BANCOS_PLATA = "fn_bancos_para_plata_compras";

/** La carpeta de los vouchers dentro del depósito de las fotos de los gastos del viaje (la base exige que la ruta empiece así). */
export const CARPETA_VOUCHERS = "plata/";
/** La carpeta de las fotos de los gastos que no son ropa (la base exige que la ruta empiece así). */
export const CARPETA_GASTOS = "gastos/";

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
  /** La ronda en la que se anotó (20261023183000): «RC-000003». Sin ronda, la de antes de las rondas o fuera de una. */
  rondaId: string | null;
  ronda: string | null;
  conFoto: boolean;
};

/** Una compra que anotó (ADR-0480, actividad 3): el papel con su proveedor, cuántas prendas y a qué tiendas van. */
export type CompraAnotada = {
  id: string;
  proveedor: string;
  tipo: string;
  monto: number;
  /** Lo que pagó de su plata (20261023181000): todo, una parte o nada si se lo dejó a Compras. Sin el dato, todo. */
  pagado: number;
  medioPago: string | null;
  porCompletar: boolean;
  fecha: string;
  creadoEn: string;
  rondaId: string | null;
  ronda: string | null;
  prendas: number;
  tiendas: string[];
  /** Las tiendas a las que todavía no sale algo de esta compra (actividad 5). */
  porMandar: string[];
};

/** En qué gastó, cuando no es ropa (actividad 5). Caben en los conceptos de un gasto del viaje: Compras lo pasa sin preguntar. */
export type ConceptoGasto = "taxi" | "cargador" | "comida" | "envio" | "bolsas" | "otro";

export const CONCEPTOS_GASTO: Record<ConceptoGasto, { nombre: string; ejemplo: string }> = {
  taxi: { nombre: "Taxi", ejemplo: "O mototaxi, o colectivo" },
  cargador: { nombre: "Cargador", ejemplo: "Quien te ayudó a cargar los fardos" },
  comida: { nombre: "Comida", ejemplo: "Tu almuerzo o un refresco" },
  envio: { nombre: "Envío", ejemplo: "La agencia o la encomienda" },
  bolsas: { nombre: "Bolsas", ejemplo: "Bolsas, cinta o rafia para el fardo" },
  otro: { nombre: "Otro", ejemplo: "Escribe en qué gastaste" },
};
const esConcepto = (v: unknown): v is ConceptoGasto => typeof v === "string" && v in CONCEPTOS_GASTO;

export type GastoAnotado = {
  id: string;
  concepto: ConceptoGasto;
  nota: string | null;
  monto: number;
  porCompletar: boolean;
  fecha: string;
  creadoEn: string;
  rondaId: string | null;
  ronda: string | null;
  conFoto: boolean;
};

/** Lo que falta mandar a una tienda: cuántas prendas y de qué compras (actividad 5). */
export type PorMandar = {
  tiendaId: string;
  tienda: string;
  unidades: number;
  prendas: { papelId: string; proveedor: string; nombre: string; cantidad: number }[];
};

export type DecisionCierre = "se_queda" | "devuelve" | "le_deben";

/**
 * El día de hoy en Lima, como lo dice la base («2026-10-23»): separa lo de hoy de lo de antes en la lista y dice desde cuándo va la ronda. Antes
 * traía también lo dado, comprado y gastado de hoy y el cierre del día (de «Terminé de comprar hoy»); desde que todo va por ronda esas cifras
 * viven en `ronda.abierta` y nadie las leía de aquí (auditoría 2026-10-27).
 */
export type Hoy = {
  fecha: string;
};

/**
 * La ronda de compras (20261023183000, Felipe 2026-10-23): la compradora la abre, anota sus compras y gastos y la cierra. Se dice por su
 * serie y número («RC-000003»), nunca «Ronda 3». Lo que lleva lo cuenta la base.
 */
export type RondaAbierta = {
  id: string;
  texto: string;
  abiertaEn: string;
  compras: number;
  prendas: number;
  dieron: number;
  compraste: number;
  gastaste: number;
};
export type RondaCerrada = { texto: string; cerradaEn: string; decision: DecisionCierre; monto: number; resuelto: boolean };
/** Una ronda ya cerrada, para el historial de Mis compras (20261023225000): cuándo fue y cómo cerró. */
export type RondaDeLista = RondaCerrada & { id: string; abiertaEn: string };
/** `cerradas`: las últimas rondas cerradas, la más nueva primero. Sin la migración 20261023225000, vacía. */
export type Rondas = { abierta: RondaAbierta | null; ultimaCerrada: RondaCerrada | null; cerradas?: RondaDeLista[] };

export type MiPlata = {
  /** Sin cuenta de persona (una terminal), no hay «tu plata». */
  persona: boolean;
  /** Lo que tiene su fondo (lo confirmado menos lo que pagó). En negativo, CAYLA le debe. */
  saldo: number;
  /** Lo que anotó y Compras todavía no confirma: ya está en su plata y lo puede usar. */
  porConfirmar: number;
  /** Lo que compró con un papel que Compras todavía no completa: ya bajó de su plata (los libros lo mueven al completarlo). */
  comprasPorCompletar: number;
  /** Lo que gastó en otras cosas y Compras todavía no revisa: también ya bajó. */
  gastosPorCompletar: number;
  /** Lo que tiene para comprar: su fondo más lo por confirmar, menos lo comprado y lo gastado por completar. */
  tiene: number;
  puedeYaTenia: boolean;
  anotada: PlataAnotada[];
  compras: CompraAnotada[];
  gastos: GastoAnotado[];
  porMandar: PorMandar[];
  hoy: Hoy;
  ronda: Rondas;
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
    rondaId: texto(o.ronda_id),
    ronda: texto(o.ronda),
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
    rondaId: texto(o.ronda_id),
    ronda: texto(o.ronda),
    pagado: numero(o.pagado) ?? monto,
    medioPago: texto(o.medio_pago),
    porCompletar: o.estado === "por_completar",
    fecha: texto(o.fecha) ?? "",
    creadoEn: texto(o.creado_en) ?? "",
    prendas: Math.max(0, Math.trunc(numero(o.prendas) ?? 0)),
    tiendas: textos(o.tiendas),
    porMandar: textos(o.por_mandar),
  };
}

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []);

function leerGasto(x: unknown): GastoAnotado | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = texto(o.id);
  const monto = numero(o.monto);
  if (!id || !esConcepto(o.concepto) || monto == null) return null;
  return {
    id,
    concepto: o.concepto,
    nota: texto(o.nota),
    monto,
    porCompletar: o.estado === "por_completar",
    fecha: texto(o.fecha) ?? "",
    creadoEn: texto(o.creado_en) ?? "",
    rondaId: texto(o.ronda_id),
    ronda: texto(o.ronda),
    conFoto: o.con_foto === true,
  };
}

function leerPorMandar(x: unknown): PorMandar | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const tiendaId = texto(o.tienda_id);
  if (!tiendaId) return null;
  const prendas = (Array.isArray(o.compras) ? o.compras : [])
    .map((c): PorMandar["prendas"][number] | null => {
      if (!c || typeof c !== "object") return null;
      const k = c as Record<string, unknown>;
      const papelId = texto(k.papel_id);
      const cantidad = numero(k.cantidad);
      if (!papelId || cantidad == null || cantidad <= 0) return null;
      return { papelId, proveedor: texto(k.proveedor) ?? "un proveedor", nombre: texto(k.nombre) ?? "Prenda", cantidad: Math.trunc(cantidad) };
    })
    .filter((c): c is PorMandar["prendas"][number] => c !== null);
  if (prendas.length === 0) return null;
  return { tiendaId, tienda: texto(o.tienda) ?? "la tienda", unidades: prendas.reduce((s, p) => s + p.cantidad, 0), prendas };
}

const DECISIONES: readonly DecisionCierre[] = ["se_queda", "devuelve", "le_deben"];

function leerHoy(x: unknown): Hoy {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return { fecha: texto(o.fecha)?.slice(0, 10) ?? "" };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Lo que manda `fn_ronda_compras_de`. Sin el dato (una base de antes de las rondas), ninguna. */
function leerRondas(x: unknown): Rondas {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const a = o.abierta && typeof o.abierta === "object" ? (o.abierta as Record<string, unknown>) : null;
  const c = o.ultima_cerrada && typeof o.ultima_cerrada === "object" ? (o.ultima_cerrada as Record<string, unknown>) : null;
  const id = texto(a?.id);
  const decision = c && DECISIONES.includes(c.decision as DecisionCierre) ? (c.decision as DecisionCierre) : null;
  return {
    abierta:
      a && id
        ? {
            id,
            texto: texto(a.texto) ?? "Tu ronda",
            abiertaEn: texto(a.abierta_en) ?? "",
            compras: Math.max(0, Math.trunc(numero(a.compras) ?? 0)),
            prendas: Math.max(0, Math.trunc(numero(a.prendas) ?? 0)),
            dieron: numero(a.dieron) ?? 0,
            compraste: numero(a.compraste) ?? 0,
            gastaste: numero(a.gastaste) ?? 0,
          }
        : null,
    ultimaCerrada:
      c && decision
        ? { texto: texto(c.texto) ?? "Tu ronda", cerradaEn: texto(c.cerrada_en) ?? "", decision, monto: numero(c.monto) ?? 0, resuelto: c.resuelto === true }
        : null,
    cerradas: (Array.isArray(o.cerradas) ? o.cerradas : []).map(leerRondaDeLista).filter((r): r is RondaDeLista => r !== null),
  };
}

function leerRondaDeLista(x: unknown): RondaDeLista | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const id = texto(o.id);
  const cerradaEn = texto(o.cerrada_en);
  const decision = DECISIONES.includes(o.decision as DecisionCierre) ? (o.decision as DecisionCierre) : null;
  if (!id || !cerradaEn || !decision) return null;
  return { id, texto: texto(o.texto) ?? "Tu ronda", abiertaEn: texto(o.abierta_en) ?? cerradaEn, cerradaEn, decision, monto: numero(o.monto) ?? 0, resuelto: o.resuelto === true };
}

/** Lo que manda `fn_mi_plata_compras`. Ilegible: sin persona (la pantalla dice que no se pudo leer, no inventa cifras). */
export function leerMiPlata(data: unknown): MiPlata | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.persona !== true) {
    return {
      persona: false,
      saldo: 0,
      porConfirmar: 0,
      comprasPorCompletar: 0,
      gastosPorCompletar: 0,
      tiene: 0,
      puedeYaTenia: false,
      anotada: [],
      compras: [],
      gastos: [],
      porMandar: [],
      hoy: leerHoy(null),
      ronda: leerRondas(null),
    };
  }
  // Principio 9: «tienes» se arma con cuatro cifras, y una que no llega NO es cero: mostrar «tienes S/ 330» cuando faltaba restar lo comprado
  // y gastado engaña a quien está en la calle con la plata. `saldo` y `por_confirmar` salen de la primera versión de la función (20261022235000):
  // sin ellas la respuesta está dañada. `compras_por_completar` (20261023005000) y `gastos_por_completar` (20261023114000) vinieron después,
  // pero antes de la ronda (20261023183000): una base que ya manda la `ronda` tiene que mandarlas; si no, es una lectura rota, no un cero.
  const saldo = numero(o.saldo);
  const porConfirmar = numero(o.por_confirmar);
  if (saldo === null || porConfirmar === null) return null;
  const compras = numero(o.compras_por_completar);
  const gastos = numero(o.gastos_por_completar);
  if (o.ronda !== undefined && (compras === null || gastos === null)) return null;
  const comprasPorCompletar = compras ?? 0;
  const gastosPorCompletar = gastos ?? 0;
  return {
    persona: true,
    saldo,
    porConfirmar,
    comprasPorCompletar,
    gastosPorCompletar,
    // La misma cuenta que `fn_mi_plata_tiene` en la base (la que guarda el cierre del día).
    tiene: redondear(saldo + porConfirmar - comprasPorCompletar - gastosPorCompletar),
    puedeYaTenia: o.puede_ya_tenia === true,
    anotada: (Array.isArray(o.anotada) ? o.anotada : []).map(leerAnotada).filter((a): a is PlataAnotada => a !== null),
    compras: (Array.isArray(o.compras) ? o.compras : []).map(leerCompra).filter((c): c is CompraAnotada => c !== null),
    gastos: (Array.isArray(o.gastos) ? o.gastos : []).map(leerGasto).filter((g): g is GastoAnotado => g !== null),
    porMandar: (Array.isArray(o.por_mandar) ? o.por_mandar : []).map(leerPorMandar).filter((t): t is PorMandar => t !== null),
    hoy: leerHoy(o.hoy),
    ronda: leerRondas(o.ronda),
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
  /** La ronda en la que la anotó (20261023210000): «RC-000012». Sin ronda abierta al anotarla, ninguna. */
  ronda: string | null;
  /** El banco de la empresa del que la compradora dijo que salió (20261026170000, solo transferencias). La cuenta de verdad la elige Compras. */
  cuentaIndicadaId: string | null;
  cuentaIndicada: string | null;
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
        ronda: texto(o.ronda),
        cuentaIndicadaId: texto(o.cuenta_indicada_id),
        cuentaIndicada: texto(o.cuenta_indicada),
      };
    })
    .filter((x): x is PlataPorConfirmar => x !== null);
}

/** Los bancos de la empresa que manda `fn_bancos_para_plata_compras`, como las cuentas que ya se eligen de un toque. Lo ilegible se descarta. */
export function leerBancosDePlata(data: unknown): CuentaOpcion[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((x): CuentaOpcion | null => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const id = texto(o.id);
      const nombre = texto(o.nombre);
      return id && nombre ? { id, nombre, tipo: "banco", sede: null } : null;
    })
    .filter((x): x is CuentaOpcion => x !== null);
}

/** Las opciones de «¿Cómo te llegó?»: «Ya tenía plata» solo si todavía puede (la primera vez). */
export function mediosParaAnotar(puedeYaTenia: boolean): MedioPlata[] {
  return puedeYaTenia ? ["transferencia", "yape_plin", "efectivo", "ya_tenia"] : ["transferencia", "yape_plin", "efectivo"];
}

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/** Los campos de «Me dieron plata», en el orden de la hoja. La foto del voucher es opcional: no cuenta como «falta». */
export function camposAnotar(
  v: { medio: MedioPlata | null; monto: string; conFoto?: boolean; banco?: string | null; hayBancos?: boolean },
  puedeYaTenia: boolean,
  r: Responsable,
): CampoDeGuia[] {
  const medioOk = v.medio !== null && mediosParaAnotar(puedeYaTenia).includes(v.medio);
  const monto = problemaDeMonto(v.monto, undefined, MONTO_MAXIMO_PLATA);
  return [
    { id: "medio", nombre: "Cómo te llegó", requerido: true, hecho: medioOk, pendiente: "Elige cómo te llegó la plata." },
    // Solo una transferencia sale de un banco; sin bancos configurados no hay nada que elegir y no bloquea.
    ...(v.medio === "transferencia" && v.hayBancos
      ? [{ id: "banco", nombre: "De qué banco salió", requerido: true, hecho: Boolean(v.banco), pendiente: "Elige de qué banco salió la plata." }]
      : []),
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "foto", nombre: "Foto del voucher", requerido: false, hecho: Boolean(v.conFoto), pendiente: "Si tienes el voucher, súmale su foto." },
    ...campoResponsable({ ...r, quien: "Quién anota" }),
  ];
}

/** Los campos de «Confirmar la plata». «Ya tenía» no sale de ninguna cuenta: solo pide el monto. */
export function camposConfirmar(v: { monto: string; cuentaId: string }, medio: MedioPlata, cuentas: readonly CuentaOpcion[], r: Responsable): CampoDeGuia[] {
  const monto = problemaDeMonto(v.monto, undefined, MONTO_MAXIMO_PLATA);
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
  return bancoSugerido(cuentas.filter((c) => c.tipo === "banco"));
}

/** El banco que llega elegido en «¿De qué banco salió?»: el BCP (Felipe 2026-10-22 y 26); si no hay uno con ese nombre, el primero; sin bancos, ninguno. */
export function bancoSugerido(bancos: readonly { id: string; nombre: string }[]): string | null {
  return (bancos.find((c) => /\bbcp\b/.test(normalizar(c.nombre))) ?? bancos[0])?.id ?? null;
}

/**
 * La cuenta con la que llega «Revisar compras» al confirmar: la que indicó la compradora si sigue entre las cuentas que se pueden elegir
 * (puede haberse archivado); si no, la de siempre (el BCP). Compras la puede cambiar: la indicación no mueve plata.
 */
export function cuentaAlConfirmar(fila: Pick<PlataPorConfirmar, "cuentaIndicadaId">, cuentas: readonly CuentaOpcion[]): string {
  const indicada = fila.cuentaIndicadaId;
  return (indicada && cuentas.some((c) => c.id === indicada) ? indicada : cuentaSugerida(cuentas)) ?? "";
}

/** «Marisol dijo que salió del BCP»: lo que ve Compras junto a la cuenta cuando la compradora indicó un banco. */
export function textoBancoIndicado(persona: string, banco: string | null): string | null {
  return banco ? `${persona} dijo que salió de ${banco}.` : null;
}

/**
 * La nota bajo «Tienes para comprar» cuando la cifra es negativa (maqueta mis-compras-rediseno-2026-10): puso plata de su bolsillo. Dice qué
 * hacer y qué pasa si no hace nada. Con plata a favor, nada: la cifra y la cuenta de abajo ya lo dicen.
 */
export function detalleTienes(tiene: number): string | null {
  return tiene < 0 ? `Pusiste ${soles(-tiene)} de tu bolsillo. Si te dieron más plata, anótala; si no, Compras te lo devuelve al cerrar.` : null;
}

/** El botón de la hoja dice lo que va a pasar: «Anotar S/ 300.00». */
export function fraseAnotar(monto: number | null): string {
  return monto != null && monto > 0 ? `Anotar ${soles(monto)}` : "Anotar la plata";
}

/** «S/ 500 que anotaste · Compras lo revisa…»: lo que se lee dentro de la billetera mientras hay plata por confirmar (maqueta 2026-10-23). */
export function textoPorConfirmar(porConfirmar: number): string | null {
  return porConfirmar > 0 ? `${soles(porConfirmar)} que anotaste · Compras lo revisa, ya lo puedes usar` : null;
}

/** Lo que dice una fila de «Lo que anotaste»: el monto y, si Compras confirmó otro, los dos. */
export function textoMontoAnotado(a: Pick<PlataAnotada, "monto" | "montoConfirmado" | "confirmada">): string {
  if (a.confirmada && a.montoConfirmado != null && Math.abs(a.montoConfirmado - a.monto) >= 0.005) {
    return `${soles(a.montoConfirmado)} (anotaste ${soles(a.monto)})`;
  }
  return soles(a.monto);
}

// ---------- Actividad 5: el resto del día de compras ----------

/** Los campos de «Gasté en otra cosa», en el orden de la hoja: qué fue (con «Otro», escrito), cuánto y la foto (opcional). */
export function camposGasto(v: { concepto: ConceptoGasto | null; nota: string; monto: string; conFoto?: boolean }): CampoDeGuia[] {
  const monto = problemaDeMonto(v.monto, undefined, MONTO_MAXIMO_GASTO);
  const nota = v.nota.trim();
  return [
    { id: "concepto", nombre: "En qué gastaste", requerido: true, hecho: v.concepto !== null, pendiente: "Elige en qué gastaste." },
    ...(v.concepto === "otro"
      ? [{ id: "nota", nombre: "Qué fue", requerido: true, hecho: nota.length > 0 && nota.length <= 120, pendiente: nota.length > 120 ? "Escríbelo más corto: hasta 120 letras." : "Escribe en qué gastaste." }]
      : []),
    { id: "monto", nombre: "Cuánto", requerido: true, hecho: monto === null, pendiente: monto ?? "" },
    { id: "foto", nombre: "Foto del papel", requerido: false, hecho: Boolean(v.conFoto), pendiente: "Si te dieron un papel, súmale su foto." },
  ];
}

/** Cómo se lee un gasto en la lista: «Taxi», o lo que escribió con «Otro». */
export function nombreGasto(g: Pick<GastoAnotado, "concepto" | "nota">): string {
  return g.concepto === "otro" ? (g.nota ?? CONCEPTOS_GASTO.otro.nombre) : CONCEPTOS_GASTO[g.concepto].nombre;
}

/** El botón de la hoja dice lo que va a pasar: «Anotar S/ 18.00». */
export function fraseGasto(monto: number | null): string {
  return monto != null && monto > 0 ? `Anotar ${soles(monto)}` : "Anotar el gasto";
}

/**
 * ¿Se puede cerrar la ronda? No mientras falte mandar prendas a una tienda (Felipe 2026-10-26, mirando la maqueta mis-compras-rediseno-2026-10:
 * «bloquear el cierre si falta mandar»; hasta entonces se podía cerrar y mandar al día siguiente). Es la regla de la pantalla: la RPC
 * `terminar_dia_compras` no la exige, así que no cambia nada en la base.
 */
export function puedeCerrarLaRonda(porMandar: readonly PorMandar[]): boolean {
  return !porMandar.some((t) => t.unidades > 0);
}

/** El aviso con el que «Cerrar mi ronda» le pide a «Mandar a la tienda» que se abra (están en celdas distintas de la pantalla). */
export const EVENTO_MANDAR = "cayla:mandar-a-tienda";

/** Las prendas de una tienda, juntas por compra: «Blusa Emma ×6 · Polo Tito ×4». */
export function resumenPrendas(prendas: PorMandar["prendas"], maximo = 3): string {
  const partes = prendas.slice(0, maximo).map((p) => `${p.nombre} ×${p.cantidad}`);
  return prendas.length > maximo ? `${partes.join(" · ")} y ${prendas.length - maximo} más` : partes.join(" · ");
}

/**
 * «Cerrar mi ronda» como un cuaderno: lo que tenía al abrirla + lo que le dieron en ella − lo que compró − lo que gastó = lo que le queda.
 * Lo de antes no viene de la base: se despeja de lo que tiene ahora, así las cuentas siempre cierran. Sin ronda abierta, todo es «de antes».
 */
export function resumenRonda(plata: Pick<MiPlata, "tiene" | "ronda">) {
  const { dieron = 0, compraste = 0, gastaste = 0, compras = 0 } = plata.ronda.abierta ?? {};
  return { antes: redondear(plata.tiene - dieron + compraste + gastaste), dieron, compraste, gastaste, compras, queda: plata.tiene };
}

/** Junto al título de «En esta ronda»: «desde hoy 08:30» o «desde el 23/10 08:30» (hora y día de Lima). Sin el instante, nada. */
export function desdeRonda(abiertaEn: string, hoy: string): string | null {
  const dia = diaLima(abiertaEn);
  const hora = horaLima(abiertaEn);
  if (!dia || !hora) return null;
  return `desde ${dia === hoy ? "hoy" : `el ${diaMes(dia)}`} ${hora}`;
}

/** La hora de Lima a la que anotó algo (24 h, «09:15»), para la fila de la lista. Sin el instante, nada: no se inventa. */
export function horaDeMovimiento(m: Pick<MovimientoCompradora, "creadoEn">): string | null {
  return horaLima(m.creadoEn);
}

/**
 * Lo que dice la hoja de una fila de la lista al tocarla (maqueta mis-compras-rediseno-2026-10): qué hará Compras con lo que anotó, o
 * que ya lo hizo. Es el mismo estado que el chip de la fila, dicho completo; no agrega reglas.
 */
export function queHaraCompras(m: Pick<MovimientoCompradora, "tipo" | "estado">): string {
  if (!m.estado.pendiente) return m.estado.detalle;
  if (m.tipo === "compra") return "Compras copia el número del papel y la completa. Si algo no cuadra, te avisa. Mientras tanto, lo que pagaste ya bajó de tu plata.";
  if (m.tipo === "plata") return "Compras mira tu voucher y la confirma con su banco o su caja. Mientras tanto ya la puedes usar.";
  return "Compras lo revisa y lo pasa a los gastos del viaje. Mientras tanto ya bajó de tu plata.";
}

/** Qué se puede elegir al terminar: con plata, quedársela o devolverla; sin plata, nada; en negativo, CAYLA le debe (sin elegir). */
export function decisionesCierre(tiene: number): DecisionCierre[] {
  if (tiene < 0) return ["le_deben"];
  if (tiene === 0) return ["se_queda"];
  return ["se_queda", "devuelve"];
}

/** Lo que dice el sello después de terminar el día. */
export function textoCierre(cierre: { decision: DecisionCierre; monto: number; resuelto?: boolean }): string {
  // Ya recibido por Compras (actividad 7): lo dice en pasado.
  if (cierre.decision === "devuelve") {
    return cierre.resuelto ? `Entregaste ${soles(cierre.monto)}: Compras ya lo recibió.` : `Entrega ${soles(cierre.monto)} en caja: Compras lo recibe.`;
  }
  if (cierre.decision === "le_deben") {
    return cierre.resuelto ? `CAYLA ya te devolvió los ${soles(cierre.monto)} que pusiste.` : `Pusiste ${soles(cierre.monto)} de tu bolsillo: CAYLA te lo devuelve.`;
  }
  return cierre.monto > 0 ? `Te quedas ${soles(cierre.monto)} para tu próxima compra.` : "No te quedó plata.";
}

/**
 * El estado de lo que anotó la compradora, dicho por quién lo hace (/formidable 2026-10-23, OK de Felipe): «Por completar», «Revisado» o
 * «Por confirmar» no decían quién ni qué faltaba. Pendiente, lo hace Compras; hecho, ya está en los libros.
 */
export function estadoParaLaCompradora(que: "compra" | "gasto" | "plata", pendiente: boolean): { texto: string; detalle: string } {
  if (que === "plata") {
    return pendiente
      ? { texto: "Compras la confirma", detalle: "Ya la puedes usar; Compras mira el voucher y la confirma" }
      : { texto: "Confirmada", detalle: "Compras ya la confirmó: está en tu fondo" };
  }
  const la = que === "compra" ? "la" : "lo";
  return pendiente
    ? { texto: `Compras ${la} revisa`, detalle: `Ya bajó de tu plata; Compras ${la} pasa a los libros` }
    : { texto: "En los libros", detalle: `Compras ya ${la} pasó a los libros` };
}

// ---------- Rediseño de Mi plata (maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23) ----------

/**
 * Las tres columnas bajo la cifra de la billetera: lo que le dieron en la ronda, lo que compró y lo que gastó (maqueta mis-compras-rediseno-
 * 2026-10). Sin ronda abierta no hay nada que contar y no se dibujan. `antes`: lo que ya tenía al abrirla (puede ser negativo); si no es
 * cero, la cifra grande no es la suma de las tres columnas y la billetera lo dice, en vez de dejar una cuenta que no cuadra.
 */
export function cuentaDeLaBilletera(plata: Pick<MiPlata, "tiene" | "ronda">): { dieron: number; compraste: number; gastaste: number; antes: number } | null {
  if (!plata.ronda.abierta) return null;
  const { dieron, compraste, gastaste, antes } = resumenRonda(plata);
  return { dieron, compraste, gastaste, antes };
}

/**
 * La barra bajo la cifra de la billetera (maqueta docs/maquetas/mis-compras-pc-mesa-2026-10/, Felipe 2026-10-28): cuánto de la plata de la
 * ronda ya se usó. La base es lo que tenía para comprar: lo que le dieron más lo que ya tenía al abrir la ronda (si le debían, eso no suma).
 * Lo usado es lo comprado más lo gastado. El porcentaje se redondea HACIA ABAJO: nunca dice que usó más de lo que usó. Sin base (nada dado ni
 * de antes) no hay qué medir y no se dibuja. Pasada de la base, la barra queda llena y la nota de «tienes» dice qué hacer; aquí no se juzga.
 */
export function usoDeLaPlata(cuenta: { dieron: number; compraste: number; gastaste: number; antes: number } | null): { pct: number; usado: number; base: number; texto: string } | null {
  if (!cuenta) return null;
  const base = redondear(cuenta.dieron + Math.max(0, cuenta.antes));
  if (base <= 0.004) return null;
  const usado = redondear(cuenta.compraste + cuenta.gastaste);
  const deQue = cuenta.antes > 0.004 ? "lo que tenías" : "lo que te dieron";
  const pct = Math.min(100, Math.max(0, Math.floor((usado / base) * 100)));
  const texto =
    usado <= 0.004 ? `Todavía no usas nada de ${deQue}` : usado >= base - 0.004 ? `Ya usaste todo ${deQue}` : pct < 1 ? `Usaste menos del 1 % de ${deQue}` : `Usaste el ${pct} % de ${deQue}`;
  return { pct, usado, base, texto };
}

/** Los cuatro tramos del camino de una ronda, en el orden en que se hacen (maqueta mis-compras-rediseno-2026-10). */
export const PASOS_DE_LA_RONDA = ["Abre tu ronda", "Anota", "Manda", "Ciérrala"] as const;

/**
 * En cuál de los cuatro pasos va: 0 sin ronda abierta; 2 («Manda») mientras haya prendas por mandar; 3 («Ciérrala») con compras anotadas y
 * nada por mandar; 1 («Anota») en todo lo demás. Los anteriores se pintan hechos. No agrega reglas: sale de lo que la pantalla ya sabe.
 */
export function pasoDeLaRonda(plata: Pick<MiPlata, "ronda" | "porMandar">): 0 | 1 | 2 | 3 {
  const abierta = plata.ronda.abierta;
  if (!abierta) return 0;
  if (plata.porMandar.some((t) => t.unidades > 0)) return 2;
  return abierta.compras > 0 ? 3 : 1;
}

/** La franja de lo que falta mandar: «Falta mandar 37 prendas» y, debajo, cuántas a cada tienda («LIM 7 · AQP 30»). Sin nada, nada. */
export function textoFaltaMandar(porMandar: readonly PorMandar[]): { titulo: string; detalle: string } | null {
  const conPrendas = porMandar.filter((t) => t.unidades > 0);
  const unidades = conPrendas.reduce((s, t) => s + t.unidades, 0);
  if (unidades === 0) return null;
  return {
    titulo: `Falta mandar ${unidades === 1 ? "1 prenda" : `${unidades} prendas`}`,
    detalle: conPrendas.map((t) => `${siglaTienda(t.tienda)} ${t.unidades}`).join(" · "),
  };
}

/** Una fila de «Hoy»: una compra, un gasto o una plata que le dieron, con su ícono, su monto con signo y su estado. */
export type MovimientoCompradora = {
  clave: string;
  tipo: "compra" | "gasto" | "plata";
  /** Qué ícono lleva: la bolsa de una compra, el de cada concepto de gasto, las monedas de la plata. */
  icono: "compra" | "plata" | ConceptoGasto;
  titulo: string;
  detalle: string;
  /** El detalle de la lista: el de arriba SIN lo que ya dice `envio` (en la lista va como chip; en la hoja de la fila, completo). */
  resumen: string;
  /** Solo una compra: si falta mandar a una tienda (ámbar) o ya salió con su código (verde). Es lo que la compradora tiene que hacer o ya hizo. */
  envio: { texto: string; tono: "ambar" | "verde" } | null;
  /** La plata que entra suma (+, en verde); la que sale resta (−). */
  entra: boolean;
  monto: string;
  /** El mismo monto, en número (sin signo): lo que suma una ronda en el historial. */
  valor: number;
  estado: { texto: string; detalle: string; pendiente: boolean };
  fecha: string;
  creadoEn: string;
  rondaId: string | null;
  ronda: string | null;
};

const TITULO_PLATA: Record<MedioPlata, string> = {
  transferencia: "Te transfirieron",
  yape_plin: "Te yapearon",
  efectivo: "Te dieron efectivo",
  ya_tenia: "Plata que ya tenías",
};

function detalleCompra(c: CompraAnotada, codigos: ReadonlyMap<string, readonly string[]>): { detalle: string; resumen: string; envio: MovimientoCompradora["envio"] } {
  const papel = TIPOS_PAPEL[c.tipo as TipoPapel]?.nombre ?? "Papel";
  const prendas = c.prendas === 1 ? "1 prenda" : `${c.prendas} prendas`;
  // Ya enviada, lo que se busca es el código para avisar a la tienda («enviada · ENV-000118»); sin código (no se pudo leer «Mis envíos»), las tiendas.
  const enviada = codigos.get(c.id);
  const faltaMandar = c.porMandar.length > 0 ? `falta mandar a ${c.porMandar.join(", ")}` : null;
  const yaSalio = !faltaMandar && enviada?.length ? `enviada · ${enviada.join(", ")}` : null;
  const tiendas = faltaMandar ?? yaSalio ?? (c.tiendas.length ? c.tiendas.join(", ") : null);
  // Lo que no pagó ella lo paga Compras desde Por pagar: se dice, para que no crea que le falta plata. Va pegado a las prendas: en el
  // celular la línea se corta al final.
  const falta = Math.round((c.monto - c.pagado) * 100) / 100;
  const compras = falta >= 0.005 ? `Compras paga ${soles(falta)}` : null;
  const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    detalle: [prendas, compras, papel, tiendas].filter(Boolean).join(" · "),
    // La lista dice lo del envío en un chip («Falta mandar a LIM»), no otra vez en el detalle: queda solo lo que no es de envío.
    resumen: [prendas, compras, papel, faltaMandar || yaSalio ? null : tiendas].filter(Boolean).join(" · "),
    envio: faltaMandar ? { texto: mayuscula(faltaMandar), tono: "ambar" } : yaSalio ? { texto: mayuscula(yaSalio), tono: "verde" } : null,
  };
}

/**
 * Lo que compró, gastó y anotó, en UNA lista (antes eran tres: había que juntarlas en la cabeza). Lo más nuevo primero. Arriba, lo de la
 * ronda abierta (`actuales`); lo demás, bajo «Ver rondas anteriores». Lo anotado sin ronda (la plata que le dieron antes de abrirla) va
 * arriba si es de después de la última ronda cerrada. Sin ninguna cerrada todavía, lo sin ronda es de antes de las rondas: arriba solo
 * mientras no haya una abierta, y si es de hoy (como antes de las rondas).
 */
export function movimientosDeLaCompradora(
  plata: Pick<MiPlata, "compras" | "gastos" | "anotada" | "hoy" | "ronda">,
  /** Los códigos de envío de cada compra (`codigosPorCompra`, de «Mis envíos»): la fila de una compra ya mandada dice cuál. */
  codigos: ReadonlyMap<string, readonly string[]> = new Map(),
): {
  actuales: MovimientoCompradora[];
  antes: MovimientoCompradora[];
} {
  const todos: MovimientoCompradora[] = [
    ...plata.compras.map((c): MovimientoCompradora => {
      const e = estadoParaLaCompradora("compra", c.porCompletar);
      const d = detalleCompra(c, codigos);
      return {
        clave: `compra-${c.id}`,
        tipo: "compra",
        icono: "compra",
        titulo: `Compra a ${c.proveedor}`,
        detalle: d.detalle,
        resumen: d.resumen,
        envio: d.envio,
        entra: false,
        // Baja de su plata solo lo que pagó: «− S/ 0.00» si se la dejó toda a Compras.
        monto: soles(c.pagado),
        valor: c.pagado,
        estado: { ...e, pendiente: c.porCompletar },
        fecha: c.fecha,
        creadoEn: c.creadoEn,
        rondaId: c.rondaId,
        ronda: c.ronda,
      };
    }),
    ...plata.gastos.map((g): MovimientoCompradora => {
      const e = estadoParaLaCompradora("gasto", g.porCompletar);
      return {
        clave: `gasto-${g.id}`,
        tipo: "gasto",
        icono: g.concepto,
        titulo: nombreGasto(g),
        detalle: g.conFoto ? "Con foto" : "Sin papel",
        resumen: g.conFoto ? "Con foto" : "Sin papel",
        envio: null,
        entra: false,
        monto: soles(g.monto),
        valor: g.monto,
        estado: { ...e, pendiente: g.porCompletar },
        fecha: g.fecha,
        creadoEn: g.creadoEn,
        rondaId: g.rondaId,
        ronda: g.ronda,
      };
    }),
    ...plata.anotada.map((a): MovimientoCompradora => {
      const e = estadoParaLaCompradora("plata", !a.confirmada);
      return {
        clave: `plata-${a.id}`,
        tipo: "plata",
        icono: "plata",
        titulo: TITULO_PLATA[a.medio],
        detalle: `${MEDIOS_PLATA[a.medio].nombre}${a.conFoto ? " · con foto" : ""}`,
        resumen: `${MEDIOS_PLATA[a.medio].nombre}${a.conFoto ? " · con foto" : ""}`,
        envio: null,
        entra: true,
        monto: textoMontoAnotado(a),
        valor: a.confirmada && a.montoConfirmado != null ? a.montoConfirmado : a.monto,
        estado: { ...e, pendiente: !a.confirmada },
        fecha: a.fecha,
        creadoEn: a.creadoEn,
        rondaId: a.rondaId,
        ronda: a.ronda,
      };
    }),
  ];
  const orden = (m: MovimientoCompradora) => m.creadoEn || m.fecha;
  todos.sort((a, b) => (orden(a) < orden(b) ? 1 : orden(a) > orden(b) ? -1 : 0));
  const abierta = plata.ronda.abierta?.id ?? null;
  const desde = plata.ronda.ultimaCerrada?.cerradaEn ?? "";
  const dia = plata.hoy.fecha;
  const despues = (m: MovimientoCompradora) => new Date(m.creadoEn || m.fecha).getTime() > new Date(desde).getTime();
  // Con una ronda abierta y sin ninguna cerrada antes, lo que no tiene ronda es de antes de las rondas: va abajo.
  const esActual = (m: MovimientoCompradora) =>
    m.rondaId ? m.rondaId === abierta : desde ? despues(m) : !abierta && (!dia || m.fecha.slice(0, 10) === dia);
  return { actuales: todos.filter(esActual), antes: todos.filter((m) => !esActual(m)) };
}

/** El título de la lista de arriba: lo de la ronda abierta; sin ella, lo anotado después de cerrar la última (o, sin ninguna, lo de hoy). */
export function tituloDeLaLista(ronda: Rondas): string {
  if (ronda.abierta) return "En esta ronda";
  return ronda.ultimaCerrada ? "Antes de abrir tu ronda" : "Hoy";
}

/**
 * El pie de «En esta ronda» (maqueta mis-compras-pc-mesa, Felipe 2026-10-28): cuánta plata entró y cuánta salió de la lista que se ve. Salen de
 * `valor` (lo que de verdad movió su plata: lo pagado de una compra, lo gastado, lo dado), no de los textos. No es «lo que tienes»: eso incluye
 * lo que ya tenía al abrir la ronda y lo dice la billetera.
 */
export function totalesDeLaLista(movimientos: readonly Pick<MovimientoCompradora, "entra" | "valor">[]): { entro: number; salio: number } {
  let entro = 0;
  let salio = 0;
  for (const m of movimientos) {
    if (m.entra) entro += m.valor;
    else salio += m.valor;
  }
  return { entro: redondear(entro), salio: redondear(salio) };
}

/** La sigla de una tienda en su cuadro: «Tienda Lima» → «LIM», «Tienda AQP» → «AQP». La última palabra, en tres letras. */
export function siglaTienda(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  return (palabras.at(-1) ?? "?").slice(0, 3).toUpperCase();
}

/** Bajo el nombre de la tienda: «30 prendas de 2 compras». */
export function detalleEnvio(t: Pick<PorMandar, "unidades" | "prendas">): string {
  const compras = new Set(t.prendas.map((p) => p.papelId)).size;
  return `${t.unidades === 1 ? "1 prenda" : `${t.unidades} prendas`} de ${compras === 1 ? "1 compra" : `${compras} compras`}`;
}

// ---------- El historial por ronda (Felipe 2026-10-23, revisando Mis compras en el celular) ----------

/**
 * Una fila de «Ver rondas anteriores». Arriba solo va lo que movió su plata fuera de una compra —la plata que le dieron, lo que devolvió
 * al cerrar (o lo que CAYLA le devuelve)— y una fila por ronda; las compras y lo de «Gasté en otra cosa» van DENTRO de su ronda.
 */
export type EntradaHistorial =
  | { tipo: "plata"; clave: string; mov: MovimientoCompradora }
  | {
      tipo: "cierre";
      clave: string;
      decision: Exclude<DecisionCierre, "se_queda">;
      titulo: string;
      detalle: string;
      entra: boolean;
      monto: string;
      estado: { texto: string; detalle: string; pendiente: boolean };
    }
  | {
      tipo: "ronda";
      clave: string;
      titulo: string;
      detalle: string;
      /** Lo que salió de su plata en la ronda: lo pagado en compras más lo gastado. */
      monto: string;
      /** Algo de la ronda que Compras todavía no pasa a los libros. */
      pendiente: boolean;
      movimientos: MovimientoCompradora[];
      /** Cómo cerró, dicho al pie del detalle («Te quedaste S/ 405.50 para tu próxima ronda»). Sin el cierre, null. */
      cierre: string | null;
    };

/**
 * «Tu última ronda» (Felipe 2026-10-27: sin ronda abierta, la columna de la derecha era un «0» y un «Ver 2» plegado): la ronda cerrada más
 * nueva, destacada, con cómo cerró y en qué va. `cierre` es lo que devolvió (o lo que CAYLA le devuelve), que el historial trae como fila
 * aparte; aquí se pega a su ronda y `resto` queda sin ambas, para no decir lo mismo dos veces. Sin ninguna ronda cerrada, `null`.
 */
export type UltimaRondaVista = {
  ronda: Extract<EntradaHistorial, { tipo: "ronda" }>;
  cierre: Extract<EntradaHistorial, { tipo: "cierre" }> | null;
  /** Qué falta de su lado: la plata por entregar o recibir manda; si no, que Compras todavía pase algo a los libros; si no, al día. */
  estado: { texto: string; detalle: string; pendiente: boolean };
  /** «Devolviste en caja S/ 80.00», «Te quedaste S/ 200.00 para tu próxima ronda.», o lo que corresponda cuando no hubo plata que mover. */
  comoCerro: string;
  resto: EntradaHistorial[];
};

export function ultimaRondaDelHistorial(historial: readonly EntradaHistorial[]): UltimaRondaVista | null {
  const ronda = historial.find((e): e is Extract<EntradaHistorial, { tipo: "ronda" }> => e.tipo === "ronda" && e.clave !== `ronda-${SIN_RONDA}`);
  if (!ronda) return null;
  const id = ronda.clave.slice("ronda-".length);
  const cierre = historial.find((e): e is Extract<EntradaHistorial, { tipo: "cierre" }> => e.tipo === "cierre" && e.clave === `cierre-${id}`) ?? null;
  const estado = cierre
    ? cierre.estado
    : ronda.pendiente
      ? { texto: "Compras la revisa", detalle: "Compras todavía pasa algo de esta ronda a los libros", pendiente: true }
      : { texto: "Todo al día", detalle: "Compras ya pasó todo de esta ronda a los libros", pendiente: false };
  const comoCerro = cierre ? `${cierre.titulo} ${cierre.monto}` : (ronda.cierre ?? "No hubo plata que mover.");
  return { ronda, cierre, estado, comoCerro, resto: historial.filter((e) => e !== ronda && e !== cierre) };
}

/** «23/10» o «21/10 al 23/10»: los días de Lima en que estuvo abierta. */
function diasDeRonda(abiertaEn: string, cerradaEn: string): string {
  const a = diaLima(abiertaEn);
  const c = diaLima(cerradaEn);
  if (!c) return "";
  return a && a !== c ? `${diaMes(a)} al ${diaMes(c)}` : diaMes(c);
}

const SIN_RONDA = "sin-ronda";

/** El historial de la compradora (lo de `antes` de `movimientosDeLaCompradora`), agrupado por ronda y del más nuevo al más viejo. */
export function historialDeLaCompradora(antes: readonly MovimientoCompradora[], cerradas: readonly RondaDeLista[]): EntradaHistorial[] {
  type ConMomento = { e: EntradaHistorial; momento: number; orden: number };
  const ms = (t: string) => Date.parse(t) || 0;
  const filas: ConMomento[] = [];
  const grupos = new Map<string, MovimientoCompradora[]>();
  for (const m of antes) {
    if (m.tipo === "plata") {
      filas.push({ e: { tipo: "plata", clave: m.clave, mov: m }, momento: ms(m.creadoEn || m.fecha), orden: 2 });
      continue;
    }
    const k = m.rondaId ?? SIN_RONDA;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  const deLista = new Map(cerradas.map((r) => [r.id, r]));
  const claves = new Set([...cerradas.map((r) => r.id), ...grupos.keys()]);
  for (const k of claves) {
    const movimientos = grupos.get(k) ?? [];
    const r = deLista.get(k) ?? null;
    const compras = movimientos.filter((m) => m.tipo === "compra").length;
    const gastos = movimientos.length - compras;
    const cuantas = [compras === 0 ? null : compras === 1 ? "1 compra" : `${compras} compras`, gastos === 0 ? null : gastos === 1 ? "1 gasto" : `${gastos} gastos`];
    const ultimo = movimientos.reduce((max, m) => Math.max(max, ms(m.creadoEn || m.fecha)), 0);
    const dias = r ? diasDeRonda(r.abiertaEn, r.cerradaEn) : "";
    filas.push({
      e: {
        tipo: "ronda",
        clave: `ronda-${k}`,
        titulo: k === SIN_RONDA ? "Antes de las rondas" : `Ronda ${r?.texto ?? movimientos[0]?.ronda ?? ""}`.trim(),
        detalle: movimientos.length === 0 ? [dias, "Sin compras ni gastos"].filter(Boolean).join(" · ") : [dias, ...cuantas].filter(Boolean).join(" · "),
        monto: soles(redondear(movimientos.reduce((s, m) => s + m.valor, 0))),
        pendiente: movimientos.some((m) => m.estado.pendiente),
        movimientos,
        cierre: r?.decision === "se_queda" ? (r.monto > 0 ? `Te quedaste ${soles(r.monto)} para tu próxima ronda.` : "No te quedó plata.") : null,
      },
      momento: r ? ms(r.cerradaEn) : ultimo,
      orden: 1,
    });
    // Lo que devolvió al cerrarla (o lo que CAYLA le devuelve) va arriba, aparte: es plata que se movió, no una compra.
    if (r && r.decision !== "se_queda" && r.monto > 0) {
      const devuelve = r.decision === "devuelve";
      filas.push({
        e: {
          tipo: "cierre",
          clave: `cierre-${r.id}`,
          decision: r.decision,
          titulo: devuelve ? "Devolviste en caja" : "Pusiste de tu bolsillo",
          detalle: [r.texto, diaLima(r.cerradaEn) ? diaMes(diaLima(r.cerradaEn)!) : null].filter(Boolean).join(" · "),
          entra: !devuelve,
          monto: soles(r.monto),
          estado: devuelve
            ? r.resuelto
              ? { texto: "Compras lo recibió", detalle: "Ya entregaste la plata en caja", pendiente: false }
              : { texto: "Entrégalo en caja", detalle: "Compras lo recibe cuando lo entregues", pendiente: true }
            : r.resuelto
              ? { texto: "Te lo devolvieron", detalle: "CAYLA ya te devolvió lo que pusiste", pendiente: false }
              : { texto: "Compras te lo devuelve", detalle: "Compras lo ve y te lo devuelve", pendiente: true },
        },
        momento: ms(r.cerradaEn),
        orden: 0,
      });
    }
  }
  // Lo más nuevo primero; a la misma hora, lo que devolvió va sobre su ronda.
  filas.sort((a, b) => b.momento - a.momento || a.orden - b.orden);
  return filas.map((f) => f.e);
}
