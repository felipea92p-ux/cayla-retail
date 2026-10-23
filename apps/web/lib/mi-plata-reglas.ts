import { diaLima, diaMes } from "./fechas-lima";
import { soles } from "./compras-reglas";
import { campoResponsable, problemaDeMonto, type CuentaOpcion } from "./fondos-reglas";
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

/** Lo de hoy, para «Terminé de comprar hoy». */
export type Hoy = {
  /** El día de hoy en Lima, como lo dice la base («2026-10-23»): separa lo de hoy de lo de antes en la lista. */
  fecha: string;
  dieron: number;
  compraste: number;
  compras: number;
  gastaste: number;
  cierre: { decision: DecisionCierre; monto: number; resuelto: boolean } | null;
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
export type Rondas = { abierta: RondaAbierta | null; ultimaCerrada: RondaCerrada | null };

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
  const c = o.cierre && typeof o.cierre === "object" ? (o.cierre as Record<string, unknown>) : null;
  const decision = c && DECISIONES.includes(c.decision as DecisionCierre) ? (c.decision as DecisionCierre) : null;
  return {
    fecha: texto(o.fecha)?.slice(0, 10) ?? "",
    dieron: numero(o.dieron) ?? 0,
    compraste: numero(o.compraste) ?? 0,
    compras: Math.max(0, Math.trunc(numero(o.compras) ?? 0)),
    gastaste: numero(o.gastaste) ?? 0,
    cierre: c && decision ? { decision, monto: numero(c.monto) ?? 0, resuelto: c.resuelto === true } : null,
  };
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
  };
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
  const saldo = numero(o.saldo) ?? 0;
  const porConfirmar = numero(o.por_confirmar) ?? 0;
  const comprasPorCompletar = numero(o.compras_por_completar) ?? 0;
  const gastosPorCompletar = numero(o.gastos_por_completar) ?? 0;
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
  const monto = problemaDeMonto(v.monto);
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

/** Lo que la tarjeta «Mandar a la tienda» dice debajo: «1 compra todavía no sale para Tienda Trujillo». */
export function textoPorMandar(porMandar: readonly PorMandar[]): string | null {
  if (porMandar.length === 0) return null;
  const compras = new Set(porMandar.flatMap((t) => t.prendas.map((p) => p.papelId))).size;
  const tiendas = porMandar.map((t) => t.tienda);
  const cuantas = compras === 1 ? "1 compra todavía no sale" : `${compras} compras todavía no salen`;
  return `${cuantas} para ${tiendas.length === 1 ? tiendas[0] : `${tiendas.slice(0, -1).join(", ")} y ${tiendas[tiendas.length - 1]}`}`;
}

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

/** Bajo el número de la ronda abierta: «Abierta el jueves 23 oct · 2 compras · 16 prendas». */
export function detalleRonda(r: Pick<RondaAbierta, "abiertaEn" | "compras" | "prendas">, hoy: string): string {
  // El día de Lima, no el de UTC: una ronda abierta a las 8 pm es de hoy.
  const dia = diaLima(r.abiertaEn) ?? "";
  const cuando = !dia ? null : dia === hoy ? "Abierta hoy" : `Abierta el ${diaMes(dia)}`;
  const compras = r.compras === 0 ? "Todavía sin compras" : r.compras === 1 ? "1 compra" : `${r.compras} compras`;
  const prendas = r.prendas > 0 ? (r.prendas === 1 ? "1 prenda" : `${r.prendas} prendas`) : null;
  return [cuando, compras, prendas].filter(Boolean).join(" · ");
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
 * Los tres tramos de la billetera: lo que te queda, lo que compraste y lo que gastaste en la ronda abierta. En negativo no queda nada que
 * dibujar (la cifra grande y su frase ya lo dicen); sin ronda abierta o sin nada en ella, la barra es toda «te queda».
 */
export function repartoBilletera(plata: Pick<MiPlata, "tiene" | "ronda">): { queda: number; compraste: number; gastos: number } {
  const r = plata.ronda.abierta;
  return { queda: Math.max(0, plata.tiene), compraste: Math.max(0, r?.compraste ?? 0), gastos: Math.max(0, r?.gastaste ?? 0) };
}

/** La franja de lo que falta mandar: «Te falta mandar 37 prendas a 2 tiendas» o «… 7 prendas a Tienda LIM». Sin nada, nada. */
export function textoFaltaMandar(porMandar: readonly PorMandar[]): { titulo: string; detalle: string } | null {
  const unidades = porMandar.reduce((s, t) => s + t.unidades, 0);
  if (porMandar.length === 0 || unidades === 0) return null;
  const prendas = unidades === 1 ? "1 prenda" : `${unidades} prendas`;
  const adonde = porMandar.length === 1 ? porMandar[0].tienda : `${porMandar.length} tiendas`;
  return { titulo: `Te falta mandar ${prendas} a ${adonde}`, detalle: "Arma los paquetes y avisa a la tienda" };
}

/** Una fila de «Hoy»: una compra, un gasto o una plata que le dieron, con su ícono, su monto con signo y su estado. */
export type MovimientoCompradora = {
  clave: string;
  tipo: "compra" | "gasto" | "plata";
  /** Qué ícono lleva: la bolsa de una compra, el de cada concepto de gasto, las monedas de la plata. */
  icono: "compra" | "plata" | ConceptoGasto;
  titulo: string;
  detalle: string;
  /** La plata que entra suma (+, en verde); la que sale resta (−). */
  entra: boolean;
  monto: string;
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

function detalleCompra(c: CompraAnotada): string {
  const papel = TIPOS_PAPEL[c.tipo as TipoPapel]?.nombre ?? "Papel";
  const prendas = c.prendas === 1 ? "1 prenda" : `${c.prendas} prendas`;
  const tiendas = c.porMandar.length ? `falta mandar a ${c.porMandar.join(", ")}` : c.tiendas.length ? c.tiendas.join(", ") : null;
  // Lo que no pagó ella lo paga Compras desde Por pagar: se dice, para que no crea que le falta plata. Va pegado a las prendas: en el
  // celular la línea se corta al final.
  const falta = Math.round((c.monto - c.pagado) * 100) / 100;
  const compras = falta >= 0.005 ? `Compras paga ${soles(falta)}` : null;
  return [prendas, compras, papel, tiendas].filter(Boolean).join(" · ");
}

/**
 * Lo que compró, gastó y anotó, en UNA lista (antes eran tres: había que juntarlas en la cabeza). Lo más nuevo primero. Arriba, lo de la
 * ronda abierta (`actuales`); lo demás, bajo «Ver rondas anteriores». Lo anotado sin ronda (la plata que le dieron antes de abrirla) va
 * arriba si es de después de la última ronda cerrada. Sin ninguna cerrada todavía, lo sin ronda es de antes de las rondas: arriba solo
 * mientras no haya una abierta, y si es de hoy (como antes de las rondas).
 */
export function movimientosDeLaCompradora(plata: Pick<MiPlata, "compras" | "gastos" | "anotada" | "hoy" | "ronda">): {
  actuales: MovimientoCompradora[];
  antes: MovimientoCompradora[];
} {
  const todos: MovimientoCompradora[] = [
    ...plata.compras.map((c): MovimientoCompradora => {
      const e = estadoParaLaCompradora("compra", c.porCompletar);
      return {
        clave: `compra-${c.id}`,
        tipo: "compra",
        icono: "compra",
        titulo: `Compra a ${c.proveedor}`,
        detalle: detalleCompra(c),
        entra: false,
        // Baja de su plata solo lo que pagó: «− S/ 0.00» si se la dejó toda a Compras.
        monto: soles(c.pagado),
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
        entra: false,
        monto: soles(g.monto),
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
        entra: true,
        monto: textoMontoAnotado(a),
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
