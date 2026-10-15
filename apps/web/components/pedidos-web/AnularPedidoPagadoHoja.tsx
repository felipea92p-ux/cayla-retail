"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Chip } from "@/components/ui/Chip";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
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
import { soles } from "@/lib/precio-sede-reglas";
import { camposAnularPagado } from "@/lib/pedidos-web-guia";
import { textoDelPago } from "@/lib/pedidos-web-cobro-reglas";
import {
  adondeIrPorLaBoleta,
  avisoTrasAnular,
  efectivoADevolver,
  errorDeAnularPagado,
  leerRespuestaAnulacion,
  pagosADevolver,
  tieneCobroDePasarela,
  textoDeDevolucion,
  textoDePrenda,
  tituloDeBoleta,
  totalADevolver,
} from "@/lib/pedidos-web-anular-reglas";
import { estadoDeBoleta, MOTIVOS_ANULAR_PAGADO, type MotivoAnularPagado, type PedidoDetalle } from "@/lib/pedidos-web-reglas";

type ErrorDeLaBase = { campo: string | null; titulo: string; detalle: string };

/**
 * Anular un pedido web PAGADO que todavía no se entrega (ADR-0408; Felipe, 2026-10-15: «Se debería poder anular el pedido y la boleta,
 * cualquier persona con el módulo lo debería poder hacer»). Antes de confirmar dice, en tres bloques, lo que va a pasar: con sus prendas
 * (vuelven a estar libres), con su plata (cada pago se le devuelve por su medio; el efectivo sale de la caja abierta de hoy) y con su
 * boleta (se libera sin enviarla, sale su nota de crédito, o todavía no se puede y qué hacer: lo decide la base). Con el motivo y quién lo
 * hace, «Anular y devolver» lo hace todo de una vez en la base (`anular_pedido_web_pagado`): o queda todo anulado o no cambia nada.
 *
 * La marca del envío sigue a lo que se manda (`useIntento`): un doble clic o un reintento devuelven la MISMA anulación; si la respuesta se
 * pierde, la hoja se congela hasta saber si quedó («Revisar si se guardó»). La nota de crédito nace pendiente y la manda la cola de siempre.
 */
export function AnularPedidoPagadoHoja({
  pedido: p,
  onClose,
  onAnulado,
  onReleer,
}: {
  pedido: PedidoDetalle;
  onClose: () => void;
  /** La base anuló el pedido (o ya estaba cambiado): la lista se pone al día y las hojas se cierran. */
  onAnulado: () => void;
  /** Volver a leer el pedido: lo que se dijo de la boleta pudo cambiar (ya salió a SUNAT, ya la aceptó). */
  onReleer: () => void;
}) {
  // La lista del combo es la de la tienda del pedido: el efectivo sale de SU caja y lo firma alguien de turno ahí.
  const responsable = useResponsable({ ubicacionId: p.ubicacionId, etiqueta: p.tienda });
  const [motivo, setMotivo] = useState<MotivoAnularPagado | null>(null);
  const [errorBase, setErrorBase] = useState<ErrorDeLaBase | null>(null);
  const [revisando, setRevisando] = useState(false);
  const envio = useIntento("anular_pedido_web_pagado");

  const pagos = pagosADevolver(p);
  const total = totalADevolver(p);
  const efectivo = efectivoADevolver(p);
  const pasarela = tieneCobroDePasarela(p);
  const camino = p.anulacionBoleta;
  const prendas = p.lineas.flatMap((l) => {
    const texto = textoDePrenda(l, p.ubicacionId, p.tienda);
    return texto ? [{ linea: l, texto }] : [];
  });
  const guia = useGuiaCampos(
    camposAnularPagado({
      // Lo que la base acaba de rechazar de la boleta vuelve a faltar, con su frase, hasta que se vuelva a abrir la hoja.
      camino: errorBase?.campo === "boleta" ? { camino: "esperar", texto: camino?.texto ?? null, estado: camino?.estado ?? null, total: null, explicacion: errorBase.detalle, hint: null } : camino,
      efectivo,
      cajaAbierta: errorBase?.campo === "caja" ? false : p.cajaAbierta,
      tienda: p.tienda,
      pasarela,
      motivo,
      responsableListo: responsable.listo,
      responsableMotivo: responsable.motivo,
    }),
  );

  function terminado(datos: Record<string, unknown> | null, cerrar: () => void) {
    const aviso = avisoTrasAnular(p.codigo, leerRespuestaAnulacion(datos), p.tienda);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onAnulado();
    cerrar();
  }

  async function anular(cerrar: () => void) {
    if (!guia.puedeConfirmar || !motivo) return;
    setErrorBase(null);
    const params = { p_pedido_id: p.id, p_motivo: motivo };
    const res = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("anular_pedido_web_pagado", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado") return;
    if (res.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") {
      const propio = errorDeAnularPagado(res.error, { efectivo, tienda: p.tienda });
      if (propio?.releer) {
        // Otra caja ya lo anuló o lo entregó mientras la hoja estaba abierta: se cierra y se relee.
        avisar.aviso(propio.titulo, { detalle: propio.detalle });
        onAnulado();
        cerrar();
        return;
      }
      setErrorBase(propio ?? { campo: null, titulo: "No se pudo anular el pedido", detalle: traducirError(res.error, "anular el pedido") });
      return;
    }
    terminado(res.tipo === "ok" ? ((res.data as Record<string, unknown> | null) ?? null) : res.datos, cerrar);
  }

  async function revisar(cerrar: () => void) {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") {
      avisar.exito(`Pedido ${p.codigo} anulado`, { detalle: "Se le devolvió lo que pagó y su boleta se anuló. Mira el detalle en el pedido." });
      onAnulado();
      cerrar();
      return;
    }
    if (res.tipo === "no_llego") {
      avisar.aviso("El pedido no se anuló", { detalle: "No cambió nada: ni la plata, ni las prendas, ni la boleta. Puedes volver a intentarlo." });
      return;
    }
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  const irPorLaBoleta = camino ? adondeIrPorLaBoleta(camino) : null;
  const estadoBoleta = camino?.estado ? estadoDeBoleta(camino.estado) : null;

  return (
    <Modal
      titulo="Anular el pedido"
      subtitulo={`Pedido ${p.codigo} · ${p.cliente.nombre}`}
      onClose={onClose}
      tamano="mediana"
      bloqueado={envio.enviando || envio.incierto}
    >
      {(cerrar) => (
        <div className="space-y-5">
          {/* En duda, nada se toca: otro motivo reenviado podría anular dos veces. */}
          <fieldset disabled={envio.incierto} className="min-w-0 space-y-5">
            <Aviso tono="atencion" titulo="Se deshace todo de una vez">
              Ya pagó y no se va a entregar: sus prendas vuelven a estar libres, se le devuelve lo que pagó y su boleta se anula. Avísale al
              cliente antes.
            </Aviso>

            <div className="space-y-2" data-guia="anular-pedido.prendas">
              <TituloGrupo cuenta={prendas.length}>Sus prendas</TituloGrupo>
              <ul className="divide-y divide-sand rounded-xl border border-sand">
                {prendas.map(({ linea: l, texto }) => (
                  <li key={l.lineaId} className="flex items-start gap-3 px-4 py-2.5">
                    <MiniPrenda prenda={l} tamano="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-tinta">{[l.referencia, l.color, l.talla].filter(Boolean).join(" · ")}</span>
                      <span className="block text-[12.5px] text-taupe">{texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2" data-guia="anular-pedido.plata">
              <TituloGrupo nota={`se le devuelven ${soles(total)}`}>Su plata</TituloGrupo>
              <ul className="divide-y divide-sand rounded-xl border border-sand text-[13px]">
                {pagos.map((g) => (
                  <li key={g.id} className="px-4 py-2.5">
                    <span className="block tabular-nums text-tinta">{textoDelPago(g)}</span>
                    <span className="block text-[12.5px] text-taupe">{textoDeDevolucion(g, p.tienda)}</span>
                  </li>
                ))}
              </ul>
              {efectivo > 0 && (
                <CampoGuiado id="caja" guia={guia}>
                  {p.cajaAbierta === false || errorBase?.campo === "caja" ? (
                    <Aviso
                      tono="atencion"
                      chico
                      accion={
                        <BotonVer href="/caja" chico>
                          Ir a Caja
                        </BotonVer>
                      }
                    >
                      {errorBase?.campo === "caja" ? errorBase.detalle : `Hay que devolverle ${soles(efectivo)} en efectivo y no hay una caja abierta en ${p.tienda}: ábrela.`}
                    </Aviso>
                  ) : (
                    <p className="text-[12.5px] text-taupe">
                      {soles(efectivo)} salen de la caja abierta de hoy de {p.tienda}, aunque se haya cobrado otro día. Si esa caja no tiene ese
                      efectivo, no se anula nada.
                    </p>
                  )}
                </CampoGuiado>
              )}
              {pasarela && (
                <CampoGuiado id="pasarela" guia={guia}>
                  <Aviso tono="atencion" chico>
                    Tiene un cobro de la pasarela: ese se devuelve desde la pasarela, no desde la tienda.
                  </Aviso>
                </CampoGuiado>
              )}
            </div>

            <CampoGuiado id="boleta" guia={guia}>
              <div className="space-y-2" data-guia="anular-pedido.boleta">
                <TituloGrupo>Su boleta</TituloGrupo>
                {camino ? (
                  <div className="space-y-2 rounded-xl border border-sand px-4 py-3">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-tinta">
                      <ReceiptText aria-hidden className="h-4 w-4 shrink-0 text-taupe" />
                      {camino.texto && (
                        <span>
                          Boleta <b className="tabular-nums">{camino.texto}</b>
                        </span>
                      )}
                      {estadoBoleta && <Chip tono={estadoBoleta.tono}>{estadoBoleta.texto}</Chip>}
                    </p>
                    {camino.camino === "esperar" || errorBase?.campo === "boleta" ? (
                      <Aviso
                        tono="atencion"
                        chico
                        titulo={tituloDeBoleta(camino)}
                        accion={
                          irPorLaBoleta ? (
                            <BotonVer href={irPorLaBoleta.href} chico>
                              {irPorLaBoleta.texto}
                            </BotonVer>
                          ) : (
                            // Se está enviando: en un par de minutos la base ya sabe. Volver a leer, no a anular a ciegas.
                            <Boton
                              type="button"
                              className="btn-chico"
                              onClick={() => {
                                setErrorBase(null);
                                onReleer();
                              }}
                            >
                              Revisar de nuevo
                            </Boton>
                          )
                        }
                      >
                        {errorBase?.campo === "boleta" ? errorBase.detalle : camino.explicacion}
                      </Aviso>
                    ) : (
                      <p className="text-[12.5px] text-taupe">
                        <b className="font-semibold text-tinta">{tituloDeBoleta(camino)}.</b> {camino.explicacion}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-taupe">Su boleta se anula por el camino de siempre: lo dice la base al anular.</p>
                )}
              </div>
            </CampoGuiado>

            <CampoGuiado id="motivo" guia={guia} titulo="¿Por qué se anula?">
              <div data-guia="anular-pedido.motivo">
                <SegmentoDeslizante
                  etiqueta="Por qué se anula el pedido"
                  opciones={MOTIVOS_ANULAR_PAGADO.map((m, i) => ({ clave: m.clave, etiqueta: m.etiqueta, ...(i === 0 ? { guia: "anular-pedido.motivo-primero" } : {}) }))}
                  valor={motivo ?? ""}
                  onCambio={(c) => {
                    setMotivo(c as MotivoAnularPagado);
                    if (errorBase?.campo === "motivo" || errorBase?.campo === null) setErrorBase(null);
                  }}
                />
              </div>
            </CampoGuiado>

            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={envio.enviando} />
            </CampoGuiado>
          </fieldset>

          {/* El aviso de toda la hoja va en el pie pegado: con la hoja larga, debajo quedaba tapado (como «Registrar un pago»). */}
          <div className="pie-hoja-fijo space-y-2 pt-1">
            {errorBase && errorBase.campo === null && (
              <Aviso tono="error" titulo={errorBase.titulo}>
                {errorBase.detalle}
              </Aviso>
            )}
            {envio.incierto ? (
              <AvisoIntentoIncierto onRevisar={() => revisar(cerrar)} revisando={revisando} />
            ) : errorBase && errorBase.campo === null ? null : (
              // Con un «no» de la base a la vista, «Todo listo» la contradiría.
              <PieGuia guia={guia} listo={`Todo listo: se le devuelven ${soles(total)} y se anula su boleta.`} />
            )}
            <PieAcciones guia="anular-pedido.acciones">
              <Boton type="button" onClick={cerrar} disabled={envio.enviando || envio.incierto}>
                Cancelar
              </Boton>
              <Boton
                type="button"
                peso="peligro"
                cargando={envio.enviando}
                textoCargando="Anulando…"
                disabled={!guia.puedeConfirmar || revisando}
                title={guia.frase ?? undefined}
                onClick={() => anular(cerrar)}
              >
                {envio.incierto ? (
                  "Volver a intentar"
                ) : (
                  // En el celular el pie se reparte en mitades: ahí sin el monto (ya está arriba, en «Su plata»).
                  <span>
                    Anular y devolver<span className="max-sm:hidden"> {soles(total)}</span>
                  </span>
                )}
              </Boton>
            </PieAcciones>
          </div>
        </div>
      )}
    </Modal>
  );
}
