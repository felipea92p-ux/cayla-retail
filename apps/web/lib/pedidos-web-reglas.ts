// Tienda web ▸ Pedidos (ADR-0408, actividad 8; maqueta docs/maquetas/tienda-online-2026-10, «Pedidos web»): la parte pura de la
// pantalla, sin React ni red, para importarla desde el servidor y el cliente y probarla sola.
//
// CONTRATO
//   PROMETE: leer lo que devuelven `fn_pedidos_web_tablero` y `fn_pedido_web_detalle` (20261015010000) sin caerse con un dato raro;
//            agrupar la lista en sus cuatro pestañas y sacar sus cifras; decir en palabras de tienda en qué está cada pedido y cada
//            prenda; armar la decisión de cada prenda para confirmar (de dónde sale, por conseguir con fecha o quitarla) en la forma que
//            pide `confirmar_pedido_web`, y lo que todavía falta para poder confirmar; y los mensajes de WhatsApp de la maqueta.
//   ASUME:   que la base manda (permisos, stock, plazos, transiciones): lo que aquí se calcula es para mostrar y para no ofrecer lo que
//            la base rechazaría. Los plazos (24 h, 48 h, 7 días) llegan de Tienda web ▸ Ajustes en la lectura, nunca escritos aquí.
//            Entregar (actividad 10): el código de 4 cifras como lo escribe la persona, lo que falta para poder entregar, la boleta y en
//            qué va su envío a SUNAT, y los mensajes para avisarle que ya puede recogerlo (o que no lo recoge).
//   NO HACE: lo de cobrar (registrar y anular un pago) vive en `pedidos-web-cobro-reglas.ts` (actividad 9); aquí solo se lee lo que
//            pagó cada pedido y lo que queda por devolver de uno anulado. Nunca compara el código: lo compara la base.

import { diaLima, horaLima, hoyLima, sumarDias } from "./fechas-lima";
import { enlaceWhatsAppA } from "./facturacion-comprobantes-reglas";
import { soles } from "./precio-sede-reglas";
import { formatoCelular } from "./separaciones-reglas";
import { haceCuanto } from "./vender-hoy-reglas";

// ---------------------------------------------------------------------------------------------------------------------------
// Lo que llega de la base
// ---------------------------------------------------------------------------------------------------------------------------

export type EstadoPedidoWeb = "por_confirmar" | "confirmado" | "pagado" | "entregado" | "vencido" | "anulado";
export type EstadoLineaWeb = "pendiente" | "reservada" | "por_conseguir" | "quitada" | "liberada" | "entregada";

export type PlazosPedidosWeb = { horasParaConfirmar: number; horasAvisoSinPagar: number; diasAvisoSinRecoger: number };
const PLAZOS_DE_FABRICA: PlazosPedidosWeb = { horasParaConfirmar: 24, horasAvisoSinPagar: 48, diasAvisoSinRecoger: 7 };

/** Una prenda como la dibuja el ERP (`fn_pedido_web_prenda`): la miniatura sin foto usa el color y la categoría (ADR-0333). */
export type PrendaWeb = {
  referencia: string;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  foto: string | null;
  categoria: string | null;
  categoriaPrefijo: string | null;
  categoriaFamilia: string | null;
};

export type PedidoDeLista = {
  id: string;
  codigo: string;
  numero: number;
  estado: EstadoPedidoWeb;
  cliente: string;
  celular: string | null;
  total: number;
  pagado: number;
  falta: number;
  prendas: number;
  porConseguir: number;
  porTraer: number;
  creadoEn: string;
  venceEn: string | null;
  confirmadoEn: string | null;
  pagadoEn: string | null;
  entregadoEn: string | null;
  cerradoEn: string | null;
  cierreMotivo: string | null;
  sinPagar: boolean;
  listoParaRecoger: boolean;
  sinRecoger: boolean;
  prendasVista: (PrendaWeb & { estado: EstadoLineaWeb })[];
};

export type LugarWeb = "almacen" | "piso";

/** Lo que una tienda tiene reservado para un pedido de OTRA tienda: lo envía ella (sin el cliente: no lo atiende). */
export type ParaEnviar = {
  pedidoId: string;
  codigo: string;
  tiendaId: string;
  tienda: string;
  lineas: (PrendaWeb & { lineaId: string; lugar: LugarWeb | null })[];
};

/** Un envío por hacer: las prendas de un pedido reservadas en una tienda (`desde`) que viajan a la del pedido. */
export type EnvioPorHacer = {
  pedidoId: string;
  codigo: string;
  tiendaPedido: string;
  desdeId: string;
  desde: string;
  lineas: (PrendaWeb & { lineaId: string; lugar: LugarWeb | null })[];
};

export type TableroPedidosWeb = {
  plazos: PlazosPedidosWeb;
  pedidos: PedidoDeLista[];
  cobradoHoy: number;
  paraEnviar: ParaEnviar[];
};

export type TrasladoDeLinea = {
  transferenciaId: string;
  numero: number;
  estado: "en_transito" | "recibido_con_diferencia" | "cerrada" | "anulada" | "completada";
  desde: string;
  desdeId: string;
  llegaEl: string | null;
};

export type LineaDetalle = PrendaWeb & {
  lineaId: string;
  posicion: number;
  precio: number;
  precioLista: number;
  descuento: number;
  estado: EstadoLineaWeb;
  ubicacionId: string | null;
  tiendaReserva: string | null;
  lugar: LugarWeb | null;
  fechaCompromiso: string | null;
  disponible: { almacen: number; piso: number; sinLugar: number; otras: { ubicacionId: string; tienda: string; libres: number }[] };
  compiten: { codigo: string; separoAntes: boolean }[];
  puedoOperarAlli: boolean;
  traslado: TrasladoDeLinea | null;
};

export type PagoDeLista = {
  id: string;
  /** «tienda» (lo anotó la sede) o «pasarela» (el aviso de un cobro en línea, futuro). */
  origen: "tienda" | "pasarela";
  medio: string;
  monto: number;
  /** aprobado · anulado · y, de una pasarela, pendiente · rechazado · por_revisar. */
  estado: string;
  numeroOperacion: string | null;
  /** Lo que explica un pago «por revisar» de la pasarela. */
  observacion: string | null;
  registradoEn: string;
  registradoPor: string | null;
  enCaja: boolean;
  anuladoEn: string | null;
  anuladoPor: string | null;
  anuladoMotivo: string | null;
};

/** La boleta del pedido (nace al quedar pagado completo, ADR-0408 act. 10) y en qué va su envío a SUNAT (`comprobantes.estado`). */
export type BoletaWeb = { comprobanteId: string; texto: string; estado: string };

/** Qué le pasaría a la boleta si el pedido pagado se anula AHORA (`fn_pedido_web_camino_boleta`, 20261015114000: la misma regla que
 *  aplica la anulación): «liberar» (nunca se intentó mandar), «nota_credito» (SUNAT la aceptó), «nada» (rechazada o ya anulada) o
 *  «esperar» (todavía no se puede: `explicacion` dice qué hacer). */
export type CaminoBoleta = {
  camino: "liberar" | "nota_credito" | "nada" | "esperar";
  texto: string | null;
  estado: string | null;
  total: number | null;
  explicacion: string;
  hint: string | null;
};

/** La nota de crédito que anuló la boleta de un pedido pagado y anulado. */
export type NotaCreditoWeb = { comprobanteId: string; texto: string; estado: string; total: number };

export type PedidoDetalle = {
  id: string;
  codigo: string;
  estado: EstadoPedidoWeb;
  ubicacionId: string;
  tienda: string;
  cliente: { nombre: string; celular: string | null; documento: string | null; miembroDelClub: boolean };
  total: number;
  pagado: number;
  falta: number;
  creadoEn: string;
  venceEn: string | null;
  confirmadoEn: string | null;
  pagadoEn: string | null;
  entregadoEn: string | null;
  cerradoEn: string | null;
  cierreMotivo: string | null;
  sinPagar: boolean;
  listoParaRecoger: boolean;
  sinRecoger: boolean;
  lineas: LineaDetalle[];
  pagos: PagoDeLista[];
  plazos: PlazosPedidosWeb;
  tiendaWeb: { nombre: string; direccion: string | null; horario: string | null };
  /** Los lugares de la tienda del pedido, para elegir de dónde sale cada prenda. */
  lugares: Partial<Record<LugarWeb, string>>;
  /** ¿La tienda del pedido tiene su caja abierta? (para ofrecer el efectivo al cobrar y al devolver). null = no se sabe (una base sin la
   *  actividad 9): no se bloquea nada y decide la base. */
  cajaAbierta: boolean | null;
  /** La venta del pedido pagado completo, su boleta y quién lo entregó (actividad 10). null antes de pagarse (o en una base sin ella). */
  ventaId: string | null;
  boleta: BoletaWeb | null;
  entregadoPor: string | null;
  /** Pagado: qué le pasaría a su boleta si se anula ahora. null en otro estado (o en una base sin la anulación de un pagado). */
  anulacionBoleta: CaminoBoleta | null;
  /** Anulado después de pagarse: la nota de crédito que anuló su boleta (si nació). */
  notaCredito: NotaCreditoWeb | null;
  /** El cupón del Club que el cliente puso al separar (20261019224000). null sin cupón (o en una base sin él). */
  cupon: CuponDelPedidoWeb | null;
};

/** El cupón del Club de un pedido web: reservado (espera el cobro), usado (en su boleta) o liberado (volvió al cliente, y por qué). */
export type CuponDelPedidoWeb = {
  codigo: string;
  valor: number;
  /** Lo que descuenta del total ahora: 0 si se liberó al quitar prendas. */
  descuento: number;
  estado: "reservado" | "usado" | "liberado";
  liberadoMotivo: "compra_minima" | "cubre_todo" | "pedido_anulado" | "pedido_vencido" | null;
};

const MOTIVOS_CUPON: readonly NonNullable<CuponDelPedidoWeb["liberadoMotivo"]>[] = ["compra_minima", "cubre_todo", "pedido_anulado", "pedido_vencido"];

/** Lo de `cupon` en `fn_pedido_web_detalle`. null si no trae un código (un pedido sin cupón). */
export function leerCuponDelPedido(x: unknown): CuponDelPedidoWeb | null {
  const c = obj(x);
  const codigo = texto(c.codigo);
  if (!codigo) return null;
  const estado = c.estado === "usado" || c.estado === "liberado" ? c.estado : "reservado";
  const motivo = MOTIVOS_CUPON.includes(c.liberado_motivo as NonNullable<CuponDelPedidoWeb["liberadoMotivo"]>)
    ? (c.liberado_motivo as CuponDelPedidoWeb["liberadoMotivo"])
    : null;
  return { codigo, valor: numero(c.valor), descuento: numero(c.descuento), estado, liberadoMotivo: estado === "liberado" ? motivo : null };
}

/**
 * Lo que la hoja del pedido dice del cupón, en palabras de tienda: «Cupón CAY-… · − S/ 5.00» y en qué quedó. El descuento ya está
 * restado del total (la base lo hace al separar); aquí solo se cuenta.
 */
export function textoDelCupon(c: CuponDelPedidoWeb): { titulo: string; chip: string; detalle: string } {
  const titulo = c.descuento > 0 ? `Cupón ${c.codigo} · − ${soles(c.descuento)}` : `Cupón ${c.codigo}`;
  if (c.estado === "usado") return { titulo, chip: "Usado", detalle: "Ya se gastó: va descontado en la boleta del pedido." };
  if (c.estado === "reservado")
    return { titulo, chip: "Reservado", detalle: "Reservado para este pedido: nadie más lo usa, ni en caja. Se gasta al cobrar el pedido completo." };
  const detalle =
    c.liberadoMotivo === "compra_minima"
      ? `Volvió al cliente: sin las prendas que se quitaron, el pedido ya no llega a su compra mínima. El total es sin descuento.`
      : c.liberadoMotivo === "cubre_todo"
        ? "Volvió al cliente: sin las prendas que se quitaron, el cupón cubría todo el pedido. El total es sin descuento."
        : "Volvió al cliente porque el pedido se cerró. Lo puede usar en otra compra mientras siga vigente.";
  return { titulo, chip: "Liberado", detalle };
}

type Crudo = Record<string, unknown>;
const obj = (x: unknown): Crudo => (x && typeof x === "object" && !Array.isArray(x) ? (x as Crudo) : {});
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x : null);
const numero = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const booleano = (x: unknown): boolean => x === true || x === "true";
const ESTADOS: readonly EstadoPedidoWeb[] = ["por_confirmar", "confirmado", "pagado", "entregado", "vencido", "anulado"];
const ESTADOS_LINEA: readonly EstadoLineaWeb[] = ["pendiente", "reservada", "por_conseguir", "quitada", "liberada", "entregada"];
const estadoDe = (x: unknown): EstadoPedidoWeb => (ESTADOS.includes(x as EstadoPedidoWeb) ? (x as EstadoPedidoWeb) : "anulado");
const estadoLineaDe = (x: unknown): EstadoLineaWeb => (ESTADOS_LINEA.includes(x as EstadoLineaWeb) ? (x as EstadoLineaWeb) : "pendiente");
const lugarDe = (x: unknown): LugarWeb | null => (x === "almacen" || x === "piso" ? x : null);

function leerPlazos(x: unknown): PlazosPedidosWeb {
  const p = obj(x);
  const h = numero(p.horas_para_confirmar);
  const s = numero(p.horas_aviso_sin_pagar);
  const d = numero(p.dias_aviso_sin_recoger);
  return {
    horasParaConfirmar: h > 0 ? h : PLAZOS_DE_FABRICA.horasParaConfirmar,
    horasAvisoSinPagar: s > 0 ? s : PLAZOS_DE_FABRICA.horasAvisoSinPagar,
    diasAvisoSinRecoger: d > 0 ? d : PLAZOS_DE_FABRICA.diasAvisoSinRecoger,
  };
}

function leerPrenda(x: unknown): PrendaWeb {
  const p = obj(x);
  return {
    referencia: texto(p.referencia) ?? "Prenda",
    talla: texto(p.talla),
    color: texto(p.color),
    colorHex: texto(p.color_hex),
    foto: texto(p.foto),
    categoria: texto(p.categoria),
    categoriaPrefijo: texto(p.categoria_prefijo),
    categoriaFamilia: texto(p.categoria_familia),
  };
}

/** Lo de `fn_pedidos_web_tablero`. Lo que no se entiende se salta (una fila rota no tumba la lista). */
export function leerTablero(data: unknown): TableroPedidosWeb {
  const t = obj(data);
  const pedidos = lista(t.pedidos)
    .map((x): PedidoDeLista | null => {
      const p = obj(x);
      const id = texto(p.pedido_id);
      const codigo = texto(p.codigo);
      if (!id || !codigo) return null;
      return {
        id,
        codigo,
        numero: numero(p.numero),
        estado: estadoDe(p.estado),
        cliente: texto(p.clienta_nombre) ?? "Cliente",
        celular: texto(p.clienta_celular),
        total: numero(p.total),
        pagado: numero(p.pagado),
        falta: numero(p.falta),
        prendas: numero(p.prendas),
        porConseguir: numero(p.por_conseguir),
        porTraer: numero(p.por_traer),
        creadoEn: texto(p.creado_en) ?? new Date(0).toISOString(),
        venceEn: texto(p.vence_en),
        confirmadoEn: texto(p.confirmado_en),
        pagadoEn: texto(p.pagado_en),
        entregadoEn: texto(p.entregado_en),
        cerradoEn: texto(p.cerrado_en),
        cierreMotivo: texto(p.cierre_motivo),
        sinPagar: booleano(p.sin_pagar),
        listoParaRecoger: booleano(p.listo_para_recoger),
        sinRecoger: booleano(p.sin_recoger),
        prendasVista: lista(p.prendas_vista).map((v) => ({ ...leerPrenda(v), estado: estadoLineaDe(obj(v).estado) })),
      };
    })
    .filter((p): p is PedidoDeLista => p !== null);
  const paraEnviar = lista(t.para_enviar)
    .map((x): ParaEnviar | null => {
      const e = obj(x);
      const pedidoId = texto(e.pedido_id);
      if (!pedidoId) return null;
      return {
        pedidoId,
        codigo: texto(e.codigo) ?? "",
        tiendaId: texto(e.tienda_id) ?? "",
        tienda: texto(e.tienda) ?? "la tienda del pedido",
        lineas: lista(e.lineas).map((l) => ({ ...leerPrenda(l), lineaId: texto(obj(l).linea_id) ?? "", lugar: lugarDe(obj(l).lugar) })),
      };
    })
    .filter((e): e is ParaEnviar => e !== null && e.lineas.length > 0);
  return { plazos: leerPlazos(t.plazos), pedidos, cobradoHoy: numero(t.cobrado_hoy), paraEnviar };
}

function leerBoleta(x: unknown): BoletaWeb | null {
  const b = obj(x);
  const comprobanteId = texto(b.comprobante_id);
  const t = texto(b.texto);
  return comprobanteId && t ? { comprobanteId, texto: t, estado: texto(b.estado) ?? "pendiente" } : null;
}

const CAMINOS: readonly CaminoBoleta["camino"][] = ["liberar", "nota_credito", "nada", "esperar"];

/** Lo de `anulacion_boleta`. Un camino que la web no conoce se lee «esperar» (no se ofrece anular: decide la base). */
export function leerCaminoBoleta(x: unknown): CaminoBoleta | null {
  const c = obj(x);
  const explicacion = texto(c.explicacion);
  if (!explicacion) return null;
  const camino = CAMINOS.includes(c.camino as CaminoBoleta["camino"]) ? (c.camino as CaminoBoleta["camino"]) : "esperar";
  return {
    camino,
    texto: texto(c.texto),
    estado: texto(c.estado),
    total: c.total === null || c.total === undefined ? null : numero(c.total),
    explicacion,
    hint: texto(c.hint),
  };
}

function leerNotaCredito(x: unknown): NotaCreditoWeb | null {
  const n = obj(x);
  const comprobanteId = texto(n.comprobante_id);
  const t = texto(n.texto);
  return comprobanteId && t ? { comprobanteId, texto: t, estado: texto(n.estado) ?? "pendiente", total: numero(n.total) } : null;
}

/** Lo de `fn_pedido_web_detalle`. null si no trae un pedido. */
export function leerDetalle(data: unknown): PedidoDetalle | null {
  const d = obj(data);
  const id = texto(d.pedido_id);
  const codigo = texto(d.codigo);
  if (!id || !codigo) return null;
  const c = obj(d.cliente);
  const tw = obj(d.tienda_web);
  const lugares = obj(d.lugares);
  return {
    id,
    codigo,
    estado: estadoDe(d.estado),
    ubicacionId: texto(d.ubicacion_id) ?? "",
    tienda: texto(d.tienda) ?? "la tienda",
    cliente: { nombre: texto(c.nombre) ?? "Cliente", celular: texto(c.celular), documento: texto(c.documento), miembroDelClub: booleano(c.miembro_del_club) },
    total: numero(d.total),
    pagado: numero(d.pagado),
    falta: numero(d.falta),
    creadoEn: texto(d.creado_en) ?? new Date(0).toISOString(),
    venceEn: texto(d.vence_en),
    confirmadoEn: texto(d.confirmado_en),
    pagadoEn: texto(d.pagado_en),
    entregadoEn: texto(d.entregado_en),
    cerradoEn: texto(d.cerrado_en),
    cierreMotivo: texto(d.cierre_motivo),
    sinPagar: booleano(d.sin_pagar),
    listoParaRecoger: booleano(d.listo_para_recoger),
    sinRecoger: booleano(d.sin_recoger),
    plazos: leerPlazos(d.plazos),
    tiendaWeb: { nombre: texto(tw.nombre) ?? texto(d.tienda) ?? "la tienda", direccion: texto(tw.direccion), horario: texto(tw.horario) },
    lugares: {
      ...(texto(lugares.almacen_tienda) ? { almacen: texto(lugares.almacen_tienda)! } : {}),
      ...(texto(lugares.piso_venta) ? { piso: texto(lugares.piso_venta)! } : {}),
    },
    cajaAbierta: typeof d.caja_abierta === "boolean" ? d.caja_abierta : null,
    ventaId: texto(d.venta_id),
    boleta: leerBoleta(d.boleta),
    entregadoPor: texto(d.entregado_por),
    anulacionBoleta: leerCaminoBoleta(d.anulacion_boleta),
    notaCredito: leerNotaCredito(d.nota_credito),
    cupon: leerCuponDelPedido(d.cupon),
    pagos: lista(d.pagos).map((x): PagoDeLista => {
      const g = obj(x);
      return {
        id: texto(g.pago_id) ?? "",
        origen: g.origen === "pasarela" ? "pasarela" : "tienda",
        medio: texto(g.medio) ?? "",
        monto: numero(g.monto),
        estado: texto(g.estado) ?? "",
        numeroOperacion: texto(g.numero_operacion),
        observacion: texto(g.observacion),
        registradoEn: texto(g.registrado_en) ?? "",
        registradoPor: texto(g.registrado_por),
        enCaja: booleano(g.en_caja),
        anuladoEn: texto(g.anulado_en),
        anuladoPor: texto(g.anulado_por),
        anuladoMotivo: texto(g.anulado_motivo),
      };
    }),
    lineas: lista(d.lineas)
      .map((x): LineaDetalle => {
        const l = obj(x);
        const disp = obj(l.disponible);
        const t = obj(l.traslado);
        return {
          ...leerPrenda(l),
          lineaId: texto(l.linea_id) ?? "",
          posicion: numero(l.posicion),
          precio: numero(l.precio),
          precioLista: numero(l.precio_lista),
          descuento: numero(l.descuento),
          estado: estadoLineaDe(l.estado),
          ubicacionId: texto(l.ubicacion_id),
          tiendaReserva: texto(l.tienda_reserva),
          lugar: lugarDe(l.lugar),
          fechaCompromiso: texto(l.fecha_compromiso),
          disponible: {
            almacen: numero(disp.almacen),
            piso: numero(disp.piso),
            sinLugar: numero(disp.sin_lugar),
            otras: lista(disp.otras_tiendas)
              .map((o) => ({ ubicacionId: texto(obj(o).ubicacion_id) ?? "", tienda: texto(obj(o).tienda) ?? "otra tienda", libres: numero(obj(o).libres) }))
              .filter((o) => o.ubicacionId !== "" && o.libres > 0),
          },
          compiten: lista(l.compiten).map((o) => ({ codigo: texto(obj(o).codigo) ?? "", separoAntes: booleano(obj(o).separo_antes) })),
          puedoOperarAlli: booleano(l.puedo_operar_alli),
          traslado: texto(t.transferencia_id)
            ? {
                transferenciaId: texto(t.transferencia_id)!,
                numero: numero(t.numero),
                estado: (texto(t.estado) ?? "en_transito") as TrasladoDeLinea["estado"],
                desde: texto(t.desde) ?? "otra tienda",
                desdeId: texto(t.desde_id) ?? "",
                llegaEl: texto(t.llega_el),
              }
            : null,
        };
      })
      .sort((a, b) => a.posicion - b.posicion),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// La lista: pestañas, cifras y en qué está cada pedido
// ---------------------------------------------------------------------------------------------------------------------------

export type PestanaPedidos = "confirmar" | "cobrar" | "entregar" | "cerrados";
/** El nombre de cada estación del camino (y del filtro que pone). */
export const NOMBRE_ESTACION: Readonly<Record<PestanaPedidos, string>> = {
  confirmar: "Por confirmar",
  cobrar: "Por cobrar",
  entregar: "Por entregar",
  cerrados: "Cerrados",
};

export function pestanaDe(estado: EstadoPedidoWeb): PestanaPedidos {
  if (estado === "por_confirmar") return "confirmar";
  if (estado === "confirmado") return "cobrar";
  if (estado === "pagado") return "entregar";
  return "cerrados";
}

/** El último momento que vivió el pedido (para ordenar y para «hace 40 min»). */
export function momentoDe(p: Pick<PedidoDeLista, "creadoEn" | "confirmadoEn" | "pagadoEn" | "entregadoEn" | "cerradoEn">): string {
  return p.entregadoEn ?? p.cerradoEn ?? p.pagadoEn ?? p.confirmadoEn ?? p.creadoEn;
}

/** Cada pestaña con sus pedidos: lo que lleva más tiempo esperando, arriba (lo cerrado, lo último arriba). */
export function agruparPorPestana(pedidos: readonly PedidoDeLista[]): Record<PestanaPedidos, PedidoDeLista[]> {
  const grupos: Record<PestanaPedidos, PedidoDeLista[]> = { confirmar: [], cobrar: [], entregar: [], cerrados: [] };
  for (const p of pedidos) grupos[pestanaDe(p.estado)].push(p);
  const porMomento = (a: PedidoDeLista, b: PedidoDeLista) => Date.parse(momentoDe(a)) - Date.parse(momentoDe(b)) || a.numero - b.numero;
  for (const k of ["confirmar", "cobrar", "entregar"] as const) grupos[k].sort(porMomento);
  grupos.cerrados.sort((a, b) => porMomento(b, a));
  return grupos;
}

const HORA = 3_600_000;

/** «3 h» o «40 min»: lo que falta para que venza (nunca «0 min»). */
export function plazoCorto(ms: number): string {
  return ms >= HORA ? `${Math.floor(ms / HORA)} h` : `${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

export type CifrasPedidosWeb = {
  porConfirmar: number;
  /** Lo que le queda al que vence primero; null si no hay ninguno por confirmar. */
  proximoVenceEnMs: number | null;
  porCobrar: number;
  confirmados: number;
  sinPagar: number;
  porEntregar: number;
  sinRecoger: number;
  cobradoHoy: number;
  /** Lo que la tienda todavía tiene de clientes en pedidos anulados (se les devuelve anulando cada pago), y en cuántos pedidos. */
  porDevolver: number;
  pedidosPorDevolver: number;
  /** Pagados que todavía esperan una prenda (por traer o por conseguir): no se pueden entregar. */
  esperanPrenda: number;
  /** Lo que le queda al confirmado SIN NINGÚN pago que se anula solo primero (`fn_anular_pedidos_web_sin_pagar`, ADR-0408 D2: a las
   *  horas de «Si no paga» se anula y sus prendas se liberan); null si no hay ninguno. Con un pago parcial no se anula: solo avisa. */
  proximoAnulaEnMs: number | null;
  /** Lo cerrado de los últimos 30 días (lo que manda la base): entregado, anulado o vencido. */
  cerrados: number;
};

export function cifrasDe(t: Pick<TableroPedidosWeb, "pedidos" | "cobradoHoy"> & { plazos?: PlazosPedidosWeb }, ahora: number): CifrasPedidosWeb {
  const plazos = t.plazos ?? PLAZOS_DE_FABRICA;
  const porConfirmar = t.pedidos.filter((p) => p.estado === "por_confirmar");
  const confirmados = t.pedidos.filter((p) => p.estado === "confirmado");
  const pagados = t.pedidos.filter((p) => p.estado === "pagado");
  const conPlata = t.pedidos.filter((p) => p.estado === "anulado" && p.pagado > 0);
  const vencen = porConfirmar.map((p) => (p.venceEn ? Date.parse(p.venceEn) - ahora : null)).filter((x): x is number => x !== null);
  return {
    porConfirmar: porConfirmar.length,
    proximoVenceEnMs: vencen.length ? Math.max(0, Math.min(...vencen)) : null,
    porCobrar: Math.round(confirmados.reduce((a, p) => a + p.falta, 0) * 100) / 100,
    confirmados: confirmados.length,
    sinPagar: confirmados.filter((p) => p.sinPagar).length,
    porEntregar: pagados.length,
    sinRecoger: pagados.filter((p) => p.sinRecoger).length,
    cobradoHoy: t.cobradoHoy,
    porDevolver: Math.round(conPlata.reduce((a, p) => a + p.pagado, 0) * 100) / 100,
    pedidosPorDevolver: conPlata.length,
    esperanPrenda: pagados.filter((p) => !p.listoParaRecoger).length,
    proximoAnulaEnMs: (() => {
      const anulan = confirmados.filter((p) => p.pagado === 0).map((p) => limiteDe(p, plazos)).filter((x): x is number => x !== null);
      return anulan.length ? Math.max(0, Math.min(...anulan) - ahora) : null;
    })(),
    cerrados: t.pedidos.filter((p) => pestanaDe(p.estado) === "cerrados").length,
  };
}

/** Por confirmar y a menos de 3 horas de cerrarse solo: la cifra y el chip lo dicen en rojo. */
export const URGENTE_MS = 3 * HORA;

export type TonoEstado = "ambar" | "rojo" | "pizarra" | "verde" | "neutro" | "apagado";

/** En qué está el pedido y qué toca hacer, en palabras de tienda (la maqueta, `chipEstado` y `accionTexto`). */
export function estadoVisible(
  p: Pick<PedidoDeLista, "estado" | "venceEn" | "confirmadoEn" | "pagadoEn" | "falta" | "pagado" | "sinPagar" | "sinRecoger" | "listoParaRecoger">,
  ahora: number,
): { texto: string; tono: TonoEstado; vivo: boolean; accion: string } {
  if (p.estado === "por_confirmar") {
    const queda = p.venceEn ? Math.max(0, Date.parse(p.venceEn) - ahora) : 0;
    const urgente = queda < URGENTE_MS;
    return { texto: `Por confirmar · vence en ${plazoCorto(queda)}`, tono: urgente ? "rojo" : "ambar", vivo: urgente, accion: "Revisa el stock y confírmalo" };
  }
  if (p.estado === "confirmado") {
    if (p.sinPagar)
      return {
        texto: `Sin pagar · confirmado ${p.confirmadoEn ? haceCuanto(p.confirmadoEn, ahora) : ""}`.trim(),
        tono: "rojo",
        vivo: false,
        accion: "Escríbele y decide si lo anulas",
      };
    return { texto: `Por cobrar · falta ${soles(p.falta)}`, tono: "pizarra", vivo: false, accion: "Registra su pago cuando lo haga" };
  }
  if (p.estado === "pagado") {
    if (p.sinRecoger)
      return { texto: `Sin recoger · pagó ${p.pagadoEn ? haceCuanto(p.pagadoEn, ahora) : ""}`.trim(), tono: "rojo", vivo: false, accion: "Escríbele para que pase a recogerlo" };
    if (!p.listoParaRecoger) return { texto: "Pagado · espera una prenda", tono: "pizarra", vivo: false, accion: "Avísale cuando llegue" };
    return { texto: "Pagado · por entregar", tono: "verde", vivo: false, accion: "Entrégalo con su código" };
  }
  if (p.estado === "entregado") return { texto: "Entregado", tono: "neutro", vivo: false, accion: "" };
  if (p.estado === "vencido") return { texto: "Se cerró sin confirmar", tono: "apagado", vivo: false, accion: "" };
  // Anulado con plata del cliente todavía en la tienda (ADR-0408 act. 9): es lo que falta hacer con él.
  if (p.pagado > 0) return { texto: `Anulado · por devolver ${soles(p.pagado)}`, tono: "rojo", vivo: false, accion: "Devuélvele lo que pagó" };
  return { texto: "Anulado", tono: "apagado", vivo: false, accion: "" };
}

/**
 * El RELOJ del plazo de un pedido abierto (Tienda web ▸ Pedidos, ADR-0430): cuánto lleva del plazo del paso en que está, para la barra
 * fina de su fila. Por confirmar: de las horas para confirmar, desde que se separó (se cierra solo al llegar). Confirmado: de las horas
 * del aviso «sin pagar», desde que se confirmó. Pagado: de los días para recoger, desde que se pagó. El tono es el mismo que ya decide
 * `estadoVisible` (rojo si urge o ya pasó; ámbar pasada la mitad), así barra y chip nunca dicen dos cosas. `null`: nada que medir.
 */
export function relojDelPlazo(
  p: Pick<PedidoDeLista, "estado" | "creadoEn" | "venceEn" | "confirmadoEn" | "pagadoEn" | "sinPagar" | "sinRecoger">,
  plazos: PlazosPedidosWeb,
  ahora: number,
): { pct: number; tono: "tinta" | "ambar" | "rojo"; texto: string } | null {
  const medir = (desde: string | null, totalMs: number, nombre: string) => {
    const d = desde ? Date.parse(desde) : Number.NaN;
    if (!Number.isFinite(d) || totalMs <= 0) return null;
    const pct = Math.min(100, Math.max(0, ((ahora - d) / totalMs) * 100));
    return { pct, texto: `Lleva ${Math.round(pct)} % del plazo para ${nombre}` };
  };
  if (p.estado === "por_confirmar") {
    const total = plazos.horasParaConfirmar * HORA;
    const desde = p.venceEn ? new Date(Date.parse(p.venceEn) - total).toISOString() : p.creadoEn;
    const m = medir(desde, total, "confirmar");
    if (!m) return null;
    const queda = p.venceEn ? Date.parse(p.venceEn) - ahora : total * (1 - m.pct / 100);
    return { ...m, tono: queda < URGENTE_MS ? "rojo" : m.pct >= 50 ? "ambar" : "tinta" };
  }
  if (p.estado === "confirmado") {
    const m = medir(p.confirmadoEn, plazos.horasAvisoSinPagar * HORA, "pagar");
    return m && { ...m, tono: p.sinPagar ? "rojo" : m.pct >= 50 ? "ambar" : "tinta" };
  }
  if (p.estado === "pagado") {
    const m = medir(p.pagadoEn, plazos.diasAvisoSinRecoger * 24 * HORA, "recoger");
    return m && { ...m, tono: p.sinRecoger ? "rojo" : m.pct >= 50 ? "ambar" : "tinta" };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Los motivos (los mismos que acepta la base)
// ---------------------------------------------------------------------------------------------------------------------------

export type MotivoNoConfirmar = "sin_stock" | "cliente_no_respondio" | "cliente_desistio";
export type MotivoAnular = "cliente_no_pago" | "cliente_desistio" | "error_en_pedido";
/** Los de un pedido PAGADO (`anular_pedido_web_pagado`): «no pagó» no aplica; «no se puede entregar» es de la tienda (la prenda se dañó,
 *  se perdió o la que se conseguía no llegó). */
export type MotivoAnularPagado = "cliente_desistio" | "error_en_pedido" | "no_se_puede_entregar";

export const MOTIVOS_NO_CONFIRMAR: readonly { clave: MotivoNoConfirmar; etiqueta: string }[] = [
  { clave: "sin_stock", etiqueta: "No hay stock" },
  { clave: "cliente_no_respondio", etiqueta: "El cliente no respondió" },
  { clave: "cliente_desistio", etiqueta: "El cliente desistió" },
];
export const MOTIVOS_ANULAR: readonly { clave: MotivoAnular; etiqueta: string }[] = [
  { clave: "cliente_no_pago", etiqueta: "El cliente no pagó" },
  { clave: "cliente_desistio", etiqueta: "El cliente desistió" },
  { clave: "error_en_pedido", etiqueta: "Error en el pedido" },
];
export const MOTIVOS_ANULAR_PAGADO: readonly { clave: MotivoAnularPagado; etiqueta: string }[] = [
  { clave: "cliente_desistio", etiqueta: "El cliente desistió" },
  { clave: "error_en_pedido", etiqueta: "Error en el pedido" },
  { clave: "no_se_puede_entregar", etiqueta: "No se puede entregar" },
];

/** Por qué se cerró un pedido, como lo leería la tienda. */
export function textoCierre(motivo: string | null): string {
  if (motivo === "sin_confirmar") return "Nadie lo confirmó a tiempo: se cerró solo";
  const m = [...MOTIVOS_NO_CONFIRMAR, ...MOTIVOS_ANULAR, ...MOTIVOS_ANULAR_PAGADO].find((x) => x.clave === motivo);
  return m ? m.etiqueta : "Se cerró";
}

// ---------------------------------------------------------------------------------------------------------------------------
// El camino y «Lo que te toca» (ADR-0430, actualización 2026-10-17): una sola navegación, cada fila con su plazo y su verbo
// ---------------------------------------------------------------------------------------------------------------------------

/** Una estación del camino: cuántos pedidos hay en ese paso (siempre pedidos, nunca soles) y, abajo, lo que urge o la plata. */
export type EstacionCamino = {
  clave: PestanaPedidos;
  etiqueta: string;
  valor: number;
  pie: string;
  punto: "neutro" | "ambar" | "verde" | "rojo";
  vivo: boolean;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Las cuatro estaciones del camino, las mismas en Pedidos y en el Resumen. Todas cuentan PEDIDOS: antes «Por cobrar» decía soles entre
 * dos cifras de pedidos y «Cobrado hoy» cerraba la fila como si fuera el paso que sigue a entregar. La plata va en el pie («Faltan …»), y
 * lo cobrado hoy, en la cabecera de la pantalla.
 */
export function estacionesDe(c: CifrasPedidosWeb, plazos: PlazosPedidosWeb): [EstacionCamino, EstacionCamino, EstacionCamino, EstacionCamino] {
  const urgente = c.proximoVenceEnMs !== null && c.proximoVenceEnMs < URGENTE_MS;
  const anulaPronto = c.proximoAnulaEnMs !== null && c.proximoAnulaEnMs < URGENTE_MS;
  const listos = c.porEntregar - c.esperanPrenda;
  return [
    {
      clave: "confirmar",
      etiqueta: NOMBRE_ESTACION.confirmar,
      valor: c.porConfirmar,
      pie: c.proximoVenceEnMs !== null ? `El primero se cierra en ${plazoCorto(c.proximoVenceEnMs)}` : "Nada esperando",
      punto: c.porConfirmar > 0 ? (urgente ? "rojo" : "ambar") : "neutro",
      vivo: urgente,
    },
    {
      clave: "cobrar",
      etiqueta: NOMBRE_ESTACION.cobrar,
      valor: c.confirmados,
      pie:
        c.confirmados === 0
          ? "Nada por cobrar"
          : [
              `Faltan ${soles(c.porCobrar)}`,
              c.proximoAnulaEnMs !== null ? `el primero sin pago se anula en ${plazoCorto(c.proximoAnulaEnMs)}` : null,
              c.sinPagar > 0 ? `${c.sinPagar} sin pagar hace más de ${plazos.horasAvisoSinPagar} h` : null,
            ]
              .filter(Boolean)
              .join(" · "),
      punto: anulaPronto || c.sinPagar > 0 ? "rojo" : c.confirmados > 0 ? "ambar" : "neutro",
      vivo: anulaPronto,
    },
    {
      clave: "entregar",
      etiqueta: NOMBRE_ESTACION.entregar,
      valor: c.porEntregar,
      pie:
        c.porEntregar === 0
          ? "Nada por entregar"
          : c.sinRecoger > 0
            ? `${c.sinRecoger} sin recoger hace más de ${plazos.diasAvisoSinRecoger} días`
            : [listos > 0 ? plural(listos, "listo para recoger", "listos para recoger") : null, c.esperanPrenda > 0 ? plural(c.esperanPrenda, "espera una prenda", "esperan una prenda") : null]
                .filter(Boolean)
                .join(" · "),
      punto: c.sinRecoger > 0 ? "rojo" : c.porEntregar > 0 ? "verde" : "neutro",
      vivo: false,
    },
    {
      clave: "cerrados",
      etiqueta: NOMBRE_ESTACION.cerrados,
      valor: c.cerrados,
      // La plata de un anulado es lo único que falta hacer con lo cerrado: va primero.
      pie: c.porDevolver > 0 ? `${soles(c.porDevolver)} por devolver` : "Últimos 30 días",
      punto: c.porDevolver > 0 ? "rojo" : "neutro",
      vivo: false,
    },
  ];
}

/** Un tramo del camino: qué lo hace avanzar, en cuánto y si al llegar el pedido SE CIERRA (se pierde la venta) o solo avisa. */
export type TramoPedidos = { verbo: string; plazo: string; cierra: boolean };

/** Los tres tramos: si nadie lo confirma, se cierra solo; si no paga NADA, se anula solo (con un pago parcial solo avisa:
 *  `fn_anular_pedidos_web_sin_pagar`, ADR-0408 D2); recoger solo avisa. Los dos primeros pierden la venta: van como los que cierran. */
export function tramosDelCamino(plazos: PlazosPedidosWeb): [TramoPedidos, TramoPedidos, TramoPedidos] {
  return [
    { verbo: "Confirmas", plazo: `se cierra a las ${plazos.horasParaConfirmar} h`, cierra: true },
    { verbo: "Te paga", plazo: `sin pago, se anula a las ${plazos.horasAvisoSinPagar} h`, cierra: true },
    { verbo: "Lo recoge", plazo: `aviso a los ${plazos.diasAvisoSinRecoger} días`, cierra: false },
  ];
}

/** «¿Cómo funciona?»: una regla por estación, la que antes vivía en una nota de cinco reglas al pie de la pantalla. */
export function reglasDelCamino(plazos: PlazosPedidosWeb): Record<PestanaPedidos, string> {
  return {
    confirmar: `Separar no toca el stock: la prenda se reserva cuando confirmas. Si nadie lo confirma en ${plazos.horasParaConfirmar} h, se cierra solo.`,
    cobrar: `Registra cada pago dentro del pedido; con el que lo completa sale su boleta. Si no paga nada en ${plazos.horasAvisoSinPagar} h, se anula solo y sus prendas se liberan; si pagó una parte, solo avisa.`,
    entregar: "Se entrega con el código de 4 cifras que el cliente ve en su pedido. Recién ahí la prenda sale del stock.",
    cerrados: "Quedan 30 días: lo entregado, lo anulado y lo que nadie confirmó a tiempo. Van aparte de los apartados de la tienda.",
  };
}

/** ¿Queda algo por hacer con este pedido? Lo abierto y, de lo cerrado, el anulado que todavía tiene plata del cliente. */
export function pideAlgo(p: Pick<PedidoDeLista, "estado" | "pagado">): boolean {
  return pestanaDe(p.estado) !== "cerrados" || (p.estado === "anulado" && p.pagado > 0);
}

/** El momento en que vence el plazo del paso en que está (se cierra solo o salta su aviso); null si no tiene. */
function limiteDe(p: Pick<PedidoDeLista, "estado" | "venceEn" | "confirmadoEn" | "pagadoEn" | "cerradoEn">, plazos: PlazosPedidosWeb): number | null {
  const t = (x: string | null) => (x ? Date.parse(x) : Number.NaN);
  const v =
    p.estado === "por_confirmar"
      ? t(p.venceEn)
      : p.estado === "confirmado"
        ? t(p.confirmadoEn) + plazos.horasAvisoSinPagar * HORA
        : p.estado === "pagado"
          ? t(p.pagadoEn) + plazos.diasAvisoSinRecoger * 24 * HORA
          : t(p.cerradoEn);
  return Number.isFinite(v) ? v : null;
}

/**
 * «Lo que te toca»: lo que pide algo, con lo que se PIERDE si no actúas arriba. Primero lo que se cierra o se anula solo en menos de 3 h
 * (por confirmar, o confirmado sin ningún pago); después lo que ya pasó su aviso (sin pagar, sin recoger) y la plata por devolver; después
 * lo demás que se cierra o se anula solo (pierde la venta);
 * después lo que solo avisa, por lo que le queda; al final lo que espera una prenda (no depende de la tienda). En cada grupo, lo que
 * vence antes arriba.
 */
export function loQueTeToca(pedidos: readonly PedidoDeLista[], plazos: PlazosPedidosWeb, ahora: number): PedidoDeLista[] {
  const grupo = (p: PedidoDeLista): number => {
    if (p.estado === "por_confirmar") return p.venceEn && Date.parse(p.venceEn) - ahora < URGENTE_MS ? 0 : 2;
    // Confirmado sin ningún pago: se anula solo, igual que lo que nadie confirma (pierde la venta).
    if (p.estado === "confirmado" && p.pagado === 0) {
      const l = limiteDe(p, plazos);
      return l !== null && l - ahora < URGENTE_MS ? 0 : 2;
    }
    if (p.estado === "anulado" || p.sinPagar || p.sinRecoger) return 1;
    if (p.estado === "pagado" && !p.listoParaRecoger) return 4;
    return 3;
  };
  return pedidos
    .filter(pideAlgo)
    .map((p) => ({ p, g: grupo(p), l: limiteDe(p, plazos) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.g - b.g || a.l - b.l || a.p.numero - b.p.numero)
    .map((x) => x.p);
}

/** «hoy a las 22:15», «mañana a las 10:44», «ayer a las 18:02» o «el 19 oct a las 10:44»: un instante, como se dice en la tienda. */
export function cuandoEnLima(instante: string, ahora: number): string {
  const dia = diaLima(instante);
  const hora = horaLima(instante);
  if (!dia || !hora) return "";
  const hoy = hoyLima(new Date(ahora));
  const cual = dia === hoy ? "hoy" : dia === sumarDias(hoy, 1) ? "mañana" : dia === sumarDias(hoy, -1) ? "ayer" : `el ${fechaCorta(dia)}`;
  return `${cual} a las ${hora}`;
}

export type TonoReloj = "tinta" | "ambar" | "rojo" | "verde" | "pizarra";

/** El plazo de una fila de la lista, UNA vez: qué pasa y cuándo (el texto), por qué importa (el detalle) y cuánto va (la barra). */
export type RelojDeFila = {
  texto: string;
  detalle: string | null;
  tono: TonoReloj;
  barra: { pct: number; tono: "tinta" | "ambar" | "rojo"; etiqueta: string } | null;
};

/**
 * Antes cada fila decía su estado tres veces (la insignia, una frase con lo que toca hacer y la barra). Ahora el reloj dice CUÁNDO y qué
 * pasa si no, y el verbo del botón (`verboDe`) dice QUÉ. El tono es el de `relojDelPlazo`, así barra y texto nunca dicen dos cosas.
 */
export function relojDeFila(
  p: Pick<PedidoDeLista, "estado" | "creadoEn" | "venceEn" | "confirmadoEn" | "pagadoEn" | "cerradoEn" | "cierreMotivo" | "total" | "pagado" | "sinPagar" | "sinRecoger" | "listoParaRecoger" | "porConseguir" | "porTraer">,
  plazos: PlazosPedidosWeb,
  ahora: number,
): RelojDeFila {
  const r = relojDelPlazo(p, plazos, ahora);
  const barra = r ? { pct: r.pct, tono: r.tono, etiqueta: r.texto } : null;
  const tonoDe = (t: "tinta" | "ambar" | "rojo" | undefined): TonoReloj => t ?? "tinta";
  if (p.estado === "por_confirmar") {
    const queda = p.venceEn ? Math.max(0, Date.parse(p.venceEn) - ahora) : 0;
    const urgente = queda < URGENTE_MS;
    return {
      texto: `Se cierra solo en ${plazoCorto(queda)}`,
      detalle: urgente ? "Si nadie lo confirma, se pierde" : p.venceEn ? `Hasta ${cuandoEnLima(p.venceEn, ahora)}` : null,
      tono: urgente ? "rojo" : tonoDe(r?.tono),
      barra,
    };
  }
  if (p.estado === "confirmado") {
    // Sin ningún pago, se anula solo al cumplir sus horas (`fn_anular_pedidos_web_sin_pagar`, cada 15 min): es un plazo que pierde la
    // venta, como el de confirmar. Con un pago parcial no se anula: solo avisa, y decide la tienda.
    if (p.pagado === 0) {
      const limite = limiteDe(p, plazos);
      const queda = limite !== null ? limite - ahora : null;
      if (queda !== null && queda <= 0)
        return { texto: "Se anula en minutos", detalle: `No pagó nada en ${plazos.horasAvisoSinPagar} h`, tono: "rojo", barra };
      const urgente = queda !== null && queda < URGENTE_MS;
      return {
        texto: queda !== null ? `Sin pago, se anula en ${plazoCorto(queda)}` : "Esperando su pago",
        detalle: urgente ? "Si no paga nada, se pierde" : limite !== null ? `Si no paga nada hasta ${cuandoEnLima(new Date(limite).toISOString(), ahora)}` : null,
        tono: urgente ? "rojo" : tonoDe(r?.tono),
        barra,
      };
    }
    if (p.sinPagar)
      return {
        texto: `Falta ${soles(p.total - p.pagado)} · confirmado ${p.confirmadoEn ? haceCuanto(p.confirmadoEn, ahora) : ""}`.trim(),
        detalle: `Pagó una parte y pasó el aviso de ${plazos.horasAvisoSinPagar} h: no se anula solo`,
        tono: "rojo",
        barra: null,
      };
    return { texto: `Pagó ${soles(p.pagado)} de ${soles(p.total)}`, detalle: "Pagó una parte: no se anula solo", tono: "tinta", barra: null };
  }
  if (p.estado === "pagado") {
    if (p.sinRecoger)
      return {
        texto: `Sin recoger · pagó ${p.pagadoEn ? haceCuanto(p.pagadoEn, ahora) : ""}`.trim(),
        detalle: `Ya pasó el aviso de ${plazos.diasAvisoSinRecoger} días`,
        tono: "rojo",
        barra,
      };
    if (!p.listoParaRecoger) {
      const n = p.porConseguir + p.porTraer;
      return { texto: n > 1 ? `Espera ${n} prendas` : "Espera una prenda", detalle: "Avísale cuando llegue", tono: "pizarra", barra: null };
    }
    return { texto: "Listo para recoger", detalle: "Pide su código de 4 cifras", tono: "verde", barra };
  }
  if (p.estado === "anulado" && p.pagado > 0)
    return { texto: `Por devolver ${soles(p.pagado)}`, detalle: `Anulado: ${textoCierre(p.cierreMotivo).toLocaleLowerCase("es")}`, tono: "rojo", barra: null };
  return { texto: motivoDeCierre(p).texto, detalle: null, tono: "tinta", barra: null };
}

/** El verbo del botón de la fila: lo que toca hacer ahora. El botón abre la hoja del pedido, donde se hace (nunca hace nada solo).
 *  null: no queda nada que hacer (lo cerrado se abre tocando la fila). */
export function verboDe(p: Pick<PedidoDeLista, "estado" | "pagado" | "sinPagar" | "sinRecoger" | "listoParaRecoger">): string | null {
  if (p.estado === "por_confirmar") return "Confirmar";
  // Sin ningún pago, lo que salva la venta es cobrar; con un pago parcial que ya pasó su aviso, escribirle (no se anula solo).
  if (p.estado === "confirmado") return p.sinPagar && p.pagado > 0 ? "Escribirle" : "Registrar pago";
  if (p.estado === "pagado") return p.sinRecoger ? "Escribirle" : p.listoParaRecoger ? "Entregar" : "Ver pedido";
  if (p.estado === "anulado" && p.pagado > 0) return "Devolver";
  return null;
}

/** Por qué se cerró un pedido, agrupable: entregado, nadie lo confirmó a tiempo, o el motivo con que se anuló. */
export type MotivoDeCierre = { clave: string; texto: string };

export function motivoDeCierre(p: Pick<PedidoDeLista, "estado" | "cierreMotivo">): MotivoDeCierre {
  if (p.estado === "entregado") return { clave: "entregado", texto: "Entregado" };
  if (p.estado === "vencido" || p.cierreMotivo === "sin_confirmar") return { clave: "sin_confirmar", texto: "Nadie lo confirmó a tiempo" };
  return { clave: p.cierreMotivo ?? "otro", texto: p.cierreMotivo ? textoCierre(p.cierreMotivo) : "Anulado" };
}

/** Lo que dicen los cerrados juntos: cuántos por cada motivo. Primero lo entregado, después lo que se perdió por la tienda (nadie lo
 *  confirmó, no había stock) y después lo del cliente, de más a menos. Si «no había stock» crece, la vitrina muestra lo que la tienda no
 *  tiene; «nadie lo confirmó» es una venta perdida. */
export function porQueSeCerraron(pedidos: readonly Pick<PedidoDeLista, "estado" | "cierreMotivo">[]): (MotivoDeCierre & { cuantos: number })[] {
  const PRIMERO = ["entregado", "sin_confirmar", "sin_stock"];
  const cuenta = new Map<string, MotivoDeCierre & { cuantos: number }>();
  for (const p of pedidos) {
    if (pestanaDe(p.estado) !== "cerrados") continue;
    const m = motivoDeCierre(p);
    const ya = cuenta.get(m.clave);
    if (ya) ya.cuantos++;
    else cuenta.set(m.clave, { ...m, cuantos: 1 });
  }
  const lugar = (k: string) => (PRIMERO.includes(k) ? PRIMERO.indexOf(k) : PRIMERO.length);
  return [...cuenta.values()].sort((a, b) => lugar(a.clave) - lugar(b.clave) || b.cuantos - a.cuantos || a.texto.localeCompare(b.texto, "es"));
}

/** «Todo al día»: no queda nada que hacer, en una línea, con lo último que pasó (que es lo que la persona quiere saber después). */
export function todoAlDia(pedidos: readonly PedidoDeLista[], tienda: string, ahora: number): string {
  const ultimo = [...pedidos].sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn))[0];
  const base = `No hay pedidos web esperando en ${tienda}.`;
  if (!ultimo) return `${base} Todavía no llegó ninguno.`;
  const m = motivoDeCierre(ultimo);
  const final = m.clave === "entregado" ? "ya se entregó" : m.clave === "sin_confirmar" ? "nadie lo confirmó a tiempo" : `se cerró: ${m.texto.toLocaleLowerCase("es")}`;
  return `${base} El último (${ultimo.codigo}) llegó ${cuandoEnLima(ultimo.creadoEn, ahora)} y ${final}.`;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Confirmar: la decisión de cada prenda
// ---------------------------------------------------------------------------------------------------------------------------

/** De dónde sale cada prenda: reservarla (en la tienda del pedido o en otra, y el lugar), conseguirla para una fecha, o quitarla. */
export type DecisionLinea =
  | { tipo: "reservar"; ubicacionId: string; lugar: LugarWeb | null }
  | { tipo: "por_conseguir"; fecha: string }
  | { tipo: "quitar" };

/** Cuánto hay libre en la tienda del pedido, por lugar. */
export function libresAqui(l: Pick<LineaDetalle, "disponible">): number {
  return l.disponible.almacen + l.disponible.piso + l.disponible.sinLugar;
}

/** El lugar de fábrica: el almacén primero (propuesta j), si no el piso, y en una tienda sin lugares, ninguno. */
export function lugarDeFabrica(l: Pick<LineaDetalle, "disponible">): LugarWeb | null {
  if (l.disponible.almacen > 0) return "almacen";
  if (l.disponible.piso > 0) return "piso";
  return null;
}

/** Lo que viene elegido al abrir: si hay en la tienda del pedido, reservarla ahí (del almacén primero); si no, nada (hay que decidir). */
export function decisionDeFabrica(l: Pick<LineaDetalle, "disponible">, tiendaPedidoId: string): DecisionLinea | null {
  return libresAqui(l) > 0 ? { tipo: "reservar", ubicacionId: tiendaPedidoId, lugar: lugarDeFabrica(l) } : null;
}

/** Lo que le falta a la decisión de una prenda, o null si está lista. La misma regla que `confirmar_pedido_web`. */
export function faltaDeDecision(d: DecisionLinea | null | undefined, hoy: string): string | null {
  if (!d) return "Elige qué hacer con esta prenda.";
  if (d.tipo === "por_conseguir") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return "Elige para qué fecha la consigues.";
    if (d.fecha < hoy || d.fecha > sumarDias(hoy, MAX_DIAS_PROMESA)) return `La fecha va de hoy a ${MAX_DIAS_PROMESA} días.`;
  }
  return null;
}

/** El tope de la fecha que se le promete: el mismo de la base (`confirmar_pedido_web`, c_max_dias). */
export const MAX_DIAS_PROMESA = 60;

/** Las fechas que se ofrecen para conseguir una prenda (la maqueta: en 3, 7 y 14 días). */
export function fechasSugeridas(hoy: string): { fecha: string; etiqueta: string }[] {
  return [3, 7, 14].map((d) => ({ fecha: sumarDias(hoy, d), etiqueta: `${fechaCorta(sumarDias(hoy, d))} · en ${d} días` }));
}

/** ¿Se puede confirmar con estas decisiones? Todas decididas y al menos una que no se quita (si no, es «No se puede confirmar»). */
export function problemaParaConfirmar(lineas: readonly Pick<LineaDetalle, "lineaId">[], decisiones: Readonly<Record<string, DecisionLinea | null>>, hoy: string): string | null {
  if (lineas.length === 0) return "El pedido no trae prendas.";
  if (lineas.some((l) => faltaDeDecision(decisiones[l.lineaId], hoy) !== null)) return "Falta decidir alguna prenda.";
  if (lineas.every((l) => decisiones[l.lineaId]?.tipo === "quitar"))
    return "Si quitas todas las prendas, ciérralo con «No se puede confirmar».";
  return null;
}

/** Una decisión como la lee `confirmar_pedido_web`. */
export type DecisionParaLaBase = { linea_id: string; decision: string | null; fecha?: string; ubicacion_id?: string; sububicacion_id?: string | null };

/** Las decisiones como las pide `confirmar_pedido_web` (una por prenda). */
export function decisionesParaLaBase(
  lineas: readonly Pick<LineaDetalle, "lineaId">[],
  decisiones: Readonly<Record<string, DecisionLinea | null>>,
  lugares: PedidoDetalle["lugares"],
  tiendaPedidoId: string,
): DecisionParaLaBase[] {
  return lineas.map((l) => {
    const d = decisiones[l.lineaId];
    if (!d) return { linea_id: l.lineaId, decision: null };
    if (d.tipo === "quitar") return { linea_id: l.lineaId, decision: "quitar" };
    if (d.tipo === "por_conseguir") return { linea_id: l.lineaId, decision: "por_conseguir", fecha: d.fecha };
    // El lugar elegido solo existe en la tienda del pedido; en otra tienda, la base reserva del almacén primero.
    const sub = d.ubicacionId === tiendaPedidoId && d.lugar ? (lugares[d.lugar] ?? null) : null;
    return { linea_id: l.lineaId, decision: "reservar", ubicacion_id: d.ubicacionId, sububicacion_id: sub };
  });
}

/** «Hay 2 en Trujillo (1 en almacén, 1 en piso)» / «No hay en Trujillo. Hay 1 en Lima.» / «No hay en ninguna tienda.» */
export function textoDisponible(l: Pick<LineaDetalle, "disponible">, tienda: string): string {
  const aqui = libresAqui(l);
  if (aqui > 0) {
    const partes = [l.disponible.almacen > 0 ? `${l.disponible.almacen} en almacén` : null, l.disponible.piso > 0 ? `${l.disponible.piso} en piso` : null].filter(Boolean);
    return `Hay ${aqui} en ${tienda}${partes.length ? ` (${partes.join(", ")})` : ""}`;
  }
  const otra = [...l.disponible.otras].sort((a, b) => b.libres - a.libres)[0];
  if (otra) return `No hay en ${tienda}. Hay ${otra.libres} en ${otra.tienda}.`;
  return "No hay en ninguna tienda.";
}

/** Qué hacer físicamente con la prenda que se reserva en la tienda del pedido. */
export function textoDeDonde(lugar: LugarWeb | null): string {
  if (lugar === "almacen") return "Sácala del almacén.";
  if (lugar === "piso") return "Está en el piso: retírala del colgador.";
  return "Sepárala para el pedido.";
}

/** Los avisos de la prenda: si es la última DE LA TIENDA donde se reserva y quién más la pidió (propuesta k). Lo decide la tienda.
 *  Cuenta la tienda entera, no el lugar elegido: con 1 en el almacén y 1 en el piso no es la última (antes decía «Es la última en
 *  Tienda TRU» justo debajo de «Hay 2 en Tienda TRU»; ADR-0430, corrección 2026-10-17 c). */
export function avisosDeLinea(l: Pick<LineaDetalle, "disponible" | "compiten">, d: DecisionLinea | null | undefined, tiendaPedidoId: string, tienda: string): string[] {
  const avisos: string[] = [];
  if (d?.tipo === "reservar") {
    const aqui = d.ubicacionId === tiendaPedidoId;
    const otra = aqui ? null : l.disponible.otras.find((o) => o.ubicacionId === d.ubicacionId);
    const libres = aqui ? libresAqui(l) : (otra?.libres ?? 0);
    if (libres === 1) avisos.push(aqui ? `Es la última en ${tienda}: al confirmar, ya no se puede vender en la tienda.` : `Es la última en ${otra?.tienda ?? "esa tienda"}.`);
    if (l.compiten.length > 0) {
      const quienes = l.compiten.map((c) => `${c.codigo}${c.separoAntes ? " (la separó antes)" : ""}`).join(", ");
      avisos.push(`También la ${l.compiten.length === 1 ? "pidió" : "pidieron"} ${quienes}. Tú decides a quién confirmarla.`);
    }
  }
  return avisos;
}

/** ¿Se ofrece «Quitar del pedido» en esta prenda? Solo si queda otra sin quitar: si se quitan todas no se puede confirmar (es «No se
 *  puede confirmar», `problemaParaConfirmar`), así que en un pedido de una sola prenda el botón llevaba a un callejón. */
export function sePuedeQuitar(
  lineas: readonly Pick<LineaDetalle, "lineaId">[],
  decisiones: Readonly<Record<string, DecisionLinea | null>>,
  lineaId: string,
): boolean {
  return lineas.some((l) => l.lineaId !== lineaId && decisiones[l.lineaId]?.tipo !== "quitar");
}

// ---------------------------------------------------------------------------------------------------------------------------
// Después de confirmar: en qué está cada prenda
// ---------------------------------------------------------------------------------------------------------------------------

/** «16 oct»: una fecha (o el día de Lima de un instante), corta. */
export function fechaCorta(fechaOInstante: string | null): string {
  const dia = diaLima(fechaOInstante);
  if (!dia) return "—";
  const [, m, d] = dia.split("-");
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1] ?? ""}`.trim();
}
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** Dónde está una prenda de un pedido ya confirmado: el estado corto (la insignia) y, si hace falta, el detalle (una línea aparte). */
export function estadoDeLinea(
  l: Pick<LineaDetalle, "estado" | "ubicacionId" | "tiendaReserva" | "lugar" | "fechaCompromiso" | "traslado">,
  tiendaPedidoId: string,
): { texto: string; tono: TonoEstado; detalle: string | null } {
  if (l.estado === "reservada") {
    if (l.ubicacionId && l.ubicacionId !== tiendaPedidoId)
      return { texto: "Por traer", tono: "ambar", detalle: `Reservada en ${l.tiendaReserva ?? "otra tienda"}: falta que la envíen` };
    return { texto: "Reservada", tono: "verde", detalle: l.lugar === "almacen" ? "En el almacén" : l.lugar === "piso" ? "En el piso" : null };
  }
  if (l.estado === "por_conseguir") {
    const t = l.traslado;
    if (t && (t.estado === "en_transito" || t.estado === "recibido_con_diferencia"))
      return {
        texto: "En camino",
        tono: "pizarra",
        detalle: `Desde ${t.desde} · traslado N.º ${t.numero}${t.llegaEl ? ` · llega el ${fechaCorta(t.llegaEl)}` : ""}`,
      };
    if (t && t.estado === "anulada") return { texto: "Por conseguir", tono: "ambar", detalle: `El envío desde ${t.desde} se anuló: resérvala de nuevo o consíguela` };
    if (t) return { texto: "Por conseguir", tono: "ambar", detalle: `No llegó en el traslado N.º ${t.numero}: resérvala en otra tienda o consíguela` };
    return { texto: "Por conseguir", tono: "pizarra", detalle: `Prometida para el ${fechaCorta(l.fechaCompromiso)}` };
  }
  if (l.estado === "quitada") return { texto: "Quitada", tono: "apagado", detalle: "Se quitó del pedido al confirmar" };
  if (l.estado === "liberada") return { texto: "Liberada", tono: "apagado", detalle: "Volvió a estar disponible" };
  if (l.estado === "entregada") return { texto: "Entregada", tono: "neutro", detalle: null };
  return { texto: "Por confirmar", tono: "ambar", detalle: null };
}

/** ¿Se puede reservar ya una prenda por conseguir? Cuando lo que faltaba llegó a la tienda del pedido (se compró, salió del taller, o
 *  el envío se cerró sin ella y apareció aquí): hay libre aquí y no viene en camino. Es lo que `reservar_linea_pedido_web` acepta
 *  sin «ya no está libre»; lo que viaja se reserva solo al llegar. */
export function sePuedeReservarYa(l: Pick<LineaDetalle, "estado" | "disponible" | "traslado">): boolean {
  const enCamino = !!l.traslado && (l.traslado.estado === "en_transito" || l.traslado.estado === "recibido_con_diferencia");
  return l.estado === "por_conseguir" && !enCamino && libresAqui(l) > 0;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Enviar a la tienda del pedido (la tienda que tiene la prenda)
// ---------------------------------------------------------------------------------------------------------------------------

/** El día de llegada que viene puesto: mañana. */
export function llegadaDeFabrica(ahora: Date = new Date()): string {
  return sumarDias(hoyLima(ahora), 1);
}

/** La fecha de llegada como la pide `enviar_pedido_web_desde` (mediodía de Lima, como el envío de un pedido de Apartados). */
export function instanteDeLlegada(fecha: string): string {
  return `${fecha}T12:00:00-05:00`;
}

/** Lo que le falta a la fecha de llegada (la misma regla de la base: de hoy a 60 días). */
export function faltaDeLlegada(fecha: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elige cuándo llega.";
  if (fecha < hoy || fecha > sumarDias(hoy, MAX_DIAS_PROMESA)) return `Elige un día de hoy a ${MAX_DIAS_PROMESA} días.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Entregar con el código de 4 cifras (actividad 10)
// ---------------------------------------------------------------------------------------------------------------------------

/** El código como se guarda: solo cifras (al dictarlo se cuela un espacio o un guion), hasta 4. */
export function limpiarCodigo(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, 4);
}

/** Lo que le falta al código para mandarlo, o null. La forma (4 cifras); si es EL del pedido lo dice la base, nunca la pantalla. */
export function problemaDelCodigo(codigo: string): string | null {
  if (codigo === "") return "Escribe el código que el cliente ve en su pedido.";
  if (!/^\d{4}$/.test(codigo)) return "El código tiene 4 cifras.";
  return null;
}

/** Las prendas que todavía no están en la tienda del pedido (por conseguir, en camino o reservadas en otra): sin ellas no se entrega.
 *  La misma regla de `entregar_pedido_web` (todo reservado en la tienda del pedido). */
export function faltanParaEntregar(lineas: readonly Pick<LineaDetalle, "estado" | "ubicacionId" | "referencia" | "talla">[], tiendaPedidoId: string): string[] {
  return lineas
    .filter((l) => l.estado !== "quitada" && l.estado !== "entregada" && (l.estado !== "reservada" || l.ubicacionId !== tiendaPedidoId))
    .map((l) => [l.referencia, l.talla].filter(Boolean).join(" · "));
}

/** En qué va el envío de la boleta a SUNAT, en palabras de tienda (la cola de Lucode, ADR-0005/0009). */
export function estadoDeBoleta(estado: string): { texto: string; tono: TonoEstado } {
  if (estado === "aceptado") return { texto: "Aceptada por SUNAT", tono: "verde" };
  if (estado === "enviado") return { texto: "Enviada a SUNAT", tono: "pizarra" };
  if (estado === "rechazado") return { texto: "SUNAT la rechazó", tono: "rojo" };
  if (estado === "anulado" || estado === "no_emitido") return { texto: "Anulada", tono: "apagado" };
  return { texto: "En cola para SUNAT", tono: "pizarra" };
}

/** Lo que dijo la base al entregar, en el campo del código si es por él (mal escrito o de otro pedido). */
export function errorDeEntrega(
  error: { message?: string; hint?: string | null } | null | undefined,
): { enElCodigo: boolean; titulo: string; detalle: string } | null {
  const hint = error?.hint ?? "";
  const detalle = (error?.message ?? "").trim();
  if (hint === "pedido_web_codigo" || hint === "pedido_web_codigo_incorrecto") return { enElCodigo: true, titulo: "Revisa el código", detalle };
  if (hint === "pedido_web_no_listo") return { enElCodigo: false, titulo: "Todavía no se puede entregar", detalle };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// WhatsApp (se abre en wa.me: lo manda la persona, nunca el sistema)
// ---------------------------------------------------------------------------------------------------------------------------

export type PlantillaWhatsapp = "libre" | "confirmado" | "cobro" | "sinstock" | "devolucion" | "listo" | "norecoge";

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

/**
 * El código de un cupón a medias, para un mensaje que sale de la tienda: «CAY-••••-9H2M». El cupón es al portador (lo usa quien tenga el
 * código), así que por WhatsApp no viaja entero (Felipe, 2026-10-19); entero se ve en Pedidos web del ERP.
 */
export function cuponAMedias(codigo: string): string {
  const partes = codigo.trim().toUpperCase().split("-");
  const ultima = partes[partes.length - 1] ?? "";
  return partes.length >= 3 ? `${partes[0]}-••••-${ultima}` : `••••${ultima.slice(-4)}`;
}

/** Los mensajes de la maqueta (`plantilla`), con la tienda y la dirección de Tienda web ▸ Ajustes. */
export function mensajeWhatsapp(
  p: Pick<PedidoDetalle, "codigo" | "total" | "falta" | "pagado" | "cliente" | "tiendaWeb"> & { cupon?: CuponDelPedidoWeb | null },
  plantilla: PlantillaWhatsapp,
): string {
  const n = primerNombre(p.cliente.nombre);
  const tienda = `CAYLA ${p.tiendaWeb.nombre}`;
  // El cupón del Club que sigue descontando (reservado o ya usado): el total ya lo resta, y el mensaje dice por qué bajó.
  const cupon = p.cupon && p.cupon.estado !== "liberado" && p.cupon.descuento > 0 ? p.cupon : null;
  const conCupon = cupon ? `, ya con tu cupón ${cuponAMedias(cupon.codigo)} de − ${soles(cupon.descuento)}` : "";
  if (plantilla === "confirmado")
    return `Hola ${n}, confirmamos tu pedido ${p.codigo} en ${tienda} (${soles(p.total)}${conCupon}). ¿Cómo prefieres pagar: Yape, Plin, transferencia o en tienda?${p.tiendaWeb.direccion ? ` Lo recoges en ${p.tiendaWeb.direccion}.` : ""}`;
  if (plantilla === "cobro") return `Hola ${n}, te escribimos por tu pedido ${p.codigo}. Falta pagar ${soles(p.falta)}. ¿Te pasamos los datos para el Yape?`;
  if (plantilla === "devolucion")
    return `Hola ${n}, te escribimos de ${tienda} por tu pedido ${p.codigo}: quedó anulado y te devolvemos ${soles(p.pagado)}. ¿Cómo prefieres recibirlo?`;
  if (plantilla === "sinstock")
    return `Hola ${n}, revisamos tu pedido ${p.codigo} y una prenda ya no está en ${tienda}. ¿Te ofrecemos otra talla, otro color o traerla de otra tienda?`;
  if (plantilla === "listo")
    return `Hola ${n}, tu pedido ${p.codigo} ya está listo para recoger en ${tienda}${p.tiendaWeb.direccion ? ` (${p.tiendaWeb.direccion})` : ""}. Muestra en caja el código de tu pedido: lo ves en «Mis pedidos».`;
  if (plantilla === "norecoge")
    return `Hola ${n}, tu pedido ${p.codigo} te espera en ${tienda}. ¿Cuándo pasas a recogerlo? Muestra en caja el código de tu pedido.`;
  return `Hola ${n}, te escribimos de ${tienda} por tu pedido ${p.codigo}.`;
}

/** El enlace de WhatsApp al celular del cliente (si su número se entiende; si no, WhatsApp pregunta a quién). */
export function enlaceWhatsappPedido(p: Parameters<typeof mensajeWhatsapp>[0], plantilla: PlantillaWhatsapp): string {
  return enlaceWhatsAppA(p.cliente.celular, mensajeWhatsapp(p, plantilla));
}

/** «DNI ••••4415 · Cel. 900 000 440 · Miembro del club». */
export function datosDelCliente(c: PedidoDetalle["cliente"]): string {
  return [c.documento ? `DNI ${c.documento}` : null, c.celular ? `Cel. ${formatoCelular(c.celular)}` : null, c.miembroDelClub ? "Miembro del club" : null]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------------------------------------------------------
// Errores de la base, en palabras de tienda
// ---------------------------------------------------------------------------------------------------------------------------

/** Lo que la base dijo al guardar, para el aviso (las funciones del motor ya hablan en tienda: se usa su mensaje). null si no es
 *  de los pedidos web. `yaEstaba`: la acción ya se había hecho (un doble clic, otra caja): se refresca, no es un error de verdad.
 *  `releer`: la prenda que la base rechazó porque lo que mostraba la hoja ya no es cierto (otra caja se llevó la última, la
 *  descontinuaron): la hoja vuelve a leer el pedido y esa prenda se decide de nuevo con lo fresco. La base la manda en el detalle. */
export function errorDePedidoWeb(
  error: { message?: string; hint?: string | null; details?: string | null } | null | undefined,
): { titulo: string; detalle: string; yaEstaba: boolean; releer: string | null } | null {
  const hint = error?.hint ?? "";
  const mensaje = (error?.message ?? "").trim();
  if (!hint.startsWith("pedido_web") && !hint.startsWith("apartado_de_pedido_web")) return null;
  const linea = (error?.details ?? "").trim();
  const releer = (hint === "pedido_web_sin_stock" || hint === "pedido_web_descontinuada") && UUID.test(linea) ? linea : null;
  const titulos: Record<string, string> = {
    pedido_web_sin_stock: "Esa prenda ya no está libre",
    pedido_web_vencido: "El pedido ya se cerró solo",
    pedido_web_estado: "El pedido ya cambió",
    pedido_web_sin_prendas: "No queda ninguna prenda",
    pedido_web_sin_modulo: "Tu rol no tiene «Pedidos web»",
    pedido_web_otra_tienda: "Ese pedido es de otra tienda",
    pedido_web_fecha: "Revisa la fecha",
    pedido_web_nada_que_enviar: "No hay nada que enviar",
    pedido_web_descontinuada: "Esa prenda está descontinuada",
    pedido_web_codigo: "Revisa el código",
    pedido_web_codigo_incorrecto: "Ese código no es de este pedido",
    pedido_web_no_listo: "Todavía no se puede entregar",
    pedido_web_por_entregar: "El pedido todavía no se entrega",
    pedido_web_sin_caja: "No hay una caja abierta",
  };
  return { titulo: titulos[hint] ?? "No se pudo guardar", detalle: mensaje, yaEstaba: hint === "pedido_web_estado", releer };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las decisiones después de volver a leer el pedido: las prendas de `ids` se rehacen con lo fresco (de fábrica: reservarla aquí si
 *  volvió a haber, o sin decidir para que la guía la encienda); las demás quedan como la persona las dejó. */
export function rehacerDecisiones(
  decisiones: Readonly<Record<string, DecisionLinea | null>>,
  lineas: readonly Pick<LineaDetalle, "lineaId" | "disponible">[],
  ids: readonly string[],
  tiendaPedidoId: string,
): Record<string, DecisionLinea | null> {
  const nuevas: Record<string, DecisionLinea | null> = { ...decisiones };
  for (const l of lineas) if (ids.includes(l.lineaId)) nuevas[l.lineaId] = decisionDeFabrica(l, tiendaPedidoId);
  return nuevas;
}
