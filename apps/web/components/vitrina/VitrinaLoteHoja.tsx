"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { camposDeLoteMostrar } from "@/lib/vitrina-guia";
import { errorDeVitrina, queLePasa, type ModeloVitrina, type ModoLote } from "@/lib/vitrina-reglas";

/**
 * Mostrar u ocultar en la web uno o varios modelos (maqueta v4, «Mostrar», «Ocultar»): la hoja dice qué le pasa a cada uno (el que ya
 * está como se pide no cambia; el que no se puede vender no entra) y pide quién lo hace. Se abre desde el interruptor de una fila (un
 * modelo) o desde la barra de los elegidos. Todo o nada, firmado por el «Responsable» (ADR-0162). Nada se borra: ocultar solo lo saca
 * de la tienda online.
 */
export function VitrinaLoteHoja({
  modo,
  modelos,
  onClose,
  onHecho,
}: {
  modo: ModoLote;
  modelos: ModeloVitrina[];
  onClose: () => void;
  onHecho: () => void;
}) {
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);

  const quePasa = modelos.map((m) => ({ m, ...queLePasa(m, modo) }));
  const cambian = quePasa.filter((q) => q.cambia).length;
  const guia = useGuiaCampos(camposDeLoteMostrar({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));

  async function aplicar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar || cambian === 0) return;
    enVuelo.current = true;
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("vitrina_mostrar", { p_producto_ids: quePasa.filter((q) => q.cambia).map((q) => q.m.id), p_publicado: modo === "mostrar" }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error) {
      const propio = errorDeVitrina(`${error.message ?? ""} ${error.hint ?? ""}`);
      if (propio) avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
      else avisar.error(traducirError(error, modo === "mostrar" ? "mostrar los modelos" : "ocultar los modelos"));
      return;
    }
    const uno = quePasa.find((q) => q.cambia)?.m;
    avisar.exito(
      cambian === 1 && uno
        ? `${uno.nombre} ${modo === "mostrar" ? "ya se ve en la web" : "ya no se ve en la web"}`
        : `${cambian} modelos ${modo === "mostrar" ? "ya se ven en la web" : "ya no se ven en la web"}`,
    );
    onHecho();
  }

  const uno = modelos.length === 1 ? modelos[0] : null;
  const titulo = modo === "mostrar" ? "Mostrar en la web" : "Ocultar de la web";
  const subtitulo = uno
    ? modo === "mostrar"
      ? `«${uno.nombre}» se verá en la tienda online con sus fotos, sus colores y el precio de cada tienda.`
      : `«${uno.nombre}» deja de verse en la tienda online. Lo vuelves a mostrar cuando quieras.`
    : `${modelos.length} modelos elegidos`;
  const accion = modo === "mostrar" ? (uno ? "Mostrar" : `Mostrar ${cambian}`) : uno ? "Ocultar" : `Ocultar ${cambian}`;

  return (
    <Modal titulo={titulo} subtitulo={subtitulo} onClose={onClose} variante="hoja" tamano="angosta" bloqueado={guardando} conCerrar>
      <form onSubmit={aplicar} className="space-y-5">
        <ul className="max-h-72 divide-y divide-sand overflow-y-auto rounded-xl border border-sand bg-papel text-[13px]" data-guia="vitrina-lote.lista">
          {quePasa.map((q) => (
            <li key={q.m.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
              <span className={`min-w-0 truncate ${q.cambia ? "text-tinta" : "text-taupe"}`}>{q.m.nombre}</span>
              <span className={`shrink-0 text-right ${q.cambia ? "text-tinta" : "text-taupe"}`}>{q.texto}</span>
            </li>
          ))}
        </ul>

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} listo={cambian === 0 ? "Ninguno cambia." : "Todo listo."} />
          <div className="ml-auto pie-acciones">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar || cambian === 0}
              title={guia.frase ?? (cambian === 0 ? "Ninguno de los elegidos cambia." : undefined)}
              className={guia.claseConfirmar}
            >
              {accion}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
