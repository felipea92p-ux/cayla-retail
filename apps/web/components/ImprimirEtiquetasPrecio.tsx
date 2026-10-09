"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, Tags, Trash2 } from "lucide-react";
import { Volver } from "@/components/ui/Volver";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { Encabezado, Tabla, TABLA, type Columna } from "@/components/ui/Tabla";
import { CapsulaColor, VARIOS_COLORES } from "@/components/ui/MuestraColor";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { EtiquetaPrecio } from "@/components/EtiquetaPrecio";
import { BotonGuiaImpresion } from "@/components/GuiaImpresion";
import { AvisoAyudanteMac, useImpresionBrother } from "@/components/impresion/useImpresionBrother";
import { soles } from "@/lib/compras-reglas";
import { useContar } from "@/lib/useContar";
import {
  agruparPorPrenda,
  cantidadDeTexto,
  expandir,
  MAX_POR_PRENDA,
  nombreDeFila,
  type Encabezado as TextosPantalla,
  type EtiquetaPrecio as DatosEtiqueta,
} from "@/lib/etiqueta-precio-reglas";

// Una fila por color y talla, juntas bajo el nombre de su prenda (Felipe, 2026-10-09: «que no se haga tan cansado de ver tantas
// cosas»): el nombre se dice una vez por grupo y cada fila dice solo lo que cambia —el color con su cápsula, la talla, el precio— y
// cuántas imprimir, con su tacho al lado. La columna «En tienda / Entraron» se fue: era el mismo número que trae el campo, y si se
// cambia, el campo ofrece volver a él («de 15»).
const PLANTILLA = "@min-[37rem]:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_12.75rem]";
/** El encabezado solo tiene sentido con la tabla ancha: angosta, cada fila va en dos líneas y se lee sola. */
const PLANTILLA_ENCABEZADO = `${PLANTILLA} @max-[37rem]:hidden!`;
const columnas: Columna[] = [
  { titulo: "Color y código" },
  { titulo: "Talla", alinear: "centro" },
  { titulo: "Precio", alinear: "centro", ayuda: "Lo que dice la etiqueta: lo que la caja cobra hoy (con la campaña, si hay una)." },
  { titulo: "Imprimir", alinear: "der", ayuda: "Cuántas etiquetas de esta prenda. Si alguna ya tiene la suya, baja el número; el tacho la saca de la lista." },
];
/** Lo que dura la fila en irse (`.etq-fila[data-saliendo]`, etiquetas-precio.css): después se quita de verdad. */
const SALIDA_MS = 320;

const modoGuardado = (): "girada" | "derecha" => {
  try {
    return localStorage.getItem("cayla.etiquetas.modo") === "derecha" ? "derecha" : "girada";
  } catch {
    return "girada";
  }
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Etiquetas de precio (ADR-0180): las prendas juntas por modelo, cada color y talla con cuántas imprimir (− n +) y su tacho, la
 * vista previa y el botón que las manda a la Brother. Los textos (de dónde vienen, qué decir si no hay nada) llegan del servidor
 * (`encabezadoDeEtiquetas`). La hoja de impresión (`#etiquetas-precio-print`) va pegada a <body> con un portal —como la boleta
 * A4—: al imprimir, `globals.css` oculta todo lo demás y cada etiqueta (40,1 × 62 mm) va en su propia página de 62 × 40,1 mm
 * —el ancho del rollo por el largo de cada corte—, girada o derecha según la forma A o B.
 *
 * El tacho (Felipe, 2026-10-09) saca la fila entera: deja de imprimirse, sale de la tabla y de la vista previa. No pregunta
 * —no toca stock, dinero ni la base: es una lista que se arma para imprimir— y se perdona: «Deshacer» en el aviso y «Volver a
 * ponerlas» al pie mientras haya alguna quitada. El movimiento vive en `app/estilos/etiquetas-precio.css`.
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
  // Las filas sacadas con el tacho, en el orden en que salieron (el «Deshacer» del aviso devuelve la suya). `saliendo`: las que
  // están haciendo su animación de salida; durante esos 320 ms siguen en la tabla, pero ya no se imprimen.
  const [quitadas, setQuitadas] = useState<string[]>([]);
  const [saliendo, setSaliendo] = useState<ReadonlySet<string>>(new Set());
  // La cascada de entrada es solo la primera vez: una fila que vuelve con «Deshacer» entra sola, sin esperar su turno.
  const [primeraVez, setPrimeraVez] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setPrimeraVez(false), 900);
    return () => window.clearTimeout(t);
  }, []);
  const temporizadores = useRef(new Map<string, number>());
  useEffect(() => {
    const mapa = temporizadores.current;
    return () => mapa.forEach((t) => window.clearTimeout(t));
  }, []);

  // Cómo se manda la hoja al driver (ver `globals.css`, #etiquetas-precio-print). Se recuerda por computadora: cada una
  // tiene su driver y gira distinto.
  const [elegido, setElegido] = useState<"girada" | "derecha" | null>(null);
  const elegirModo = (m: "girada" | "derecha") => {
    setElegido(m);
    try {
      localStorage.setItem("cayla.etiquetas.modo", m);
    } catch {}
  };

  const fuera = useMemo(() => new Set([...quitadas, ...saliendo]), [quitadas, saliendo]);
  const enLista = useMemo(() => etiquetas.filter((e) => !quitadas.includes(e.varianteId)), [etiquetas, quitadas]);
  const seImprimen = useMemo(() => etiquetas.filter((e) => !fuera.has(e.varianteId)), [etiquetas, fuera]);
  const numeros = useMemo(() => Object.fromEntries(Object.entries(cantidades).map(([id, t]) => [id, cantidadDeTexto(t)])), [cantidades]);
  const hoja = useMemo(() => expandir(seImprimen, numeros), [seImprimen, numeros]);
  const total = hoja.length;
  const grupos = useMemo(() => agruparPorPrenda(enLista), [enLista]);
  const visibles = enLista.filter((e) => (numeros[e.varianteId] ?? 0) > 0);
  const totalContado = Math.round(useContar(total, 450));

  const cambiar = (id: string, valor: number | string) => setCantidades((c) => ({ ...c, [id]: String(valor) }));
  const devolver = (ids: string[]) => {
    for (const id of ids) {
      window.clearTimeout(temporizadores.current.get(id));
      temporizadores.current.delete(id);
    }
    setSaliendo((s) => new Set([...s].filter((id) => !ids.includes(id))));
    setQuitadas((q) => q.filter((id) => !ids.includes(id)));
  };
  // Un doble clic en el tacho no se lleva también la fila que sube a ocupar el lugar: el segundo toque, si llega antes de que
  // termine la salida, no hace nada.
  const ultimoQuitar = useRef(0);
  const avisoQuitar = useRef<number | null>(null);
  const quitar = (filas: DatosEtiqueta[], cuando: number) => {
    if (cuando - ultimoQuitar.current < SALIDA_MS + 120) return;
    ultimoQuitar.current = cuando;
    const ids = filas.map((e) => e.varianteId).filter((id) => !fuera.has(id));
    if (ids.length === 0) return;
    setSaliendo((s) => new Set([...s, ...ids]));
    for (const id of ids) {
      temporizadores.current.set(
        id,
        window.setTimeout(() => {
          temporizadores.current.delete(id);
          setQuitadas((q) => (q.includes(id) ? q : [...q, id]));
          setSaliendo((s) => new Set([...s].filter((x) => x !== id)));
        }, SALIDA_MS),
      );
    }
    const unidades = filas.reduce((a, e) => a + (numeros[e.varianteId] ?? 0), 0);
    // Un solo aviso a la vez: el de la fila anterior se cierra (su «Deshacer» sigue vivo al pie, en «Volver a ponerlas»).
    if (avisoQuitar.current !== null) avisar.cerrar(avisoQuitar.current);
    avisoQuitar.current = avisar.exito(filas.length === 1 ? `Quitaste ${nombreDeFila(filas[0])}` : `Quitaste ${filas[0].prenda}`, {
      detalle: unidades > 0 ? `${plural(unidades, "etiqueta menos", "etiquetas menos")} por imprimir.` : undefined,
      accion: { texto: "Deshacer", onClick: () => devolver(ids) },
      duracion: 7000,
    });
  };

  // El portal queda montado siempre, así Ctrl+P también imprime las etiquetas y no la pantalla. En la Mac con ayudante, la
  // hoja va con la forma A (girada): allí la página SÍ mide 62 × 40,1 y nadie la vuelve a girar.
  const { montado, porAyudante, enviando, avisoMac, instalar, imprimir: mandar } = useImpresionBrother({
    idHoja: "etiquetas-precio-print",
    total,
    pieza: "etiqueta",
    detalleEspera: "Preparando las etiquetas para la Brother…",
    prepararCopia: (copia) => copia.setAttribute("data-modo", "girada"),
  });
  const modo = elegido ?? (montado ? modoGuardado() : "girada");

  // La guía va al lado del botón que imprime: quien se traba lo hace justo ahí, con el diálogo de impresión recién visto.
  // El número del botón cuenta hasta el nuevo cada vez que se sube, se baja o se quita algo.
  const imprimir = (
    <div className="flex flex-wrap items-center gap-2">
      <BotonGuiaImpresion />
      <button type="button" className="btn-cayla btn-primario mov-boton" disabled={total === 0 || enviando} onClick={mandar}>
        {total === 0 ? (
          "Nada que imprimir"
        ) : enviando ? (
          "Imprimiendo…"
        ) : (
          <>
            <span aria-hidden>
              Imprimir <span className="etq-total tabular-nums">{totalContado}</span> {totalContado === 1 ? "etiqueta" : "etiquetas"}
            </span>
            <span className="sr-only">Imprimir {plural(total, "etiqueta", "etiquetas")}</span>
          </>
        )}
      </button>
    </div>
  );

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

  // El nombre del modelo va como subtítulo de su grupo solo si hay más de uno: con uno solo ya lo dice el título de la página.
  const conGrupos = grupos.length > 1;
  let indice = 0;
  const cascada = (): CSSProperties | undefined => (primeraVez ? ({ ["--i" as string]: Math.min(indice++, 12) } as CSSProperties) : undefined);

  // Dos columnas desde 1280 px (Felipe 2026-10-03: «ocupar todo el espacio […] al lado derecho que se muestren las etiquetas en vez
  // de que queden al último»): a la izquierda qué se imprime y cómo; a la derecha la vista previa, pegada arriba mientras se baja.
  // La ruta está en `SIN_TOPE_DE_ANCHO` del AppShell (sin el tope de `max-w-5xl`). Más angosta, una columna como antes, con la vista
  // previa justo después de la tabla.
  const vistaPrevia =
    visibles.length > 0 ? (
      <section aria-label="Vista previa" className="etq-previa space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:overscroll-contain xl:rounded-xl xl:border xl:border-sand xl:bg-papel xl:p-4">
        <p className="text-sm text-taupe">Así salen, a tamaño real (una de cada prenda):</p>
        <div className="flex flex-wrap gap-4">
          {visibles.map((e, i) => (
            <figure
              key={e.varianteId}
              className="etq-tarjeta space-y-1.5"
              data-saliendo={saliendo.has(e.varianteId) || undefined}
              style={primeraVez ? ({ ["--i" as string]: Math.min(i, 8) } as CSSProperties) : undefined}
            >
              <div className="ring-1 ring-sand">
                <EtiquetaPrecio etiqueta={e} impreso={impreso} />
              </div>
              {/* La misma cápsula que la fila de la tabla: así se empareja cada etiqueta con su fila sin leer. */}
              <figcaption className="flex items-center justify-center gap-1.5 text-xs text-taupe tabular-nums">
                {e.color && <CapsulaColor fondo={e.colorMuestra ?? null} compacta />}
                <span>
                  × <NumeroQueSalta valor={numeros[e.varianteId] ?? 0} />
                </span>
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
        <div className="min-w-0 space-y-5">
          {sinCodigo.length > 0 && <AvisoSinCodigo prendas={sinCodigo} />}
          {avisoMac && <AvisoAyudanteMac {...avisoMac} instalar={instalar} mientras="Mientras tanto, «Imprimir» usa el diálogo de Chrome: la etiqueta sale, pero con papel de sobra." />}

          <Tabla className="etq-tabla @container">
            <Encabezado columnas={columnas} plantilla={PLANTILLA_ENCABEZADO} />
            {grupos.length === 0 && (
              <Vacio
                tamano="chico"
                icono={<Tags />}
                accion={{ texto: "Volver a ponerlas todas", onClick: () => devolver(quitadas) }}
              >
                Quitaste todas las filas: no queda nada por imprimir.
              </Vacio>
            )}
            {grupos.map((g) => (
              <div key={g.prenda} role="rowgroup" className="etq-grupo">
                {conGrupos && (
                  <CabezaDeGrupo
                    prenda={g.prenda}
                    unidades={g.filas.reduce((a, e) => a + (fuera.has(e.varianteId) ? 0 : (numeros[e.varianteId] ?? 0)), 0)}
                    saliendo={g.filas.every((e) => saliendo.has(e.varianteId))}
                    estilo={cascada()}
                    onQuitar={(cuando) => quitar(g.filas, cuando)}
                  />
                )}
                {g.filas.map((e) => (
                  <FilaEtiqueta
                    key={e.varianteId}
                    e={e}
                    texto={cantidades[e.varianteId] ?? ""}
                    numero={numeros[e.varianteId] ?? 0}
                    columnaCantidad={encabezado.columnaCantidad}
                    saliendo={saliendo.has(e.varianteId)}
                    estilo={cascada()}
                    onTexto={(t) => cambiar(e.varianteId, t)}
                    onQuitar={(cuando) => quitar([e], cuando)}
                  />
                ))}
              </div>
            ))}
            <div className={`${TABLA.pie} flex flex-wrap items-center justify-between gap-x-4 gap-y-1`}>
              <span>
                Se {total === 1 ? "imprime" : "imprimen"}{" "}
                <b className="font-semibold text-tinta tabular-nums">{plural(totalContado, "etiqueta", "etiquetas")}</b> de 40,1 × 62 mm.
              </span>
              {quitadas.length > 0 && grupos.length > 0 && (
                <button type="button" className="etq-reponer inline-flex items-center gap-1.5 text-taupe transition-colors hover:text-tinta" onClick={() => devolver(quitadas)}>
                  <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                  Quitaste {quitadas.length === 1 ? "una fila" : `${quitadas.length} filas`} · <span className="underline underline-offset-2">Volver a ponerlas</span>
                </button>
              )}
            </div>
          </Tabla>

          {/* Una columna: la vista previa va aquí, justo después de la tabla. Dos columnas: a la derecha. */}
          {vistaPrevia && <div className="xl:hidden">{vistaPrevia}</div>}

          {/* Lo de la impresora en UNA nota (antes eran dos notas y una fila suelta de píldoras): cómo se manda —salvo con el
              ayudante de la Mac, que siempre va con la forma A— y la guía para quien se traba. El precio, en una línea aparte. */}
          <div className="nota-cayla space-y-2.5">
            <p>
              <b>¿Primera vez en esta computadora, o sale chica, larga o girada?</b> La Brother se configura una vez: la{" "}
              <BotonGuiaImpresion className="font-semibold underline underline-offset-2 transition-colors hover:text-rojo">guía de impresión</BotonGuiaImpresion> lo muestra con fotos, para
              Windows y Mac.
            </p>
            {!porAyudante && (
              <div className="flex flex-wrap items-center gap-2">
                <span>Cómo la manda:</span>
                {(["girada", "derecha"] as const).map((m) => (
                  // La elegida la pinta `.pildora-cayla[aria-pressed]` (tinta con letra crema): un `text-tinta` encima la dejaba negra sobre negra.
                  <button key={m} type="button" className="pildora-cayla" aria-pressed={modo === m} onClick={() => elegirModo(m)}>
                    {m === "girada" ? "A · Hoja 62 × 40,1 (girada)" : "B · Hoja 40,1 × 62 (derecha)"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="px-1 text-xs leading-relaxed text-taupe">
            Sale lo que la caja cobra hoy, con la campaña si hay una; cuando termine, reimprímelas desde la campaña. Si la vista previa no
            dice «Impreso {impreso}», recarga antes de imprimir.
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

/** El nombre del modelo sobre sus filas (solo con dos modelos o más), con cuántas etiquetas suma y el tacho que lo saca entero. */
function CabezaDeGrupo({
  prenda,
  unidades,
  saliendo,
  estilo,
  onQuitar,
}: {
  prenda: string;
  unidades: number;
  saliendo: boolean;
  estilo?: CSSProperties;
  /** `cuando`: la hora del clic (`timeStamp`), para que un doble clic no se lleve dos filas. */
  onQuitar: (cuando: number) => void;
}) {
  return (
    <div className="etq-fila etq-entra" data-saliendo={saliendo || undefined} style={estilo}>
      <div className="etq-fila-dentro">
        <div className="etq-cabeza flex items-center gap-3 px-5 pt-4 pb-1.5" role="row">
          <span className="font-display min-w-0 flex-1 truncate text-[17px] leading-tight text-tinta" role="rowheader">
            {prenda}
          </span>
          <span className="shrink-0 text-xs text-taupe tabular-nums">
            <NumeroQueSalta valor={unidades} /> {unidades === 1 ? "etiqueta" : "etiquetas"}
          </span>
          <button type="button" className="etq-tacho etq-tacho-chico" aria-label={`Quitar ${prenda} entera`} title="Quitar el modelo entero" onClick={(ev) => onQuitar(ev.timeStamp)}>
            <Trash2 aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Una talla de un color: lo que cambia entre las filas del modelo (cápsula, color, código, talla, precio) y cuántas imprimir. */
function FilaEtiqueta({
  e,
  texto,
  numero,
  columnaCantidad,
  saliendo,
  estilo,
  onTexto,
  onQuitar,
}: {
  e: DatosEtiqueta;
  texto: string;
  numero: number;
  columnaCantidad: string;
  saliendo: boolean;
  estilo?: CSSProperties;
  onTexto: (t: string) => void;
  onQuitar: (cuando: number) => void;
}) {
  const nombre = nombreDeFila(e);
  const cambiado = numero !== e.cantidad;
  return (
    <div className="etq-fila etq-entra fila-cayla" data-saliendo={saliendo || undefined} data-cero={numero === 0 || undefined} style={estilo}>
      <div className="etq-fila-dentro">
        {/* Con la tabla angosta (celular, o junto a la vista previa en una pantalla de 1280), dos líneas: color y talla arriba,
            precio y cantidad abajo. Lo decide el ancho de la TABLA (`@container`), no el de la ventana. */}
        <div className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-2.5 ${PLANTILLA}`} role="row">
          {/* La franja del color al borde izquierdo, la misma de Editar producto (`MatrizStockFicha`): se sigue la fila de
              lejos, y el filo interior hace visible un blanco o un crema. Va fuera de la rejilla (absoluta). */}
          <span
            aria-hidden
            className="etq-franja absolute inset-y-0 left-0 w-[5px] shadow-[inset_-1px_0_0_0_color-mix(in_srgb,var(--color-tinta)_18%,transparent)]"
            style={{ background: e.color ? (e.colorMuestra ?? VARIOS_COLORES) : "var(--color-sand)" }}
          />
          <span className="flex min-w-0 items-center gap-2.5">
            <CapsulaColor fondo={e.color ? (e.colorMuestra ?? null) : "var(--color-sand)"} />
            <span className="min-w-0">
              <span className="block truncate text-sm text-tinta" title={e.color ?? undefined}>
                {e.color ?? <span className="text-tinta/45">Sin color</span>}
              </span>
              <span className="block truncate font-mono text-[11px] text-taupe">{e.codigo}</span>
            </span>
          </span>
          <span className="min-w-0 justify-self-end @min-[37rem]:justify-self-auto @min-[37rem]:text-center">
            {e.talla ? (
              <span className="etq-talla" title={`Talla ${e.talla}`}>
                {e.talla}
              </span>
            ) : (
              <span className="text-tinta/45">—</span>
            )}
          </span>
          <span className="col-start-1 row-start-2 min-w-0 truncate whitespace-nowrap text-sm tabular-nums @min-[37rem]:col-start-auto @min-[37rem]:row-start-auto @min-[37rem]:text-center">
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
          {/* Angosta, ocupa las dos columnas de la 2.ª línea, pegada a la derecha: así no ensancha la columna de la talla y el
              color no se corta. */}
          <span className="col-span-2 col-start-1 row-start-2 flex items-center justify-self-end gap-2 @min-[37rem]:col-span-1 @min-[37rem]:col-start-auto @min-[37rem]:row-start-auto @min-[37rem]:justify-self-stretch @min-[37rem]:justify-end">
            {/* Si el número ya no es el de la tienda (o el que entró), se ofrece volver a él; el lugar está reservado siempre,
                así el paso no se corre al aparecer (ADR-0185). */}
            <button
              type="button"
              className="etq-volver-a text-[11px] text-taupe tabular-nums hover:text-tinta"
              data-visible={cambiado || undefined}
              tabIndex={cambiado ? 0 : -1}
              aria-hidden={!cambiado}
              title={`${columnaCantidad}: ${e.cantidad}. Toca para volver a ese número.`}
              onClick={() => onTexto(String(e.cantidad))}
            >
              de {e.cantidad}
            </button>
            <span className="etq-paso">
              <button type="button" aria-label={`Una etiqueta menos de ${nombre}`} disabled={numero <= 0} onClick={() => onTexto(String(numero - 1))}>
                <Minus aria-hidden />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_POR_PRENDA}
                value={texto}
                onChange={(ev) => onTexto(ev.target.value)}
                onFocus={(ev) => ev.currentTarget.select()}
                aria-label={`Etiquetas de ${nombre}`}
                className="tabular-nums"
              />
              <button type="button" aria-label={`Una etiqueta más de ${nombre}`} disabled={numero >= MAX_POR_PRENDA} onClick={() => onTexto(String(numero + 1))}>
                <Plus aria-hidden />
              </button>
            </span>
            <button type="button" className="etq-tacho" aria-label={`Quitar ${nombre}`} title="Quitar esta fila" onClick={(ev) => onQuitar(ev.timeStamp)}>
              <Trash2 aria-hidden />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Un número que, al cambiar, entra desde abajo si subió y desde arriba si bajó (`.etq-salta`): el ojo nota hacia dónde se movió. */
function NumeroQueSalta({ valor }: { valor: number }) {
  // El anterior se guarda en estado y se compara al dibujar (no en un efecto): así la dirección llega en el mismo cuadro que el número.
  const [previo, setPrevio] = useState(valor);
  const [dir, setDir] = useState<"sube" | "baja" | null>(null);
  if (valor !== previo) {
    setPrevio(valor);
    setDir(valor > previo ? "sube" : "baja");
  }
  return (
    <span key={valor} className="etq-salta" data-dir={dir ?? undefined}>
      {valor}
    </span>
  );
}

function AvisoSinCodigo({ prendas }: { prendas: string[] }) {
  return (
    <Aviso tono="atencion" titulo={prendas.length === 1 ? "Una prenda no tiene código y no se puede etiquetar" : `${prendas.length} prendas no tienen código y no se pueden etiquetar`}>
      Sin código la caja no la encontraría al escanear: {prendas.join(" · ")}.
    </Aviso>
  );
}
