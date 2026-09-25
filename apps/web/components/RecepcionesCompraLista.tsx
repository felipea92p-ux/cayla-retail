"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Tabla, fila, celda } from "@/components/ui/Tabla";
import { RecepcionVistaRapida } from "@/components/RecepcionVistaRapida";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import { useFlip } from "@/lib/useFlip";
import type { LineaRecepcion } from "@/lib/compras-reglas";
import type { RecepcionDeCompra } from "@/lib/compras-indicadores";
import type { ResultadoRecibidas } from "@/lib/recibidas-filtros-reglas";
import { agruparPorEnvio, type EnvioDeLote, type GrupoRecepcion } from "@/lib/envio-reglas";

// Pestaña «Recibidas recientemente» (maqueta 06): qué llegó contra cada comprobante, con su
// resultado (completa o cuánto faltó) y la demora entre la emisión y la llegada. Antes esta
// pestaña era una lista fija de las últimas 15 guías con solo fecha, proveedor y unidades: no
// decía si la entrega llegó completa ni cuánto tardó — justo lo que sirve para decidir con qué
// proveedor conviene volver a pedir.
//
// Una guía que cubre dos comprobantes aparece dos veces (una fila por comprobante). El detalle
// (prenda por prenda) sale de `getRecepcionesRecientes` y viaja ya cargado: con ≤ 30 filas no
// vale la pena un viaje al abrir el modal.
//
// ENVÍOS (ADR-0113): las filas de un mismo envío de VARIOS proveedores —una sola guía— se agrupan bajo una
// cabecera («Envío de 3 proveedores · Guía …») en vez de salir como filas sueltas. La cabecera suma lo que llegó y
// lo que faltó; si la lista cortó el envío (el tope de filas), no pinta totales de una parte. Las recepciones de
// antes de los envíos y las de un solo proveedor siguen como filas normales.

// Fecha · Proveedor·comprobante·guía · Llegó/facturado · Resultado · Demora · Recibió · flecha
// Las columnas las decide el ANCHO DE LA TABLA (`@container`), no el de la ventana: con el menú lateral abierto una ventana
// de 1024 px deja ~670 px a la tabla, y las 7 columnas dejaban al proveedor en «Textiles Andin…» (ADR-0128). Angosta: sin
// «Recibió» ni la flecha (lo menos decisivo); ancha: completa.
const PLANTILLA = "sm:grid-cols-[5rem_1fr_8.5rem_6rem_5.5rem] @5xl:grid-cols-[6rem_1fr_9.5rem_5.75rem_7.5rem_6.25rem_1rem]";
const SOLO_ANCHA = "hidden max-sm:block @5xl:block";

export function RecepcionesCompraLista({
  recepciones,
  detalles,
  nombres,
  vacio,
  enlaceAlComprobante = true,
  envios,
  limite,
  destacarNueva = false,
  resultado = "todas",
}: {
  recepciones: RecepcionDeCompra[];
  /** Prenda por prenda de cada guía, por `loteId` (puede faltar para las más antiguas). */
  detalles: Record<string, LineaRecepcion[]>;
  /** Quién recibió, por `loteId` (ya resuelto a nombre). */
  nombres: Record<string, string>;
  vacio: string;
  /** El detalle del comprobante es de Compras (solo líder): quien cuenta sin ser líder no lo ve, y un enlace que lo devuelve al Inicio no sirve. */
  enlaceAlComprobante?: boolean;
  /** A qué envío pertenece cada lote (por `loteId`). Sin esto —o sin lotes de envíos— la lista sale como siempre. */
  envios?: Record<string, EnvioDeLote>;
  /** El tope de filas con que se pidió la lista: si se llenó, el último envío puede estar cortado. */
  limite?: number;
  /** Se llegó desde «Ver recibidas» tras recibir: la recepción más reciente se tiñe un momento (`anim-destello-fila`). */
  destacarNueva?: boolean;
  /** `?res=`: solo completas / solo con faltante (se filtra acá, en el navegador). */
  resultado?: ResultadoRecibidas;
}) {
  const [abierta, setAbierta] = useState<RecepcionDeCompra | null>(null);
  // Los envíos plegados por quien mira (por defecto todos abiertos).
  const [plegados, setPlegados] = useState<Record<string, boolean>>({});

  // El resultado filtra en el navegador: la lista ya trae ≤ 30 filas, no vale otro viaje al servidor.
  const filtradas = useMemo(
    () => recepciones.filter((r) => resultado === "todas" || (resultado === "completas") === r.faltante <= 0),
    [recepciones, resultado],
  );
  const grupos = agruparPorEnvio(filtradas, envios ?? {}, { llegoAlLimite: (limite != null && recepciones.length >= limite) || resultado !== "todas" });
  const claveFilas = filtradas.map((r) => `${r.loteId}-${r.compraId}`).join("|");
  // Al filtrar, las filas que quedan se deslizan a su lugar en vez de saltar (ADR-0128).
  const refFila = useFlip(claveFilas);

  if (recepciones.length === 0) return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;

  const idFila = (r: RecepcionDeCompra) => `${r.loteId}-${r.compraId}`;
  const nuevaId = destacarNueva && filtradas[0] ? idFila(filtradas[0]) : null;
  const posicion = abierta ? { indice: Math.max(0, filtradas.findIndex((r) => idFila(r) === idFila(abierta))), total: filtradas.length } : null;
  // ↑ ↓ del cajón: la recepción siguiente o anterior de la lista visible, dando la vuelta.
  const navegar = (delta: 1 | -1) => {
    if (!abierta || filtradas.length === 0) return;
    const i = filtradas.findIndex((r) => idFila(r) === idFila(abierta));
    setAbierta(filtradas[(i + delta + filtradas.length) % filtradas.length]);
  };

  function filaRecepcion(r: RecepcionDeCompra, dentroDeEnvio: boolean, i: number) {
    const completa = r.faltante <= 0;
    const pct = r.unidadesFacturadas > 0 ? Math.min(100, (r.unidadesLlegaron / r.unidadesFacturadas) * 100) : 0;
    const id = idFila(r);
    return (
      <button
        key={id}
        ref={refFila(id)}
        type="button"
        onClick={() => setAbierta(r)}
        className={`${fila(PLANTILLA)} group relative w-full text-left transition-colors before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:origin-center before:scale-y-0 before:rounded before:bg-rojo before:transition-transform before:duration-300 before:ease-cayla hover:bg-tinta/[0.03] hover:before:scale-y-100 ${dentroDeEnvio ? "border-l-2 border-tinta/15" : ""} ${nuevaId === id ? "anim-destello-fila" : ""}`}
      >
        <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(hoyLima(new Date(r.fechaRecepcion)))}</span>
        <span className={celda("izq")}>
          <span className="text-sm text-tinta">
            {r.proveedorNombre} <span className="ml-1 text-xs tabular-nums text-tinta/65">{r.documento}</span>
          </span>
          <span className="block truncate text-xs text-tinta/55">
            Guía {r.numeroGuia ?? "—"} · {r.ubicacionNombre}
          </span>
        </span>
        <span className={celda("der", "text-sm text-tinta")}>
          {r.unidadesLlegaron} / {r.unidadesFacturadas}
          {/* cuánto de lo facturado llegó, sin leer el número */}
          <span aria-hidden className="mt-1 block h-[3px] overflow-hidden rounded-full bg-sand">
            <span className={`anim-crece-x block h-full rounded-full ${completa ? "bg-verde" : "bg-ambar"}`} style={{ width: `${pct}%`, "--i": i } as CSSProperties} />
          </span>
        </span>
        <span className={celda("izq", "overflow-visible")}>
          <Chip tono={completa ? "verde" : "ambar"}>
            {completa && <Check aria-hidden className="check-trazo -ml-0.5 mr-1 inline h-3 w-3" strokeWidth={2.4} style={{ "--d": "0ms" } as CSSProperties} />}
            {completa ? "Completa" : `Faltan ${r.faltante}`}
          </Chip>
        </span>
        <span className={celda("der", "text-sm text-tinta")}>{r.diasDemora === 1 ? "1 día" : `${r.diasDemora} días`}</span>
        <span className={celda("izq", `text-sm text-tinta/65 ${SOLO_ANCHA}`)}>{nombres[r.loteId] ?? "—"}</span>
        <span aria-hidden className="hidden -translate-x-1.5 justify-self-end text-base leading-none text-tinta/30 opacity-0 transition-[opacity,transform,color] duration-300 ease-cayla group-hover:translate-x-0 group-hover:text-rojo group-hover:opacity-100 @5xl:block">
          ›
        </span>
      </button>
    );
  }

  function cabeceraEnvio(g: Extract<GrupoRecepcion, { tipo: "envio" }>) {
    const completo = g.faltante <= 0;
    const abierto = !plegados[g.envioId];
    return (
      <button
        key={`envio-${g.envioId}`}
        type="button"
        aria-expanded={abierto}
        onClick={() => setPlegados((p) => ({ ...p, [g.envioId]: abierto }))}
        className={`${fila(PLANTILLA)} w-full bg-tinta/[0.035] text-left transition-colors hover:bg-tinta/[0.06]`}
      >
        <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(hoyLima(new Date(g.fechaRecepcion)))}</span>
        <span className={celda("izq")}>
          <span className="flex items-center gap-1.5 text-sm font-medium text-tinta">
            <ChevronRight aria-hidden className={`h-3.5 w-3.5 shrink-0 text-tinta/55 transition-transform duration-300 ease-cayla ${abierto ? "rotate-90" : ""}`} />
            Envío de {g.proveedores} proveedores
          </span>
          <span className="block truncate pl-5 text-xs text-tinta/55">
            Guía {g.numeroGuia ?? "—"} · {g.ubicacionNombre}
            {g.parcial ? " · esta lista muestra solo una parte" : ""}
          </span>
        </span>
        <span className={celda("der", "text-sm text-tinta")}>{g.parcial ? "" : `${g.unidadesLlegaron} / ${g.unidadesFacturadas}`}</span>
        <span className={celda("izq", "overflow-visible")}>{g.parcial ? null : <Chip tono={completo ? "verde" : "ambar"}>{completo ? "Completo" : `Faltan ${g.faltante}`}</Chip>}</span>
        <span aria-hidden className={celda("der")} />
        <span className={celda("izq", `text-sm text-tinta/65 ${SOLO_ANCHA}`)}>{nombres[g.filas[0].loteId] ?? "—"}</span>
        <span aria-hidden className="hidden @5xl:block" />
      </button>
    );
  }

  let n = 0;
  return (
    <>
      <Tabla className="@container">
        <div className={`hidden gap-x-4 px-5 py-2 sm:grid ${PLANTILLA}`} role="row">
          {[
            ["Fecha", "", ""],
            ["Proveedor · comprobante · guía", "", ""],
            ["Llegó / facturado", "text-right", ""],
            ["Resultado", "", ""],
            ["Demora", "text-right", ""],
            ["Recibió", "", "hidden @5xl:block"],
            ["", "", "hidden @5xl:block"],
          ].map(([t, alinea, ancha], i) => (
            <span key={i} role="columnheader" className={`label-cayla text-[11px] text-tinta/55 ${alinea} ${ancha}`}>
              {t}
            </span>
          ))}
        </div>
        {filtradas.length === 0 && (
          <div className="px-5 py-8 text-center">
            <p className="font-display text-[17px] italic text-tinta/65">Ninguna recepción {resultado === "faltante" ? "llegó con faltante" : "llegó completa"} en esta lista.</p>
            <p className="mt-1 text-xs text-tinta/55">Cambia «Con faltante / Completas» arriba para ver el resto.</p>
          </div>
        )}
        {grupos.map((g) =>
          g.tipo === "suelta" ? (
            filaRecepcion(g.fila, false, n++)
          ) : (
            <Fragment key={`envio-${g.envioId}`}>
              {cabeceraEnvio(g)}
              {/* el envío se pliega por altura (grid 0fr → 1fr), sin medir; plegado no se enfoca */}
              <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-cayla ${plegados[g.envioId] ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`} inert={!!plegados[g.envioId]}>
                <div className="min-h-0 divide-y divide-tinta/10 overflow-hidden">{g.filas.map((r) => filaRecepcion(r, true, n++))}</div>
              </div>
            </Fragment>
          )
        )}
      </Tabla>

      {abierta && posicion && (
        <RecepcionVistaRapida
          recepcion={abierta}
          detalle={detalles[abierta.loteId] ?? []}
          recibio={nombres[abierta.loteId] ?? null}
          posicion={posicion}
          enlaceAlComprobante={enlaceAlComprobante}
          onCerrar={() => setAbierta(null)}
          onNavegar={navegar}
        />
      )}
    </>
  );
}
