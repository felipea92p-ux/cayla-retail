"use client";

import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { FormularioCategoria } from "@/components/plan-compra/FormularioCategoria";
import type { CategoriaPlan, FilaPlan } from "@/lib/plan-compra-reglas";

// La ventana de una categoría en el plan de campaña (ADR-0349): el formulario de la categoría (`FormularioCategoria`, el mismo que usa
// el paso a paso) dentro de una hoja. Aquí solo vive lo propio de la hoja: el título, el pie y qué pasa al guardar. Con «Guardar y seguir
// con …» la hoja NO se cierra: pasa a la siguiente categoría que más vende y no tiene plan (la elige `PlanCampana`, que ve toda la
// lista). El formulario lleva `key` por categoría: cada una arranca con su propio borrador, nunca con el de la anterior.

export function PlanCategoriaModal({
  planId,
  planNombre,
  fila,
  vendidoPorTalla,
  tope,
  inversionDeLasDemas,
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
  /** La que sigue si se guarda con «Guardar y seguir»; null si no queda ninguna (el botón no se dibuja). */
  siguiente: CategoriaPlan | null;
  /** Ya se guardó alguna en esta tanda: esta llegó por «Guardar y seguir» y el cursor va a su primer campo. */
  enSerie: boolean;
  /** Se guardó la categoría. `seguir`: con «Guardar y seguir» (y hay una siguiente); si no, la hoja se cierra. */
  onGuardado: (seguir: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal titulo={`Plan de ${fila.c.nombre}`} subtitulo={`${planNombre}.`} onClose={onClose} variante="hoja" ancho="max-w-2xl">
      {(cerrar) => (
        <FormularioCategoria
          key={fila.c.id}
          planId={planId}
          fila={fila}
          vendidoPorTalla={vendidoPorTalla}
          tope={tope}
          inversionDeLasDemas={inversionDeLasDemas}
          irAlMontar={enSerie}
          onGuardado={(seguir) => {
            onGuardado(seguir && siguiente !== null);
            if (!(seguir && siguiente !== null)) cerrar();
          }}
          pie={({ guardando, puedeGuardar, motivo, claseConfirmar }) => (
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso={siguiente ? "fantasma" : "primario"} cargando={guardando} disabled={!puedeGuardar} title={motivo} className={siguiente ? undefined : claseConfirmar}>
                Guardar
              </Boton>
              {siguiente && (
                <Boton type="submit" data-seguir="1" peso="primario" cargando={guardando} disabled={!puedeGuardar} title={motivo} className={claseConfirmar}>
                  Guardar y seguir con {siguiente.nombre}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Boton>
              )}
            </div>
          )}
        />
      )}
    </Modal>
  );
}
