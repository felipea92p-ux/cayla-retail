"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { agruparCambios, type ResumenCambios } from "@/lib/producto-cambios-reglas";

/**
 * La hoja «Revisa y guarda los cambios» (ADR-0257; Felipe eligió la opción A de la pregunta 2 el 2026-09-28).
 *
 * EL PROBLEMA. Guardar una ficha pedía elegir «Responsable» en un panel lejano y dejaba el botón gris sin decir por qué. Ahora
 * «Revisar y guardar» abre esta hoja: lista lo que va a cambiar y confirma. Desde 2026-09-29 la hoja ya no pide «Responsable»
 * (Felipe; clave `producto_confirmar_cambios`, que firma `ProductoForm`): son dos toques, sin elegir a nadie.
 *
 * `onConfirmar` guarda y dice si la hoja debe cerrarse: sí cuando salió bien (la pantalla se va sola) o cuando lo que falló
 * se arregla en la ficha (un nombre repetido, una versión vieja); `false` deja la hoja abierta.
 *
 * Con la sección de variantes de ADR-0263, un grupo puede juntar varios cambios en una línea («3 variantes pasan de Sin color
 * a Negro»): la insignia dice cuántos cambios son (`cantidad`), no cuántas líneas, y la `nota` del grupo dice lo que conviene
 * saber antes de confirmar (el código viejo sigue sonando; las nuevas nacen sin unidades). `avisos`: lo que deja guardar pero
 * hay que leer antes (todas las variantes quedan desactivadas).
 */
export function ConfirmarCambios({
  nombre,
  resumen,
  onConfirmar,
  onClose,
  avisos = [],
}: {
  nombre: string;
  resumen: ResumenCambios;
  onConfirmar: () => Promise<boolean>;
  onClose: () => void;
  /** Lo que no impide guardar pero conviene leer justo antes de confirmar. */
  avisos?: readonly string[];
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
                  <span className="rounded-full bg-ambar/15 px-2 text-[11px] font-semibold tracking-normal text-ambar">{g.cantidad}</span>
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
                {g.nota && <p className="mt-1.5 text-[12px] leading-snug text-taupe">{g.nota}</p>}
              </section>
            ))}
          </div>

          {avisos.length > 0 && (
            <div className="space-y-1">
              {avisos.map((a, i) => (
                <p key={i} className="text-[12.5px] leading-snug text-ambar-profundo">
                  {a}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar} disabled={enCurso}>
              Volver a editar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              className="flex-1"
              cargando={enCurso}
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
