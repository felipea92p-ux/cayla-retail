import { z } from "zod";
import { soles } from "./catalogo";
import { leerCuponDelPedido, type CuponDelPedido } from "./cupon";
import { enlaceWhatsapp } from "./tiendas";

// Los pedidos web del cliente (ADR-0408, actividad 7): lo que devuelve `retail.tienda_mis_pedidos` (y, uno solo, `tienda_pedido`).
// La base decide todo —el estado de hoy (un «por confirmar» pasado su plazo ya se lee vencido), cuánto falta, hasta cuándo se
// recoge y si el código de 4 cifras ya se puede mostrar—; aquí solo se valida la forma y se arman los textos de la maqueta
// (`vSeparado`, `vPedido`, `vCuenta` y el mensaje de WhatsApp que dictó Felipe).

const fecha = z.string().min(10);

const esquemaLinea = z.object({
  variante_id: z.string().uuid(),
  producto_id: z.string().uuid().nullable().catch(null),
  nombre: z.string().min(1),
  categoria: z.object({ nombre: z.string(), prefijo: z.string().nullable() }).nullable().catch(null),
  color: z
    .object({
      nombre: z.string().nullable(),
      hex: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .nullable()
        .catch(null),
    })
    .catch({ nombre: null, hex: null }),
  talla: z.string().nullable(),
  foto: z.string().url().nullable().catch(null),
  precio: z.number().nonnegative(),
  estado: z.enum(["pendiente", "reservada", "por_conseguir", "quitada", "liberada", "entregada"]),
  // La tienda donde quedó reservada, si no es la de recojo (hay que traerla); la fecha prometida, si está por conseguir.
  viene_de: z.string().nullable().catch(null),
  fecha_compromiso: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
});

const ESTADOS = ["por_confirmar", "confirmado", "pagado", "entregado", "vencido", "anulado"] as const;
export type EstadoPedido = (typeof ESTADOS)[number];

const esquemaPedido = z.object({
  codigo: z.string().regex(/^W-\d{4,}$/),
  // La tienda donde se recoge (para «Volver a separar» en la misma).
  ubicacion_id: z.string().uuid(),
  estado: z.enum(ESTADOS),
  total: z.number().nonnegative(),
  pagado: z.number().nonnegative(),
  falta: z.number().nonnegative(),
  creado_en: fecha,
  vence_en: fecha.nullable(),
  confirmado_en: fecha.nullable(),
  pagado_en: fecha.nullable(),
  entregado_en: fecha.nullable(),
  cierre_motivo: z.string().nullable(),
  listo_para_recoger: z.boolean(),
  recoger_hasta: fecha.nullable(),
  codigo_recojo: z
    .string()
    .regex(/^[1-9]\d{3}$/)
    .nullable(),
  // El número de su boleta (actividad 10): nace al quedar pagado completo. Uno raro no tumba el pedido: no se muestra.
  boleta: z
    .string()
    .regex(/^[A-Z0-9]{4}-\d{6,8}$/)
    .nullable()
    .catch(null)
    .default(null),
  // Anulado (20261015115000): lo que se le devolvió y la nota de crédito que anuló su boleta. Una base sin eso: 0 y sin nota.
  devuelto: z.number().nonnegative().catch(0).default(0),
  nota_credito: z
    .string()
    .regex(/^[A-Z0-9]{4}-\d{6,8}$/)
    .nullable()
    .catch(null)
    .default(null),
  // El cupón del Club que puso al separar (20261019224000). Lo lee `leerCuponDelPedido`: uno raro no tumba el pedido.
  cupon: z.unknown().optional(),
  tienda_web: z.object({
    nombre: z.string().min(1),
    // El WhatsApp de la tienda (el del QR del club). Si la tienda lo borró, el pedido se sigue viendo, sin el botón.
    whatsapp: z
      .string()
      .regex(/^9\d{8}$/)
      .nullable()
      .catch(null),
  }),
  lineas: z.array(esquemaLinea),
});

export type LineaPedido = {
  varianteId: string;
  productoId: string | null;
  nombre: string;
  categoria: { nombre: string; prefijo: string | null } | null;
  color: { nombre: string | null; hex: string | null };
  talla: string | null;
  foto: string | null;
  precio: number;
  estado: z.infer<typeof esquemaLinea>["estado"];
  vieneDe: string | null;
  fechaCompromiso: string | null;
};

export type Pedido = {
  codigo: string;
  ubicacionId: string;
  estado: EstadoPedido;
  total: number;
  pagado: number;
  falta: number;
  creadoEn: string;
  venceEn: string | null;
  confirmadoEn: string | null;
  pagadoEn: string | null;
  entregadoEn: string | null;
  cierreMotivo: string | null;
  listoParaRecoger: boolean;
  recogerHasta: string | null;
  codigoRecojo: string | null;
  /** «B002-000013»: la boleta del pedido, desde que quedó pagado completo. */
  boleta: string | null;
  /** Anulado: lo que ya se le devolvió (cada pago devuelto). */
  devuelto: number;
  /** Anulado después de pagarse: «BC01-000001», la nota de crédito que anuló su boleta. */
  notaCredito: string | null;
  /** El cupón del Club: reservado (espera el pago), usado (en su boleta) o liberado (volvió a «Mi Club», y por qué). */
  cupon: CuponDelPedido | null;
  tienda: { nombre: string; whatsapp: string | null };
  lineas: LineaPedido[];
};

export type Plazos = { horasParaConfirmar: number; diasParaRecoger: number };

const esquemaPlazos = z.object({ horas_para_confirmar: z.number().int().positive(), dias_para_recoger: z.number().int().positive() });

function aPedido(d: z.infer<typeof esquemaPedido>): Pedido {
  return {
    codigo: d.codigo,
    ubicacionId: d.ubicacion_id,
    estado: d.estado,
    total: d.total,
    pagado: d.pagado,
    falta: d.falta,
    creadoEn: d.creado_en,
    venceEn: d.vence_en,
    confirmadoEn: d.confirmado_en,
    pagadoEn: d.pagado_en,
    entregadoEn: d.entregado_en,
    cierreMotivo: d.cierre_motivo,
    listoParaRecoger: d.listo_para_recoger,
    recogerHasta: d.recoger_hasta,
    codigoRecojo: d.codigo_recojo,
    boleta: d.boleta,
    devuelto: d.devuelto,
    notaCredito: d.nota_credito,
    cupon: leerCuponDelPedido(d.cupon),
    tienda: d.tienda_web,
    lineas: d.lineas.map((l) => ({
      varianteId: l.variante_id,
      productoId: l.producto_id,
      nombre: l.nombre,
      categoria: l.categoria,
      color: l.color,
      talla: l.talla,
      foto: l.foto,
      precio: l.precio,
      estado: l.estado,
      vieneDe: l.viene_de,
      fechaCompromiso: l.fecha_compromiso,
    })),
  };
}

/** «Mis pedidos». Un pedido con un dato raro se deja fuera (los demás se ven); si la respuesta entera no tiene forma, `null`. */
export function interpretarMisPedidos(dato: unknown): { plazos: Plazos; pedidos: Pedido[] } | null {
  const r = z.object({ plazos: esquemaPlazos, pedidos: z.array(z.unknown()) }).safeParse(dato);
  if (!r.success) return null;
  return {
    plazos: { horasParaConfirmar: r.data.plazos.horas_para_confirmar, diasParaRecoger: r.data.plazos.dias_para_recoger },
    pedidos: r.data.pedidos.flatMap((p) => {
      const x = esquemaPedido.safeParse(p);
      return x.success ? [aPedido(x.data)] : [];
    }),
  };
}

/** Un pedido por su número: `pedido: null` si no es de esta cuenta o no existe (la base responde igual en los dos casos). */
export function interpretarUnPedido(dato: unknown): { plazos: Plazos; pedido: Pedido | null } | null {
  const r = z.object({ plazos: esquemaPlazos, pedido: z.unknown() }).safeParse(dato);
  if (!r.success) return null;
  const plazos = { horasParaConfirmar: r.data.plazos.horas_para_confirmar, diasParaRecoger: r.data.plazos.dias_para_recoger };
  if (r.data.pedido === null) return { plazos, pedido: null };
  const p = esquemaPedido.safeParse(r.data.pedido);
  return p.success ? { plazos, pedido: aPedido(p.data) } : null;
}

/** El número de la dirección (`/cuenta/pedidos/W-0141`): «W-0141», «w-0141» o «141». `null` si no es un número de pedido. */
export function codigoDeLaUrl(valor: string): string | null {
  let t: string;
  try {
    t = decodeURIComponent(valor).trim().toUpperCase();
  } catch {
    return null;
  }
  const m = /^(?:W-?)?(\d{1,9})$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? `W-${String(n).padStart(4, "0")}` : null;
}

/* ---------------- Los textos ---------------- */

/** «CAYLA Trujillo»: como la maqueta nombra a la tienda en los mensajes (`SEDES[…].tienda`). La web guarda «Trujillo». */
export const nombreTienda = (nombreWeb: string) => (/^cayla\b/i.test(nombreWeb.trim()) ? nombreWeb.trim() : `CAYLA ${nombreWeb.trim()}`);

/** Las prendas que siguen en el pedido: las que la tienda quitó al confirmar (sin stock) ya no cuentan (maqueta, `vivos`). */
export const vivas = (p: Pick<Pedido, "lineas">) => p.lineas.filter((l) => l.estado !== "quitada");

/** «Color · Talla M», sin inventar lo que la prenda no tiene. */
export const detalleDeLaPrenda = (l: Pick<LineaPedido, "color" | "talla">) =>
  [l.color.nombre, l.talla ? `Talla ${l.talla}` : null].filter(Boolean).join(" · ");

/**
 * El mensaje de WhatsApp que va escrito al tocar «Enviar por WhatsApp». Es la idea de Felipe, PALABRA POR PALABRA (maqueta,
 * `mensajeWsp`): prenda, talla y color de cada una, el número de pedido y el total, y «¿Me confirman la separación?». No se cambia
 * sin su permiso. Una prenda sin talla o sin color no inventa una: esa parte se omite.
 */
export function mensajeWhatsapp(p: Pick<Pedido, "codigo" | "total" | "tienda" | "lineas">): string {
  const lineas = vivas(p).map((l) => ["• " + l.nombre, l.talla ? `Talla ${l.talla}` : null, l.color.nombre].filter(Boolean).join(" — "));
  return `Hola ${nombreTienda(p.tienda.nombre)}, separé el pedido web ${p.codigo}:\n\n${lineas.join("\n")}\n\nTotal: ${soles(p.total)}\n\n¿Me confirman la separación?`;
}

/** El chat con la tienda, con el mensaje ya escrito. `null` si la tienda no tiene WhatsApp. */
export const enlaceDelPedido = (p: Pick<Pedido, "codigo" | "total" | "tienda" | "lineas">) =>
  p.tienda.whatsapp ? `${enlaceWhatsapp(p.tienda.whatsapp)}?text=${encodeURIComponent(mensajeWhatsapp(p))}` : null;

/**
 * El chat con la tienda para lo que sigue después de separar (coordinar el pago, el recojo, una duda), con el número del pedido ya
 * escrito: «Hola CAYLA Trujillo, te escribo por mi pedido web W-0141.». Antes «Coordina el pago por WhatsApp» y «Si tienes dudas,
 * escríbele» no tenían a dónde tocar: el número de la tienda era texto suelto. El de «por confirmar» es el otro (`enlaceDelPedido`, el
 * mensaje de Felipe). null si la tienda no tiene WhatsApp.
 */
export const enlaceParaHablarDelPedido = (p: Pick<Pedido, "codigo" | "tienda">) =>
  p.tienda.whatsapp
    ? `${enlaceWhatsapp(p.tienda.whatsapp)}?text=${encodeURIComponent(`Hola ${nombreTienda(p.tienda.nombre)}, te escribo por mi pedido web ${p.codigo}.`)}`
    : null;

/** «S/ 57.20» con un espacio que no se parte (ADR-0413): en una frase, «S/» no queda sola al final de un renglón del celular. */
export const solesEnFrase = (monto: number) => soles(monto).replace(" ", "\u00a0");

/** La insignia de cada estado en «Mis pedidos» (maqueta, `ESTADO_T`). */
export const INSIGNIA: Record<EstadoPedido, { texto: string; tono: "ambar" | "verde" | "neutro" | "rojo" }> = {
  por_confirmar: { texto: "Por confirmar", tono: "ambar" },
  confirmado: { texto: "Confirmado · falta pagar", tono: "verde" },
  pagado: { texto: "Pagado", tono: "verde" },
  entregado: { texto: "Entregado", tono: "neutro" },
  vencido: { texto: "Se cerró sin confirmar", tono: "neutro" },
  anulado: { texto: "Anulado", tono: "rojo" },
};

/**
 * Por qué la tienda cerró un pedido, dicho PARA EL CLIENTE (Felipe, 2026-10-14). La tienda elige su motivo en la hoja del ERP con
 * palabras de la tienda («El cliente no pagó»); el cliente lee una frase escrita para él, que explica sin acusarlo. Las claves son las
 * que acepta la base: al no confirmar (`no_confirmar_pedido_web`: sin_stock, cliente_no_respondio, cliente_desistio), al anular uno
 * confirmado (`anular_pedido_web`: cliente_no_pago, cliente_desistio, error_en_pedido) y al anular uno pagado
 * (`anular_pedido_web_pagado`: cliente_desistio, error_en_pedido, no_se_puede_entregar). El pedido que se cerró solo (vencido,
 * `sin_confirmar`) tiene su propia explicación en la página. Solo cambia el texto: ninguna regla.
 */
const MOTIVO_PARA_EL_CLIENTE: Record<string, string> = {
  sin_stock: "Cuando la tienda fue a separarlo, alguna de las prendas ya no estaba disponible.",
  cliente_no_respondio: "La tienda no pudo comunicarse contigo para confirmarlo.",
  cliente_desistio: "Se canceló a pedido tuyo.",
  cliente_no_pago: "No se registró tu pago a tiempo.",
  error_en_pedido: "Hubo un error con el pedido y la tienda tuvo que cancelarlo.",
  no_se_puede_entregar: "No pudimos tener lista una de tus prendas para entregártela.",
};
/** Para un motivo que la tienda no conoce todavía (uno nuevo del ERP): lo neutro. */
const MOTIVO_NEUTRO = "La tienda canceló este pedido.";

/** La frase de por qué se cerró, para el cliente (la página le suma «Si tienes dudas, escríbele a CAYLA …»). */
export const porQueSeCerro = (motivo: string | null): string =>
  motivo !== null && Object.hasOwn(MOTIVO_PARA_EL_CLIENTE, motivo) ? MOTIVO_PARA_EL_CLIENTE[motivo] : MOTIVO_NEUTRO;

/**
 * Lo que se le devuelve a quien ya había pagado algo de un pedido anulado: lo devuelto más lo que la tienda todavía tiene por devolver
 * (un pedido anulado antes de pagarse completo se devuelve pago por pago). La plata vuelve por el mismo medio con que se pagó: el
 * efectivo, en la tienda. null si no había pagado nada.
 */
export function textoDeDevolucion(p: Pick<Pedido, "estado" | "devuelto" | "pagado">): string | null {
  if (p.estado !== "anulado") return null;
  const monto = Math.round((p.devuelto + p.pagado) * 100) / 100;
  // «S/» y la cifra con un espacio que no se parte: en el celular «S/» no queda sola al final de un renglón (ADR-0413).
  return monto > 0 ? `Se te devuelve lo que pagaste, ${solesEnFrase(monto)}, por el mismo medio con el que pagaste.` : null;
}

/** «¿Necesitas cambiarlo?» de un pedido entregado, con el MISMO plazo que imprime su boleta (`tienda_ayuda`, el de la caja): la web y la
 *  boleta nunca dicen dos números distintos. Sin el dato, sin número: el plazo va impreso en la boleta. */
export function textoCambiarlo(diasParaCambiar: number | null): string {
  return diasParaCambiar !== null
    ? `Tienes ${diasParaCambiar} ${diasParaCambiar === 1 ? "día" : "días"} para cambiarlo en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta.`
    : "Puedes cambiarlo en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta. El plazo va impreso en tu boleta.";
}

export type Hito = { nombre: string; cuando: string | null; estado: "hecho" | "ahora" | "falta" };

/** La línea de tiempo del pedido (maqueta, `hitos`): Separado → Confirmado por la tienda → Pagado → Entregado. Un pedido cerrado
 *  (vencido o anulado) marca hecho todo paso que tiene fecha (hasta dónde llegó antes de cerrarse) y nada como «ahora». */
export function hitos(p: Pick<Pedido, "estado" | "creadoEn" | "confirmadoEn" | "pagadoEn" | "entregadoEn">): Hito[] {
  const orden: [EstadoPedido, string, string | null][] = [
    ["por_confirmar", "Separado", p.creadoEn],
    ["confirmado", "Confirmado por la tienda", p.confirmadoEn],
    ["pagado", "Pagado", p.pagadoEn],
    ["entregado", "Entregado", p.entregadoEn],
  ];
  const cerrado = p.estado === "vencido" || p.estado === "anulado";
  const idx = cerrado ? 0 : orden.findIndex(([e]) => e === p.estado);
  return orden.map(([, nombre, cuando], i) => ({
    nombre,
    cuando,
    estado: (cerrado ? cuando !== null : i <= idx) ? "hecho" : !cerrado && i === idx + 1 ? "ahora" : "falta",
  }));
}

/** «23:59:12»: cuánto falta para que se cierre (las horas pueden pasar de 24 si Configuración da más plazo). */
export function hhmmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

const enLima = (iso: string, opciones: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("es-PE", { ...opciones, timeZone: "America/Lima" });

/** «14 oct.» */
export const fechaCorta = (iso: string) => enLima(iso, { day: "numeric", month: "short" });
/** «3:05 p. m.» */
export const hora = (iso: string) => enLima(iso, { hour: "numeric", minute: "2-digit" });
/** «martes, 21 de octubre» */
export const fechaLarga = (iso: string) => enLima(iso, { weekday: "long", day: "numeric", month: "long" });
/** La fecha prometida de una prenda por conseguir («2026-10-20»), leída como día de Lima: «20 oct.». */
export const diaCorto = (dia: string) => fechaCorta(`${dia}T12:00:00-05:00`);
