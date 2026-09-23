"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { TABLA } from "@/components/ui/Tabla";
import { TrasladoEstado } from "@/components/TrasladoEstado";
import { TrasladoLlegada } from "@/components/TrasladoLlegada";
import { TrasladoMiniaturas } from "@/components/TrasladoMiniaturas";
import { accionDeTraslado, diaHora, direccionTraslado, resumenPrendas, type SituacionTraslado } from "@/lib/traslados-reglas";
import type { TrasladoResumen } from "@/lib/traslados";

// La tabla de traslados (rediseño 2026-09-18). Dos acomodos de las MISMAS celdas,
// por `col-start`/`row-start`, en vez de una tabla que se corta o pide scroll:
//  · desde 1280 px de ventana: seis columnas, como la tabla de la guía oficial (con el lateral de
//    17 rem y el relleno quedan ~928 px; las seis piden ~920). La insignia y el botón van en minúscula
//    («Por confirmar», «Confirmar recepción») y caben en ~9.5 rem cada uno.
//  · por debajo: una tarjeta de cuatro líneas, con su botón a la mano.
// Hasta el 2026-09-22 había un tercer acomodo de dos líneas entre 1280 y 1399 px; Felipe eligió la
// tabla de la guía en la demo (docs/maquetas/traslados-cifras-filtros-2026-09/, ADR-0175) y se fue.
// Lo que hace cada columna:
//  · Traslado  el número que se dice por WhatsApp + cuándo salió.
//  · Ruta      de dónde a dónde, y si es entrante o saliente para esta sede.
//  · Contenido miniaturas (o los colores, sin fotos), prendas y variantes.
//  · Llegada   fechas humanas; la frase depende de la situación real.
//  · Estado    información: un chip suave, sin forma de botón.
//  · Acción    un botón. El fuerte (tinta) solo si de verdad pide intervención.
// Toda la fila es clic — con un `onClick` que se aparta si el clic fue sobre un enlace/botón o si había
// texto seleccionado — y NO con un enlace extendido (`after:absolute`): ese tapaba los `title` de las
// notas y prendas recortadas y no dejaba seleccionar el texto de la fila. Para teclado y lectores de
// pantalla siguen estando el enlace del número y el botón de la acción.
const BASE = "grid-cols-[minmax(0,1fr)_auto]";
const PLANTILLA = "min-[1280px]:grid-cols-[7.5rem_minmax(6rem,0.8fr)_minmax(11rem,1.4fr)_minmax(7.5rem,0.9fr)_9.5rem_9.75rem]";

// Desde 1280 px (seis columnas) todo se centra menos «Traslado», la identidad de la fila — el mismo criterio de
// Existencias y Movimientos. Cada celda pasa a rejilla con `justify-items-center` para que sus bloques (texto,
// miniaturas, chip) se centren sin tocar los componentes que los dibujan. Por debajo de 1280 px la fila conserva
// su acomodo de tarjeta, alineados a la izquierda.
// `[&>*]:max-w-full`: un renglón de una sola línea con «…» (`truncate`) centrado desborda por los DOS lados si no
// se le acota el ancho a la celda; con el tope se recorta con «…» como antes.
const CENTRO = " min-[1280px]:grid min-[1280px]:justify-items-center min-[1280px]:text-center min-[1280px]:[&>*]:max-w-full";

const CELDA = {
  traslado: "col-start-1 row-start-1 min-w-0 min-[1280px]:col-auto min-[1280px]:row-auto",
  estado:
    "col-start-2 row-start-1 justify-self-end min-[1280px]:col-auto min-[1280px]:row-auto min-[1280px]:justify-self-auto" + CENTRO,
  ruta: "col-span-2 row-start-2 min-w-0 min-[1280px]:col-auto min-[1280px]:row-auto" + CENTRO,
  contenido:
    "col-span-2 row-start-3 min-w-0 min-[1280px]:col-auto min-[1280px]:row-auto" + CENTRO,
  llegada: "col-start-1 row-start-4 min-w-0 min-[1280px]:col-auto min-[1280px]:row-auto" + CENTRO,
  accion:
    "col-start-2 row-start-4 justify-self-end min-[1280px]:col-auto min-[1280px]:row-auto min-[1280px]:justify-self-center",
};

const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo";
// Guía oficial (2026-09-22, ADR-0169): primario y secundario del sistema.
const BOTON_FUERTE = `btn-cayla btn-primario btn-chico ${FOCO}`;
// «Ver detalle» va en sutil (rediseño 2026-09-22): la fila entera ya abre el detalle, y así el único botón que
// pesa en la lista es el de la acción que de verdad toca.
const BOTON_SUAVE = `btn-cayla btn-sutil btn-chico ${FOCO}`;

// Solo el que le toca a quien mira lleva fondo: coral suave si es una recepción,
// ámbar suave si es una diferencia que debe cerrar un líder. El resto es tranquilo.
function fondo(s: SituacionTraslado): string {
  if (s === "requiere_recepcion") return "bg-rojo/[0.05] hover:bg-rojo/[0.08]";
  if (s === "requiere_revision") return "bg-ambar/[0.06] hover:bg-ambar/[0.09]";
  return "";
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
  vacios,
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
  /** Traslados sin prendas que se apartaron (`separarVacios`). Solo se avisa a quien puede ajustar
   *  inventario: es un tema de datos, no algo que un integrante tenga que resolver. 0 = no se dice nada. */
  vacios: number;
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
      <div className="space-y-3 p-5 text-sm text-taupe">
        <p>{hayFiltros ? "Ningún traslado coincide con lo que buscas." : "No hay traslados para mostrar."}</p>
        {hayFiltros && (
          <button type="button" onClick={onLimpiar} className={`btn-cayla btn-secundario btn-chico ${FOCO}`}>
            Quitar filtros
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div role="table" aria-label="Traslados">
        <div role="row" className={`encabezado-tabla-cayla hidden gap-x-3 px-5 py-2 min-[1280px]:grid ${PLANTILLA}`}>
          {COLUMNAS.map((c) => (
            <span key={c.titulo} role="columnheader" className={`${TABLA.titulo} whitespace-nowrap ${c.alinear === "centro" ? "text-center" : ""}`}>
              {c.titulo}
            </span>
          ))}
        </div>

        <div role="rowgroup" className="divide-y divide-sand">
          {filas.map(({ t, s }) => {
            const accion = accionDeTraslado(s);
            const direccion = direccionTraslado(t, miUbicacionId);
            return (
              <div
                key={t.id}
                role="row"
                onClick={(e) => irAlDetalle(e, t.id)}
                className={`grid ${BASE} ${PLANTILLA} fila-cayla cursor-pointer gap-x-3 gap-y-2 px-5 py-3 transition-colors min-[1280px]:items-center min-[1280px]:gap-y-1 ${fondo(s)}`}
              >
                <div role="cell" className={CELDA.traslado}>
                  <Link id={`traslado-${t.id}`} href={`/inventario/traslados/${t.id}`} className={`block whitespace-nowrap rounded-sm text-sm font-medium text-tinta ${FOCO}`}>
                    Traslado {t.numero}
                  </Link>
                  <p className="whitespace-nowrap text-xs text-taupe">Salió {diaHora(t.creadoEn, ahoraIso)}</p>
                </div>

                <div role="cell" className={CELDA.ruta}>
                  {/* Si no cabe en una línea, parte ANTES de la flecha («Tienda TRU» / «→ Tienda AQP»), no en medio de un nombre. */}
                  <p className="text-sm text-tinta" title={`${t.ubicacionOrigenNombre} → ${t.ubicacionDestinoNombre}`}>
                    <span className="whitespace-nowrap">{t.ubicacionOrigenNombre}</span>{" "}
                    <span className="whitespace-nowrap">
                      <span aria-hidden className="text-taupe">
                        →{" "}
                      </span>
                      <span className="sr-only">hacia </span>
                      {t.ubicacionDestinoNombre}
                    </span>
                  </p>
                  <p className="truncate text-xs text-taupe" title={t.nota ?? undefined}>
                    {direccion === "entrante" ? "Entra a tu sede" : "Sale de tu sede"}
                    {t.nota ? ` · ${t.nota}` : ""}
                  </p>
                </div>

                <div role="cell" className={CELDA.contenido}>
                  {/* Las miniaturas (o los colores, si aún no hay fotos) a la izquierda del texto: se lee QUÉ va
                      antes de cuánto. */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TrasladoMiniaturas fotos={t.fotos} colores={t.colores} />
                    <div className="min-w-0 text-left">
                      {/* «· N variantes» puede bajar de línea (a 1280 px la columna es angosta); nunca se encima con la de al lado. */}
                      <p className="text-sm text-tinta">
                        <span className="whitespace-nowrap font-medium tabular-nums">{t.unidadesEnviadas.toLocaleString("es-PE")} u.</span>
                        {" "}
                        <span className="whitespace-nowrap text-taupe">
                          · {t.lineas} {t.lineas === 1 ? "variante" : "variantes"}
                        </span>
                      </p>
                      <p className="truncate text-xs text-taupe" title={t.referencias.join(", ")}>
                        {resumenPrendas(t.referencias)}
                      </p>
                    </div>
                  </div>
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

      <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-sand ${TABLA.pie}`}>
        <p>
          Mostrando {filas.length} de {totalFiltrados} {totalFiltrados === 1 ? "traslado" : "traslados"}
          {hayFiltros && totalFiltrados !== totalTraslados && ` (${totalTraslados} en total)`}
          {cerradosAcotados && " · los cerrados se acotan a los últimos 30"}
          {vacios > 0 && ` · ${vacios} ${vacios === 1 ? "traslado sin prendas no se muestra" : "traslados sin prendas no se muestran"}`}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {siguientePagina > 0 && (
            <button
              type="button"
              onClick={onMostrarMas}
              className={`btn-cayla btn-secundario btn-chico ${FOCO}`}
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
              className={`btn-enlace text-xs disabled:cursor-wait disabled:opacity-60 ${FOCO}`}
            >
              {refrescando ? "Actualizando…" : "Actualizar"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
