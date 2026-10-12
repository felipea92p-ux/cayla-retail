// ===========================================================================
// Los pedidos entre sedes y «Para enviar» como PASES de la billetera de Traslados (ADR-0355, actividad 4).
//
// La maqueta D dibujó «LIM te pide una prenda» en Envías, con «No la tengo» y «Enviar». Aquí se le da forma de pase a TODO lo
// que antes vivía en la tarjeta «Pedidos y envíos entre sedes», sin cambiar ninguna regla de pedidos (las acciones salen de
// `accionesDe`, los chips de `estadoVisible*`, la espera de `esperaVisible`):
//   · Envías: lo que otra sede te pide y no salió («te pide»: por hacer, cuenta en el anillo y en el menú) y lo que subiste al
//     almacén para mandar («Para enviar», un pase por sede de destino; se ve, pero no es un pedido de nadie y no suma).
//   · Te llegan: lo que tú pediste mientras siga abierto o te pida algo (avisar al cliente, ¿sigue en pie?).
//   · Terminadas: lo que pediste y ya terminó (llegó, se canceló y está avisado).
// Lo que te pidieron y ya salió no se repite: ya es una caja en camino.
// ===========================================================================

import type { CampoDeGuia } from "./guia-campos";
import { accionesDe, estadoVisibleConCliente, paraQuien, type ClientePedido } from "./pedidos-con-cliente-reglas";
import { estadoVisiblePedido, etiquetaLinea, textoPrendas, totalPrendas, type PedidoEntreSedes } from "./pedidos-entre-sedes-reglas";
import { esperaVisible } from "./pedidos-por-atender-reglas";
import { esperaParaEnviar, etiquetaParaEnviar, type GrupoParaEnviar } from "./para-enviar-reglas";
import { diaHora, type TrasladoBuscable } from "./traslados-reglas";
import type { PestanaPase, TonoPase, VistaPase } from "./traslados-pases-reglas";

export const PREFIJO_PEDIDO = "pedido-";
export const PREFIJO_PARA_ENVIAR = "enviar-";
export const idPasePedido = (grupoId: string) => `${PREFIJO_PEDIDO}${grupoId}`;
export const idPaseParaEnviar = (destinoId: string) => `${PREFIJO_PARA_ENVIAR}${destinoId}`;

/** Qué pase abre una dirección: una caja, un pedido o lo que hay para enviar a una sede. */
export function claseDelId(id: string): { clase: VistaPase["clase"]; ref: string } {
  if (id.startsWith(PREFIJO_PEDIDO)) return { clase: "pedido", ref: id.slice(PREFIJO_PEDIDO.length) };
  if (id.startsWith(PREFIJO_PARA_ENVIAR)) return { clase: "para-enviar", ref: id.slice(PREFIJO_PARA_ENVIAR.length) };
  return { clase: "traslado", ref: id };
}

const conCliente = (p: PedidoEntreSedes): p is PedidoEntreSedes & { cliente: ClientePedido } => !!p.cliente;

/** En qué pestaña va un pedido; `null` si no se dibuja (lo que te pidieron y ya salió: es una caja en camino). */
export function pestanaDelPedido(p: PedidoEntreSedes, ahoraIso: string): PestanaPase | null {
  if (p.direccion === "me_piden") return p.estado === "pedido" ? "envias" : null;
  const a = accionesDe(p, ahoraIso);
  if (p.estado === "pedido" || a.avisar || a.sigueEnPie) return "llegan";
  return "terminadas";
}

/** «Pedido · te pide»: lo que espera tu respuesta. Es lo mismo que cuenta el número del menú (`contarTePiden`). */
export const pedidoPorHacer = (p: PedidoEntreSedes) => p.direccion === "me_piden" && p.estado === "pedido";

type Codigos = { mio: string; otra: string; miNombre: string };

/** El texto del botón del frente de un pedido: lo que toca hacer con él. */
export function botonDelPedido(p: PedidoEntreSedes, ahoraIso: string, codigoOtra: string): VistaPase["boton"] {
  const a = accionesDe(p, ahoraIso);
  if (a.enviar) return { texto: `Enviar a ${codigoOtra}`, principal: true };
  if (a.subirAlAlmacen) return { texto: "Subir al almacén", principal: true };
  if (a.avisar) return { texto: "Avisar al cliente", principal: true };
  if (a.sigueEnPie) return { texto: "¿Sigue en pie?", principal: true };
  if (a.yaNoLaNecesito) return { texto: "Ver lo que pediste", principal: false };
  return { texto: "Ver el pedido", principal: false };
}

const SELLO_PEDIDO: Partial<Record<PedidoEntreSedes["estado"], { texto: string; tono: TonoPase }>> = {
  en_camino: { texto: "ENVIADO", tono: "sale" },
  recibido: { texto: "LLEGÓ", tono: "cerrado" },
  cancelado: { texto: "CANCELADO", tono: "anulado" },
};

export function vistaDelPedido(p: PedidoEntreSedes, ctx: { miUbicacionId: string; ahoraIso: string }, codigos: Codigos): VistaPase {
  const mePiden = p.direccion === "me_piden";
  const total = totalPrendas(p);
  const estado = conCliente(p) ? estadoVisibleConCliente(p, ctx.ahoraIso) : estadoVisiblePedido(p);
  const espera = p.estado === "pedido" ? esperaVisible(p.creadoEn, ctx.ahoraIso) : null;
  // «para un cliente» del lado que envía; «para Ana Lozano» del que pidió (privacidad: `paraQuien`, decisión del 2026-10-04).
  const paraQue = conCliente(p) ? paraQuien(p) : "para reponer";
  const sello = SELLO_PEDIDO[p.estado];
  return {
    id: idPasePedido(p.grupoId),
    numero: 0,
    clase: "pedido",
    rotulo: "Pedido",
    tono: espera?.tarde ? "atraso" : "pedido",
    pestana: pestanaDelPedido(p, ctx.ahoraIso) ?? "terminadas",
    nombre: mePiden ? `${codigos.otra} te pide ${conCliente(p) ? paraQuien(p) : textoPrendas(total)}` : estado.texto,
    // Del lado que envía, la caja sale de mí; del lado que pidió, viene hacia mí.
    codigoOrigen: mePiden ? codigos.mio : codigos.otra,
    codigoDestino: mePiden ? codigos.otra : codigos.mio,
    sedeOrigen: mePiden ? codigos.miNombre : p.otraSede,
    sedeDestino: mePiden ? p.otraSede : codigos.miNombre,
    soyOrigen: mePiden,
    soyDestino: !mePiden,
    progreso: p.estado === "en_camino" ? 0.5 : p.estado === "recibido" ? 1 : 0,
    conCamion: false,
    tarde: espera?.tarde ?? false,
    ciego: false,
    campos: [
      { etiqueta: mePiden ? "Te pidió" : "Pediste", valor: diaHora(p.creadoEn, ctx.ahoraIso), detalle: p.creadoPorNombre },
      { etiqueta: "Prendas", valor: textoPrendas(total), detalle: paraQue },
      espera
        ? { etiqueta: "Espera", valor: espera.texto.replace(/^(Espera|Sin respuesta) /, ""), detalle: espera.tarde ? "sin respuesta" : "tu respuesta", tarde: espera.tarde }
        : { etiqueta: "Estado", valor: estado.texto, detalle: p.trasladoNumero != null ? `Caja Nº ${p.trasladoNumero}` : null },
    ],
    cifra: { grande: String(total), chica: total === 1 ? "prenda" : "prendas", tarde: espera?.tarde ?? false },
    boton: botonDelPedido(p, ctx.ahoraIso, codigos.otra),
    sello: sello ? { ...sello, fecha: "" } : null,
    porHacer: pedidoPorHacer(p),
    // Quien pidió ya está en «Te pidió»: el pie del pase no lo repite como si hubiera enviado algo.
    enviaNombre: null,
    conGuia: false,
    nota: p.nota,
    fotos: [],
    colores: [],
  };
}

/** «Para enviar a LIM»: lo que esta sede subió al almacén para mandarlo, un pase por sede de destino. */
export function vistaParaEnviar(g: GrupoParaEnviar, ctx: { ahoraIso: string }, codigos: Codigos): VistaPase {
  const masVieja = g.prendas.reduce((a, p) => (p.creadoEn < a ? p.creadoEn : a), g.prendas[0]?.creadoEn ?? ctx.ahoraIso);
  const espera = esperaParaEnviar(masVieja, ctx.ahoraIso);
  return {
    id: idPaseParaEnviar(g.destinoId),
    numero: 0,
    clase: "para-enviar",
    rotulo: "Para enviar",
    tono: espera.tarde ? "atraso" : "sale",
    pestana: "envias",
    nombre: `Para enviar a ${codigos.otra}`,
    codigoOrigen: codigos.mio,
    codigoDestino: codigos.otra,
    sedeOrigen: codigos.miNombre,
    sedeDestino: g.destino,
    soyOrigen: true,
    soyDestino: false,
    progreso: 0,
    conCamion: false,
    tarde: espera.tarde,
    ciego: false,
    campos: [
      { etiqueta: "Subiste", valor: espera.texto.replace(/^Subida /, ""), detalle: "al almacén", tarde: espera.tarde },
      { etiqueta: "Prendas", valor: textoPrendas(g.total), detalle: `${g.prendas.length === 1 ? "1 tipo" : `${g.prendas.length} tipos`}` },
      { etiqueta: "Caben hoy", valor: textoPrendas(g.enviables), detalle: g.enviables < g.total ? "lo libre en tu almacén" : "todo está libre" },
    ],
    cifra: { grande: String(g.total), chica: g.total === 1 ? "prenda" : "prendas", tarde: espera.tarde },
    boton: g.enviables > 0 ? { texto: `Armar el envío a ${codigos.otra}`, principal: true } : { texto: "Ver lo que subiste", principal: false },
    sello: null,
    porHacer: false,
    enviaNombre: null,
    conGuia: false,
    nota: null,
    fotos: [],
    colores: [],
  };
}

/** Lo que el buscador mira de un pedido: la otra sede, sus prendas y códigos, y la palabra «pedido». */
export function buscableDelPedido(p: PedidoEntreSedes, codigos: Codigos): TrasladoBuscable {
  return {
    numero: p.trasladoNumero ?? 0,
    ubicacionOrigenNombre: `pedido ${p.otraSede} ${codigos.otra}`,
    ubicacionDestinoNombre: codigos.miNombre,
    nota: p.nota,
    referencias: p.lineas.map(etiquetaLinea),
    skus: p.lineas.flatMap((l) => (l.sku ? [l.sku] : [])),
  };
}

export function buscableParaEnviar(g: GrupoParaEnviar, codigos: Codigos): TrasladoBuscable {
  return {
    numero: 0,
    ubicacionOrigenNombre: `para enviar ${codigos.miNombre}`,
    ubicacionDestinoNombre: `${g.destino} ${codigos.otra}`,
    nota: null,
    referencias: g.prendas.map(etiquetaParaEnviar),
    skus: g.prendas.flatMap((p) => (p.sku ? [p.sku] : [])),
  };
}

/** La guía de foco del reverso de un pedido (enviar o cancelar): lo único que la base exige es quién lo hace (ADR-0161). La
 *  llegada viene marcada («Mañana») y no es «falta». */
export function camposDelPedido(responsableListo: boolean, motivoResponsable: string | null): CampoDeGuia[] {
  return [{ id: "responsable-pedido", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: motivoResponsable ?? "Elige quién lo hace." }];
}
