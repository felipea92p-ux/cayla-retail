import { z } from "zod";
import { soles } from "./catalogo";
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

/** La insignia de cada estado en «Mis pedidos» (maqueta, `ESTADO_T`). */
export const INSIGNIA: Record<EstadoPedido, { texto: string; tono: "ambar" | "verde" | "neutro" | "rojo" }> = {
  por_confirmar: { texto: "Por confirmar", tono: "ambar" },
  confirmado: { texto: "Confirmado · falta pagar", tono: "verde" },
  pagado: { texto: "Pagado", tono: "verde" },
  entregado: { texto: "Entregado", tono: "neutro" },
  vencido: { texto: "Se cerró sin confirmar", tono: "neutro" },
  anulado: { texto: "Anulado", tono: "rojo" },
};

/** Por qué la tienda cerró un pedido, con las palabras de la hoja del ERP (maqueta: «No confirmar» y «Anular»). */
export const MOTIVO_DE_CIERRE: Record<string, string> = {
  sin_stock: "No hay stock",
  cliente_no_respondio: "El cliente no respondió",
  cliente_desistio: "El cliente desistió",
  cliente_no_pago: "El cliente no pagó",
  error_en_pedido: "Error en el pedido",
};

export type Hito = { nombre: string; cuando: string | null; estado: "hecho" | "ahora" | "falta" };

/** La línea de tiempo del pedido (maqueta, `hitos`): Separado → Confirmado por la tienda → Pagado → Entregado. */
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
    estado: i <= idx ? "hecho" : !cerrado && i === idx + 1 ? "ahora" : "falta",
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
