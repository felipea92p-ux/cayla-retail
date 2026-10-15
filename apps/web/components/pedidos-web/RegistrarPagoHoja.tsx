"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { FichasMedio } from "@/components/ui/FichasMedio";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { traducirError } from "@/lib/error-escritura";
import { leerMonto, soles } from "@/lib/precio-sede-reglas";
import { camposPago } from "@/lib/pedidos-web-guia";
import {
  MEDIOS_PAGO_WEB,
  avisoTrasPagar,
  ayudaDelMonto,
  despuesDelPago,
  errorDelPago,
  esDigital,
  limpiarOperacion,
  montoDeFabrica,
  pagoParaLaBase,
  problemaDelMonto,
  type CampoDelPago,
  type FormPago,
} from "@/lib/pedidos-web-cobro-reglas";
import type { EstadoPedidoWeb, PedidoDetalle } from "@/lib/pedidos-web-reglas";

type ErrorDeLaBase = { campo: CampoDelPago | null; titulo: string; detalle: string };

/**
 * Registrar un pago de un pedido web (ADR-0408, actividad 9; maqueta v4, «Registrar pago»): lo que el cliente pagó por WhatsApp o en
 * la tienda. Cuánto (puede ser una parte; si el pedido espera una prenda por conseguir y todavía no paga nada, es el adelanto y el
 * monto no viene puesto: cuánto lo decide la tienda), cómo (las fichas de medio de Vender), el n.º de operación si es digital (no se
 * repite en ningún pedido, propuesta a) y quién lo registra. El efectivo entra a la caja abierta de la tienda: sin caja, no se cobra.
 * Cuando lo pagado llega al total, la base deja el pedido «pagado» sola.
 *
 * La marca del envío sigue a lo que se manda (`useIntento`, como Caja y Apartados): un doble clic o un reintento con lo mismo devuelve
 * el MISMO pago; si la respuesta se pierde, la hoja se congela hasta saber si quedó («Revisar si se guardó»). La base dice la última
 * palabra (el total, la caja, el n.º repetido): su error se muestra bajo el campo que lo causó.
 */
export function RegistrarPagoHoja({
  pedido: p,
  onClose,
  onRegistrado,
}: {
  pedido: PedidoDetalle;
  onClose: () => void;
  /** La base guardó el pago (o el pedido cambió mientras tanto): la lista y la hoja del pedido se ponen al día. */
  onRegistrado: (estado: EstadoPedidoWeb) => void;
}) {
  // La lista del combo es la de la tienda del pedido: el efectivo entra a SU caja y lo firma alguien de turno ahí.
  const responsable = useResponsable({ ubicacionId: p.ubicacionId, etiqueta: p.tienda });
  const [form, setForm] = useState<FormPago>(() => ({ monto: montoDeFabrica(p), medio: null, operacion: "" }));
  const [errorBase, setErrorBase] = useState<ErrorDeLaBase | null>(null);
  const [revisando, setRevisando] = useState(false);
  const envio = useIntento("registrar_pago_pedido_web");
  const guia = useGuiaCampos(
    camposPago({
      form,
      falta: p.falta,
      cajaAbierta: p.cajaAbierta,
      tienda: p.tienda,
      // Lo que la base acaba de rechazar de un campo falta otra vez (y apaga el botón) hasta que se cambie.
      rechazo: errorBase?.campo ? { campo: errorBase.campo, detalle: errorBase.detalle } : null,
      responsableListo: responsable.listo,
      responsableMotivo: responsable.motivo,
    }),
  );
  const cambiar = (c: Partial<FormPago>) => {
    setForm((f) => ({ ...f, ...c }));
    setErrorBase(null);
  };
  const errorEn = (campo: CampoDelPago) => (errorBase?.campo === campo ? errorBase.detalle : null);
  const problemaMonto = form.monto.trim() === "" ? null : problemaDelMonto(form.monto, p.falta);
  const despues = despuesDelPago(p.falta, form.monto);
  // El botón dice cuánto se registra apenas el monto está bien (aunque falte otro dato).
  const montoLeido = problemaDelMonto(form.monto, p.falta) === null ? leerMonto(form.monto) : null;

  function terminado(datos: Record<string, unknown> | null, monto: number, medio: FormPago["medio"], cerrar: () => void) {
    const aviso = avisoTrasPagar(monto, medio ?? "yape", datos);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onRegistrado(datos?.estado_pedido === "pagado" ? "pagado" : "confirmado");
    cerrar();
  }

  async function registrar(cerrar: () => void) {
    const params = pagoParaLaBase(p.id, form, p.falta, p.cajaAbierta, p.tienda);
    if (!params || !guia.puedeConfirmar) return;
    const res = await envio.enviar(huellaDe(params), (token, senal) =>
      firmar(createClient().rpc("registrar_pago_pedido_web", { ...params, p_token: token }), responsable.firma()).abortSignal(senal),
    );
    if (res.tipo === "ocupado") return;
    if (res.tipo === "congelado") return avisarCongelado(avisar);
    responsable.despues(res.tipo === "error" || res.tipo === "incierto" ? res.error : null);
    // En duda: la hoja lo dice sobre los botones y se congela hasta saber qué pasó.
    if (res.tipo === "incierto") return;
    if (res.tipo === "error") {
      const propio = errorDelPago(res.error);
      if (propio?.releer) {
        // El pedido cambió mientras la hoja estaba abierta (otra caja lo cobró completo, lo anularon): se cierra y se relee.
        avisar.aviso(propio.titulo, { detalle: propio.detalle });
        onRegistrado(p.estado);
        cerrar();
        return;
      }
      setErrorBase(propio ?? { campo: null, titulo: "No se pudo registrar el pago", detalle: traducirError(res.error, "registrar el pago") });
      return;
    }
    terminado(res.tipo === "ok" ? ((res.data as Record<string, unknown> | null) ?? null) : res.datos, params.p_monto, params.p_medio, cerrar);
  }

  async function revisar(cerrar: () => void) {
    setRevisando(true);
    const res = await envio.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") {
      const monto = Number(res.datos.monto);
      const medio = MEDIOS_PAGO_WEB.find((m) => m.clave === res.datos.medio)?.clave ?? null;
      return terminado(res.datos, Number.isFinite(monto) ? monto : 0, medio, cerrar);
    }
    if (res.tipo === "no_llego") {
      avisar.aviso("El pago no se registró", { detalle: "No se anotó nada. Revisa los datos y vuelve a registrarlo." });
      return;
    }
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  return (
    <Modal
      titulo="Registrar un pago"
      subtitulo={`Pedido ${p.codigo} · ${p.cliente.nombre}`}
      onClose={onClose}
      tamano="angosta"
      bloqueado={envio.enviando || envio.incierto}
    >
      {(cerrar) => (
        <div className="space-y-4">
          {/* En duda, nada se toca: otro monto reenviado podría anotar el pago dos veces. */}
          <fieldset disabled={envio.incierto} className="min-w-0 space-y-4">
            <dl className="grid grid-cols-3 gap-3 rounded-xl border border-sand px-4 py-3 text-center">
              <div>
                <dt className="text-[12px] text-taupe">Total</dt>
                <dd className="font-display text-lg tabular-nums text-tinta">{soles(p.total)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-taupe">Pagado</dt>
                <dd className="font-display text-lg tabular-nums text-tinta">{soles(p.pagado)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-taupe">Falta</dt>
                <dd className="font-display text-lg tabular-nums text-ambar-profundo">{soles(p.falta)}</dd>
              </div>
            </dl>

            <CampoGuiado id="monto" guia={guia}>
              <div data-guia="pago.monto">
                <CampoMonto
                  etiqueta={guia.etiqueta("monto", "Monto")}
                  value={form.monto}
                  inputMode="decimal"
                  autoComplete="off"
                  onChange={(e) => cambiar({ monto: e.target.value })}
                  tono={errorEn("monto") || problemaMonto ? "error" : undefined}
                  pie={errorEn("monto") ?? problemaMonto ?? ayudaDelMonto(p)}
                />
              </div>
              {form.monto.trim() !== p.falta.toFixed(2) && (
                <button type="button" className="pildora-cayla mt-1" onClick={() => cambiar({ monto: p.falta.toFixed(2) })}>
                  Todo lo que falta · {soles(p.falta)}
                </button>
              )}
            </CampoGuiado>

            <CampoGuiado id="medio" guia={guia} titulo="¿Cómo pagó?">
              <div data-guia="pago.medio">
                <FichasMedio
                  opciones={MEDIOS_PAGO_WEB}
                  valor={form.medio}
                  onValor={(medio) => cambiar({ medio, operacion: esDigital(medio) ? form.operacion : "" })}
                  etiqueta="Cómo pagó"
                  className="grid grid-cols-2 gap-2"
                  guia={(m) => (m === "yape" ? "pago.medio-yape" : undefined)}
                />
              </div>
              {form.medio === "efectivo" && p.cajaAbierta === false ? (
                <Aviso
                  tono="atencion"
                  chico
                  className="mt-2"
                  accion={
                    <BotonVer href="/caja" chico>
                      Ir a Caja
                    </BotonVer>
                  }
                >
                  No hay una caja abierta en {p.tienda}: ábrela para cobrar en efectivo, o elige otro medio.
                </Aviso>
              ) : form.medio === "efectivo" ? (
                <p className="mt-1.5 text-[12.5px] text-taupe">Entra a la caja abierta de {p.tienda}.</p>
              ) : null}
              {errorEn("medio") && (
                <Aviso tono="error" chico className="mt-2">
                  {errorEn("medio")}
                </Aviso>
              )}
            </CampoGuiado>

            {esDigital(form.medio) && (
              <CampoGuiado id="operacion" guia={guia}>
                <div data-guia="pago.operacion">
                  <CampoTexto
                    etiqueta={guia.etiqueta("operacion", "N.º de operación")}
                    mono
                    inputMode="numeric"
                    value={form.operacion}
                    onChange={(e) => cambiar({ operacion: limpiarOperacion(e.target.value) })}
                    placeholder="De 6 a 12 dígitos" // sugerir-fijo: el formato del n.º de operación no depende de lo elegido antes
                    tono={errorEn("operacion") ? "error" : undefined}
                    pie={errorEn("operacion") ?? "Cópialo de tu app o del banco y confírmalo ahí: una foto se puede editar."}
                  />
                </div>
              </CampoGuiado>
            )}

            <CampoGuiado id="responsable" guia={guia}>
              <ComboResponsable control={responsable} deshabilitado={envio.enviando} />
            </CampoGuiado>
          </fieldset>

          {/* El aviso de toda la hoja va en el pie pegado: con la hoja larga, debajo de él quedaba tapado (/chaos 2026-10-14, «la
              respuesta se perdió» y nadie veía qué hacer). En duda, la guía calla: lo que diría ya puede no ser cierto. */}
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
              <PieGuia guia={guia} listo={despues ?? "Todo listo."} />
            )}
            <PieAcciones guia="pago.acciones">
              <Boton type="button" onClick={cerrar} disabled={envio.enviando || envio.incierto}>
                Cancelar
              </Boton>
              <Boton
                type="button"
                peso="primario"
                cargando={envio.enviando}
                textoCargando="Registrando…"
                disabled={!guia.puedeConfirmar || revisando}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
                onClick={() => registrar(cerrar)}
              >
                {envio.incierto ? "Volver a intentar" : montoLeido !== null ? `Registrar ${soles(montoLeido)}` : "Registrar el pago"}
              </Boton>
            </PieAcciones>
          </div>
        </div>
      )}
    </Modal>
  );
}
