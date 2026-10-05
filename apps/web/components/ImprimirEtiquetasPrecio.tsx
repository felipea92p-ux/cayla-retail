"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Volver } from "@/components/ui/Volver";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "@/components/ui/Tabla";
import { avisar } from "@/components/ui/Avisos";
import { useEsperando } from "@/components/ui/Espera";
import { CapsulaColor, VARIOS_COLORES } from "@/components/ui/MuestraColor";
import { EtiquetaPrecio } from "@/components/EtiquetaPrecio";
import { BotonGuiaImpresion } from "@/components/GuiaImpresion";
import { soles } from "@/lib/compras-reglas";
import { cantidadDeTexto, expandir, MAX_POR_PRENDA, type Encabezado as TextosPantalla, type EtiquetaPrecio as DatosEtiqueta } from "@/lib/etiqueta-precio-reglas";
import { sistemaDelEquipo } from "@/lib/guia-impresion-reglas";
import {
  avisoDelAyudante,
  COMANDO_INSTALAR,
  documentoParaAyudante,
  estadoDelAyudante,
  resultadoDeImpresion,
  URL_AYUDANTE,
  type EstadoAyudante,
} from "@/lib/mac-etiquetas";

// El color tiene columna propia, en medio, con su cápsula y su nombre (Felipe, 2026-10-03: con diez filas del mismo modelo
// lo único que cambia es el color, y tiene que verse sin leer). Solo cuando la TABLA mide 40rem o más (`@container` en la
// `Tabla`): más angosta —celular, o junto a la vista previa en una pantalla de 1280— una quinta columna dejaba la de la
// prenda en 0 px y el nombre desaparecía; ahí el color vuelve bajo el nombre, con la misma cápsula. Las clases `@min-[40rem]:`
// van escritas enteras (Tailwind no ve una clase armada con `${…}`).
const PLANTILLA = "sm:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_5.5rem] @min-[40rem]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_6.5rem_4.5rem_5.5rem]";
const columnas = (cantidad: string): Columna[] => [
  { titulo: "Prenda" },
  { titulo: "Color", clase: "hidden @min-[40rem]:block" },
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
  volver,
}: {
  encabezado: TextosPantalla;
  etiquetas: DatosEtiqueta[];
  sinCodigo: string[];
  impreso: string;
  /** La pantalla que abrió las etiquetas (`volverDeEtiquetas`): no es del menú, así que sin esto no hay salida. */
  volver: { href: string; a: string };
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

  // En una Mac, Chrome entrega la hoja girada y la Brother la saca larga: se imprime por el ayudante local (ADR-0304).
  const esMac = montado && sistemaDelEquipo(navigator.userAgent, navigator.platform) === "mac";
  const [ayudante, setAyudante] = useState<EstadoAyudante>("comprobando");
  const [enviando, setEnviando] = useState(false);
  useEsperando(enviando, { etiqueta: "Un momento", titulo: "Imprimiendo", detalle: "Preparando las etiquetas para la Brother…" });
  useEffect(() => {
    if (!esMac) return;
    let vigente = true;
    fetch(`${URL_AYUDANTE}/estado`, { cache: "no-store", signal: AbortSignal.timeout(2500) })
      .then((r) => r.json())
      .then((j) => vigente && setAyudante(estadoDelAyudante(j)))
      .catch(() => vigente && setAyudante("sin-ayudante"));
    return () => {
      vigente = false;
    };
  }, [esMac]);
  const porAyudante = esMac && ayudante === "listo";

  const imprimirEnMac = async () => {
    const nodo = document.getElementById("etiquetas-precio-print");
    if (!nodo) return;
    // La hoja tal cual la dibuja la pantalla, con la forma A: allí la página sí mide 62 × 40,1 y nadie la vuelve a girar.
    const copia = nodo.cloneNode(true) as HTMLElement;
    copia.setAttribute("data-modo", "girada");
    const estilos = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style, link[rel="preload"][as="font"]'), (n) => n.outerHTML);
    const documento = documentoParaAyudante({
      estilos,
      base: `${location.origin}/`,
      clases: `${document.documentElement.className} ${document.body.className}`.trim(),
      hoja: copia.outerHTML,
    });
    setEnviando(true);
    let status: number | null = null;
    let cuerpo: unknown = null;
    try {
      const r = await fetch(`${URL_AYUDANTE}/imprimir`, { method: "POST", headers: { "Content-Type": "text/html" }, body: documento });
      status = r.status;
      cuerpo = await r.json().catch(() => null);
    } catch {
      status = null;
    } finally {
      setEnviando(false);
    }
    const res = resultadoDeImpresion(status, cuerpo, total);
    if (res.ok) avisar.exito(res.texto);
    else avisar.error(res.texto, { detalle: res.detalle });
  };

  // La guía va al lado del botón que imprime: quien se traba lo hace justo ahí, con el diálogo de impresión recién visto.
  const imprimir = (
    <div className="flex flex-wrap items-center gap-2">
      <BotonGuiaImpresion />
      <button
        type="button"
        className="btn-cayla btn-primario"
        disabled={total === 0 || enviando}
        onClick={() => (porAyudante ? void imprimirEnMac() : window.print())}
      >
        {total === 0 ? "Nada que imprimir" : enviando ? "Imprimiendo…" : `Imprimir ${plural(total, "etiqueta", "etiquetas")}`}
      </button>
    </div>
  );
  const avisoMac = esMac ? avisoDelAyudante(ayudante) : null;

  if (etiquetas.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <Volver {...volver} className="mb-4" />
          <CabeceraPantalla sobretitulo={encabezado.sobretitulo} titulo={encabezado.titulo} bajada={encabezado.vacio} />
        </div>
        {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}
      </div>
    );
  }

  // Dos columnas desde 1280 px (Felipe 2026-10-03: «ocupar todo el espacio […] al lado derecho que se muestren las etiquetas en vez
  // de que queden al último»): a la izquierda qué se imprime y cómo; a la derecha la vista previa, pegada arriba mientras se baja.
  // La ruta está en `SIN_TOPE_DE_ANCHO` del AppShell (sin el tope de `max-w-5xl`). Más angosta, una columna como antes, con la vista
  // previa justo después de la tabla.
  const vistaPrevia =
    visibles.length > 0 ? (
      <section aria-label="Vista previa" className="space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:overscroll-contain xl:rounded-xl xl:border xl:border-sand xl:bg-papel xl:p-4">
        <p className="text-sm text-taupe">Así salen, a tamaño real (una de cada prenda):</p>
        <div className="flex flex-wrap gap-4">
          {visibles.map((e) => (
            <figure key={e.varianteId} className="space-y-1.5">
              <div className="ring-1 ring-sand">
                <EtiquetaPrecio etiqueta={e} impreso={impreso} />
              </div>
              {/* La misma cápsula que la fila de la tabla: así se empareja cada etiqueta con su fila sin leer. */}
              <figcaption className="flex items-center justify-center gap-1.5 text-xs text-taupe tabular-nums">
                {e.color && <CapsulaColor fondo={e.colorMuestra ?? null} compacta />}
                <span>× {numeros[e.varianteId]}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      <div>
        <Volver {...volver} className="mb-4" />
        <CabeceraPantalla sobretitulo={encabezado.sobretitulo} titulo={encabezado.titulo} bajada={encabezado.bajada} acciones={imprimir} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,40%)] xl:gap-8">
      <div className="min-w-0 space-y-6">
      {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}
      {avisoMac && <AvisoAyudanteMac {...avisoMac} instalar={ayudante === "sin-ayudante"} />}

      <Tabla className="@container">
        <Encabezado columnas={columnas(encabezado.columnaCantidad)} plantilla={PLANTILLA} />
        {etiquetas.map((e) => (
          <div key={e.varianteId} className={fila(PLANTILLA, "relative")} role="row">
            {/* La franja del color al borde izquierdo, la misma de Editar producto (`MatrizStockFicha`): se sigue la fila de
                lejos, y el filo interior hace visible un blanco o un crema. Va fuera de la rejilla (absoluta). */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_color-mix(in_srgb,var(--color-tinta)_18%,transparent)]"
              style={{ background: e.color ? (e.colorMuestra ?? VARIOS_COLORES) : "var(--color-sand)" }}
            />
            <span className={celda()}>
              <span className="block truncate text-tinta">{e.prenda}</span>
              {/* Envuelve en vez de cortar: con la cápsula, en una tabla angosta el código se quedaba en «BLZ-0001-BL…», y el
                  código es justo lo que dice qué etiqueta es. Si no cabe, baja entero a la línea siguiente. */}
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-taupe">
                {/* Tabla angosta: el color va aquí, con la misma cápsula; ancha, tiene su columna y aquí sobra. */}
                {e.color && (
                  <span className="inline-flex items-center gap-1.5 @min-[40rem]:hidden">
                    <CapsulaColor fondo={e.colorMuestra ?? null} compacta />
                    {e.color}
                    {e.talla && <span aria-hidden>·</span>}
                  </span>
                )}
                {e.talla && <span>Talla {e.talla}</span>}
                <span className="ml-1 font-mono">{e.codigo}</span>
              </span>
            </span>
            <span className="hidden min-w-0 items-center gap-2 self-center @min-[40rem]:flex">
              {e.color ? (
                <>
                  <CapsulaColor fondo={e.colorMuestra ?? null} />
                  <span className="truncate text-sm text-tinta/80" title={e.color}>
                    {e.color}
                  </span>
                </>
              ) : (
                <span className="text-sm text-tinta/45">Sin color</span>
              )}
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

      {/* Una columna: la vista previa va aquí, justo después de la tabla. Dos columnas: a la derecha. */}
      {vistaPrevia && <div className="xl:hidden">{vistaPrevia}</div>}

      {/* Con el ayudante de la Mac la forma no se elige: siempre va la A, del tamaño exacto. */}
      {!porAyudante && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-taupe">
          <span>Cómo la manda a la Brother:</span>
          {(["girada", "derecha"] as const).map((m) => (
            // La elegida la pinta `.pildora-cayla[aria-pressed]` (tinta con letra crema): un `text-tinta` encima la dejaba negra sobre negra.
            <button key={m} type="button" className="pildora-cayla" aria-pressed={modo === m} onClick={() => elegirModo(m)}>
              {m === "girada" ? "A · Hoja 62 × 40,1 (girada)" : "B · Hoja 40,1 × 62 (derecha)"}
            </button>
          ))}
        </div>
      )}

      {/* La impresora y el precio van en notas separadas (2026-09-26): juntas, nadie de tienda leía la nota entera y la parte
          de la Brother —la que traba a un equipo nuevo— quedaba al final. La configuración paso a paso vive en la guía. */}
      <div className="nota-cayla flex flex-wrap items-center justify-between gap-3">
        <span>
          <b>¿Primera vez imprimiendo en esta computadora, o sale chica, larga o girada?</b> La Brother se configura una sola vez por
          computadora: la guía lo muestra paso a paso, con fotos, para Windows y para Mac.
        </span>
        <BotonGuiaImpresion className="btn-cayla btn-secundario shrink-0" />
      </div>

      <p className="nota-cayla">
        La etiqueta dice lo que la caja cobra hoy: con una campaña vigente sale el precio rebajado y hasta cuándo vale; cuando termine,
        reimprímelas desde la campaña con «Volver al precio normal». La vista previa dice «Impreso» con la fecha de hoy; si dice otra,
        recarga la página antes de imprimir.
      </p>
      </div>
      {vistaPrevia && <div className="hidden xl:block">{vistaPrevia}</div>}
      </div>

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

/** Una Mac que todavía no puede imprimir por el ayudante (ADR-0304): qué le falta y, si es el ayudante, la línea para instalarlo. */
function AvisoAyudanteMac({ titulo, detalle, instalar }: { titulo: string; detalle: string; instalar: boolean }) {
  const copiar = () =>
    navigator.clipboard.writeText(COMANDO_INSTALAR).then(
      () => avisar.exito("Línea copiada", { detalle: "Pégala en Terminal y presiona Enter." }),
      () => avisar.error("No se pudo copiar", { detalle: "Selecciona la línea y cópiala con ⌘C." }),
    );
  return (
    <div role="status" className="nota-cayla space-y-2">
      <p>
        <b>{titulo}.</b> {detalle}
      </p>
      {instalar && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="select-all break-all rounded bg-papel px-2 py-1 font-mono text-xs text-tinta">{COMANDO_INSTALAR}</code>
          <button type="button" className="btn-cayla btn-secundario" onClick={copiar}>
            Copiar
          </button>
        </div>
      )}
      <p className="text-xs">Mientras tanto, «Imprimir» usa el diálogo de Chrome: la etiqueta sale, pero con papel de sobra.</p>
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
