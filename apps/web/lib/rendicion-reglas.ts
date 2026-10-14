import { leerMonto } from "./caja-cierre-reglas";
import { soles } from "./compras-reglas";
import type { CampoDeGuia } from "./guia-campos";

// La rendición del fondo (ADR-0362, fase 6 · actividad 5; decisiones 33–35, 54 y 69): las reglas puras de las dos hojas —rendir (la
// dueña) y revisar (quien aprueba)— y de lo que la tarjeta «Tu fondo» suma por la rendición. Leer lo que manda la base (que puede venir
// de una versión vieja o rota: nunca se cae, descarta lo ilegible), decir si la plata cuadra y qué falta en cada hoja. Lo que falta sale
// de lo MISMO que rechazan `rendir_fondo` y `aprobar_rendicion_fondo` (20261013235000): la guía no agrega reglas (ADR-0284). Sin
// Supabase: lo importan el servidor y las hojas.

// Cada llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
export const RPC_MI_FONDO_RENDICION = "fn_mi_fondo_rendicion";
export const RPC_MI_CICLO_FONDO = "fn_mi_ciclo_fondo";
export const RPC_RENDIR_FONDO = "rendir_fondo";
export const RPC_APROBAR_RENDICION = "aprobar_rendicion_fondo";
export const RPC_DEVOLVER_RENDICION = "devolver_rendicion_fondo";
export const RPC_RENDICIONES_FONDO = "fn_rendiciones_fondo";
export const RPC_RENDICION_ITEMS = "fn_rendicion_fondo_items";
export const RPC_REGISTRAR_FOTO_GASTO_VIAJE = "registrar_foto_gasto_viaje";
export const RPC_FOTOS_GASTO_VIAJE = "fn_fotos_gasto_viaje";
export const BUCKET_FOTOS_GASTO_VIAJE = "retail-gastos-viaje";

/** La explicación de un faltante, la nota de quien aprueba y el motivo de una devolución: lo que aceptan sus columnas. */
export const MAX_TEXTO_RENDICION = 500;

const CENTAVO = 0.005;
const redondo = (n: number) => Math.round(n * 100) / 100;

// ---------- Leer lo que manda la base ----------

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const filas = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? data.filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null) : [];

/** Lo que la tarjeta «Tu fondo» suma por la rendición (`fn_mi_fondo_rendicion`). */
export type RendicionDeMiFondo = {
  /** Lo que se trajo de la rendición anterior (puede ser negativo: CAYLA le debía). */
  arrastre: number;
  /** Cuántas filas lleva el ciclo abierto (0 = nada que rendir). */
  items: number;
  sinFoto: number;
  /** La rendición por aprobar, si hay. */
  abierta: { id: string; en: string; faltante: number } | null;
  /** Lo que debe por faltantes de rendiciones aprobadas (decisión 54). */
  deuda: number;
};

export function leerMiFondoRendicion(data: unknown): RendicionDeMiFondo | null {
  const f = filas(data)[0];
  if (!f) return null;
  const id = texto(f.rendicion_id);
  return {
    arrastre: numero(f.arrastre) ?? 0,
    items: Math.max(0, Math.trunc(numero(f.items) ?? 0)),
    sinFoto: Math.max(0, Math.trunc(numero(f.sin_foto) ?? 0)),
    abierta: id ? { id, en: texto(f.rendicion_en) ?? "", faltante: numero(f.rendicion_faltante) ?? 0 } : null,
    deuda: numero(f.deuda) ?? 0,
  };
}

export type TipoItem = "mov" | "pago" | "gasto" | "otro";

/** Una fila del libro del fondo, en el ciclo abierto o en una rendición, con su papel. */
export type ItemRendicion = {
  clave: string;
  origen: string;
  /** Con su signo: lo que entró al fondo (+) o salió de él (−). */
  monto: number;
  fecha: string | null;
  detalle: string;
  tipo: TipoItem;
  refId: string | null;
  compraId: string | null;
  concepto: string | null;
  papel: string | null;
  documento: string | null;
  /** null = no lleva papel (una entrega o una devolución). */
  conFoto: boolean | null;
  fotos: number;
};

const TIPOS_ITEM: readonly TipoItem[] = ["mov", "pago", "gasto"];

/** Las filas de `fn_mi_ciclo_fondo` o `fn_rendicion_fondo_items`. Una fila sin clave no se puede mostrar: se descarta. */
export function leerItemsRendicion(data: unknown): ItemRendicion[] {
  return filas(data).flatMap((f) => {
    const clave = texto(f.clave);
    if (!clave) return [];
    const tipo = texto(f.tipo);
    return [
      {
        clave,
        origen: texto(f.origen) ?? "",
        monto: numero(f.monto) ?? 0,
        fecha: texto(f.fecha),
        detalle: texto(f.detalle) ?? "",
        tipo: TIPOS_ITEM.includes(tipo as TipoItem) ? (tipo as TipoItem) : "otro",
        refId: texto(f.ref_id),
        compraId: texto(f.compra_id),
        concepto: texto(f.concepto),
        papel: texto(f.papel),
        documento: texto(f.documento),
        conFoto: typeof f.con_foto === "boolean" ? f.con_foto : null,
        fotos: Math.max(0, Math.trunc(numero(f.fotos) ?? 0)),
      },
    ];
  });
}

export type EstadoRendicion = "por_aprobar" | "aprobada" | "devuelta";
export type DecisionFaltante = "asume_cayla" | "deuda_persona";

/** Una rendición del tablero de quien aprueba (`fn_rendiciones_fondo`). */
export type Rendicion = {
  id: string;
  cuentaId: string;
  personaId: string;
  persona: string;
  estado: EstadoRendicion;
  arrastre: number;
  entregado: number;
  devuelto: number;
  pagado: number;
  gastos: number;
  otros: number;
  saldo: number;
  efectivo: number;
  faltante: number;
  explicacion: string | null;
  items: number;
  sinFoto: number;
  rendidaEn: string;
  decision: DecisionFaltante | null;
  nota: string | null;
  aprobadaEn: string | null;
  aprobadaPor: string | null;
  motivoDevolucion: string | null;
  devueltaEn: string | null;
  devueltaPor: string | null;
  /** Por qué quien mira no puede aprobarla (null = sí puede). Es una pista: decide la base, con quien de verdad firma. */
  porQueNoAprueba: string | null;
};

const ESTADOS: readonly EstadoRendicion[] = ["por_aprobar", "aprobada", "devuelta"];

export function leerRendiciones(data: unknown): Rendicion[] {
  return filas(data).flatMap((f) => {
    const id = texto(f.id);
    const estado = texto(f.estado);
    if (!id || !ESTADOS.includes(estado as EstadoRendicion)) return [];
    const decision = texto(f.decision);
    return [
      {
        id,
        cuentaId: texto(f.cuenta_id) ?? "",
        personaId: texto(f.persona_id) ?? "",
        persona: texto(f.persona_nombre) ?? "Sin nombre",
        estado: estado as EstadoRendicion,
        arrastre: numero(f.arrastre) ?? 0,
        entregado: numero(f.entregado) ?? 0,
        devuelto: numero(f.devuelto) ?? 0,
        pagado: numero(f.pagado) ?? 0,
        gastos: numero(f.gastos) ?? 0,
        otros: numero(f.otros) ?? 0,
        saldo: numero(f.saldo) ?? 0,
        efectivo: numero(f.efectivo) ?? 0,
        faltante: numero(f.faltante) ?? 0,
        explicacion: texto(f.explicacion),
        items: Math.max(0, Math.trunc(numero(f.items) ?? 0)),
        sinFoto: Math.max(0, Math.trunc(numero(f.sin_foto) ?? 0)),
        rendidaEn: texto(f.rendida_en) ?? "",
        decision: decision === "asume_cayla" || decision === "deuda_persona" ? decision : null,
        nota: texto(f.nota),
        aprobadaEn: texto(f.aprobada_en),
        aprobadaPor: texto(f.aprobada_por_nombre),
        motivoDevolucion: texto(f.motivo_devolucion),
        devueltaEn: texto(f.devuelta_en),
        devueltaPor: texto(f.devuelta_por_nombre),
        porQueNoAprueba: texto(f.por_que_no_aprueba),
      },
    ];
  });
}

// ---------- La cuenta de la rendición ----------

/** Lo que la persona escribió en «¿Cuánto tienes en la mano?» frente a lo que dice el sistema. */
export type CuentaRendicion = {
  /** Lo que debería tener en la mano (nunca negativo). */
  deberias: number;
  /** Si el fondo está en negativo: lo que CAYLA le debe (decisión 32). */
  caylaTeDebe: number;
  efectivo: number | null;
  estado: "sin_escribir" | "cuadra" | "falta" | "sobra" | "invalido";
  /** Lo que falta (estado «falta»). */
  faltante: number;
  /** Lo que sobra (estado «sobra»): la base no lo acepta. */
  sobra: number;
};

export function cuentaRendicion(saldo: number, textoEfectivo: string): CuentaRendicion {
  const deberias = redondo(Math.max(saldo, 0));
  const caylaTeDebe = redondo(Math.max(-saldo, 0));
  const base = { deberias, caylaTeDebe, faltante: 0, sobra: 0 };
  if (textoEfectivo.trim() === "") return { ...base, efectivo: null, estado: "sin_escribir" };
  const efectivo = leerMonto(textoEfectivo);
  if (efectivo == null || efectivo < 0) return { ...base, efectivo: null, estado: "invalido" };
  const dif = redondo(deberias - efectivo);
  if (Math.abs(dif) <= CENTAVO) return { ...base, efectivo, estado: "cuadra" };
  return dif > 0 ? { ...base, efectivo, estado: "falta", faltante: dif } : { ...base, efectivo, estado: "sobra", sobra: -dif };
}

/** Lo que la hoja dice bajo «¿Cuánto tienes en la mano?», en palabras de tienda. */
export function fraseCuenta(c: CuentaRendicion): string | null {
  switch (c.estado) {
    case "cuadra":
      return c.caylaTeDebe > CENTAVO ? `Cuadra. CAYLA te debe ${soles(c.caylaTeDebe)}: se te devuelve con una entrega.` : "Cuadra.";
    case "falta":
      return `Te faltan ${soles(c.faltante)}. Escribe qué pasó: si no, quedan como deuda tuya.`;
    case "sobra":
      return `Tienes ${soles(c.sobra)} más de lo que dice tu fondo: falta anotar algo (o un gasto quedó dos veces). Revísalo antes de rendir.`;
    case "invalido":
      return "Escribe un monto válido (0 si no te queda nada).";
    default:
      return null;
  }
}

// ---------- Lo que falta en cada hoja ----------

type Responsable = { esPersona: boolean; listo: boolean; motivo: string | null };

/** Los campos de «Rendir mi fondo»: el efectivo (obligatorio; no más de lo que dice el fondo) y la explicación (sugerida si falta plata). */
export function camposRendir(v: { efectivo: string; explicacion: string }, saldo: number): CampoDeGuia[] {
  const c = cuentaRendicion(saldo, v.efectivo);
  const efectivoOk = c.estado === "cuadra" || c.estado === "falta";
  const largo = v.explicacion.trim().length > MAX_TEXTO_RENDICION;
  const campos: CampoDeGuia[] = [
    {
      id: "efectivo",
      nombre: "Lo que tienes en la mano",
      requerido: true,
      hecho: efectivoOk,
      pendiente: c.estado === "sin_escribir" ? "Cuenta tu efectivo y escribe cuánto tienes (0 si no te queda nada)." : (fraseCuenta(c) ?? ""),
    },
  ];
  if (c.estado === "falta") {
    campos.push({
      id: "explicacion",
      nombre: "Qué pasó con lo que falta",
      requerido: largo,
      sugerido: true,
      hecho: v.explicacion.trim() !== "" && !largo,
      pendiente: largo ? `Es muy larga (máximo ${MAX_TEXTO_RENDICION} letras).` : "Escribe qué pasó: si no, el faltante queda como deuda tuya.",
    });
  }
  return campos;
}

/** Los campos de «Revisar la rendición». Con faltante y explicación, hay que decidir quién lo asume; sin explicación, es deuda (54). */
export function camposAprobar(r: Pick<Rendicion, "faltante" | "explicacion">, v: { decision: DecisionFaltante | ""; nota: string }, resp: Responsable): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (r.faltante > CENTAVO && r.explicacion) {
    campos.push({
      id: "decision",
      nombre: "Quién asume lo que falta",
      requerido: true,
      hecho: v.decision !== "",
      pendiente: "Elige si lo asume CAYLA o queda como deuda de la persona.",
    });
  }
  const largo = v.nota.trim().length > MAX_TEXTO_RENDICION;
  campos.push({ id: "nota", nombre: "Nota", requerido: largo, hecho: v.nota.trim() !== "" && !largo, pendiente: largo ? `Es muy larga (máximo ${MAX_TEXTO_RENDICION} letras).` : "" });
  if (!resp.esPersona) {
    campos.push({ id: "responsable", nombre: "Quién aprueba", requerido: true, hecho: resp.listo, pendiente: resp.motivo ?? "Elige quién aprueba." });
  }
  return campos;
}

// ---------- Textos ----------

/** «Rendir S/ 120.00» con lo que ya se sabe. */
export function fraseRendir(c: CuentaRendicion): string {
  return c.efectivo != null && (c.estado === "cuadra" || c.estado === "falta") ? `Rendir: tengo ${soles(c.efectivo)}` : "Rendir mi fondo";
}

/** Lo que dice el botón de aprobar: con faltante, cómo queda. */
export function fraseAprobar(r: Pick<Rendicion, "faltante" | "explicacion">, decision: DecisionFaltante | ""): string {
  if (r.faltante <= CENTAVO) return "Aprobar la rendición";
  const d = r.explicacion ? decision : "deuda_persona";
  if (d === "asume_cayla") return `Aprobar: CAYLA asume ${soles(r.faltante)}`;
  if (d === "deuda_persona") return `Aprobar: debe ${soles(r.faltante)}`;
  return "Aprobar la rendición";
}

/** Quién lee: la dueña («te entregaron») o quien revisa («le entregaron»). */
export type Voz = "duena" | "revisa";

/** Qué fila es, en una palabra de tienda (la descripción completa va debajo). */
export function etiquetaItem(i: ItemRendicion, voz: Voz = "duena"): string {
  if (i.tipo === "pago") return "Pago a proveedor";
  if (i.tipo === "gasto") return "Gasto";
  if (i.tipo === "mov") return i.monto >= 0 ? (voz === "duena" ? "Te entregaron" : "Le entregaron") : voz === "duena" ? "Devolviste" : "Devolvió";
  return "Otro";
}

/** Cuántos papeles sin foto, en una frase (decisión 69: la rendición avisa cuáles faltan; las fotos son opcionales). */
export function fraseSinFoto(n: number, voz: Voz = "duena"): string | null {
  if (n <= 0) return null;
  if (voz === "revisa") return n === 1 ? "1 papel sin foto (la foto es opcional)." : `${n} papeles sin foto (las fotos son opcionales).`;
  return n === 1 ? "1 papel sin foto: súbela si la tienes (no es obligatoria)." : `${n} papeles sin foto: súbelas si las tienes (no son obligatorias).`;
}

/** Lo que dice la insignia del papel de una fila: un pago lleva su comprobante; un gasto del viaje, su foto. */
export function textoPapel(i: Pick<ItemRendicion, "tipo" | "conFoto">): string | null {
  if (i.conFoto === null) return null;
  if (i.tipo === "pago") return i.conFoto ? "Con papel" : "Sin papel";
  return i.conFoto ? "Con foto" : "Sin foto";
}

// ---------- El tablero de quien aprueba ----------

/** Por persona (su cuenta de fondo): la rendición por aprobar y lo que debe por faltantes (decisión 54), para la fila de cada una. */
export function estadoPorFondo(rendiciones: readonly Rendicion[]): Map<string, { porAprobar: Rendicion | null; deuda: number }> {
  const mapa = new Map<string, { porAprobar: Rendicion | null; deuda: number }>();
  for (const r of rendiciones) {
    const e = mapa.get(r.cuentaId) ?? { porAprobar: null, deuda: 0 };
    if (r.estado === "por_aprobar") e.porAprobar = r;
    if (r.estado === "aprobada" && r.decision === "deuda_persona") e.deuda = redondo(e.deuda + r.faltante);
    mapa.set(r.cuentaId, e);
  }
  return mapa;
}

