"use client";

import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { FormularioCategoria } from "@/components/plan-compra/FormularioCategoria";
import type { CategoriaPlan, LineaPlan } from "@/lib/plan-compra-reglas";

// La ventana de una categoría en el plan de campaña (ADR-0349): el formulario de la categoría (`FormularioCategoria`, el mismo que usa
// el paso a paso) dentro de una hoja. Aquí solo vive lo propio de la hoja: el título, el pie con «Cancelar» y «Guardar» y que al
// guardar se cierra.

export function PlanCategoriaModal({
  planId,
  planNombre,
  categoria,
  linea,
  stock,
  vendidoPorTalla,
  onClose,
}: {
  planId: string;
  planNombre: string;
  categoria: CategoriaPlan;
  linea: LineaPlan | undefined;
  stock: number;
  vendidoPorTalla: ReadonlyMap<string, number> | undefined;
  onClose: () => void;
}) {
  return (
    <Modal titulo={`Plan de ${categoria.nombre}`} subtitulo={`${planNombre}. Hoy hay ${stock} en la red.`} onClose={onClose} variante="hoja" ancho="max-w-2xl">
      {(cerrar) => (
        <FormularioCategoria
          planId={planId}
          categoria={categoria}
          linea={linea}
          stock={stock}
          vendidoPorTalla={vendidoPorTalla}
          onGuardado={cerrar}
          pie={({ guardando, puedeGuardar, motivo, claseConfirmar }) => (
            <div className="flex justify-end gap-3 pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={guardando} disabled={!puedeGuardar} title={motivo} className={claseConfirmar}>
                Guardar
              </Boton>
            </div>
          )}
        />
      )}
    </Modal>
  );
}
