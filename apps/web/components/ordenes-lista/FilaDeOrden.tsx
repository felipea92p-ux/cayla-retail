"use client";

import "@/app/estilos/ordenes-lista.css";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CapsulaColor } from "@/components/ui/MuestraColor";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import type { FilaDeLista } from "@/lib/ordenes-lista-reglas";
import { prefiereQuieto } from "@/lib/movimiento-cliente";

// Una orden en la lista (ADR-0400, actividad 5; rehecha el 2026-11-26, «Producción más clara»): qué es, dónde está y QUIÉN la tiene, cuánto lleva ahí, para cuándo y, si pide
// atención, por qué, con el motivo a la vista en una línea (ya no hay que abrir un «¿Por qué?»). Cada dato es su pieza: ninguno se junta con otro con un punto medio.
// Toda la fila es un enlace a la página de la orden (un enlace que la cubre). La forma se decide por el ancho de la TARJETA de la tabla (`@container`), no por el de la pantalla:
//   · 60 rem o más: Orden, Prendas, Dónde está, Lleva ahí, Entrega y Atención, en columnas;
//   · menos: una tarjeta por orden — la orden arriba (con sus prendas en su línea), «dónde está» y la entrega lado a lado, y la atención abajo.

/** Las columnas de la fila: la misma plantilla que el encabezado de la tabla (por eso se exporta). */
export const PLANTILLA_LISTA = "grid-cols-2 @min-[60rem]:grid-cols-[minmax(0,1.5fr)_5.5rem_minmax(0,1.15fr)_6.5rem_8.5rem_minmax(0,1.35fr)]";

const A_LO_ANCHO = "col-span-2 @min-[60rem]:col-span-1";
const SOLO_EN_COLUMNAS = "hidden @min-[60rem]:block";
/** Cuántos colores se dibujan antes de decir «y N más». */
const COLORES_A_LA_VISTA = 6;

export function FilaDeOrden({ f, primera = false, guiaAtencion = false, recien = false }: { f: FilaDeLista; primera?: boolean; /** La guía interactiva enciende la «Atención» de la primera fila que la tenga. */ guiaAtencion?: boolean; /** La orden que se acaba de abrir (ADR-0509): respira en verde una vez (`data-recien`) y se lleva a la vista. */ recien?: boolean }) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (recien) raiz.current?.scrollIntoView({ block: "nearest", behavior: prefiereQuieto() ? "auto" : "smooth" });
  }, [recien]);
  const prenda = categoriaDe({ categoria: f.categoria?.nombre, categoriaPrefijo: f.categoria?.prefijo, categoriaFamilia: f.categoria?.familia });
  const enProceso = f.estado === "en_proceso";
  const colores = f.coloresDeLaOrden.slice(0, COLORES_A_LA_VISTA);
  const coloresDeMas = f.coloresDeLaOrden.length - colores.length;
  return (
    <div ref={raiz} className="fila-cayla ol-fila cursor-pointer px-5 py-3.5 pr-8" data-guia={primera ? "prod-ordenes.fila" : undefined} data-recien={recien ? "" : undefined}>
      <Link href={f.href} className="ol-enlace" aria-label={`Abrir ${f.numeroTexto}, ${f.referencia}`} />
      <div className={`ol-celdas grid items-start gap-x-4 gap-y-2.5 @min-[60rem]:items-center ${PLANTILLA_LISTA}`}>
        {/* Orden: la prenda, su nombre con sus insignias y, debajo, el número y los colores, cada uno en su pieza. */}
        <span className={`${A_LO_ANCHO} flex min-w-0 items-center gap-3.5`}>
          <MiniaturaPrenda fotoUrl={null} colorHex={f.colorHex} tamano="lg" {...prenda} />
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 break-words text-sm font-semibold text-tinta">{f.referencia}</span>
              {f.esMuestra && <Chip tono="tinta">Muestra</Chip>}
              {f.urgente && <Chip tono="ambar">Urgente</Chip>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-detalle text-tenue">
              <span className="whitespace-nowrap tabular-nums">{f.numeroTexto}</span>
              {colores.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  {colores.map((c) => (
                    <CapsulaColor key={c.nombre} fondo={c.hex} compacta />
                  ))}
                  {coloresDeMas > 0 && <span aria-hidden>y {coloresDeMas} más</span>}
                  <span className="sr-only">Colores: {f.colores}</span>
                </span>
              )}
              <span className="whitespace-nowrap @min-[60rem]:hidden">
                {f.cuantas} {f.cuantas === 1 ? "prenda" : "prendas"}
              </span>
            </span>
          </span>
        </span>

        <span className={`${SOLO_EN_COLUMNAS} min-w-0 text-right text-sm tabular-nums text-tinta`}>{f.cuantas}</span>

        {/* Dónde está: la fase en su insignia y, debajo, quién la tiene (o, en una orden cerrada, cómo terminó). */}
        <span className="block min-w-0">
          <Chip tono={f.donde.tono}>{f.donde.fase}</Chip>
          {f.donde.lineas.map((linea, i) => (
            <span key={i} className="mt-1 block break-words text-detalle text-tenue">
              {linea}
            </span>
          ))}
        </span>

        <span className={`${SOLO_EN_COLUMNAS} min-w-0 text-sm tabular-nums text-tinta`}>
          {f.dias ? (
            <>
              {f.dias.texto}
              {f.dias.desde && <span className="mt-0.5 block text-detalle text-tenue">{f.dias.desde}</span>}
            </>
          ) : (
            <span aria-hidden className="text-tenue">
              —
            </span>
          )}
        </span>

        <span className="block min-w-0 text-sm text-tinta">
          {f.entrega.fecha ? (
            <>
              {f.entrega.texto}
              {f.entrega.relativo && <span className={`mt-0.5 block text-detalle ${f.entrega.atrasada ? "text-rojo-profundo" : "text-tenue"}`}>{f.entrega.relativo}</span>}
            </>
          ) : (
            <span className="text-tenue">Sin fecha</span>
          )}
        </span>

        {/* Atención: por cada causa, su insignia y el motivo en una línea. Una orden abierta sin causas dice «Va bien»; una cerrada no dice nada. */}
        <span className={`${A_LO_ANCHO} block min-w-0`} data-guia={guiaAtencion ? "prod-ordenes.atencion" : undefined}>
          {f.atencion.length > 0 ? (
            <span className="block space-y-2">
              {f.atencion.map((a) => (
                <span key={a.clave} className="block">
                  <Chip tono="ambar">{a.insignia}</Chip>
                  <span className="mt-1 block break-words text-detalle text-ambar">{a.motivo}</span>
                </span>
              ))}
            </span>
          ) : (
            enProceso && (
              <span className="inline-flex items-center gap-1.5 text-detalle text-tenue">
                <Check aria-hidden className="h-3.5 w-3.5 text-verde" />
                Va bien
              </span>
            )
          )}
        </span>
      </div>
    </div>
  );
}
