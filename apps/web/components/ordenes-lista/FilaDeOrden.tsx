"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import type { FilaDeLista } from "@/lib/ordenes-lista-reglas";

// Una orden en la lista (ADR-0400, actividad 5; vista A de la lámina): la prenda, de qué es y cuántas; dónde está y QUIÉN la tiene; cuánto lleva ahí y para cuándo; y, si pide algo, por qué.
// Toda la fila es un enlace a la página de la orden (un enlace que la cubre; adentro solo hay un botón, «¿Por qué?», que abre la explicación en una línea y no navega). Las columnas se
// deciden por el ancho de la TARJETA de la tabla (`@container`), no por el de la pantalla: con el lateral abierto a 1024 px quedan ~670 px.
//   · 900 px o más: Orden · Prendas · Fase y quién · En la fase · Entrega · Pide algo;
//   · de 620 a 900: Orden · Fase y quién · Pide algo (las prendas pasan a la línea del número, y la entrega a la línea de la fase);
//   · menos de 620: todo apilado en una columna.

/** Las columnas de la fila: la misma plantilla que el encabezado de la tabla (por eso se exporta). */
export const PLANTILLA_LISTA =
  "grid-cols-1 @min-[620px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] @min-[900px]:grid-cols-[minmax(0,1.7fr)_4rem_minmax(0,1.5fr)_6rem_6.5rem_minmax(0,1.3fr)]";

const SOLO_ANCHA = "hidden @min-[900px]:block";
const DESDE_MEDIA = "hidden @min-[620px]:block";

export function FilaDeOrden({ f, primera = false, guiaPorque = false, onAbrirCajon }: { f: FilaDeLista; primera?: boolean; /** La guía interactiva enciende el «¿Por qué?» de la primera fila que lo tenga. */ guiaPorque?: boolean; /** Una orden de antes de las fases no tiene página: se sigue desde el cajón de siempre. */ onAbrirCajon?: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const idPorque = useId();
  const prenda = categoriaDe({ categoria: f.categoria?.nombre, categoriaPrefijo: f.categoria?.prefijo, categoriaFamilia: f.categoria?.familia });
  const enProceso = f.estado === "en_proceso";
  const entregaEnLinea = f.entrega.fecha ? `Entrega ${f.entrega.texto}${f.entrega.relativo ? ` · ${f.entrega.relativo}` : ""}` : "Sin fecha de entrega";
  return (
    <div className="fila-cayla ol-fila cursor-pointer px-5 py-3 pr-8" data-guia={primera ? "prod-ordenes.fila" : undefined}>
      {f.legado && onAbrirCajon ? (
        <button type="button" className="ol-enlace" aria-haspopup="dialog" aria-label={`Abrir ${f.numeroTexto}, ${f.referencia}`} onClick={onAbrirCajon} />
      ) : (
        <Link href={f.href} className="ol-enlace" aria-label={`Abrir ${f.numeroTexto}, ${f.referencia}`} />
      )}
      <div className={`ol-celdas grid items-center gap-x-4 gap-y-2 ${PLANTILLA_LISTA}`}>
        <span className="flex min-w-0 items-center gap-3">
          <MiniaturaPrenda fotoUrl={null} colorHex={f.colorHex} tamano="lg" {...prenda} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-tinta">{f.referencia}</span>
              {f.esMuestra && <Chip tono="tinta">Muestra</Chip>}
            </span>
            <span className="block break-words text-xs text-tinta/65 @min-[620px]:truncate">
              {f.numeroTexto}
              {f.colores ? ` · ${f.colores}` : ""}
              <span className="@min-[900px]:hidden"> · {f.cuantas} {f.cuantas === 1 ? "prenda" : "prendas"}</span>
            </span>
          </span>
        </span>

        <span className={`${SOLO_ANCHA} min-w-0 text-right text-sm tabular-nums text-tinta`}>{f.cuantas}</span>

        <span className="block min-w-0 space-y-1">
          <Chip tono={f.chip.tono}>{f.chip.texto}</Chip>
          {f.quien && <span className="block text-xs text-tinta/65 @min-[620px]:truncate">{f.quien}</span>}
          {enProceso && <span className="block text-xs text-tinta/65 @min-[900px]:hidden">{entregaEnLinea}</span>}
        </span>

        <span className={`${SOLO_ANCHA} min-w-0 text-sm tabular-nums text-tinta`}>
          {f.dias ? (
            <>
              {f.dias.n} d<small className="block text-xs text-tinta/65">{f.dias.desde}</small>
            </>
          ) : (
            <span className="text-tinta/50">—</span>
          )}
        </span>

        <span className={`${SOLO_ANCHA} min-w-0 text-sm text-tinta`}>
          {f.entrega.fecha ? (
            <>
              {f.entrega.texto}
              {f.entrega.relativo && <small className={`block text-xs ${f.entrega.atrasada ? "text-rojo-profundo" : "text-tinta/65"}`}>{f.entrega.relativo}</small>}
            </>
          ) : (
            <span className="text-tinta/65">Sin fecha</span>
          )}
        </span>

        <span className="block min-w-0">
          {f.causas.length > 0 ? (
            <span className="ol-causa block">
              {f.causas.map((c) => (
                <span key={c.clave} className="block">
                  {c.titulo}
                </span>
              ))}
              <button
                type="button"
                aria-expanded={abierta}
                aria-controls={idPorque}
                data-guia={guiaPorque ? "prod-ordenes.porque" : undefined}
                onClick={() => setAbierta((v) => !v)}
                className="btn-cayla btn-enlace ol-porque text-xs"
              >
                ¿Por qué?
              </button>
            </span>
          ) : (
            <span className={`${DESDE_MEDIA} text-sm text-tinta/50`} aria-label="No pide nada">
              —
            </span>
          )}
        </span>
      </div>

      {f.causas.length > 0 && (
        <div id={idPorque} className="ol-explica" data-abierta={abierta ? "true" : "false"} aria-hidden={!abierta}>
          <div>
            <div className="@min-[620px]:pl-[60px]">
              {f.causas.map((c) => (
                <p key={c.clave}>{c.porque}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
