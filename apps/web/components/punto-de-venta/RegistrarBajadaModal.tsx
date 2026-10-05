"use client";

import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * «¿Quién está atendiendo?» antes de registrar, desde Vender, la bajada al piso que se olvidó (ADR-0321).
 *
 * La bajada mueve stock y queda firmada (ADR-0162), pero en Vender el responsable se elige recién al cobrar. Si al tocar
 * «Agregar y registrar como colgada» todavía no hay nadie elegido, sale esta hoja con el MISMO combo del ticket: lo elegido
 * aquí queda elegido para la venta (es la misma persona atendiendo), así que no se pregunta dos veces. Con el responsable
 * ya elegido esta hoja ni aparece: la prenda entra directo.
 */
export function RegistrarBajadaModal({
  nombres,
  sede,
  responsable,
  onConfirmar,
  onClose,
}: {
  /** Lo que se va a agregar («Blusa Paracas · M»): una o varias prendas (lo que quedó fuera al cerrar la cámara). */
  nombres: string[];
  sede: string;
  /** El combo del ticket (`useResponsable` de `PuntoDeVenta`), no uno propio. */
  responsable: ControlResponsable;
  onConfirmar: () => void;
  onClose: () => void;
}) {
  const varias = nombres.length > 1;
  return (
    <Modal titulo="Registrar que se colgó en el piso" ancho="max-w-md" onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-tinta/80">
            {varias
              ? `${nombres.join(", ")} entran al ticket y quedan registradas en el piso de ${sede}.`
              : `${nombres[0]} entra al ticket y queda registrada en el piso de ${sede}.`}{" "}
            Queda a nombre de quien atiende.
          </p>
          <ComboResponsable control={responsable} />
          <div className="flex gap-2">
            <Boton peso="fantasma" className="flex-1" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              peso="primario"
              className="flex-1"
              disabled={!responsable.listo}
              title={responsable.motivo ?? undefined}
              onClick={() => {
                onConfirmar();
                cerrar();
              }}
            >
              {/* Corto: en el celular el botón ocupa media fila y el título ya dice qué se registra. */}
              Agregar y registrar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
