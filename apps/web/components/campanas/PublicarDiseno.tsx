"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { fechaLarga, type Aviso as AvisoDeRevision, type DisenoDeCampana } from "@cayla-retail/portada";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { Lienzo } from "./Lienzo";
import { PortadaDeCampana, type CampanaDePortada, type PiezaDePortada } from "./PortadaDeCampana";
import { Revision } from "./DisenoCampana";

/**
 * «Publicar el diseño» (ADR-0436, actividad 4; maqueta, pantalla 3): la portada en los dos tamaños, cuándo se ve y cuándo se quita, la
 * revisión y quién publica. Primero se guarda lo último que se tocó (`guardarYa`) y se publica ESA versión: si otra persona cambió el
 * borrador mientras tanto, la base no publica y lo dice. El diseño anterior queda guardado («Volver al anterior»).
 */
export function PublicarDiseno({
  campana,
  diseno,
  piezas,
  avisos,
  despues,
  ahora,
  guardarYa,
  onClose,
}: {
  campana: CampanaDePortada & { id: string };
  diseno: DisenoDeCampana;
  piezas: readonly PiezaDePortada[];
  avisos: readonly AvisoDeRevision[];
  despues: string;
  ahora: number;
  guardarYa: () => Promise<number | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [publicando, setPublicando] = useState(false);
  const guia = useGuiaCampos([{ id: "responsable", nombre: "Quién publica", requerido: true, hecho: responsable.listo, pendiente: "Elige quién publica." }]);

  async function publicar(cerrar: () => void) {
    if (!responsable.listo) return;
    setPublicando(true);
    try {
      const version = await guardarYa();
      if (version === null) {
        avisar.error("No se pudo guardar lo último que cambiaste. Revisa la conexión y vuelve a intentar.");
        return;
      }
      const { error } = await firmar(
        createClient().rpc("publicar_diseno_campana" as never, { p_etiqueta_id: campana.id, p_version: version } as never),
        responsable.firma(),
      );
      responsable.despues(error);
      if (error) {
        avisar.error(traducirError(error, "publicar el diseño"));
        return;
      }
      avisar.exito(`Diseño de ${campana.nombre} publicado`, { detalle: "Se ve en la web en menos de 5 minutos." });
      cerrar();
      router.refresh();
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <Modal titulo="Publicar el diseño" subtitulo={`${campana.nombre} · así lo verán los clientes en la computadora y en el celular.`} tamano="ancha" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-5">
          <div className="tw-dos-vistas">
            <div className="overflow-hidden rounded-xl border border-sand">
              <Lienzo ancho={1280} alto={720} etiqueta={`La portada de ${campana.nombre} en la computadora`}>
                <PortadaDeCampana campana={campana} diseno={diseno} tema="claro" piezas={piezas} ahora={ahora} />
              </Lienzo>
            </div>
            <div className="tw-celular">
              <Lienzo ancho={375} alto={812} etiqueta={`La portada de ${campana.nombre} en el celular`}>
                <PortadaDeCampana campana={campana} diseno={diseno} tema="claro" piezas={piezas} ahora={ahora} celular />
              </Lienzo>
            </div>
          </div>
          <div className="tw-cuando">
            <div>
              <small>Se ve en la web</small>
              <b>En menos de 5 min</b>
            </div>
            <div>
              <small>Se quita sola</small>
              <b>{campana.hasta ? `Al cerrar el ${fechaLarga(campana.hasta)}` : "Cuando la apagues"}</b>
            </div>
            <div>
              <small>Después sale</small>
              <b>{despues}</b>
            </div>
          </div>
          <Revision avisos={avisos} />
          <CampoGuiado id="responsable" guia={guia}>
            <p className="campo-etiqueta">{guia.etiqueta("responsable", "Quién publica")}</p>
            <ComboResponsable control={responsable} />
          </CampoGuiado>
          <p className="nota-cayla sin-i flex items-start gap-2">
            <Undo2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>El diseño anterior queda guardado: si algo no te gusta, «Volver al anterior» lo regresa en un toque.</span>
          </p>
          <PieGuia guia={guia} listo="Todo listo para publicar." />
          <PieAcciones>
            <Boton peso="fantasma" onClick={cerrar} disabled={publicando}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={() => void publicar(cerrar)} cargando={publicando} textoCargando="Publicando…" disabled={!responsable.listo} title={guia.frase ?? undefined}>
              Publicar diseño
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
