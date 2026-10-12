"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { FormularioCategoria } from "@/components/plan-compra/FormularioCategoria";
import type { CategoriaPlan, FilaPlan } from "@/lib/plan-compra-reglas";

// La ventana de una categoría en el plan de campaña (ADR-0349): el formulario de la categoría (`FormularioCategoria`, el mismo que usa
// el paso a paso) dentro de una hoja. Aquí solo vive lo propio de la hoja: el título, el pie y qué pasa al guardar. Con «Guardar y seguir
// con …» la hoja NO se cierra: pasa a la siguiente categoría que más vende y no tiene plan (la elige `PlanCampana`, que ve toda la
// lista). El formulario lleva `key` por categoría: cada una arranca con su propio borrador, nunca con el de la anterior.
//
// Salir con algo escrito sin guardar —Escape, el velo, «Cancelar», un enlace o «Atrás»— pregunta antes de perderlo (`useSalidaSinGuardar`,
// la pieza del ERP; Formidable 2026-10-10: antes se perdía en silencio). Escape y el velo preguntan con la hoja todavía a la vista
// (`antesDeCerrar` de <Modal>).

export function PlanCategoriaModal({
  planId,
  planNombre,
  fila,
  vendidoPorTalla,
  tope,
  inversionDeLasDemas,
  conVersion,
  versionConocida,
  siguiente,
  enSerie,
  onGuardado,
  onClose,
}: {
  planId: string;
  planNombre: string;
  fila: FilaPlan;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  /** El tope de la campaña (null = sin tope) y lo que cuestan las otras categorías con plan. */
  tope: number | null;
  inversionDeLasDemas: number;
  /** La base ya compara versiones al guardar (B4). */
  conVersion: boolean;
  /** La versión que devolvió un guardado de esta tanda para esta categoría, si lo hubo. */
  versionConocida?: number;
  /** La que sigue si se guarda con «Guardar y seguir»; null si no queda ninguna (el botón no se dibuja). */
  siguiente: CategoriaPlan | null;
  /** Ya se guardó alguna en esta tanda: esta llegó por «Guardar y seguir» y el cursor va a su primer campo. */
  enSerie: boolean;
  /** Se guardó la categoría. `seguir`: con «Guardar y seguir» (y hay una siguiente); si no, la hoja se cierra. `version`: la nueva. */
  onGuardado: (seguir: boolean, version: number | null) => void;
  onClose: () => void;
}) {
  const [sucio, setSucio] = useState(false);
  const salida = useSalidaSinGuardar(sucio, `Escribiste parte del plan de ${fila.c.nombre} y todavía no se guardó. Si sales ahora, se pierde lo que escribiste.`);
  return (
    <Modal titulo={`Plan de ${fila.c.nombre}`} subtitulo={`${planNombre}.`} onClose={onClose} antesDeCerrar={salida.pedirAccion} variante="hoja" ancho="max-w-2xl">
      {(cerrar) => (
        <>
          <FormularioCategoria
            key={fila.c.id}
            planId={planId}
            fila={fila}
            vendidoPorTalla={vendidoPorTalla}
            tope={tope}
            inversionDeLasDemas={inversionDeLasDemas}
            conVersion={conVersion}
            versionConocida={versionConocida}
            irAlMontar={enSerie}
            onCambios={setSucio}
            antesDeRefrescar={salida.retirarYa}
            onGuardado={(seguir, version) => {
              onGuardado(seguir && siguiente !== null, version);
              if (!(seguir && siguiente !== null)) cerrar();
            }}
            pie={({ guardando, puedeGuardar, motivo, claseConfirmar }) => (
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Boton type="button" onClick={() => salida.pedirAccion(cerrar)}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso={siguiente ? "fantasma" : "primario"} cargando={guardando} disabled={!puedeGuardar} title={motivo} className={siguiente ? undefined : claseConfirmar}>
                  Guardar
                </Boton>
                {siguiente && (
                  <Boton type="submit" data-seguir="1" peso="primario" cargando={guardando} disabled={!puedeGuardar} title={motivo} className={claseConfirmar}>
                    <span className="inline-flex items-center gap-2">
                      Guardar y seguir con {siguiente.nombre}
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </span>
                  </Boton>
                )}
              </div>
            )}
          />
          {salida.aviso}
        </>
      )}
    </Modal>
  );
}
