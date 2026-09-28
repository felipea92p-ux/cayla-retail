"use client";

import { useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { agruparCambios, type ResumenCambios } from "@/lib/producto-cambios-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";

/**
 * La hoja «Revisa y guarda los cambios» (ADR-0256; Felipe eligió la opción A de la pregunta 2 el 2026-09-28).
 *
 * EL PROBLEMA. Guardar una ficha pedía elegir «Responsable» en un panel lejano y dejaba el botón gris sin decir por qué. Ahora
 * «Revisar y guardar» abre esta hoja: lista lo que va a cambiar, pide quién hace la operación justo aquí y confirma. El orden
 * es el natural (cambio → guardo → digo quién soy → confirmo) y es el mismo patrón que Catálogo (`ConfirmarConResponsable`,
 * 2026-09-23). Con la cuenta de una persona presente el combo ya trae su nombre y son dos toques; con la tablet de la tienda,
 * elegir quién es, que ya era obligatorio.
 *
 * `onConfirmar` guarda y dice si la hoja debe cerrarse: sí cuando salió bien (la pantalla se va sola) o cuando lo que falló
 * se arregla en la ficha (un nombre repetido, una versión vieja); NO cuando falló por el responsable (dejó de estar de turno,
 * por ejemplo): ahí se queda abierta para elegir a otra persona sin perder el lugar.
 */
export function ConfirmarCambios({
  nombre,
  resumen,
  control,
  onConfirmar,
  onClose,
}: {
  nombre: string;
  resumen: ResumenCambios;
  control: ControlResponsable;
  onConfirmar: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [enCurso, setEnCurso] = useState(false);
  const grupos = agruparCambios(resumen.cambios);

  return (
    <Modal
      titulo="Revisa y guarda los cambios"
      subtitulo={`Esto es lo que va a cambiar en «${nombre}». Nada se guarda hasta que confirmes.`}
      variante="hoja"
      ancho="max-w-md"
      bloqueado={enCurso}
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <div className="max-h-[36vh] divide-y divide-sand overflow-y-auto pr-1">
            {grupos.map((g) => (
              <section key={g.clave} className="py-2.5 first:pt-0">
                <h3 className="label-cayla mb-1.5 flex items-center gap-2 text-[11px] text-taupe">
                  {g.titulo}
                  <span className="rounded-full bg-ambar/15 px-2 text-[11px] font-semibold tracking-normal text-ambar">{g.lineas.length}</span>
                </h3>
                <ul className="space-y-1">
                  {g.lineas.map((l, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 text-sm text-tinta">
                      <span className="min-w-0">{l.texto}</span>
                      {l.antes !== undefined && l.despues !== undefined ? (
                        <span className="shrink-0 whitespace-nowrap tabular-nums">
                          <s className="mr-1 text-tinta/50">{l.antes}</s>→ {l.despues}
                        </span>
                      ) : l.detalle ? (
                        <span className="shrink-0 text-tinta/65">{l.detalle}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <ComboResponsable control={control} deshabilitado={enCurso} />

          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar} disabled={enCurso}>
              Volver a editar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              className="flex-1"
              cargando={enCurso}
              disabled={!control.listo}
              title={control.motivo ?? undefined}
              onClick={async () => {
                setEnCurso(true);
                const cerrarHoja = await onConfirmar();
                setEnCurso(false);
                if (cerrarHoja) cerrar();
              }}
            >
              Confirmar y guardar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
