"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { MuestraTemporada } from "@/components/MuestraTemporada";
import { GrillaMuestras, TarjetaMuestraBase, TileVerTodos } from "@/components/alta-producto/GrillaMuestras";
import { aLaVista } from "@/lib/muestras-alta-reglas";
import { SIN_PROPIA, type Temporada } from "@/lib/temporada-reglas";

/* ====================================================================
   ElegirTemporada · el campo «Temporada» del alta, con el mismo molde que Tejido y Patrón (2026-09-29)

   Antes era un <select> nativo con la temporada heredada de la categoría escondida dentro de la primera opción
   («Ninguna»); ahora es una tarjeta más, con un dibujo punteado («Ninguna») igual que el «Sin muestra» de
   Tejido/Patrón cuando no hay foto. La explicación de qué hereda «Ninguna» sigue viviendo en la ayuda del campo
   (`NuevoProductoForm.tsx`), como ya se decidió al simplificar el texto de la opción (spike v2): acá no se repite.

   A diferencia de Tejido/Patrón: temporada es una lista PLANA de 9 valores — ninguna categoría restringe cuáles se
   ofrecen — y elegir una no escribe nada en la categoría. Por eso la hoja «Ver todos» no tiene buscador, secciones
   ni «Proponer un valor»: las 9 (+ «Ninguna») entran de sobra en una sola grilla.
   ==================================================================== */

type Item = Pick<Temporada, "nombre" | "es_clasico" | "estacion_desde" | "estacion_hasta"> & { id: string };

type Props = {
  /** `retail.fn_temporadas()`, sin ordenar (acá se ordena por `orden`). */
  temporadas: readonly Temporada[];
  /** La clave elegida; `SIN_PROPIA` ("") = «Ninguna» (hereda la de la categoría). */
  clave: string;
  onElegir: (clave: string) => void;
};

const NINGUNA: Item = { id: SIN_PROPIA, nombre: "Ninguna", es_clasico: false, estacion_desde: null, estacion_hasta: null };

export function ElegirTemporada({ temporadas, clave, onElegir }: Props) {
  const [hoja, setHoja] = useState(false);
  const ordenadas = [...temporadas].sort((a, b) => a.orden - b.orden);
  const lista: Item[] = [NINGUNA, ...ordenadas.map((t) => ({ id: t.clave, nombre: t.nombre, es_clasico: t.es_clasico, estacion_desde: t.estacion_desde, estacion_hasta: t.estacion_hasta }))];
  const elegida = lista.find((t) => t.id === clave) ?? null;
  const visibles = aLaVista(lista, elegida);

  function alternar(id: string) {
    onElegir(id === clave ? SIN_PROPIA : id);
  }

  return (
    <>
      <GrillaMuestras>
        {visibles.map((t) => (
          <TarjetaTemporada key={t.id} t={t} elegido={t.id === clave} onClick={() => alternar(t.id)} />
        ))}
        <TileVerTodos total={temporadas.length} singular="temporada" plural="temporadas" onClick={() => setHoja(true)} />
      </GrillaMuestras>

      {hoja && (
        <Modal variante="hoja" ancho="max-w-[680px]" titulo="Elige la temporada" subtitulo={`${temporadas.length} temporadas en el catálogo.`} onClose={() => setHoja(false)}>
          {(cerrar) => (
            <GrillaMuestras>
              {lista.map((t) => (
                <TarjetaTemporada
                  key={t.id}
                  t={t}
                  elegido={t.id === clave}
                  enHoja
                  onClick={() => {
                    alternar(t.id);
                    cerrar();
                  }}
                />
              ))}
            </GrillaMuestras>
          )}
        </Modal>
      )}
    </>
  );
}

function TarjetaTemporada({ t, elegido, enHoja = false, onClick }: { t: Item; elegido: boolean; enHoja?: boolean; onClick: () => void }) {
  return (
    <TarjetaMuestraBase elegido={elegido} onClick={onClick} title={enHoja ? undefined : t.nombre}>
      {t.id === SIN_PROPIA ? (
        <div
          className="flex h-10 w-full items-center justify-center rounded-lg border border-dashed border-tinta/20 text-[10px] uppercase tracking-wider text-tinta/40"
          aria-hidden
        >
          Ninguna
        </div>
      ) : (
        <MuestraTemporada temporada={t} className="h-10 w-full" />
      )}
      <span className={`px-0.5 ${enHoja ? "break-words leading-tight" : "truncate"}`}>
        {elegido && (
          <span aria-hidden className="text-[11px]">
            ✓{" "}
          </span>
        )}
        {t.nombre}
      </span>
    </TarjetaMuestraBase>
  );
}
