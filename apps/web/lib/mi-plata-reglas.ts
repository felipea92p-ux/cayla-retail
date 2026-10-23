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
// Actividad 5 (20261023114000): el resto del día de compras.
export const RPC_GASTO_RAPIDO = "registrar_gasto_rapido";
export const RPC_MANDAR_A_TIENDA = "mandar_compras_a_tienda";
export const RPC_TERMINAR_DIA = "terminar_dia_compras";

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
  dieron: number;
  compraste: number;
  compras: number;
  gastaste: number;
  cierre: { decision: DecisionCierre; monto: number; resuelto: boolean } | null;
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
    dieron: numero(o.dieron) ?? 0,
    compraste: numero(o.compraste) ?? 0,
    compras: Math.max(0, Math.trunc(numero(o.compras) ?? 0)),
    gastaste: numero(o.gastaste) ?? 0,
    cierre: c && decision ? { decision, monto: numero(c.monto) ?? 0, resuelto: c.resuelto === true } : null,
  };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

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
 * «Terminé de comprar hoy» como un cuaderno: lo que tenía antes de hoy + lo que le dieron − lo que compró − lo que gastó = lo que le queda.
 * Lo de antes no viene de la base: se despeja de lo que tiene ahora, así las cuentas siempre cierran.
 */
export function resumenDia(plata: Pick<MiPlata, "tiene" | "hoy">) {
  const { dieron, compraste, gastaste } = plata.hoy;
  return { antes: redondear(plata.tiene - dieron + compraste + gastaste), dieron, compraste, gastaste, queda: plata.tiene };
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
