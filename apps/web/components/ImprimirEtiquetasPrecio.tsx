"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "@/components/ui/Tabla";
import { EtiquetaPrecio } from "@/components/EtiquetaPrecio";
import { soles } from "@/lib/compras-reglas";
import { cantidadDeTexto, expandir, MAX_POR_PRENDA, type EtiquetaPrecio as DatosEtiqueta } from "@/lib/etiqueta-precio-reglas";

// Color y talla van bajo el nombre (no en columnas propias): con cinco columnas fijas, en una pantalla angosta la de la
// prenda se quedaba en 0 px y el nombre desaparecía.
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_5.5rem]";
const COLUMNAS: Columna[] = [
  { titulo: "Prenda" },
  { titulo: "Precio", alinear: "der" },
  { titulo: "Entraron", alinear: "der" },
  { titulo: "Imprimir", alinear: "der", ayuda: "Cuántas etiquetas de esta prenda. Si alguna ya venía etiquetada, baja el número." },
];

const sinSuscripcion = () => () => {};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Etiquetas de precio de un ingreso (ADR-0180): una por prenda que entró, con la cantidad editable, la vista previa
 * y el botón que las manda a la Brother. La hoja de impresión (`#etiquetas-precio-print`) va pegada a <body> con un
 * portal —como la boleta A4—: al imprimir, `globals.css` oculta todo lo demás y cada etiqueta es una página de 62 × 92 mm.
 */
export function ImprimirEtiquetasPrecio({
  sobretitulo,
  etiquetas,
  sinCodigo,
  impreso,
}: {
  sobretitulo: string;
  etiquetas: DatosEtiqueta[];
  sinCodigo: string[];
  impreso: string;
}) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(etiquetas.map((e) => [e.varianteId, String(e.cantidad)])));
  // El portal necesita `document`: en el servidor (y al hidratar) no hay hoja; en el navegador, sí. Queda montada siempre,
  // así Ctrl+P también imprime las etiquetas y no la pantalla.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  const numeros = useMemo(() => Object.fromEntries(Object.entries(cantidades).map(([id, t]) => [id, cantidadDeTexto(t)])), [cantidades]);
  const hoja = useMemo(() => expandir(etiquetas, numeros), [etiquetas, numeros]);
  const entraron = etiquetas.reduce((a, e) => a + e.cantidad, 0);
  const modelos = new Set(etiquetas.map((e) => e.prenda)).size;
  const total = hoja.length;
  const visibles = etiquetas.filter((e) => (numeros[e.varianteId] ?? 0) > 0);

  const imprimir = (
    <button type="button" className="btn-cayla btn-primario" disabled={total === 0} onClick={() => window.print()}>
      {total === 0 ? "Nada que imprimir" : `Imprimir ${plural(total, "etiqueta", "etiquetas")}`}
    </button>
  );

  if (etiquetas.length === 0) {
    return (
      <div className="space-y-6">
        <CabeceraPantalla sobretitulo={sobretitulo} titulo="Etiquetas de precio" bajada="Este ingreso no dejó prendas para etiquetar en tu sede." />
        {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo={sobretitulo}
        titulo="Etiquetas de precio"
        bajada={`Entraron ${plural(entraron, "prenda", "prendas")} de ${plural(modelos, "modelo", "modelos")}. Sale una etiqueta por prenda; si alguna ya venía etiquetada, baja su número.`}
        acciones={imprimir}
      />

      {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}

      <Tabla>
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
        {etiquetas.map((e) => (
          <div key={e.varianteId} className={fila(PLANTILLA)} role="row">
            <span className={celda()}>
              <span className="block truncate text-tinta">{e.prenda}</span>
              <span className="block truncate text-xs text-taupe">
                {[e.color, e.talla && `Talla ${e.talla}`].filter(Boolean).join(" · ")}
                <span className="ml-2 font-mono">{e.codigo}</span>
              </span>
            </span>
            <span className={celda("der")}>{soles(e.precio)}</span>
            <span className={celda("der", "text-tinta/70")}>{e.cantidad}</span>
            <span className={celda("der")}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_POR_PRENDA}
                value={cantidades[e.varianteId] ?? ""}
                onChange={(ev) => setCantidades((c) => ({ ...c, [e.varianteId]: ev.target.value }))}
                aria-label={`Etiquetas de ${e.prenda}${e.color ? ` ${e.color}` : ""}${e.talla ? ` talla ${e.talla}` : ""}`}
                className="caja-cayla h-9 w-20 px-2 text-right tabular-nums text-tinta outline-none"
              />
            </span>
          </div>
        ))}
        <p className={TABLA.pie}>
          Se {total === 1 ? "imprime" : "imprimen"} <b className="font-semibold text-tinta">{plural(total, "etiqueta", "etiquetas")}</b> de 62 × 92 mm.
        </p>
      </Tabla>

      {visibles.length > 0 && (
        <section aria-label="Vista previa" className="space-y-3">
          <p className="text-sm text-taupe">Así salen, a tamaño real (una de cada prenda):</p>
          <div className="flex flex-wrap gap-4">
            {visibles.map((e) => (
              <figure key={e.varianteId} className="space-y-1.5">
                <div className="ring-1 ring-sand">
                  <EtiquetaPrecio etiqueta={e} impreso={impreso} />
                </div>
                <figcaption className="text-center text-xs text-taupe tabular-nums">× {numeros[e.varianteId]}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <p className="nota-cayla">
        <b>La primera vez en esta computadora:</b> en la ventana de impresión elige la <b>Brother QL-1110NWB</b>, papel <b>62 × 92 mm</b>,
        márgenes «Ninguno», escala 100 % y sin encabezados ni pies de página. Cada etiqueta sale en su propio corte del rollo. La etiqueta lleva el
        precio de lista: si la prenda está en campaña, la caja cobra el precio rebajado igual.
      </p>

      {montado &&
        createPortal(
          <div id="etiquetas-precio-print" aria-hidden>
            {hoja.map((e, i) => (
              <EtiquetaPrecio key={i} etiqueta={e} impreso={impreso} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function AvisoSinCodigo({ prendas }: { prendas: string[] }) {
  return (
    <div role="status" className="rounded-xl border border-ambar/40 bg-ambar/[0.06] px-4 py-3 text-sm text-ambar-profundo">
      <b className="font-semibold">
        {prendas.length === 1 ? "Una prenda no tiene código" : `${prendas.length} prendas no tienen código`} y no se puede{prendas.length === 1 ? "" : "n"} etiquetar
      </b>
      : sin código la caja no la encontraría al escanear. {prendas.join(" · ")}.
    </div>
  );
}
