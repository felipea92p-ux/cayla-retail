// Pedidos a otra sede PARA UN CLIENTE que espera (ADR-0233 + ADR-0328 actividad 17; Felipe 2026-10-04: «la asesora pide y
// aparta la prenda de otra sede para el cliente que la espera; allá la apartan; viaja en el próximo envío; se avisa al
// cliente al llegar»). Lógica pura, sin React ni Supabase: se prueba en `pedidos-con-cliente-reglas.test.ts`.
//
// La base (`fn_pedidos_con_cliente`, migración 20261005100100) da una fila por pedido. Aquí se decide:
//   · cómo entra a la lista de Traslados (la misma tarjeta que la reposición: «una sola lista de pedidos», ADR-0242 D-7);
//   · qué botón ve cada lado (enviar, o primero «subir al almacén» si la prenda apartada allá está colgada; avisar al cliente);
//   · qué le ofrece Vender desde «Dónde más hay» y el mensaje de WhatsApp cuando llega.

import { nombreCortoSede, type SedeConStock } from "./stock-por-sede";
import { accionesDePedido, type AccionesPedido, type PedidoEntreSedes, type TonoEstadoPedido } from "./pedidos-entre-sedes-reglas";

/** Dónde está apartada la prenda en la sede que la envía (null si el pedido ya no espera). */
export type ReservaEnOrigen = "almacen" | "piso" | "sin_lugar" | "sin_reserva";
export type EstadoPedidoCliente = "pedido" | "en_camino" | "llego" | "apartado" | "cancelado";

export type ClientePedido = {
  nombres: string;
  apellidos: string;
  celular: string;
  estado: EstadoPedidoCliente;
  reservaEn: ReservaEnOrigen | null;
  llegoEn: string | null;
  /** Hasta cuándo la guarda la sede que pidió (el apartado de llegada). */
  guardadaHasta: string | null;
  avisadoEn: string | null;
};

const ESTADOS_CLIENTE: readonly EstadoPedidoCliente[] = ["pedido", "en_camino", "llego", "apartado", "cancelado"];
const RESERVAS: readonly ReservaEnOrigen[] = ["almacen", "piso", "sin_lugar", "sin_reserva"];
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Una fila de `fn_pedidos_con_cliente` → un pedido de la lista de Traslados (con su cliente). Un pedido es UNA prenda. */
export function pedidoConClienteDeFila(f: Record<string, unknown>): PedidoEntreSedes {
  const estado = ESTADOS_CLIENTE.includes(f.estado as EstadoPedidoCliente) ? (f.estado as EstadoPedidoCliente) : "pedido";
  // La tarjeta de Traslados habla en cuatro estados; «llegó» y «apartado con adelanto» son, para ella, «llegó».
  const general = estado === "llego" || estado === "apartado" ? "recibido" : estado;
  const id = String(f.id ?? "");
  return {
    grupoId: id,
    direccion: f.direccion === "me_piden" ? "me_piden" : "pedi",
    otraSede: String(f.otra_sede ?? ""),
    otraSedeId: String(f.otra_sede_id ?? ""),
    estado: general,
    creadoEn: String(f.created_at ?? ""),
    creadoPorNombre: texto(f.creado_por_nombre),
    nota: texto(f.nota),
    trasladoId: texto(f.traslado_id),
    trasladoNumero: f.traslado_numero == null ? null : Number(f.traslado_numero),
    canceladoMotivo: texto(f.cancelado_motivo),
    lineas: [
      {
        pedidoId: id,
        varianteId: String(f.variante_id ?? ""),
        producto: String(f.producto ?? "Prenda"),
        color: texto(f.color),
        talla: texto(f.talla),
        sku: texto(f.sku),
        cantidad: Number(f.cantidad ?? 1),
        estado: general,
        // Para un cliente la prenda ya está APARTADA allá: no hay «te queda menos de lo pedido» que avisar.
        disponibleEnOrigen: Number(f.cantidad ?? 1),
      },
    ],
    cliente: {
      nombres: String(f.cliente_nombres ?? ""),
      apellidos: String(f.cliente_apellidos ?? ""),
      celular: String(f.cliente_celular ?? ""),
      estado,
      reservaEn: RESERVAS.includes(f.reserva_en as ReservaEnOrigen) ? (f.reserva_en as ReservaEnOrigen) : null,
      llegoEn: texto(f.llego_en),
      guardadaHasta: texto(f.guardada_hasta),
      avisadoEn: texto(f.avisado_en),
    },
  };
}

/** «Ana Lozano». */
export function nombreCliente(c: Pick<ClientePedido, "nombres" | "apellidos">): string {
  return `${c.nombres} ${c.apellidos}`.trim();
}

export type AccionesConCliente = AccionesPedido & {
  /** El primer paso de dos: la prenda apartada allá está colgada; se sube al almacén antes de enviarla (Felipe). */
  subirAlAlmacen: boolean;
  /** La sede que pidió le avisa al cliente que llegó (WhatsApp). */
  avisar: boolean;
};

/** Los botones de un pedido de la lista, con o sin cliente. Sin cliente, los de siempre (`accionesDePedido`). */
export function accionesDe(p: Pick<PedidoEntreSedes, "estado" | "direccion" | "trasladoId" | "cliente">): AccionesConCliente {
  const base = accionesDePedido(p);
  const c = p.cliente;
  if (!c) return { ...base, subirAlAlmacen: false, avisar: false };
  const colgada = base.enviar && c.reservaEn === "piso";
  return {
    ...base,
    enviar: base.enviar && !colgada,
    subirAlAlmacen: colgada,
    avisar: p.direccion === "pedi" && c.estado === "llego",
  };
}

/** Lo que dice el chip de un pedido para un cliente, según de qué lado se mira. */
export function estadoVisibleConCliente(p: Pick<PedidoEntreSedes, "direccion" | "otraSede"> & { cliente: ClientePedido }): { texto: string; tono: TonoEstadoPedido } {
  const c = p.cliente;
  switch (c.estado) {
    case "pedido":
      if (p.direccion === "me_piden") {
        if (c.reservaEn === "piso") return { texto: "Colgada: súbela al almacén", tono: "ambar" };
        if (c.reservaEn === "sin_reserva") return { texto: "Por enviar · ya no está apartada", tono: "ambar" };
        return { texto: "Por enviar · apartada", tono: "ambar" };
      }
      return { texto: c.reservaEn === "sin_reserva" ? `Esperando a ${p.otraSede} · sin apartar` : `Apartada en ${p.otraSede}`, tono: "ambar" };
    case "en_camino":
      return { texto: "En camino", tono: "pizarra" };
    case "llego":
      if (p.direccion === "me_piden") return { texto: `Llegó a ${p.otraSede}`, tono: "verde" };
      return c.avisadoEn ? { texto: "Llegó · cliente avisado", tono: "verde" } : { texto: "Llegó · avísale al cliente", tono: "ambar" };
    case "apartado":
      return { texto: "Apartado con adelanto", tono: "verde" };
    case "cancelado":
      return { texto: "Cancelado", tono: "apagado" };
  }
}

/** Los que llegaron y nadie le avisó todavía al cliente (la franja de Vender), el que llegó primero arriba. */
export function porAvisarAlCliente(pedidos: readonly PedidoEntreSedes[]): (PedidoEntreSedes & { cliente: ClientePedido })[] {
  return pedidos
    .filter((p): p is PedidoEntreSedes & { cliente: ClientePedido } => p.direccion === "pedi" && p.cliente?.estado === "llego" && !p.cliente.avisadoEn)
    .sort((a, b) => (a.cliente.llegoEn ?? "").localeCompare(b.cliente.llegoEn ?? ""));
}

const fechaLarga = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long" });

/**
 * El WhatsApp para el cliente cuando llega su prenda. Habla igual a cualquier cliente (CLAUDE.md, ADR-0288 act. k): sin
 * «bienvenida» ni «querida». Ej.: «Hola Ana, te escribimos de CAYLA Trujillo: ya llegó tu Blusa Carlita (Blanco, M). Te la
 * guardamos hasta el viernes 9 de octubre. ¡Te esperamos!».
 */
export function mensajeLlegoTuPrenda({
  nombres,
  producto,
  color,
  talla,
  sede,
  guardadaHasta,
}: {
  nombres: string;
  producto: string;
  color: string | null;
  talla: string | null;
  /** La sede que pidió, con su nombre de la base («Tienda Trujillo»). */
  sede: string;
  guardadaHasta: string | null;
}): string {
  const detalle = [color, talla].filter((x): x is string => !!x && x.trim() !== "").join(", ");
  const primerNombre = nombres.trim().split(/\s+/)[0] ?? "";
  const saludo = primerNombre ? `Hola ${primerNombre}` : "Hola";
  const prenda = detalle ? `${producto} (${detalle})` : producto;
  const plazo = guardadaHasta ? ` Te la guardamos hasta el ${fechaLarga(guardadaHasta)}.` : "";
  return `${saludo}, te escribimos de CAYLA ${nombreCortoSede(sede)}: ya llegó tu ${prenda}.${plazo} ¡Te esperamos!`;
}

// ---------------------------------------------------------------------------
// Vender: «Pedir y apartar para este cliente» desde «Dónde más hay»
// ---------------------------------------------------------------------------

/** Una tienda a la que se le puede pedir (otra tienda activa: `sedesParaPedir`), con su nombre corto (el de «Dónde más hay»). */
export type TiendaParaPedir = { id: string; nombre: string };

export type CandidatoPedir = {
  varianteId: string;
  talla: string;
  /** Las tiendas que la tienen libre, de más a menos. */
  tiendas: (TiendaParaPedir & { corto: string; cantidad: number })[];
};

/**
 * Las tallas de un color que se pueden pedir a otra tienda para el cliente: las que AQUÍ no se pueden vender porque no hay
 * (agotada) o lo único que queda es de otro cliente (apartada), y que alguna OTRA TIENDA tiene libre. Lo que está en el
 * almacén de esta sede no entra: eso se baja aquí mismo (ADR-0321), no se pide. El Taller no es una tienda: no se le pide.
 */
export function candidatosParaPedir(
  tallas: readonly { varianteId: string; talla: string | null; motivo: "cobrable" | "en_almacen" | "apartada" | "agotada"; stockOtrasSedes: readonly SedeConStock[] }[],
  tiendas: readonly TiendaParaPedir[],
): CandidatoPedir[] {
  const porCorto = new Map(tiendas.map((t) => [nombreCortoSede(t.nombre), t]));
  return tallas.flatMap((t) => {
    if (t.motivo !== "agotada" && t.motivo !== "apartada") return [];
    const conStock = t.stockOtrasSedes.flatMap((o) => {
      const tienda = porCorto.get(o.sede);
      return tienda && o.cantidad > 0 ? [{ ...tienda, corto: o.sede, cantidad: o.cantidad }] : [];
    });
    if (conStock.length === 0) return [];
    conStock.sort((a, b) => b.cantidad - a.cantidad || a.corto.localeCompare(b.corto, "es"));
    return [{ varianteId: t.varianteId, talla: t.talla ?? "Única", tiendas: conStock }];
  });
}

/** La frase del pie de la ventana: «¿No hay aquí? Arequipa la tiene: pídela y apártala para el cliente». */
export function textoSugerenciaPedir(candidatos: readonly CandidatoPedir[]): string {
  const sedes = [...new Set(candidatos.flatMap((c) => c.tiendas.map((t) => t.corto)))];
  if (sedes.length === 0) return "";
  const quien = sedes.length === 1 ? `${sedes[0]} la tiene` : `${sedes.slice(0, -1).join(", ")} y ${sedes.at(-1)} la tienen`;
  return `¿No hay aquí? ${quien}: pídela y que la aparten para el cliente.`;
}

/**
 * Nombres y apellidos desde el nombre de la ficha del cliente (una sola caja): con 4 palabras o más, las dos primeras son
 * nombres («Ana María Lozano Vera»); con menos, la primera. Es solo el punto de partida: la asesora lo corrige.
 */
export function partirNombre(nombre: string | null | undefined): { nombres: string; apellidos: string } {
  const palabras = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return { nombres: "", apellidos: "" };
  const n = palabras.length >= 4 ? 2 : 1;
  return { nombres: palabras.slice(0, n).join(" "), apellidos: palabras.slice(n).join(" ") };
}

export const soloDigitos = (s: string) => s.replace(/\D/g, "");
/** El celular que acepta la base: 9 dígitos y empieza en 9 (`pedir_prenda_para_apartar`). */
export const celularValido = (s: string) => /^9\d{8}$/.test(soloDigitos(s));

export type DatosPedirYApartar = { varianteId: string; tiendaId: string; nombres: string; apellidos: string; celular: string };

/** Lo que falta para pedir, en el orden de la ventana: lo mismo que apaga el botón (la guía de foco lo lee de aquí). */
export function faltaParaPedir(d: DatosPedirYApartar): { talla: boolean; tienda: boolean; nombres: boolean; apellidos: boolean; celular: boolean } {
  return {
    talla: d.varianteId === "",
    tienda: d.tiendaId === "",
    nombres: d.nombres.trim() === "",
    apellidos: d.apellidos.trim() === "",
    celular: !celularValido(d.celular),
  };
}

/** Lo que identifica el pedido para su marca de reintento (ADR-0190): reintentar LO MISMO reusa la marca; cambiar algo es otro pedido. */
export function huellaDelPedido(d: DatosPedirYApartar & { nota: string }): string {
  return JSON.stringify([d.varianteId, d.tiendaId, d.nombres.trim(), d.apellidos.trim(), soloDigitos(d.celular), d.nota.trim()]);
}

// ---------------------------------------------------------------------------
// Traslados: una sola lista de pedidos (ADR-0242 D-7)
// ---------------------------------------------------------------------------

/**
 * Junta la reposición y los pedidos para un cliente en UNA lista: primero lo que sigue esperando que salga, del más
 * antiguo al más nuevo (es lo que se pasa de las 48 h); después lo demás, lo más reciente primero.
 */
export function juntarPedidos(reposicion: readonly PedidoEntreSedes[], conCliente: readonly PedidoEntreSedes[]): PedidoEntreSedes[] {
  const t = (p: PedidoEntreSedes) => Date.parse(p.creadoEn) || 0;
  const todos = [...reposicion, ...conCliente];
  const esperando = todos.filter((p) => p.estado === "pedido").sort((a, b) => t(a) - t(b));
  const resto = todos.filter((p) => p.estado !== "pedido").sort((a, b) => t(b) - t(a));
  return [...esperando, ...resto];
}
