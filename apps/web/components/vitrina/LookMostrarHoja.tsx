"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { traducirError } from "@/lib/error-escritura";
import { camposDeMostrarLook } from "@/lib/vitrina-looks-guia";
import { errorDeLook, loQueImpideMostrar, lookDeJson, resumenLook, type Look } from "@/lib/vitrina-looks-reglas";

/**
 * Mostrar u ocultar un look desde el interruptor de su fila (maqueta v4, «e-look-sw»): dice qué pasa y pide quién lo hace (ADR-0162).
 * Mostrar exige lo mismo que la base: todas sus prendas, y cada una a la vista en la web. Ocultar no borra nada: lo vuelves a mostrar
 * cuando quieras.
 */
export function LookMostrarHoja({
  look,
  publicado,
  onClose,
  onHecho,
}: {
  look: Look;
  /** Lo que se pide: `true` mostrar, `false` ocultar. */
  publicado: boolean;
  onClose: () => void;
  onHecho: (look: Look) => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);
  const guia = useGuiaCampos(camposDeMostrarLook({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));

  // Lo que la base rechazaría al mostrarlo: una prenda eliminada del catálogo o una que ya no se ve en la web.
  const impide = publicado ? loQueImpideMostrar(look) : null;

  async function aplicar(e: React.FormEvent) {
    e.preventDefault();
    if (enVuelo.current || !guia.puedeConfirmar || impide) return;
    enVuelo.current = true;
    setGuardando(true);
    const { data, error } = await firmar(
      createClient().rpc("vitrina_mostrar_look", { p_look_id: look.id, p_publicado: publicado, p_version: look.version }),
      responsable.firma(),
    );
    enVuelo.current = false;
    setGuardando(false);
    responsable.despues(error);
    if (error || !data) {
      const propio = errorDeLook(`${error?.message ?? ""} ${error?.hint ?? ""}`);
      if (propio) avisar.error(propio.titulo, propio.detalle ? { detalle: propio.detalle } : undefined);
      else avisar.error(traducirError(error ?? { message: "sin respuesta" }, publicado ? "mostrar el look" : "ocultar el look"));
      if (propio?.releer) router.refresh();
      return;
    }
    const nuevo = lookDeJson(data);
    avisar.exito(publicado ? `El look «${look.nombre}» ya se ve en la web` : `El look «${look.nombre}» ya no se ve en la web`);
    if (nuevo) onHecho(nuevo);
    else onClose();
  }

  return (
    <Modal
      titulo={publicado ? "Mostrar en la web" : "Ocultar de la web"}
      subtitulo={
        publicado
          ? `«${look.nombre}» se verá en «Arma tu look», con el precio de la tienda que elija el cliente.`
          : `«${look.nombre}» deja de verse en la tienda online. Lo vuelves a mostrar cuando quieras.`
      }
      onClose={onClose}
      variante="hoja"
      tamano="angosta"
      bloqueado={guardando}
      conCerrar
    >
      <form onSubmit={aplicar} className="space-y-5">
        <p className="rounded-xl border border-sand bg-papel px-3.5 py-2.5 text-[13px] text-tinta">
          <span className="font-medium">{look.nombre}</span>
          <span className="block text-taupe">{`${resumenLook(look)} · ${look.piezas.map((p) => p.nombre).join(", ")}`}</span>
        </p>
        {impide && (
          <Aviso tono="atencion" titulo="Todavía no se puede mostrar" chico>
            {impide}
          </Aviso>
        )}

        <CampoGuiado id="responsable" guia={guia}>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </CampoGuiado>

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          <PieGuia guia={guia} />
          <div className="ml-auto pie-acciones">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar || Boolean(impide)}
              title={guia.frase ?? impide ?? undefined}
              className={guia.claseConfirmar}
            >
              {publicado ? "Mostrar" : "Ocultar"}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
