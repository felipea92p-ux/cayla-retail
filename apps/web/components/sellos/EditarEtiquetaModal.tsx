"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { Modal } from "@/components/ui/Modal";
import { Boton, Campo, CampoTexto } from "@/components/ui/campos";
import { ElegirDibujoDeInsignia } from "@/components/sellos/ElegirDibujoDeInsignia";
import { cambioDeDibujo, type EleccionDeDibujo } from "@/lib/eleccion-de-dibujo";
import { cambioDeNombre } from "@/lib/editar-etiqueta";
import type { ControlResponsable } from "@/lib/useResponsable";

/** Lo que se guarda al editar: cada parte es `null` si no cambió (así la hoja solo escribe lo que la persona tocó). */
export type CambiosDeEtiqueta = { nombre: string | null; dibujo: EleccionDeDibujo | null };

/**
 * «Editar» en el pase de una insignia o campaña que ya existe (ADR-0490, ampliado el 2026-10-27): corrige su nombre —un error de ortografía al
 * registrarla— y cambia el dibujo o la imagen que lleva. Guardar escribe solo lo que cambió (el nombre por `PATCH nombre`; el dibujo por
 * `fijar_icono_etiqueta`, y si es una imagen nueva, antes se sube al almacén) y lo firma el combo «Responsable», como crear una insignia
 * (ADR-0161). Su guía de foco sale de lo que ya apaga el botón: un nombre que no esté vacío, algo que cambie y alguien que firma.
 */
export function EditarEtiquetaModal({
  nombre,
  actual,
  esDelNombre,
  esCampana,
  responsable,
  guardando,
  onGuardar,
  onClose,
}: {
  /** El nombre que lleva hoy. */
  nombre: string;
  /** Lo que lleva hoy: su imagen propia, el dibujo que eligió o el de su nombre (`eleccionDeLoGuardado`). */
  actual: EleccionDeDibujo;
  /** `true` si nunca eligió: lo que lleva sale de su nombre. */
  esDelNombre: boolean;
  esCampana: boolean;
  responsable: ControlResponsable;
  guardando: boolean;
  onGuardar: (cambios: CambiosDeEtiqueta) => void;
  onClose: () => void;
}) {
  const [nombreNuevo, setNombreNuevo] = useState(nombre);
  const [eleccion, setEleccion] = useState<EleccionDeDibujo | null>(null);
  const valor = eleccion ?? actual;
  const nombreCambio = cambioDeNombre(nombre, nombreNuevo);
  const dibujoCambio = eleccion !== null && cambioDeDibujo(actual, eleccion);
  const nombreVacio = nombreNuevo.trim() === "";
  const hayCambio = nombreCambio || dibujoCambio;
  const delUno = esCampana ? "de la campaña" : "de la insignia";
  // Nombre y dibujo son UN solo campo para la guía: basta con cambiar uno de los dos.
  const guia = useGuiaCampos([
    {
      id: "cambio",
      nombre: "Nombre o ícono",
      requerido: true,
      hecho: hayCambio && !nombreVacio,
      pendiente: nombreVacio ? `Escribe el nombre ${delUno}.` : "Corrige el nombre o elige otro ícono.",
    },
    { id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." },
  ]);
  const puedeGuardar = hayCambio && !nombreVacio && responsable.listo;
  return (
    <Modal titulo={`Editar ${esCampana ? "la campaña" : "la insignia"}`} subtitulo={nombre} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <CampoGuiado id="cambio" guia={guia} className="space-y-4">
            <CampoTexto
              etiqueta={`Nombre ${delUno}`}
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              disabled={guardando}
              autoFocus
              sinPie
            />
            <Campo etiqueta="Ícono" idEtiqueta="dibujo-cambiar" sinPie>
              <ElegirDibujoDeInsignia
                valor={valor}
                yaElegido={eleccion !== null || !esDelNombre}
                onValor={setEleccion}
                idEtiqueta="dibujo-cambiar"
                deshabilitado={guardando}
              />
            </Campo>
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={guardando} />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para guardar." />
          <div className="pie-acciones">
            <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              onClick={() => onGuardar({ nombre: nombreCambio ? nombreNuevo.trim() : null, dibujo: dibujoCambio ? eleccion : null })}
              cargando={guardando}
              disabled={!puedeGuardar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              className={`flex-1 ${guia.claseConfirmar}`}
            >
              Guardar cambios
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
