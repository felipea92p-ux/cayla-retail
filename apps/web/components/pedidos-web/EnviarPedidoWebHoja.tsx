"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { MiniPrenda } from "@/components/pedidos-web/PedidosWebPantalla";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/fechas-lima";
import { camposEnviar } from "@/lib/pedidos-web-guia";
import { errorDePedidoWeb, instanteDeLlegada, llegadaDeFabrica, type EnvioPorHacer } from "@/lib/pedidos-web-reglas";

/**
 * Enviar a la tienda del pedido lo que quedó reservado aquí (maqueta: «Pedir traslado desde Arequipa»; el motor de traslados de
 * siempre, como el pedido a otra sede de Apartados). Suelta la reserva y arma el traslado en la misma transacción: la prenda nunca
 * queda libre para otra caja. Si estaba colgada, la base la sube al almacén antes (de ahí sale todo traslado). Al llegar, la otra
 * tienda la recibe en Traslados y queda reservada sola para su pedido. La marca del envío (`p_token`) hace que un doble clic o un
 * reintento devuelva el MISMO traslado.
 */
export function EnviarPedidoWebHoja({ envio, onClose, onEnviado }: { envio: EnvioPorHacer; onClose: () => void; onEnviado: () => void }) {
  const responsable = useResponsable();
  const hoy = hoyLima();
  const [llega, setLlega] = useState(() => llegadaDeFabrica());
  const [enviando, setEnviando] = useState(false);
  const enVuelo = useRef(false);
  // La marca del envío sigue a lo que se manda: el mismo día de llegada, el mismo traslado (un reintento no arma otro).
  const marca = useRef<{ llega: string; token: string } | null>(null);
  const guia = useGuiaCampos(camposEnviar({ llega, hoy, responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  const colgadas = envio.lineas.filter((l) => l.lugar === "piso").length;

  async function enviar(cerrar: () => void) {
    if (enVuelo.current || !guia.puedeConfirmar) return;
    if (!marca.current || marca.current.llega !== llega) marca.current = { llega, token: crypto.randomUUID() };
    enVuelo.current = true;
    setEnviando(true);
    const { data, error } = await firmar(
      createClient().rpc("enviar_pedido_web_desde", {
        p_pedido_id: envio.pedidoId,
        p_ubicacion_origen_id: envio.desdeId,
        p_fecha_estimada_llegada: instanteDeLlegada(llega),
        p_token: marca.current.token,
      }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setEnviando(false);
    responsable.despues(error);
    if (error) {
      const propio = errorDePedidoWeb(error);
      if (propio) avisar.error(propio.titulo, { detalle: propio.detalle });
      else avisar.error(traducirError(error, "enviar las prendas"));
      return;
    }
    marca.current = null;
    const numero = (data as { traslado_numero?: number } | null)?.traslado_numero;
    avisar.exito(`Enviado a ${envio.tiendaPedido}`, {
      detalle: `Salió en el traslado${numero ? ` N.º ${numero}` : ""}: empácalo con el número ${envio.codigo}. Al llegar queda reservado para el pedido.`,
    });
    onEnviado();
    cerrar();
  }

  return (
    <Modal titulo={`Enviar a ${envio.tiendaPedido}`} subtitulo={`Pedido web ${envio.codigo} · sale de ${envio.desde}`} onClose={onClose} tamano="angosta" bloqueado={enviando}>
      {(cerrar) => (
        <div className="space-y-4">
          <ul className="divide-y divide-sand rounded-xl border border-sand" data-guia="enviar-pedido-web.prendas">
            {envio.lineas.map((l) => (
              <li key={l.lineaId} className="flex items-center gap-3 px-4 py-2.5">
                <MiniPrenda prenda={l} tamano="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-tinta">{[l.referencia, l.color, l.talla].filter(Boolean).join(" · ")}</span>
                  <span className="block text-[12.5px] text-taupe">
                    {l.lugar === "piso" ? "Está colgada en el piso: descuélgala para empacarla" : l.lugar === "almacen" ? "Está en el almacén" : "Reservada aquí"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <CampoGuiado id="llega" guia={guia}>
            <div data-guia="enviar-pedido-web.llega">
              <CampoFecha etiqueta={guia.etiqueta("llega", "¿Cuándo llega?")} valor={llega} onValor={setLlega} required />
            </div>
          </CampoGuiado>
          <p className="nota-cayla text-[13px]">
            Sale como un traslado más{colgadas > 0 ? " (lo colgado pasa antes al almacén)" : ""}: Traslados lo muestra en camino hasta que{" "}
            {envio.tiendaPedido} lo reciba, y ahí queda reservado solo para el pedido.
          </p>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>
          <div className="space-y-2 pt-1">
            <PieGuia guia={guia} />
            <PieAcciones guia="enviar-pedido-web.acciones">
              <Boton type="button" onClick={cerrar} disabled={enviando}>
                Cancelar
              </Boton>
              <Boton
                type="button"
                peso="primario"
                cargando={enviando}
                textoCargando="Enviando…"
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
                onClick={() => enviar(cerrar)}
              >
                Enviar por traslado
              </Boton>
            </PieAcciones>
          </div>
        </div>
      )}
    </Modal>
  );
}
