// Ventas ▸ Pedidos web (ADR-0408, actividad 8; maqueta docs/maquetas/tienda-online-2026-10, «Pedidos web»): la parte pura de la
// pantalla, sin React ni red, para importarla desde el servidor y el cliente y probarla sola.
//
// CONTRATO
//   PROMETE: leer lo que devuelven `fn_pedidos_web_tablero` y `fn_pedido_web_detalle` (20261015010000) sin caerse con un dato raro;
//            agrupar la lista en sus cuatro pestañas y sacar sus cifras; decir en palabras de tienda en qué está cada pedido y cada
//            prenda; armar la decisión de cada prenda para confirmar (de dónde sale, por conseguir con fecha o quitarla) en la forma que
//            pide `confirmar_pedido_web`, y lo que todavía falta para poder confirmar; y los mensajes de WhatsApp de la maqueta.
//   ASUME:   que la base manda (permisos, stock, plazos, transiciones): lo que aquí se calcula es para mostrar y para no ofrecer lo que
//            la base rechazaría. Los plazos (24 h, 48 h, 7 días) llegan de Configuración ▸ Tienda web en la lectura, nunca escritos aquí.
//            Entregar (actividad 10): el código de 4 cifras como lo escribe la persona, lo que falta para poder entregar, la boleta y en
//            qué va su envío a SUNAT, y los mensajes para avisarle que ya puede recogerlo (o que no lo recoge).
//   NO HACE: lo de cobrar (registrar y anular un pago) vive en `pedidos-web-cobro-reglas.ts` (actividad 9); aquí solo se lee lo que
//            pagó cada pedido y lo que queda por devolver de uno anulado. Nunca compara el código: lo compara la base.

import { diaLima, hoyLima, sumarDias } from "./fechas-lima";
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
};

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
export const PESTANAS_PEDIDOS: readonly { clave: PestanaPedidos; etiqueta: string }[] = [
  { clave: "confirmar", etiqueta: "Por confirmar" },
  { clave: "cobrar", etiqueta: "Por cobrar" },
  { clave: "entregar", etiqueta: "Por entregar" },
  { clave: "cerrados", etiqueta: "Cerrados" },
];

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
};

export function cifrasDe(t: Pick<TableroPedidosWeb, "pedidos" | "cobradoHoy">, ahora: number): CifrasPedidosWeb {
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

// ---------------------------------------------------------------------------------------------------------------------------
// Los motivos (los mismos que acepta la base)
// ---------------------------------------------------------------------------------------------------------------------------

export type MotivoNoConfirmar = "sin_stock" | "cliente_no_respondio" | "cliente_desistio";
export type MotivoAnular = "cliente_no_pago" | "cliente_desistio" | "error_en_pedido";

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

/** Por qué se cerró un pedido, como lo leería la tienda. */
export function textoCierre(motivo: string | null): string {
  if (motivo === "sin_confirmar") return "Nadie lo confirmó a tiempo: se cerró solo";
  const m = [...MOTIVOS_NO_CONFIRMAR, ...MOTIVOS_ANULAR].find((x) => x.clave === motivo);
  return m ? m.etiqueta : "Se cerró";
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

/** Los avisos de la prenda: si es la última del lugar elegido y quién más la pidió (propuesta k). Lo decide la tienda. */
export function avisosDeLinea(l: Pick<LineaDetalle, "disponible" | "compiten">, d: DecisionLinea | null | undefined, tiendaPedidoId: string, tienda: string): string[] {
  const avisos: string[] = [];
  if (d?.tipo === "reservar") {
    const libres =
      d.ubicacionId === tiendaPedidoId
        ? d.lugar === "almacen"
          ? l.disponible.almacen
          : d.lugar === "piso"
            ? l.disponible.piso
            : libresAqui(l)
        : (l.disponible.otras.find((o) => o.ubicacionId === d.ubicacionId)?.libres ?? 0);
    const donde = d.ubicacionId === tiendaPedidoId ? tienda : (l.disponible.otras.find((o) => o.ubicacionId === d.ubicacionId)?.tienda ?? "esa tienda");
    if (libres === 1) avisos.push(`Es la última en ${donde}.`);
    if (l.compiten.length > 0) {
      const quienes = l.compiten.map((c) => `${c.codigo}${c.separoAntes ? " (la separó antes)" : ""}`).join(", ");
      avisos.push(`También la ${l.compiten.length === 1 ? "pidió" : "pidieron"} ${quienes}. Tú decides a quién confirmarla.`);
    }
  }
  return avisos;
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

/** Los mensajes de la maqueta (`plantilla`), con la tienda y la dirección de Configuración ▸ Tienda web. */
export function mensajeWhatsapp(
  p: Pick<PedidoDetalle, "codigo" | "total" | "falta" | "pagado" | "cliente" | "tiendaWeb">,
  plantilla: PlantillaWhatsapp,
): string {
  const n = primerNombre(p.cliente.nombre);
  const tienda = `CAYLA ${p.tiendaWeb.nombre}`;
  if (plantilla === "confirmado")
    return `Hola ${n}, confirmamos tu pedido ${p.codigo} en ${tienda} (${soles(p.total)}). ¿Cómo prefieres pagar: Yape, Plin, transferencia o en tienda?${p.tiendaWeb.direccion ? ` Lo recoges en ${p.tiendaWeb.direccion}.` : ""}`;
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
