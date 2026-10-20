"use client";

import { useRef, useState } from "react";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { MessageCircle, PackageSearch, ReceiptText, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { Boton, BotonAncla, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { MiniPrenda } from "@/components/pedidos-web/PedidosWebPantalla";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/fechas-lima";
import { haceCuanto } from "@/lib/vender-hoy-reglas";
import { soles } from "@/lib/precio-sede-reglas";
import { camposConfirmar, camposEntregar, camposMotivo, camposReservar, campoDeLinea } from "@/lib/pedidos-web-guia";
import { detalleDelPago, esAdelanto, estadoDelPago, porDevolver, sePuedeAnular, textoDelPago } from "@/lib/pedidos-web-cobro-reglas";
import { devueltoAlCliente } from "@/lib/pedidos-web-anular-reglas";
import {
  avisosDeLinea,
  datosDelCliente,
  decisionDeFabrica,
  decisionesParaLaBase,
  enlaceWhatsappMensajePredeterminado,
  enlaceWhatsappPedido,
  errorDeEntrega,
  errorDePedidoWeb,
  estadoDeBoleta,
  estadoDeLinea,
  estadoVisible,
  faltanParaEntregar,
  fechaCorta,
  fechasSugeridas,
  libresAqui,
  limpiarCodigo,
  lugarDeFabrica,
  MOTIVOS_ANULAR,
  MOTIVOS_NO_CONFIRMAR,
  problemaParaConfirmar,
  rehacerDecisiones,
  sePuedeQuitar,
  sePuedeReservarYa,
  textoCierre,
  textoDeDonde,
  textoDisponible,
  type BoletaWeb,
  type DecisionLinea,
  type EstadoPedidoWeb,
  type LineaDetalle,
  type LugarWeb,
  type NotaCreditoWeb,
  type PagoDeLista,
  type PedidoDetalle,
  type PlantillaWhatsapp,
} from "@/lib/pedidos-web-reglas";

type Modo = "revisar" | "no_confirmar" | "anular" | "reservar";

// En el celular, el botón de un aviso baja bajo su texto: en la hoja angosta, a su derecha dejaba el texto a una palabra por línea.
const AVISO_CON_BOTON =
  "max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:[&>.aviso-linea-acc]:col-start-2 max-sm:[&>.aviso-linea-acc]:row-auto max-sm:[&>.aviso-linea-acc]:justify-self-start";

/**
 * Un pedido web (maqueta v4, «Confirmar un pedido»): quién lo separó y cómo escribirle, sus prendas y, según en qué esté:
 *   · por confirmar: qué pasa con cada prenda (de qué lugar sale —el almacén primero—, traerla de otra tienda, conseguirla para
 *     una fecha o quitarla), los avisos de «la última» y de quién la separó antes, y «Confirmar»; o «No se puede confirmar» con su
 *     motivo;
 *   · confirmado: dónde está cada prenda (reservada, por traer, en camino, por conseguir), sus pagos y «Registrar pago» (la hoja de
 *     encima, actividad 9: si espera una prenda por conseguir, el adelanto lo decide la tienda), anular un pago mal anotado, y
 *     «Anular» el pedido con su motivo (lo reservado vuelve a estar disponible; si ya pagó, la hoja se queda abierta con lo que hay
 *     que devolverle);
 *   · pagado (actividad 10): su boleta (salió al pagarse) y, si todo está en la tienda, «Entregar» con el código de 4 cifras que el
 *     cliente muestra (la base lo compara: mal escrito, nada se entrega); si algo falta, qué; y el aviso de los días sin recoger. Y, si
 *     no se va a entregar, «Anular pedido» (la hoja de encima: devuelve la plata y anula su venta y su boleta, Felipe 2026-10-15);
 *   · anulado con plata del cliente: cada pago «por devolver», con «Devolver» (la plata sale de la caja de hoy si es efectivo);
 *   · entregado o cerrado: para leer (entregado, con su boleta y quién lo entregó; anulado después de pagarse, con lo que se le devolvió
 *     y cómo quedó su boleta: liberada o anulada con su nota de crédito).
 * Todo lo que guarda firma con el «Responsable» (ADR-0162) y no cambia qué decide la base: si otra caja ya lo tocó, lo dice.
 */
export function PedidoWebHoja({
  pedido: p,
  tiendaId,
  tienda,
  ahora,
  mensajePredeterminado,
  onClose,
  onCambio,
  onEnviar,
  onReleer,
  onPagar,
  onAnularPago,
  onAnularPedido,
}: {
  pedido: PedidoDetalle;
  tiendaId: string;
  tienda: string;
  ahora: number;
  /** El texto propio del mensaje predeterminado de quien atiende (o el de fábrica): lo llena este pedido para el botón de WhatsApp. */
  mensajePredeterminado: string;
  onClose: () => void;
  /** La base cambió el pedido (confirmado, cerrado, anulado o una prenda reservada): la lista se pone al día. `sigueAbierta`: la hoja
   *  no se cierra (anulado con plata por devolver): el pedido se relee ya, no al cerrar. */
  onCambio: (estado: EstadoPedidoWeb, opciones?: { sigueAbierta?: boolean }) => void;
  /** Abrir «Registrar un pago» encima de esta hoja (actividad 9). */
  onPagar: () => void;
  /** Abrir «Anular un pago» (o «Devolver», en un pedido anulado) encima de esta hoja. */
  onAnularPago: (pago: PagoDeLista) => void;
  /** Abrir «Anular el pedido» encima de esta hoja: un pedido PAGADO que no se va a entregar (devuelve la plata y anula su boleta). */
  onAnularPedido: () => void;
  /** Enviar a la tienda del pedido lo reservado en `desdeId` (solo quien opera esa tienda). */
  onEnviar: (desdeId: string) => void;
  /** Volver a leer el pedido (lo que muestra la hoja ya no es cierto: otra caja se llevó la última). */
  onReleer: () => void;
}) {
  const responsable = useResponsable();
  const hoy = hoyLima(new Date(ahora));
  const [modo, setModo] = useState<Modo>("revisar");
  const [decisiones, setDecisiones] = useState<Record<string, DecisionLinea | null>>(() =>
    Object.fromEntries(p.lineas.map((l) => [l.lineaId, decisionDeFabrica(l, p.ubicacionId)])),
  );
  const [motivo, setMotivo] = useState<string | null>(null);
  // «Reservarla»: la prenda por conseguir que ya llegó a la tienda, y de qué lugar sale (el almacén primero).
  const [reservando, setReservando] = useState<{ linea: LineaDetalle; lugar: LugarWeb | null } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // «Confirmado» recién: la hoja lo celebra una vez con su aviso y el mensaje para el cliente.
  const [recien, setRecien] = useState<"confirmado" | null>(null);
  // Entregar (actividad 10): el código que el cliente muestra, lo que la base rechazó de él y el aviso de toda la hoja. La marca del
  // envío sigue a lo que se manda (`useIntento`): un doble clic devuelve la MISMA entrega; si la respuesta se pierde, la hoja se congela
  // hasta saber si quedó.
  const [codigo, setCodigo] = useState("");
  const [rechazoCodigo, setRechazoCodigo] = useState<string | null>(null);
  const [errorEntrega, setErrorEntrega] = useState<{ titulo: string; detalle: string } | null>(null);
  const [revisando, setRevisando] = useState(false);
  const entrega = useIntento("entregar_pedido_web");
  // Un doble clic no manda dos veces: el estado de React llega tarde dentro de un mismo clic.
  const enVuelo = useRef(false);
  // Las prendas que la base rechazó por «ya no está libre» (otra caja confirmó antes la última): cuando llega el pedido releído,
  // su decisión se rehace con lo fresco y la guía la vuelve a encender. Se ajusta al pintar, no en un efecto (patrón de React).
  const [porReleer, setPorReleer] = useState<string[]>([]);
  const [lineasLeidas, setLineasLeidas] = useState(p.lineas);
  if (lineasLeidas !== p.lineas) {
    setLineasLeidas(p.lineas);
    if (porReleer.length > 0) {
      setDecisiones((ds) => rehacerDecisiones(ds, p.lineas, porReleer, p.ubicacionId));
      setPorReleer([]);
    }
  }

  const estado = estadoVisible(p, ahora);
  const porConfirmar = p.estado === "por_confirmar";
  const lineasVivas = p.lineas.filter((l) => l.estado !== "quitada");
  const whatsapp = (pl: PlantillaWhatsapp) => enlaceWhatsappPedido(p, pl);

  const camposRevisar = camposConfirmar({ lineas: p.lineas, decisiones, hoy, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const camposCierre = camposMotivo({ motivo, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const camposDeReservar = camposReservar({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const camposDeEntregar = camposEntregar({ codigo, rechazo: rechazoCodigo, responsableListo: responsable.listo, responsableMotivo: responsable.motivo });
  const guia = useGuiaCampos(
    modo === "revisar" ? (p.estado === "pagado" ? camposDeEntregar : camposRevisar) : modo === "reservar" ? camposDeReservar : camposCierre,
  );
  const faltan = faltanParaEntregar(p.lineas, p.ubicacionId);
  const reservar = (l: LineaDetalle) => {
    setReservando({ linea: l, lugar: lugarDeFabrica(l) });
    setModo("reservar");
  };

  /** `cerrar`: el cierre animado de la hoja (un pedido cerrado o anulado ya no tiene nada que hacer aquí). */
  async function guardar(accion: "confirmar" | "no_confirmar" | "anular" | "reservar", cerrar: () => void) {
    if (enVuelo.current || !guia.puedeConfirmar) return;
    if (accion === "confirmar" && problemaParaConfirmar(p.lineas, decisiones, hoy) !== null) return;
    if (accion === "reservar" && !reservando) return;
    enVuelo.current = true;
    setGuardando(true);
    const supabase = createClient();
    // De qué lugar de la tienda del pedido sale la prenda que se reserva (sin lugar elegido, la base toma el almacén primero).
    const sub = reservando?.lugar ? p.lugares[reservando.lugar] : undefined;
    const llamada =
      accion === "confirmar"
        ? supabase.rpc("confirmar_pedido_web", { p_pedido_id: p.id, p_lineas: decisionesParaLaBase(p.lineas, decisiones, p.lugares, p.ubicacionId) })
        : accion === "reservar"
          ? supabase.rpc("reservar_linea_pedido_web", {
              p_linea_id: reservando?.linea.lineaId ?? "",
              p_ubicacion_id: p.ubicacionId,
              ...(sub ? { p_sububicacion_id: sub } : {}),
            })
          : accion === "no_confirmar"
            ? supabase.rpc("no_confirmar_pedido_web", { p_pedido_id: p.id, p_motivo: motivo ?? "" })
            : supabase.rpc("anular_pedido_web", { p_pedido_id: p.id, p_motivo: motivo ?? "" });
    const { error } = await firmar(llamada, responsable.firma());
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      const propio = errorDePedidoWeb(error);
      if (propio?.yaEstaba) {
        // Otra caja (o un doble clic) ya lo hizo: se muestra cómo quedó.
        avisar.aviso(propio.titulo, { detalle: propio.detalle });
        if (accion === "reservar") {
          setReservando(null);
          setModo("revisar");
        }
        onCambio(p.estado);
        return;
      }
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else
        avisar.error(
          traducirError(
            error,
            accion === "confirmar" ? "confirmar el pedido" : accion === "anular" ? "anular el pedido" : accion === "reservar" ? "reservar la prenda" : "cerrar el pedido",
          ),
        );
      if (accion === "reservar" && propio?.releer) {
        // Otra caja se la llevó: se vuelve a las prendas, que dicen lo que hay ahora.
        setReservando(null);
        setModo("revisar");
      }
      if (propio?.releer) {
        // Lo que decía la hoja ya no es cierto: se relee el pedido y esa prenda se decide de nuevo (nada se guardó).
        const linea = propio.releer;
        setPorReleer((ids) => (ids.includes(linea) ? ids : [...ids, linea]));
        onReleer();
      }
      return;
    }
    if (accion === "reservar") {
      const prenda = reservando ? [reservando.linea.referencia, reservando.linea.talla].filter(Boolean).join(" · ") : "La prenda";
      avisar.exito("Prenda reservada", { detalle: `${prenda} quedó separada para el pedido ${p.codigo}.` });
      setReservando(null);
      setModo("revisar");
      onCambio(p.estado);
      return;
    }
    if (accion === "confirmar") {
      setRecien("confirmado");
      setModo("revisar");
      avisar.exito(`Pedido ${p.codigo} confirmado`, {
        detalle: lineasPorConseguir(decisiones) > 0 ? "Se reservó lo que había; lo demás queda por conseguir." : "Sus prendas quedaron reservadas.",
      });
      onCambio("confirmado");
      return;
    }
    if (accion === "anular" && p.pagado > 0) {
      // Ya pagó algo: la hoja se queda abierta para lo que sigue, devolverle su plata (en cada pago, «Devolver»).
      avisar.exito(`Pedido ${p.codigo} anulado`, { detalle: `Lo reservado volvió a estar disponible. Falta devolverle ${soles(p.pagado)}.` });
      setModo("revisar");
      setMotivo(null);
      onCambio("anulado", { sigueAbierta: true });
      return;
    }
    avisar.exito(accion === "anular" ? `Pedido ${p.codigo} anulado` : `Pedido ${p.codigo} cerrado`, {
      detalle: accion === "anular" ? "Lo reservado volvió a estar disponible." : "Nada se había reservado: el stock no cambió.",
    });
    // La lista se pone al día al cerrar la hoja (`onCambio` lo deja anotado): refrescar ANTES de cambiar la URL perdía el refresco.
    onCambio("anulado");
    cerrar();
  }

  /** Entregar con el código (actividad 10). La base decide: el código, que todo esté en la tienda, el permiso y que no se haya entregado. */
  async function entregar(cerrar: () => void) {
    if (!guia.puedeConfirmar) return;
    setErrorEntrega(null);
    const params = { p_pedido_id: p.id, p_codigo: codigo };
    const res = await entrega.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("entregar_pedido_web", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado") return;
    if (res.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") {
      const propia = errorDeEntrega(res.error);
      if (propia?.enElCodigo) {
        // Mal escrito o de otro pedido: bajo el código, que vuelve a faltar hasta que se cambie.
        setRechazoCodigo(propia.detalle);
        return;
      }
      const general = errorDePedidoWeb(res.error);
      if (general?.yaEstaba) {
        // Otra caja ya lo entregó (o el pedido cambió): se muestra cómo quedó.
        avisar.aviso(general.titulo, { detalle: general.detalle });
        onCambio(p.estado);
        return;
      }
      setErrorEntrega(propia ?? general ?? { titulo: "No se pudo entregar", detalle: traducirError(res.error, "entregar el pedido") });
      return;
    }
    const datos = res.tipo === "ok" ? ((res.data as Record<string, unknown> | null) ?? null) : res.datos;
    const boleta = typeof datos?.boleta === "string" ? datos.boleta : p.boleta?.texto;
    avisar.exito(`Pedido ${p.codigo} entregado`, {
      detalle: `Sus prendas salieron del stock.${boleta ? ` La boleta ${boleta} ya había salido al pagarse.` : ""}`,
    });
    // La lista se pone al día al cerrar la hoja (como al anular): el pedido pasa a «Cerrados».
    onCambio("entregado");
    cerrar();
  }

  async function revisarEntrega(cerrar: () => void) {
    setRevisando(true);
    const res = await entrega.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") {
      avisar.exito(`Pedido ${p.codigo} entregado`, { detalle: "Sus prendas salieron del stock." });
      onCambio("entregado");
      cerrar();
      return;
    }
    if (res.tipo === "no_llego") {
      avisar.aviso("El pedido no se entregó", { detalle: "No se guardó nada. Revisa el código y vuelve a entregarlo." });
      return;
    }
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  const subtitulo = `Separado ${haceCuanto(p.creadoEn, ahora)} · lo recoge en ${p.tiendaWeb.nombre}`;

  return (
    <Modal
      titulo={
        <span className="inline-flex flex-wrap items-center gap-2">
          Pedido {p.codigo}
          <Chip tono={estado.tono} vivo={estado.vivo} className="font-sans">
            {estado.texto}
          </Chip>
        </span>
      }
      subtitulo={subtitulo}
      onClose={onClose}
      variante="hoja"
      tamano="mediana"
      bloqueado={guardando || entrega.enviando || entrega.incierto}
      conCerrar
      // Al abrir se LEE primero (quién pidió y qué): el foco va a la hoja, no a la ✕ ni al primer botón (Tab entra igual).
      focoEnLaHoja
    >
      {(cerrar) => (
        <div className="space-y-5">
          <BloqueCliente pedido={p} whatsapp={enlaceWhatsappMensajePredeterminado(p, mensajePredeterminado)} />

          {porConfirmar && modo === "revisar" && (
            <>
              <p className="flex items-start gap-2 text-[13px] text-tinta/80" data-guia="pedido-web.llega">
                <MessageCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-taupe" />
                <span>
                  Llega por WhatsApp con el número <b className="text-tinta">{p.codigo}</b>. Revisa que esté todo y confírmalo; por el chat coordinan el
                  pago y cuándo lo recoge.
                </span>
              </p>
              <div className="space-y-3" data-guia="pedido-web.prendas">
                <TituloGrupo cuenta={p.lineas.length}>Lo que pidió</TituloGrupo>
                {p.lineas.map((l) => (
                  <CampoGuiado key={l.lineaId} id={campoDeLinea(l.lineaId)} guia={guia} retiene="fila">
                    <LineaPorConfirmar
                      linea={l}
                      decision={decisiones[l.lineaId] ?? null}
                      puedeQuitar={sePuedeQuitar(p.lineas, decisiones, l.lineaId)}
                      onDecision={(d) => setDecisiones((ds) => ({ ...ds, [l.lineaId]: d }))}
                      tiendaId={p.ubicacionId}
                      tienda={tienda}
                      hoy={hoy}
                      deshabilitado={guardando}
                    />
                  </CampoGuiado>
                ))}
              </div>
              <CampoGuiado id="responsable" guia={guia}>
                <div data-guia="pedido-web.responsable">
                  <ComboResponsable control={responsable} deshabilitado={guardando} />
                </div>
              </CampoGuiado>
              <p className="text-[12.5px] text-taupe">
                Al confirmar, cada prenda queda reservada para el cliente (primero la del almacén) y deja de ofrecerse en la web y en Vender. Sale
                del stock recién al entregarla. Si después se anula, vuelve a estar disponible.
              </p>
              <div className="pie-hoja-fijo space-y-2 pt-2">
                <PieGuia guia={guia} />
                <PieAcciones
                  guia="pedido-web.acciones"
                  izquierda={
                    <Boton type="button" onClick={() => setModo("no_confirmar")} disabled={guardando}>
                      No se puede confirmar
                    </Boton>
                  }
                >
                  <Boton
                    type="button"
                    peso="primario"
                    cargando={guardando}
                    textoCargando="Confirmando…"
                    disabled={!guia.puedeConfirmar}
                    title={guia.frase ?? undefined}
                    className={guia.claseConfirmar}
                    onClick={() => guardar("confirmar", cerrar)}
                  >
                    Confirmar · reserva las prendas
                  </Boton>
                </PieAcciones>
              </div>
            </>
          )}

          {porConfirmar && modo === "no_confirmar" && (
            <>
              <Aviso
                tono="atencion"
                titulo="Antes de cerrarlo, escríbele"
                className={AVISO_CON_BOTON}
                accion={
                  <BotonAncla href={whatsapp("sinstock")} target="_blank" rel="noopener noreferrer" className="btn-chico">
                    <MessageCircle aria-hidden className="h-4 w-4" />
                    Escribirle por WhatsApp
                  </BotonAncla>
                }
              >
                A veces se resuelve con otra talla, otro color u otra tienda.
              </Aviso>
              <CampoGuiado id="motivo" guia={guia} titulo="¿Por qué no se confirma?">
                <SegmentoDeslizante
                  etiqueta="Por qué no se confirma"
                  opciones={MOTIVOS_NO_CONFIRMAR.map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }))}
                  valor={motivo ?? ""}
                  onCambio={setMotivo}
                />
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <p className="text-[12.5px] text-taupe">El stock no cambia: nada se había reservado. El cliente ve su pedido «Anulado» con el motivo.</p>
              <div className="pie-hoja-fijo space-y-2 pt-2">
                <PieGuia guia={guia} />
                <PieAcciones>
                  <Boton type="button" onClick={() => setModo("revisar")} disabled={guardando}>
                    Cancelar
                  </Boton>
                  <Boton
                    type="button"
                    peso="peligro"
                    cargando={guardando}
                    textoCargando="Cerrando…"
                    disabled={!guia.puedeConfirmar}
                    title={guia.frase ?? undefined}
                    onClick={() => guardar("no_confirmar", cerrar)}
                  >
                    Cerrar el pedido
                  </Boton>
                </PieAcciones>
              </div>
            </>
          )}

          {p.estado === "confirmado" && modo === "revisar" && (
            <>
              {p.sinPagar && (
                <Aviso
                  tono="error"
                  titulo={`Lo confirmaron ${p.confirmadoEn ? haceCuanto(p.confirmadoEn, ahora) : ""} y no paga`}
                  className={AVISO_CON_BOTON}
                  accion={
                    <BotonAncla href={whatsapp("cobro")} target="_blank" rel="noopener noreferrer" className="btn-chico">
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      Escribirle por WhatsApp
                    </BotonAncla>
                  }
                >
                  Sus prendas siguen reservadas. Escríbele y decide: si lo anulas, vuelven a estar disponibles.
                </Aviso>
              )}
              {recien === "confirmado" && (
                <Aviso
                  tono="exito"
                  titulo="Confirmado"
                  className={AVISO_CON_BOTON}
                  accion={
                    <BotonAncla href={whatsapp("confirmado")} target="_blank" rel="noopener noreferrer" className="btn-chico">
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      Avisarle por WhatsApp
                    </BotonAncla>
                  }
                >
                  Sus prendas quedaron reservadas y el pedido queda por cobrar.
                </Aviso>
              )}
              <LineasDelPedido pedido={p} tiendaId={tiendaId} onEnviar={onEnviar} onReservar={reservar} />
              <BloqueDinero pedido={p} ahora={ahora} onAnularPago={onAnularPago} />
              {esAdelanto(p) && (
                <Aviso tono="info" titulo="Espera una prenda por conseguir">
                  Llega para el {fechaCorta(p.lineas.find((l) => l.estado === "por_conseguir")?.fechaCompromiso ?? null)}. Cobra un adelanto ahora
                  (tú decides cuánto) y el resto cuando la recoja.
                </Aviso>
              )}
              <p className="text-[12.5px] text-taupe">La boleta sale cuando el pedido queda pagado completo.</p>
              <PieAcciones
                izquierda={
                  <Boton type="button" peso="peligro" onClick={() => setModo("anular")}>
                    Anular
                  </Boton>
                }
              >
                <BotonAncla href={whatsapp("cobro")} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden className="h-4 w-4" />
                  WhatsApp
                </BotonAncla>
                <Boton type="button" peso="primario" aria-haspopup="dialog" onClick={onPagar} data-guia="pedido-web.pagar">
                  {/* En el celular el pie se reparte en mitades: ahí solo «Registrar pago» (lo que falta ya está arriba). */}
                  <span className="inline-flex items-center gap-2">
                    <Wallet aria-hidden className="h-4 w-4 max-sm:hidden" />
                    <span>
                      Registrar pago<span className="max-sm:hidden"> · falta {soles(p.falta)}</span>
                    </span>
                  </span>
                </Boton>
              </PieAcciones>
            </>
          )}

          {(p.estado === "confirmado" || p.estado === "pagado") && modo === "reservar" && reservando && (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-sand px-4 py-3">
                <MiniPrenda prenda={reservando.linea} tamano="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-tinta">{[reservando.linea.referencia, reservando.linea.color, reservando.linea.talla].filter(Boolean).join(" · ")}</span>
                  <span className="block text-[12.5px] text-taupe">{textoDisponible(reservando.linea, tienda)}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                    <span className="text-verde">{textoDeDonde(reservando.lugar)}</span>
                    {reservando.linea.disponible.almacen > 0 && reservando.linea.disponible.piso > 0 && (
                      <button
                        type="button"
                        className="btn-enlace"
                        disabled={guardando}
                        onClick={() => setReservando({ ...reservando, lugar: reservando.lugar === "almacen" ? "piso" : "almacen" })}
                      >
                        {reservando.lugar === "almacen" ? "Mejor la del piso" : "Mejor la del almacén"}
                      </button>
                    )}
                  </span>
                </span>
              </div>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <p className="text-[12.5px] text-taupe">
                Llegó lo que faltaba: queda separada para el cliente y deja de ofrecerse en la web y en Vender. Sale del stock recién al
                entregarla.
              </p>
              <div className="pie-hoja-fijo space-y-2 pt-2">
                <PieGuia guia={guia} />
                <PieAcciones>
                  <Boton
                    type="button"
                    onClick={() => {
                      setReservando(null);
                      setModo("revisar");
                    }}
                    disabled={guardando}
                  >
                    Cancelar
                  </Boton>
                  <Boton
                    type="button"
                    peso="primario"
                    cargando={guardando}
                    textoCargando="Reservando…"
                    disabled={!guia.puedeConfirmar}
                    title={guia.frase ?? undefined}
                    className={guia.claseConfirmar}
                    onClick={() => guardar("reservar", cerrar)}
                  >
                    Reservar ahora
                  </Boton>
                </PieAcciones>
              </div>
            </>
          )}

          {p.estado === "confirmado" && modo === "anular" && (
            <>
              <Aviso tono="error" titulo="Anular devuelve sus prendas">
                Lo reservado vuelve a estar disponible
                {p.lineas.some((l) => l.estado === "reservada" && l.ubicacionId && l.ubicacionId !== p.ubicacionId) ? " (también en la otra tienda)" : ""}.
                {p.lineas.some((l) => l.estado === "por_conseguir" && l.traslado && (l.traslado.estado === "en_transito" || l.traslado.estado === "recibido_con_diferencia"))
                  ? ` Lo que viene en camino entra libre a ${p.tienda} al llegar.`
                  : ""}
                {p.pagado > 0 ? ` Ya pagó ${soles(p.pagado)}: coordina la devolución del dinero por WhatsApp.` : ""}
              </Aviso>
              <CampoGuiado id="motivo" guia={guia} titulo="¿Por qué se anula?">
                <SegmentoDeslizante
                  etiqueta="Por qué se anula"
                  opciones={MOTIVOS_ANULAR.map((m) => ({ clave: m.clave, etiqueta: m.etiqueta }))}
                  valor={motivo ?? ""}
                  onCambio={setMotivo}
                />
              </CampoGuiado>
              <CampoGuiado id="responsable" guia={guia}>
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
              <div className="pie-hoja-fijo space-y-2 pt-2">
                <PieGuia guia={guia} />
                <PieAcciones>
                  <Boton type="button" onClick={() => setModo("revisar")} disabled={guardando}>
                    Cancelar
                  </Boton>
                  <Boton
                    type="button"
                    peso="peligro"
                    cargando={guardando}
                    textoCargando="Anulando…"
                    disabled={!guia.puedeConfirmar}
                    title={guia.frase ?? undefined}
                    onClick={() => guardar("anular", cerrar)}
                  >
                    Anular el pedido
                  </Boton>
                </PieAcciones>
              </div>
            </>
          )}

          {p.estado === "pagado" && modo === "revisar" && (
            <>
              {p.sinRecoger && (
                <Aviso
                  tono="error"
                  titulo={`Pagó ${p.pagadoEn ? haceCuanto(p.pagadoEn, ahora) : ""} y no lo recoge`}
                  className={AVISO_CON_BOTON}
                  accion={
                    <BotonAncla href={whatsapp("norecoge")} target="_blank" rel="noopener noreferrer" className="btn-chico">
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      Escribirle por WhatsApp
                    </BotonAncla>
                  }
                >
                  Ya pagó: el pedido no se libera solo. Escríbele y, si no lo va a recoger, decídelo con tu líder.
                </Aviso>
              )}
              <LineasDelPedido pedido={p} tiendaId={tiendaId} onEnviar={onEnviar} onReservar={reservar} />
              <BloqueDinero pedido={p} ahora={ahora} />
              <BloqueBoleta boleta={p.boleta} />
              {faltan.length > 0 ? (
                <>
                  <Aviso tono="info" titulo="Todavía no se puede entregar">
                    Falta que llegue a {p.tienda}: {faltan.join(", ")}. Se entrega cuando todo esté aquí: avísale al cliente cuando esté.
                  </Aviso>
                  <PieAcciones izquierda={<BotonAnularPedido onClick={onAnularPedido} />}>
                    <BotonAncla href={whatsapp(p.sinRecoger ? "norecoge" : "libre")} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      WhatsApp
                    </BotonAncla>
                  </PieAcciones>
                </>
              ) : (
                <>
                  <CampoGuiado id="codigo" guia={guia}>
                    <div data-guia="pedido-web.codigo">
                      <CampoTexto
                        etiqueta={guia.etiqueta("codigo", "Código para recoger")}
                        mono
                        inputMode="numeric"
                        // Sin maxLength: el navegador cortaría «20 94» pegado en «20 9» antes de limpiarlo (/chaos 2026-10-15); las
                        // 4 cifras las deja limpiarCodigo.
                        value={codigo}
                        onChange={(e) => {
                          setCodigo(limpiarCodigo(e.target.value));
                          setRechazoCodigo(null);
                          setErrorEntrega(null);
                        }}
                        tono={rechazoCodigo ? "error" : undefined}
                        pie={rechazoCodigo ?? "Pídeselo al cliente: lo ve en su pedido, en «Mis pedidos»."}
                        disabled={entrega.incierto}
                      />
                    </div>
                  </CampoGuiado>
                  <CampoGuiado id="responsable" guia={guia}>
                    <ComboResponsable control={responsable} deshabilitado={entrega.enviando || entrega.incierto} />
                  </CampoGuiado>
                  <p className="text-[12.5px] text-taupe">Al entregar, sus prendas salen del stock. La boleta ya salió cuando quedó pagado.</p>
                  {/* El aviso de toda la hoja va en el pie pegado: con la hoja larga, debajo quedaba tapado (como «Registrar un pago»). */}
                  <div className="pie-hoja-fijo space-y-2 pt-2">
                    {errorEntrega && (
                      <Aviso tono="error" titulo={errorEntrega.titulo}>
                        {errorEntrega.detalle}
                      </Aviso>
                    )}
                    {entrega.incierto ? (
                      <AvisoIntentoIncierto onRevisar={() => revisarEntrega(cerrar)} revisando={revisando} />
                    ) : errorEntrega ? null : (
                      <PieGuia guia={guia} />
                    )}
                    <PieAcciones guia="pedido-web.entregar" izquierda={<BotonAnularPedido onClick={onAnularPedido} deshabilitado={entrega.enviando || entrega.incierto} />}>
                      <BotonAncla href={whatsapp(p.sinRecoger ? "norecoge" : "listo")} target="_blank" rel="noopener noreferrer">
                        <MessageCircle aria-hidden className="h-4 w-4" />
                        WhatsApp
                      </BotonAncla>
                      <Boton
                        type="button"
                        peso="primario"
                        cargando={entrega.enviando}
                        textoCargando="Entregando…"
                        disabled={!guia.puedeConfirmar || revisando}
                        title={guia.frase ?? undefined}
                        className={guia.claseConfirmar}
                        onClick={() => entregar(cerrar)}
                      >
                        {entrega.incierto ? "Volver a intentar" : "Entregar"}
                      </Boton>
                    </PieAcciones>
                  </div>
                </>
              )}
            </>
          )}

          {!porConfirmar && p.estado !== "confirmado" && p.estado !== "pagado" && modo !== "reservar" && (
            <>
              <LineasDelPedido pedido={p} tiendaId={tiendaId} onEnviar={onEnviar} />
              {porDevolver(p) > 0 && (
                <Aviso
                  tono="atencion"
                  titulo={`Falta devolverle ${soles(porDevolver(p))}`}
                  className={AVISO_CON_BOTON}
                  accion={
                    <BotonAncla href={whatsapp("devolucion")} target="_blank" rel="noopener noreferrer" className="btn-chico">
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      Escribirle por WhatsApp
                    </BotonAncla>
                  }
                >
                  El pedido está anulado y ya había pagado. Coordina cómo se lo devuelves y regístralo en cada pago con «Devolver».
                </Aviso>
              )}
              {lineasVivas.length > 0 && p.estado !== "vencido" && (
                <BloqueDinero pedido={p} ahora={ahora} onAnularPago={p.estado === "anulado" ? onAnularPago : undefined} />
              )}
              {p.estado === "entregado" && <BloqueBoleta boleta={p.boleta} />}
              {p.estado === "anulado" && p.ventaId && <BloqueBoleta boleta={p.boleta} nota={p.notaCredito} anulado />}
              <Aviso tono="info">
                {p.estado === "entregado"
                  ? `Entregado ${p.entregadoEn ? haceCuanto(p.entregadoEn, ahora) : ""}${p.entregadoPor ? ` por ${p.entregadoPor}` : ""}. Sus prendas salieron del stock.`
                  : p.estado === "vencido"
                    ? `Se cerró solo: nadie lo confirmó en ${p.plazos.horasParaConfirmar} horas. Nada se había reservado.`
                    : p.ventaId
                      ? `Anulado después de pagarse: ${textoCierre(p.cierreMotivo).toLocaleLowerCase("es")}. Sus prendas volvieron a estar libres y se le devolvió lo que pagó.`
                      : `Anulado: ${textoCierre(p.cierreMotivo).toLocaleLowerCase("es")}.`}
              </Aviso>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

const lineasPorConseguir = (d: Record<string, DecisionLinea | null>) => Object.values(d).filter((x) => x?.tipo === "por_conseguir").length;

/** Quién separó el pedido y cómo escribirle: lo necesario para coordinar por WhatsApp (decisión de Felipe, ADR-0408 act. c). */
function BloqueCliente({ pedido: p, whatsapp }: { pedido: PedidoDetalle; whatsapp: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sand bg-hueso/40 px-4 py-3" data-guia="pedido-web.cliente">
      <AvatarPersona personaId={null} nombre={p.cliente.nombre} tamano={40} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-tinta">{p.cliente.nombre}</span>
        <span className="block text-[12.5px] text-taupe">{datosDelCliente(p.cliente) || "Sin datos de contacto"}</span>
      </span>
      <BotonAncla href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-chico">
        <MessageCircle aria-hidden className="h-4 w-4" />
        WhatsApp
      </BotonAncla>
    </div>
  );
}

/** La boleta del pedido (salió sola al quedar pagado completo) y en qué va su envío a SUNAT. Sin boleta (una base sin la actividad 10),
 *  nada. `anulado`: el pedido se anuló después de pagarse; la boleta se liberó sin enviarla o la anuló su `nota` de crédito. */
function BloqueBoleta({ boleta, nota = null, anulado = false }: { boleta: BoletaWeb | null; nota?: NotaCreditoWeb | null; anulado?: boolean }) {
  if (!boleta) return null;
  const estado = estadoDeBoleta(boleta.estado);
  const estadoNota = nota ? estadoDeBoleta(nota.estado) : null;
  return (
    <div className="space-y-1" data-guia={anulado ? undefined : "pedido-web.boleta"}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-tinta">
        <ReceiptText aria-hidden className="h-4 w-4 shrink-0 text-taupe" />
        <span>
          Boleta <b className="tabular-nums">{boleta.texto}</b>
        </span>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
        <span className="text-[12.5px] text-taupe">
          {!anulado ? "Salió al quedar pagado completo." : nota ? "La anula su nota de crédito." : boleta.estado === "no_emitido" ? "Se liberó sin enviarla a SUNAT." : ""}
        </span>
      </p>
      {nota && estadoNota && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[13px] text-tinta">
          <span>
            Nota de crédito <b className="tabular-nums">{nota.texto}</b>
          </span>
          <Chip tono={estadoNota.tono}>{estadoNota.texto}</Chip>
          <span className="text-[12.5px] text-taupe">
            Por {soles(nota.total)}:{" "}
            {nota.estado === "aceptado"
              ? "SUNAT la aceptó."
              : nota.estado === "rechazado"
                ? "SUNAT la rechazó; revísala en Comprobantes."
                : "sale sola a SUNAT por la cola de siempre."}
          </span>
        </p>
      )}
    </div>
  );
}

/** «Anular pedido» de un pedido pagado: rojo desde el principio y a la izquierda del pie (lo peligroso, ADR-0358). Abre su hoja: no
 *  guarda nada (la demo la puede abrir). */
function BotonAnularPedido({ onClick, deshabilitado = false }: { onClick: () => void; deshabilitado?: boolean }) {
  return (
    <Boton type="button" peso="peligro" aria-haspopup="dialog" onClick={onClick} disabled={deshabilitado} data-guia="pedido-web.anular-pagado">
      Anular pedido
    </Boton>
  );
}

/** Una prenda por confirmar: lo que hay, de dónde sale (o traerla, conseguirla, quitarla) y sus avisos. */
function LineaPorConfirmar({
  linea: l,
  decision,
  puedeQuitar,
  onDecision,
  tiendaId,
  tienda,
  hoy,
  deshabilitado,
}: {
  linea: LineaDetalle;
  decision: DecisionLinea | null;
  /** Queda otra prenda sin quitar (`sePuedeQuitar`): con una sola, la salida es «No se puede confirmar». */
  puedeQuitar: boolean;
  onDecision: (d: DecisionLinea | null) => void;
  tiendaId: string;
  tienda: string;
  hoy: string;
  deshabilitado: boolean;
}) {
  const aqui = libresAqui(l) > 0;
  const avisos = avisosDeLinea(l, decision, tiendaId, tienda);
  const quitada = decision?.tipo === "quitar";
  // Las opciones cuando NO hay en esta tienda: traerla de otra (una por tienda que la tiene) o conseguirla para una fecha.
  const opciones = [
    ...l.disponible.otras.map((o) => ({ clave: `otra:${o.ubicacionId}`, etiqueta: `Traer de ${o.tienda} (${o.libres})` })),
    { clave: "conseguir", etiqueta: "Conseguirla" },
  ];
  const elegida = decision?.tipo === "reservar" && decision.ubicacionId !== tiendaId ? `otra:${decision.ubicacionId}` : decision?.tipo === "por_conseguir" ? "conseguir" : "";

  return (
    <div className={`space-y-2.5 rounded-xl border px-4 py-3 ${quitada ? "border-sand bg-hueso/40" : aqui ? "border-sand" : "border-ambar/40"}`}>
      <div className="flex items-start gap-3">
        <MiniPrenda prenda={l} tamano="lg" />
        <span className="min-w-0 flex-1">
          <span className={`block font-medium text-tinta ${quitada ? "line-through decoration-tinta/40" : ""}`}>
            {[l.referencia, l.color, l.talla].filter(Boolean).join(" · ")}
          </span>
          <span className="block text-[12.5px] text-taupe">{textoDisponible(l, tienda)}</span>
        </span>
        <b className="whitespace-nowrap tabular-nums text-tinta">{soles(l.precio)}</b>
      </div>

      {quitada ? (
        <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-taupe">
          Se quita del pedido al confirmar (sale del total). Avísale al cliente por WhatsApp.
          <BotonDeshacer disabled={deshabilitado} onClick={() => onDecision(decisionDeFabrica(l, tiendaId))} />
        </p>
      ) : aqui ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          <span className="text-verde">{textoDeDonde(decision?.tipo === "reservar" ? decision.lugar : null)}</span>
          {l.disponible.almacen > 0 && l.disponible.piso > 0 && decision?.tipo === "reservar" && (
            <button
              type="button"
              className="btn-enlace"
              disabled={deshabilitado}
              onClick={() => onDecision({ tipo: "reservar", ubicacionId: tiendaId, lugar: decision.lugar === "almacen" ? "piso" : "almacen" })}
            >
              {decision.lugar === "almacen" ? "Mejor la del piso" : "Mejor la del almacén"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <SegmentoDeslizante
            etiqueta={`Qué hacer con ${l.referencia}`}
            opciones={opciones}
            valor={elegida}
            onCambio={(c) => {
              if (c === "conseguir") onDecision({ tipo: "por_conseguir", fecha: decision?.tipo === "por_conseguir" ? decision.fecha : "" });
              else onDecision({ tipo: "reservar", ubicacionId: c.slice("otra:".length), lugar: null });
            }}
          />
          {decision?.tipo === "reservar" && (
            <p className="text-[12.5px] text-taupe">
              Se reserva allá y esa tienda la envía en un traslado; al llegar queda reservada aquí sola.
            </p>
          )}
          {decision?.tipo === "por_conseguir" && (
            <div className="space-y-1.5">
              <p className="text-[12.5px] text-taupe">Comprarla o hacerla en el taller; la fecha la coordinas con el cliente.</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Para qué fecha la consigues">
                {fechasSugeridas(hoy).map((f) => (
                  <button
                    key={f.fecha}
                    type="button"
                    className="pildora-cayla"
                    aria-pressed={decision.fecha === f.fecha}
                    disabled={deshabilitado}
                    onClick={() => onDecision({ tipo: "por_conseguir", fecha: f.fecha })}
                  >
                    {f.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!quitada && avisos.length > 0 && (
        <Aviso tono="atencion" chico>
          {avisos.join(" ")}
        </Aviso>
      )}

      {!quitada && puedeQuitar && (
        <div className="flex justify-end">
          <Boton type="button" peso="peligro" className="btn-chico" disabled={deshabilitado} onClick={() => onDecision({ tipo: "quitar" })}>
            Quitar del pedido
          </Boton>
        </div>
      )}
    </div>
  );
}

/** Las prendas de un pedido ya confirmado (o cerrado): dónde está cada una y qué falta con ella. Si quien mira opera la tienda donde
 *  quedó reservada una prenda de otra tienda, puede enviarla desde aquí. */
function LineasDelPedido({
  pedido: p,
  tiendaId,
  onEnviar,
  onReservar,
}: {
  pedido: PedidoDetalle;
  tiendaId: string;
  onEnviar: (desdeId: string) => void;
  /** Reservar una prenda por conseguir que ya llegó a la tienda del pedido (`reservar_linea_pedido_web`). */
  onReservar?: (l: LineaDetalle) => void;
}) {
  // Lo reservado en otra tienda, agrupado por tienda: se envía junto.
  const porEnviar = new Map<string, { tienda: string; puedo: boolean }>();
  for (const l of p.lineas) {
    if (l.estado === "reservada" && l.ubicacionId && l.ubicacionId !== p.ubicacionId)
      porEnviar.set(l.ubicacionId, { tienda: l.tiendaReserva ?? "otra tienda", puedo: l.puedoOperarAlli });
  }
  return (
    <div className="space-y-2" data-guia="pedido-web.prendas">
      <TituloGrupo cuenta={p.lineas.filter((l) => l.estado !== "quitada").length}>Sus prendas</TituloGrupo>
      <ul className="divide-y divide-sand rounded-xl border border-sand">
        {p.lineas.map((l) => {
          const e = estadoDeLinea(l, p.ubicacionId);
          return (
            <li key={l.lineaId} className="flex items-start gap-3 px-4 py-2.5">
              <MiniPrenda prenda={l} tamano="md" />
              <span className="min-w-0 flex-1">
                <span className={`block text-tinta ${l.estado === "quitada" ? "line-through decoration-tinta/40" : ""}`}>
                  {[l.referencia, l.color, l.talla].filter(Boolean).join(" · ")}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Chip tono={e.tono}>{e.texto}</Chip>
                  {e.detalle && <span className="text-[12.5px] text-taupe">{e.detalle}</span>}
                </span>
                {onReservar && sePuedeReservarYa(l) && (
                  // Lo que faltaba ya está en la tienda (se compró, salió del taller): se reserva desde aquí.
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]" data-guia="pedido-web.reservar">
                    <span className="text-verde">Ya hay {libresAqui(l)} en {p.tienda}.</span>
                    <Boton type="button" className="btn-chico" onClick={() => onReservar(l)}>
                      Reservarla
                    </Boton>
                  </span>
                )}
              </span>
              <b className="whitespace-nowrap tabular-nums text-tinta">{soles(l.precio)}</b>
            </li>
          );
        })}
      </ul>
      {[...porEnviar.entries()].map(([desdeId, x]) =>
        x.puedo && desdeId !== tiendaId ? (
          <div key={desdeId} className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-taupe">
            <span>Tú operas {x.tienda}: puedes enviarlas desde aquí.</span>
            <Boton type="button" className="btn-chico" aria-haspopup="dialog" onClick={() => onEnviar(desdeId)}>
              Enviar desde {x.tienda}
            </Boton>
          </div>
        ) : (
          <p key={desdeId} className="flex items-start gap-2 text-[12.5px] text-taupe">
            <PackageSearch aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {x.tienda} la tiene reservada: la envía desde Tienda web ▸ Pedidos, en «Para enviar a otra tienda».
          </p>
        ),
      )}
    </div>
  );
}

/** Total, lo pagado y lo que falta (o, anulado, lo que hay que devolver), con cada pago: quién lo registró, si entró a la caja, si se
 *  anuló (tachado, con quién y por qué) y, si todavía se puede, su «Anular» (o «Devolver», en un pedido anulado). */
function BloqueDinero({
  pedido: p,
  ahora,
  onAnularPago,
}: {
  pedido: PedidoDetalle;
  ahora: number;
  /** Sin esto, los pagos solo se leen (un pedido pagado completo: devolverle ya es una nota de crédito). */
  onAnularPago?: (pago: PagoDeLista) => void;
}) {
  const devolver = porDevolver(p);
  const anulado = p.estado === "anulado";
  // Anulado sin nada por devolver y con algo ya devuelto (un pedido pagado que se anuló): dice lo que se le devolvió.
  const devuelto = anulado && devolver === 0 ? devueltoAlCliente(p) : 0;
  return (
    <div className="space-y-2 rounded-xl border border-sand px-4 py-3" data-guia="pedido-web.dinero">
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-[12px] text-taupe">Total</dt>
          <dd className="font-display text-xl tabular-nums text-tinta">{soles(p.total)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-taupe">Pagado</dt>
          <dd className="font-display text-xl tabular-nums text-tinta">{soles(p.pagado)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-taupe">{anulado ? (devuelto > 0 ? "Devuelto" : "Por devolver") : "Falta"}</dt>
          <dd className={`font-display text-xl tabular-nums ${anulado ? (devolver > 0 ? "text-rojo-profundo" : "text-verde") : p.falta > 0 ? "text-ambar-profundo" : "text-verde"}`}>
            {soles(anulado ? (devuelto > 0 ? devuelto : devolver) : p.falta)}
          </dd>
        </div>
      </dl>
      {p.pagos.length === 0 ? (
        <Vacio tamano="chico" alinear="izquierda" className="px-0" icono={<Wallet />}>
          Todavía no registra pagos.
        </Vacio>
      ) : (
        <ul className="divide-y divide-sand text-[13px]">
          {p.pagos.map((g) => {
            const chip = estadoDelPago(g, p.estado);
            const tachado = g.estado === "anulado" || g.estado === "rechazado";
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`tabular-nums ${tachado ? "text-taupe line-through decoration-tinta/40" : "text-tinta"}`}>{textoDelPago(g)}</span>
                    {chip && <Chip tono={chip.tono}>{chip.texto}</Chip>}
                  </span>
                  <span className="block text-[12px] text-taupe">{detalleDelPago(g, ahora, p.tienda)}</span>
                </span>
                {onAnularPago && sePuedeAnular(g, p.estado) && (
                  <Boton type="button" peso="peligro" className="btn-chico" aria-haspopup="dialog" onClick={() => onAnularPago(g)}>
                    {anulado ? "Devolver" : "Anular pago"}
                  </Boton>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {p.lineas.some((l) => l.estado === "por_conseguir") && !esAdelanto(p) && (
        <p className="text-[12.5px] text-taupe">Espera una prenda: llega para el {fechaCorta(p.lineas.find((l) => l.estado === "por_conseguir")?.fechaCompromiso ?? null)}.</p>
      )}
    </div>
  );
}
