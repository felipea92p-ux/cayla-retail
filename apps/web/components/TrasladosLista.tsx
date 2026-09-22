"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { TABLA } from "@/components/ui/Tabla";
import { TrasladoEstado } from "@/components/TrasladoEstado";
import { TrasladoLlegada } from "@/components/TrasladoLlegada";
import { TrasladoMiniaturas } from "@/components/TrasladoMiniaturas";
import { accionDeTraslado, diaMes, direccionTraslado, resumenPrendas, type SituacionTraslado } from "@/lib/traslados-reglas";
import type { TrasladoResumen } from "@/lib/traslados";

// La tabla de traslados (rediseño 2026-09-18). Tres acomodos de las MISMAS celdas,
// por `col-start`/`row-start`, en vez de una tabla que se corta o pide scroll:
//  · desde 1400 px de ventana: seis columnas (con el lateral quedan ~1040 px de
//    contenido, lo que piden las seis con el chip «REQUIERE CONFIRMACIÓN» y el botón
//    «CONFIRMAR RECEPCIÓN», que en las mayúsculas del sistema miden 187 y 184 px —
//    medido en el navegador).
//  · de 1280 a 1399: dos líneas por fila (los dos cortes son variantes `min-[…px]:` del mismo tipo a propósito:
//    con `xl:` mezclado el orden de la hoja de estilos hacía ganar al de 1280 también a 1440 px) (Traslado+Ruta · Contenido · Llegada+Estado · Acción).
//  · por debajo: una tarjeta de cuatro líneas.
// Lo que hace cada columna:
//  · Traslado  el número que se dice por WhatsApp + cuándo salió.
//  · Ruta      de dónde a dónde, y si es entrante o saliente para esta sede.
//  · Contenido prendas (lo que piensa el encargado), variantes y miniaturas si las hay.
//  · Llegada   fechas humanas; la frase depende de la situación real.
//  · Estado    información: un chip suave, sin forma de botón.
//  · Acción    un botón. El fuerte (tinta) solo si de verdad pide intervención.
// Toda la fila es clic — con un `onClick` que se aparta si el clic fue sobre un enlace/botón o si había
// texto seleccionado — y NO con un enlace extendido (`after:absolute`): ese tapaba los `title` de las
// notas y prendas recortadas y no dejaba seleccionar el texto de la fila. Para teclado y lectores de
// pantalla siguen estando el enlace del número y el botón de la acción.
const BASE = "grid-cols-[minmax(0,1fr)_auto]";
const PLANTILLA_MEDIA = "min-[1280px]:grid-cols-[minmax(8.5rem,1fr)_minmax(11rem,1.4fr)_12rem_11.75rem]";
const PLANTILLA = "min-[1400px]:grid-cols-[6rem_minmax(7.5rem,0.9fr)_minmax(11rem,1.3fr)_minmax(10.25rem,1fr)_12rem_11.75rem]";

// Desde 1400 px (seis columnas) todo se centra menos «Traslado», la identidad de la fila — el mismo criterio de
// Existencias y Movimientos. Cada celda pasa a rejilla con `justify-items-center` para que sus bloques (texto,
// miniaturas, chip) se centren sin tocar los componentes que los dibujan. Por debajo de 1400 px la fila conserva
// sus acomodos de dos líneas y de tarjeta, alineados a la izquierda.
// `[&>*]:max-w-full`: un renglón de una sola línea con «…» (`truncate`) centrado desborda por los DOS lados si no
// se le acota el ancho a la celda; con el tope se recorta con «…» como antes.
const CENTRO = " min-[1400px]:grid min-[1400px]:justify-items-center min-[1400px]:text-center min-[1400px]:[&>*]:max-w-full";

const CELDA = {
  traslado: "col-start-1 row-start-1 min-w-0 min-[1280px]:col-start-1 min-[1280px]:row-start-1 min-[1400px]:col-auto min-[1400px]:row-auto",
  estado:
    "col-start-2 row-start-1 justify-self-end min-[1280px]:col-start-3 min-[1280px]:row-start-2 min-[1280px]:justify-self-start min-[1400px]:col-auto min-[1400px]:row-auto min-[1400px]:justify-self-auto" + CENTRO,
  ruta: "col-span-2 row-start-2 min-w-0 min-[1280px]:col-span-1 min-[1280px]:col-start-1 min-[1280px]:row-start-2 min-[1400px]:col-auto min-[1400px]:row-auto" + CENTRO,
  contenido:
    "col-span-2 row-start-3 min-w-0 min-[1280px]:col-span-1 min-[1280px]:col-start-2 min-[1280px]:row-span-2 min-[1280px]:row-start-1 min-[1400px]:col-auto min-[1400px]:row-auto" + CENTRO,
  llegada: "col-start-1 row-start-4 min-w-0 min-[1280px]:col-start-3 min-[1280px]:row-start-1 min-[1400px]:col-auto min-[1400px]:row-auto" + CENTRO,
  accion:
    "col-start-2 row-start-4 justify-self-end min-[1280px]:col-start-4 min-[1280px]:row-span-2 min-[1280px]:row-start-1 min-[1280px]:self-center min-[1400px]:col-auto min-[1400px]:row-auto min-[1400px]:justify-self-center",
};

const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo";
const BOTON = `label-cayla inline-flex items-center justify-center whitespace-nowrap rounded-md px-3.5 py-2.5 text-[11px] transition-colors ${FOCO}`;
const BOTON_FUERTE = `${BOTON} bg-tinta text-crema hover:bg-rojo`;
const BOTON_SUAVE = `${BOTON} border border-tinta/25 text-tinta hover:border-rojo hover:text-rojo`;

// Solo el que le toca a quien mira lleva fondo: coral suave si es una recepción,
// ámbar suave si es una diferencia que debe cerrar un líder. El resto es tranquilo.
function fondo(s: SituacionTraslado): string {
  if (s === "requiere_recepcion") return "bg-rojo/[0.05] hover:bg-rojo/[0.08]";
  if (s === "requiere_revision") return "bg-ambar/[0.06] hover:bg-ambar/[0.09]";
  return "hover:bg-tinta/[0.03]";
}

const COLUMNAS: { titulo: string; alinear?: "centro" }[] = [
  { titulo: "Traslado" },
  { titulo: "Ruta", alinear: "centro" },
  { titulo: "Contenido", alinear: "centro" },
  { titulo: "Llegada estimada", alinear: "centro" },
  { titulo: "Estado", alinear: "centro" },
  { titulo: "Acción", alinear: "centro" },
];

export function TrasladosLista({
  filas,
  totalFiltrados,
  totalTraslados,
  miUbicacionId,
  ahoraIso,
  horaCarga,
  hayFiltros,
  cerradosAcotados,
  onLimpiar,
  onMostrarMas,
  siguientePagina,
  onRefrescar,
  refrescando,
}: {
  filas: { t: TrasladoResumen; s: SituacionTraslado }[];
  totalFiltrados: number;
  totalTraslados: number;
  miUbicacionId: string;
  ahoraIso: string;
  horaCarga: string;
  hayFiltros: boolean;
  /** Los cerrados se traen acotados (los últimos 30): avisarlo, o «no aparece» parece «no existe». */
  cerradosAcotados: boolean;
  onLimpiar: () => void;
  onMostrarMas: () => void;
  /** Cuántos se sumarían al pulsar «Mostrar más» (0 = no hay más). */
  siguientePagina: number;
  onRefrescar: () => void;
  refrescando: boolean;
}) {
  const router = useRouter();

  // Clic en cualquier parte de la fila, salvo sobre un enlace/botón (que ya llevan su destino) o si la
  // persona estaba seleccionando texto para copiarlo.
  function irAlDetalle(e: MouseEvent, id: string) {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    router.push(`/inventario/traslados/${id}`);
  }

  if (filas.length === 0) {
    return (
      <div className="card-cayla space-y-3 p-5 text-sm text-tinta/75">
        <p>{hayFiltros ? "Ningún traslado coincide con lo que buscas." : "No hay traslados para mostrar."}</p>
        {hayFiltros && (
          <button type="button" onClick={onLimpiar} className={`label-cayla rounded-md border border-tinta/25 px-3.5 py-2 text-[11px] text-tinta hover:border-rojo hover:text-rojo ${FOCO}`}>
            Quitar filtros
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card-cayla overflow-x-auto">
      <div role="table" aria-label="Traslados">
        <div role="row" className={`hidden gap-x-3 px-5 py-2 min-[1400px]:grid ${PLANTILLA}`}>
          {COLUMNAS.map((c) => (
            <span key={c.titulo} role="columnheader" className={`${TABLA.titulo} whitespace-nowrap ${c.alinear === "centro" ? "text-center" : ""}`}>
              {c.titulo}
            </span>
          ))}
        </div>

        <div role="rowgroup" className="divide-y divide-tinta/10 border-t border-tinta/10">
          {filas.map(({ t, s }) => {
            const accion = accionDeTraslado(s);
            const direccion = direccionTraslado(t, miUbicacionId);
            return (
              <div
                key={t.id}
                role="row"
                onClick={(e) => irAlDetalle(e, t.id)}
                className={`grid ${BASE} ${PLANTILLA_MEDIA} ${PLANTILLA} cursor-pointer gap-x-3 gap-y-2 px-5 py-3 transition-colors min-[1280px]:items-center min-[1280px]:gap-y-1 ${fondo(s)}`}
              >
                <div role="cell" className={CELDA.traslado}>
                  <Link id={`traslado-${t.id}`} href={`/inventario/traslados/${t.id}`} className={`block whitespace-nowrap rounded-sm text-sm font-medium text-tinta ${FOCO}`}>
                    Traslado {t.numero}
                  </Link>
                  <p className="text-xs text-tinta/65">Salió {diaMes(t.creadoEn)}</p>
                </div>

                <div role="cell" className={CELDA.ruta}>
                  {/* Si no cabe en una línea, parte ANTES de la flecha («Tienda TRU» / «→ Tienda AQP»), no en medio de un nombre. */}
                  <p className="text-sm text-tinta" title={`${t.ubicacionOrigenNombre} → ${t.ubicacionDestinoNombre}`}>
                    <span className="whitespace-nowrap">{t.ubicacionOrigenNombre}</span>{" "}
                    <span className="whitespace-nowrap">
                      <span aria-hidden className="text-tinta/55">
                        →{" "}
                      </span>
                      <span className="sr-only">hacia </span>
                      {t.ubicacionDestinoNombre}
                    </span>
                  </p>
                  <p className="truncate text-xs text-tinta/65" title={t.nota ?? undefined}>
                    {direccion === "entrante" ? "Entrante" : "Saliente"}
                    {t.nota ? ` · ${t.nota}` : ""}
                  </p>
                </div>

                <div role="cell" className={CELDA.contenido}>
                  <p className="text-sm text-tinta">
                    <span className="font-medium tabular-nums">
                      {t.unidadesEnviadas.toLocaleString("es-PE")} {t.unidadesEnviadas === 1 ? "unidad" : "unidades"}
                    </span>
                    <span className="text-tinta/65">
                      {" "}
                      · {t.lineas} {t.lineas === 1 ? "variante" : "variantes"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-tinta/65" title={t.referencias.join(", ")}>
                    {resumenPrendas(t.referencias)}
                  </p>
                  <TrasladoMiniaturas fotos={t.fotos} />
                </div>

                <div role="cell" className={CELDA.llegada}>
                  <TrasladoLlegada traslado={t} situacion={s} ahoraIso={ahoraIso} />
                </div>

                <div role="cell" className={CELDA.estado}>
                  <TrasladoEstado situacion={s} />
                </div>

                <div role="cell" className={CELDA.accion}>
                  {/* El nombre accesible dice DE QUÉ traslado es: «Ver detalle» a secas, repetido en cada fila, no sirve. */}
                  <Link href={`/inventario/traslados/${t.id}`} aria-label={`${accion.texto}: traslado ${t.numero}`} className={accion.principal ? BOTON_FUERTE : BOTON_SUAVE}>
                    {accion.texto}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-tinta/10 ${TABLA.pie}`}>
        <p>
          Mostrando {filas.length} de {totalFiltrados} {totalFiltrados === 1 ? "traslado" : "traslados"}
          {hayFiltros && totalFiltrados !== totalTraslados && ` (${totalTraslados} en total)`}
          {cerradosAcotados && " · los cerrados se acotan a los últimos 30"}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {siguientePagina > 0 && (
            <button
              type="button"
              onClick={onMostrarMas}
              className={`label-cayla rounded-md border border-tinta/25 px-3 py-1.5 text-[11px] text-tinta hover:border-rojo hover:text-rojo ${FOCO}`}
            >
              Mostrar {siguientePagina} más
            </button>
          )}
          {/* Los estados que dependen de la hora («debió llegar hace 1 h») son una foto del momento de carga; la
              pantalla se refresca sola cada minuto mientras está a la vista, y esto lo hace a pedido. */}
          <span className="flex items-center gap-2">
            Vista de las {horaCarga}
            <button
              type="button"
              onClick={onRefrescar}
              disabled={refrescando}
              className={`label-cayla rounded-sm text-[11px] text-tinta/75 underline-offset-2 hover:text-rojo hover:underline disabled:cursor-wait disabled:opacity-60 ${FOCO}`}
            >
              {refrescando ? "Actualizando…" : "Actualizar"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
