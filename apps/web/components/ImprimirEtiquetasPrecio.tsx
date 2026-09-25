"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "@/components/ui/Tabla";
import { EtiquetaPrecio } from "@/components/EtiquetaPrecio";
import { soles } from "@/lib/compras-reglas";
import { cantidadDeTexto, expandir, MAX_POR_PRENDA, type Encabezado as TextosPantalla, type EtiquetaPrecio as DatosEtiqueta } from "@/lib/etiqueta-precio-reglas";

// Color y talla van bajo el nombre (no en columnas propias): con cinco columnas fijas, en una pantalla angosta la de la
// prenda se quedaba en 0 px y el nombre desaparecía.
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_5.5rem]";
const columnas = (cantidad: string): Columna[] => [
  { titulo: "Prenda" },
  { titulo: "Precio", alinear: "der", ayuda: "Lo que dice la etiqueta: lo que la caja cobra hoy (con la campaña, si hay una)." },
  { titulo: cantidad, alinear: "der" },
  { titulo: "Imprimir", alinear: "der", ayuda: "Cuántas etiquetas de esta prenda. Si alguna ya tiene la suya, baja el número." },
];

const sinSuscripcion = () => () => {};
const modoGuardado = (): "girada" | "derecha" => {
  try {
    return localStorage.getItem("cayla.etiquetas.modo") === "derecha" ? "derecha" : "girada";
  } catch {
    return "girada";
  }
};
const plural =(n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Etiquetas de precio (ADR-0180): una fila por prenda con la cantidad editable, la vista previa y el botón que las
 * manda a la Brother. Los textos (de dónde vienen, qué decir si no hay nada) llegan del servidor (`encabezadoDeEtiquetas`). La hoja de impresión (`#etiquetas-precio-print`) va pegada a <body> con un
 * portal —como la boleta A4—: al imprimir, `globals.css` oculta todo lo demás y cada etiqueta (40,1 × 62 mm) va en su
 * propia página de 62 × 40,1 mm —el ancho del rollo por el largo de cada corte—, girada o derecha según la forma A o B.
 */
export function ImprimirEtiquetasPrecio({
  encabezado,
  etiquetas,
  sinCodigo,
  impreso,
}: {
  encabezado: TextosPantalla;
  etiquetas: DatosEtiqueta[];
  sinCodigo: string[];
  impreso: string;
}) {
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => Object.fromEntries(etiquetas.map((e) => [e.varianteId, String(e.cantidad)])));
  // El portal necesita `document`: en el servidor (y al hidratar) no hay hoja; en el navegador, sí. Queda montada siempre,
  // así Ctrl+P también imprime las etiquetas y no la pantalla.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  // Cómo se manda la hoja al driver (ver `globals.css`, #etiquetas-precio-print). Se recuerda por computadora: cada una
  // tiene su driver y gira distinto.
  const [elegido, setElegido] = useState<"girada" | "derecha" | null>(null);
  const modo = elegido ?? (montado ? modoGuardado() : "girada");
  const elegirModo = (m: "girada" | "derecha") => {
    setElegido(m);
    try {
      localStorage.setItem("cayla.etiquetas.modo", m);
    } catch {}
  };

  const numeros = useMemo(() => Object.fromEntries(Object.entries(cantidades).map(([id, t]) => [id, cantidadDeTexto(t)])), [cantidades]);
  const hoja = useMemo(() => expandir(etiquetas, numeros), [etiquetas, numeros]);
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
        <CabeceraPantalla sobretitulo={encabezado.sobretitulo} titulo={encabezado.titulo} bajada={encabezado.vacio} />
        {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CabeceraPantalla sobretitulo={encabezado.sobretitulo} titulo={encabezado.titulo} bajada={encabezado.bajada} acciones={imprimir} />

      {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}

      <Tabla>
        <Encabezado columnas={columnas(encabezado.columnaCantidad)} plantilla={PLANTILLA} />
        {etiquetas.map((e) => (
          <div key={e.varianteId} className={fila(PLANTILLA)} role="row">
            <span className={celda()}>
              <span className="block truncate text-tinta">{e.prenda}</span>
              <span className="block truncate text-xs text-taupe">
                {[e.color, e.talla && `Talla ${e.talla}`].filter(Boolean).join(" · ")}
                <span className="ml-2 font-mono">{e.codigo}</span>
              </span>
            </span>
            <span className={celda("der")}>
              {e.campana ? (
                <>
                  {soles(e.precio - e.campana.descuento)}
                  <span className="block text-xs text-taupe">
                    <s>{soles(e.precio)}</s> −{e.campana.pct} %
                  </span>
                </>
              ) : (
                soles(e.precio)
              )}
            </span>
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
          Se {total === 1 ? "imprime" : "imprimen"} <b className="font-semibold text-tinta">{plural(total, "etiqueta", "etiquetas")}</b> de 40,1 × 62 mm, como la plantilla de la P-touch.
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

      <div className="flex flex-wrap items-center gap-2 text-sm text-taupe">
        <span>Cómo la manda a la Brother:</span>
        {(["girada", "derecha"] as const).map((m) => (
          // La elegida la pinta `.pildora-cayla[aria-pressed]` (tinta con letra crema): un `text-tinta` encima la dejaba negra sobre negra.
          <button key={m} type="button" className="pildora-cayla" aria-pressed={modo === m} onClick={() => elegirModo(m)}>
            {m === "girada" ? "A · Hoja 62 × 40,1 (girada)" : "B · Hoja 40,1 × 62 (derecha)"}
          </button>
        ))}
      </div>

      <p className="nota-cayla">
        <b>La primera vez en esta computadora:</b> en la <b>Brother QL-1110NWB</b> el papel tiene que medir <b>62 × 40,1 mm</b>, como la
        plantilla de la P-touch. En la Mac, el «62 mm» de la lista corta cada 100 mm: sobra papel y la etiqueta sale a lo largo. Imprime con{" "}
        <b>⌥⌘P</b> (el diálogo del sistema; el de Chrome no muestra tamaños propios): la primera vez, en Tamaño del papel elige «Gestionar
        tamaños personalizados…», crea 62 × 40,1 mm con márgenes en 0 y guárdalo como preajuste. En Windows, créalo en las Preferencias de
        impresión de la Brother. Márgenes «Ninguno», escala 100 % y sin encabezados. Si sale a lo largo, prueba la otra forma (A o B) de
        arriba. La vista previa dice «Impreso» con la fecha de hoy; si dice otra, recarga la página antes de imprimir. La etiqueta dice lo
        que la caja cobra hoy: con una campaña vigente sale el precio rebajado y hasta cuándo vale; cuando termine, reimprímelas desde la
        campaña con «Volver al precio normal».
      </p>

      {montado &&
        createPortal(
          <div id="etiquetas-precio-print" data-modo={modo} aria-hidden>
            {hoja.map((e, i) => (
              // Cada etiqueta en su hoja del tamaño del corte: `globals.css` (.etq-hoja) la gira o la deja derecha según el modo.
              <div key={i} className="etq-hoja">
                <EtiquetaPrecio etiqueta={e} impreso={impreso} />
              </div>
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
