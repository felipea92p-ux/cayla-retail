"use client";

import { hayMedidaApagada, MEDIDAS, medidaVisible, type ClaveMedida, type EleccionMedidas } from "@/lib/rendimiento-medidas";

/* ====================================================================
   «Qué más mostrar» (Felipe, 2026-10-03; spike docs/maquetas/rendimiento-vistas-2026-10/)

   Debajo del panel de Rendimiento: un interruptor por cada medida extra. Es una preferencia de VISTA de quien mira (una cookie por cuenta,
   como «Ajustar» del Inicio): no cambia lo que ven los demás ni qué se calcula, solo qué se dibuja arriba.

   Cómo se hace intuitivo (la pregunta de Felipe): cada fila muestra el NÚMERO REAL que hoy se ve arriba, no una descripción —así se entiende qué
   se enciende sin leer—; todo viene encendido (quien nunca entra aquí ve la pantalla completa); lo apagado se puede volver a encender con un toque
   y hay un «Volver a mostrar todo»; y una medida que no se puede mostrar ahora (todavía sin datos, o la base no la entregó) lo dice en su fila en
   vez de ofrecer un interruptor que no haría nada visible.
   ==================================================================== */

export type VistaPrevia = { texto: string; disponible: boolean };

export function QueMasMostrar({
  medidas,
  previas,
  onCambiar,
  onTodo,
}: {
  medidas: EleccionMedidas;
  /** Por medida: el dato real de hoy para que se vea qué enciende; `disponible: false` si ahora no hay nada que dibujar. */
  previas: Record<ClaveMedida, VistaPrevia>;
  onCambiar: (clave: ClaveMedida, visible: boolean) => void;
  onTodo: () => void;
}) {
  return (
    <section className="card-cayla p-5" aria-labelledby="que-mas-mostrar">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="que-mas-mostrar" className="label-cayla text-[11px] font-bold text-taupe">
            Qué más mostrar
          </h2>
          <p className="mt-1 text-xs text-tinta/65">Elige qué medidas ves arriba, debajo de las cifras. Es solo tu vista: no cambia lo que ven los demás.</p>
        </div>
        {hayMedidaApagada(medidas) && (
          <button type="button" className="btn-cayla btn-sutil" onClick={onTodo}>
            Volver a mostrar todo
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {MEDIDAS.map((m) => {
          const visible = medidaVisible(m.clave, medidas);
          const previa = previas[m.clave];
          return (
            <li key={m.clave} className="flex items-center gap-3 rounded-[10px] border border-sand bg-papel px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tinta">{m.titulo}</p>
                <p className="mt-0.5 text-xs text-tinta/65">
                  {m.explica}{" "}
                  <span className={previa.disponible ? "text-tinta" : "text-tinta/65"}>
                    {previa.disponible ? <b className="font-semibold tabular-nums">{previa.texto}</b> : previa.texto}
                  </span>
                </p>
              </div>
              {visible && previa.disponible && (
                <a href="#medidas-extra" className="shrink-0 text-xs text-taupe underline underline-offset-2 hover:no-underline">
                  Ver arriba
                </a>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                aria-label={m.titulo}
                onClick={() => onCambiar(m.clave, !visible)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${visible ? "bg-verde" : "bg-tinta/30"}`}
              >
                <span
                  className={`absolute top-[3px] left-[3px] size-[18px] rounded-full bg-crema transition-transform duration-200 ease-cayla ${visible ? "translate-x-4" : ""}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
