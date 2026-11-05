"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, ChevronDown, Funnel, FunnelX } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Casilla } from "@/components/ui/Casilla";
import { Interruptor } from "@/components/ui/campos";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { Modal } from "@/components/ui/Modal";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { Vacio } from "@/components/ui/Vacio";
import { useDestinoFlotante } from "@/components/ui/useAnclaje";
import { useEnCelular } from "@/components/ui/useEnCelular";
import { comboNecesitaBuscador, filtrarCombo } from "@/lib/combo-reglas";
import {
  alternarOpcion,
  anchoDeMontos,
  contarOpciones,
  fechaDiaMes,
  fechaRelativa,
  filtrarFilas,
  fraseDeLoQueVes,
  hayFiltrosPuestos,
  ordenAlTocar,
  ordenarFilas,
  partesDeFiltros,
  textosDeOrden,
  tituloSinResultados,
  type ColumnaDatos,
  type DireccionOrden,
  type FiltrosVivos,
  type OrdenViva,
  type Sustantivo,
} from "@/lib/tabla-viva-reglas";

/* ====================================================================
   TablaViva · la tabla con superpoderes (ADR-0596; Felipe 2026-10-31 eligió «A · Globo desde la cabecera» mirando la maqueta
   docs/maquetas/tabla-superpoderes-2026-10/, sobre la cara «B · Placa Serena» de las tablas).

   Es una pieza NUEVA al lado de `<Tabla>`: `<Tabla>` sigue dibujando las ~75 tablas de siempre, y una pantalla pasa a esta cuando sus
   filas ya están todas en el navegador (no una que pagina en la base con `?q=`: el globo contaría solo la página). Lo que suma:
     1. Letra que cualquiera lee: el dato a 15 px, lo de debajo a 14 (el piso de lectura del ERP), la cabecera a 12,5 en tinta. Y
        «Letra grande» (17 px), que se recuerda en el aparato (`localStorage`, con try/catch: sin él, vale mientras dure la página).
     2. Todo al centro, cabecera y dato; los montos, en una caja del ancho del más largo con las cifras a la derecha.
     3. Filtrar y ordenar desde la cabecera: tocar el nombre de una columna que filtra abre el globo con las flechas de «Ordenar» (↑ ↓, sin
        texto: Felipe 2026-11-05) y «Mostrar solo» (cuántas filas tiene cada opción); una columna que solo ordena cambia su flecha al tocarla,
        sin globo. Todo se aplica al tocar, sin «Aplicar». La cabecera filtrada lleva un punto rojo. Bajo 640 px de ventana el globo es la
        hoja del celular a media altura (`<Modal mediaAltura>`, ADR-0479), con opciones de 44 px.
     4. Lo que ves, en una frase, y lo puesto en píldoras que se quitan (`<FiltroPuesto>`, `<BotonLimpiar>`).
     5. La cabecera te acompaña al bajar: pegada bajo las islas del marco, recortando lo que sube por encima (CSS guiado por el
        desplazamiento, ver app/estilos/vidrio/tabla-viva.css).
     6. La fecha dice cuánto falta («en 4 días», «hace 2 días»).
     7. Al pie, el total de lo que ves.
     8. Cuando los filtros no dejan nada, `<Vacio>` con lo puesto y cómo volver.
   Y es responsive por el ancho de la PROPIA tabla (consultas de contenedor): todas las columnas desde 1060 px; bajo 1060 se van las que
   declaran `seVa: 1060`, bajo 840 las de `seVa: 840`, y lo que se va pasa a la línea de debajo de la columna principal (`resumen`); bajo
   660 cada fila es una tarjeta y los filtros, píldoras arriba.

   El estado vive en `useTablaViva` (quien llama recibe `visibles`: lo que baja a Excel o se imprime es lo que se ve).
   ==================================================================== */

export type ColumnaViva<F> = ColumnaDatos<F> & {
  /** Lo que se dibuja en la celda. La columna `principal` recibe en `debajo` lo que se fue de las columnas escondidas y lo pone donde
   *  va su segunda línea (bajo el nombre, no bajo la foto). Sin `celda`: el texto (`texto`), la fecha con cuánto falta, o el valor. */
  celda?: (fila: F, ctx: { indice: number; debajo: ReactNode }) => ReactNode;
  /** Lo que se escribe de un monto o un número («S/ 4,280.00»): mide la caja de los montos y es la celda si no hay `celda`. */
  texto?: (fila: F) => string;
  /** Se puede filtrar («Mostrar solo»). */
  filtra?: boolean;
  /** Se puede ordenar (de fábrica, sí). */
  ordena?: boolean;
  /** Cómo se dicen los dos sentidos del orden, si los de su tipo no dicen nada («Por debajo primero»). */
  textosOrden?: { asc: string; desc: string };
  /** La pista de la rejilla (`minmax(0,1.5fr)`, `8rem`). De fábrica `minmax(0,1fr)`; un monto o un número con `texto`, de fábrica, nunca
   *  más angosto que su caja (el más largo + aire): así un monto no se sale de su columna. */
  ancho?: string;
  /** Bajo qué ancho de la tabla se va la columna (los escalones de tabla-viva.css). Sin él, se queda hasta la tarjeta. */
  seVa?: 1060 | 960 | 840 | 740;
  /** Lo que dice bajo la columna principal cuando esta columna se fue («6 artículos», «entró hace 3 días»). */
  resumen?: (fila: F) => ReactNode;
  /** La columna que nombra la fila (proveedor, modelo): recibe la línea de debajo y va primera en la tarjeta. */
  principal?: boolean;
  /** En la tarjeta, la cifra de arriba a la derecha (el total de la orden, las prendas). */
  destacadaEnTarjeta?: boolean;
  /** En la tarjeta, lo que la cifra destacada cuenta, detrás de ella («119 prendas»): sin cabecera, un número solo no dice qué es. */
  unidadEnTarjeta?: string;
  /** En la tarjeta la celda no lleva su nombre delante (un estado con su insignia ya se explica solo). */
  sinNombreEnTarjeta?: boolean;
  /** Todo va al centro; `izquierda` solo para una columna con foto (centrada, la foto saltaba de lugar en cada fila). */
  alinear?: "centro" | "izquierda";
  /** Lo que dice el pie en esta columna: la suma de lo que se ve («340»). */
  suma?: (visibles: readonly F[]) => ReactNode;
  /** Una opción del globo dibujada como en la celda (la insignia del estado). Sin ella, su texto. */
  dibujarOpcion?: (valor: string) => ReactNode;
  /** Una fecha que ya pasó y no debía (la orden que no llegó) se tiñe de ámbar: lo decide la pantalla. */
  avisaSiPaso?: (fila: F) => boolean;
  /** `title` de la cabecera: qué cuenta la columna. */
  ayuda?: string;
  /** Anclas de la guía interactiva (ADR-0389): la cabecera, y la celda de la primera fila. */
  guia?: string;
  guiaCelda?: string;
};

/** Un filtro que la pantalla pone por fuera de las columnas (la búsqueda): entra a la frase, a las píldoras y a «Limpiar todo». Con `frase` vacía, solo a las píldoras (la frase ya lo dice en su `cola`). */
export type FiltroDeAfuera = { clave: string; pildora: string; frase: string; quitar: () => void };

export type TablaVivaEstado<F> = {
  columnas: readonly ColumnaViva<F>[];
  /** Las filas que recibió (ya buscadas por la pantalla, si busca). */
  filas: readonly F[];
  /** Las que quedan con los filtros y el orden: lo que se ve, se baja y se imprime. */
  visibles: F[];
  filtros: FiltrosVivos;
  orden: OrdenViva | null;
  ordenarPor: (clave: string, dir: DireccionOrden) => void;
  alternar: (clave: string, valor: string) => void;
  quitarColumna: (clave: string) => void;
  limpiarFiltros: () => void;
};

/** El estado de una tabla viva. `ordenar` reemplaza el orden de fábrica cuando la pantalla ya tiene el suyo (desempates propios). */
export function useTablaViva<F>({
  filas,
  columnas,
  ordenInicial = null,
  ordenar,
  control,
}: {
  filas: readonly F[];
  columnas: readonly ColumnaViva<F>[];
  ordenInicial?: OrdenViva | null;
  ordenar?: (filas: readonly F[], orden: OrdenViva) => F[];
  /** Cuando filtros y orden viven afuera, porque otras piezas de la pantalla también los tocan (Rendimiento, ADR-0610). Sin esto, los guarda la tabla. */
  control?: { filtros: FiltrosVivos; orden: OrdenViva | null; onFiltros: (f: FiltrosVivos) => void; onOrden: (o: OrdenViva) => void };
}): TablaVivaEstado<F> {
  const [filtrosPropios, setFiltrosPropios] = useState<FiltrosVivos>({});
  const [ordenPropio, setOrdenPropio] = useState<OrdenViva | null>(ordenInicial);
  const filtros = control ? control.filtros : filtrosPropios;
  const orden = control ? control.orden : ordenPropio;
  const setFiltros = (cambio: (f: FiltrosVivos) => FiltrosVivos) => (control ? control.onFiltros(cambio(control.filtros)) : setFiltrosPropios(cambio));
  const setOrden = (o: OrdenViva) => (control ? control.onOrden(o) : setOrdenPropio(o));
  // Un filtro de una columna que dejó de filtrar (la pantalla la apagó: ya no hay de las dos clases) no puede seguir escondiendo filas.
  const vigentes = useMemo(() => {
    const filtrables = new Set(columnas.filter((c) => c.filtra).map((c) => c.clave));
    return Object.fromEntries(Object.entries(filtros).filter(([k]) => filtrables.has(k))) as FiltrosVivos;
  }, [filtros, columnas]);
  const visibles = useMemo(() => {
    const quedan = filtrarFilas(filas, columnas, vigentes);
    if (!orden) return quedan;
    if (ordenar) return ordenar(quedan, orden);
    return ordenarFilas(quedan, columnas.find((c) => c.clave === orden.clave), orden.dir);
  }, [filas, columnas, vigentes, orden, ordenar]);
  return {
    columnas,
    filas,
    visibles,
    filtros: vigentes,
    orden,
    ordenarPor: (clave, dir) => setOrden({ clave, dir }),
    alternar: (clave, valor) => setFiltros((f) => alternarOpcion(f, clave, valor)),
    quitarColumna: (clave) => setFiltros((f) => ({ ...f, [clave]: [] })),
    limpiarFiltros: () => setFiltros(() => ({})),
  };
}

// ---------- «Letra grande»: una preferencia del aparato, como el tema (ADR-0336) ----------
const CLAVE_LETRA = "cayla-letra-tabla";
const EVENTO_LETRA = "cayla-letra-tabla";
/** Si el navegador no deja guardar (ventana privada, datos bloqueados), la elección vale mientras dure la página. */
let letraSinGuardar: boolean | null = null;
function leerLetraGrande(): boolean {
  if (letraSinGuardar !== null) return letraSinGuardar;
  try {
    return window.localStorage.getItem(CLAVE_LETRA) === "grande";
  } catch {
    return false;
  }
}
function suscribirLetra(avisar: () => void) {
  window.addEventListener(EVENTO_LETRA, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_LETRA, avisar);
    window.removeEventListener("storage", avisar);
  };
}
function ponerLetraGrande(grande: boolean) {
  try {
    window.localStorage.setItem(CLAVE_LETRA, grande ? "grande" : "normal");
    letraSinGuardar = null;
  } catch {
    letraSinGuardar = grande;
  }
  window.dispatchEvent(new Event(EVENTO_LETRA));
}

type Globo = { tipo: "columna"; clave: string } | { tipo: "orden" };

export function TablaViva<F>({
  tabla,
  clave,
  etiqueta,
  sustantivo,
  hoy,
  total,
  cola,
  suma,
  deAfuera = [],
  href,
  onAbrir,
  abierta,
  debajoDeFila,
  guia,
  guiaFrase,
  guiaFila,
  guiaPie,
}: {
  tabla: TablaVivaEstado<F>;
  /** La clave de React de cada fila. */
  clave: (fila: F) => string;
  /** El nombre de la tabla para el lector de pantalla («Modelos que entraron»). */
  etiqueta: string;
  sustantivo: Sustantivo;
  /** El día de Lima (ISO): con él, una fecha dice cuánto falta. */
  hoy?: string;
  /** Cuántas hay en total, si la pantalla ya buscó antes de dar las filas («Ves 2 de 14»). De fábrica, las filas que recibió. */
  total?: number;
  /** Lo que va pegado a lo que se cuenta en la frase («que entraron en los últimos 7 días»). */
  cola?: string;
  /** La suma de la frase, ya dicha («340 prendas»). */
  suma?: (visibles: readonly F[]) => string | null;
  deAfuera?: readonly FiltroDeAfuera[];
  /** La fila lleva a su detalle: un enlace… */
  href?: (fila: F) => string;
  /** …o se abre en su lugar (o en un cajón). La celda principal lleva un `<button>` para el teclado: su clic sube a la fila. */
  onAbrir?: (fila: F) => void;
  /** La fila abierta (su detalle o su cajón a la vista): queda marcada, con el hilo rojo de canto. */
  abierta?: (fila: F) => boolean;
  /** Lo que se abre bajo una fila (los colores y tallas de un modelo). `null`: nada. */
  debajoDeFila?: (fila: F, indice: number) => ReactNode;
  guia?: string;
  guiaFrase?: string;
  guiaFila?: string;
  guiaPie?: string;
}) {
  const { columnas, filas, visibles, filtros, orden } = tabla;
  const letraGrande = useSyncExternalStore(suscribirLetra, leerLetraGrande, () => false);
  const [globo, setGlobo] = useState<Globo | null>(null);
  const ancla = useRef<HTMLElement | null>(null);
  const tablaRef = useRef<HTMLDivElement>(null);
  const cabezaRef = useRef<HTMLDivElement>(null);

  const hayDeColumnas = hayFiltrosPuestos(filtros);
  const hayAlgo = hayDeColumnas || deAfuera.length > 0;
  const partes = [...deAfuera.map((d) => d.frase).filter(Boolean), ...partesDeFiltros(columnas, filtros, visibles.length)];
  const frase = fraseDeLoQueVes({ visibles: visibles.length, total: total ?? filas.length, sustantivo, partes, suma: visibles.length ? suma?.(visibles) : null, cola });

  // La caja de los montos mide lo del más largo de TODAS las filas: filtrar no hace saltar la columna.
  const anchoMonto = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of columnas) if ((c.tipo === "monto" || c.tipo === "numero") && c.texto) m.set(c.clave, anchoDeMontos(filas.map((f) => c.texto!(f))));
    return m;
  }, [columnas, filas]);
  // La pista de la rejilla en cada escalón: en cada uno se quedan las que no declaran `seVa` y las que se van más abajo. El ancho de una
  // cifra (`--tv-cifra`) se mide en la tabla con su letra (15 o 17 px): la columna crece con «Letra grande» igual que su caja.
  const pista = (c: ColumnaViva<F>) => {
    if (c.ancho) return c.ancho;
    const w = anchoMonto.get(c.clave);
    // Fija: lo de la caja más su aire, y nunca menos que lo que pide su nombre en la cabecera («PRENDAS ↓»). Lo que sobra va a las
    // columnas de texto, que son las que cortan.
    return w ? `max(calc(${w} * var(--tv-cifra) + 1.5rem), 7.5rem)` : "minmax(0,1fr)";
  };
  const pistasBajo = (escalon: number) =>
    columnas
      .filter((c) => !c.seVa || c.seVa < escalon)
      .map(pista)
      .join(" ");
  const estiloTabla = {
    "--tv-cols-todas": columnas.map(pista).join(" "),
    "--tv-cols-1060": pistasBajo(1060),
    "--tv-cols-960": pistasBajo(960),
    "--tv-cols-840": pistasBajo(840),
    "--tv-cols-740": pistasBajo(740),
  } as CSSProperties;
  // Dónde se pega la cabecera y dónde termina: se mide al pintar, al cambiar el ancho o la letra (UNA vez, no en cada desplazamiento).
  // El recorte de lo que sube lo hace el navegador en el mismo cuadro en que mueve la lista (tabla-viva.css).
  useLayoutEffect(() => {
    const t = tablaRef.current;
    const c = cabezaRef.current;
    if (!t || !c) return;
    const medir = () => {
      const cs = getComputedStyle(c);
      const activa = c.offsetHeight > 0 && cs.position === "sticky";
      const tope = activa ? parseFloat(cs.top) || 0 : 0;
      t.style.setProperty("--tv-corte-fondo", activa ? `${tope}px` : "-100000px");
      t.style.setProperty("--tv-corte", activa ? `${tope + c.offsetHeight}px` : "-100000px");
      t.style.setProperty("--tv-alto-cabeza", activa ? `${c.offsetHeight}px` : "0px");
      t.toggleAttribute("data-cabeza-propia", activa);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    ro.observe(t);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  function abrirGlobo(g: Globo, el: HTMLElement) {
    const mismo = globo && g.tipo === globo.tipo && (g.tipo === "orden" || (globo.tipo === "columna" && globo.clave === g.clave));
    ancla.current = el;
    setGlobo(mismo ? null : g);
  }
  function cerrarGlobo(devolverFoco: boolean) {
    setGlobo(null);
    if (devolverFoco) ancla.current?.focus();
  }
  function limpiarTodo() {
    tabla.limpiarFiltros();
    for (const d of deAfuera) d.quitar();
  }

  const pildoras = [
    ...deAfuera.map((d) => ({ clave: `afuera-${d.clave}`, texto: d.pildora, quitar: d.quitar })),
    ...columnas.flatMap((c) =>
      (filtros[c.clave] ?? []).map((v) => ({ clave: `${c.clave}-${v}`, texto: `${c.titulo}: ${v}`, quitar: () => tabla.alternar(c.clave, v) })),
    ),
  ];
  const textoLimpiar = deAfuera.length > 0 ? "Limpiar todo" : "Limpiar filtros";
  const conOrden = columnas.filter((c) => c.ordena !== false);
  const columnaOrdenada = orden ? columnas.find((c) => c.clave === orden.clave) : undefined;

  function clicEnFila(e: MouseEvent<HTMLDivElement>, f: F) {
    // Un modal abierto desde la fila le entrega sus clics por React (ADR-0128): solo cuenta el que nació en la fila.
    if (!e.currentTarget.contains(e.target as Node)) return;
    onAbrir?.(f);
  }

  function celdas(f: F, i: number) {
    const debajo = columnas
      .filter((c) => c.seVa && c.resumen)
      .map((c) => (
        <span key={c.clave} className={`tv-en-${c.seVa}`}>
          {c.resumen!(f)}
        </span>
      ));
    const nodoDebajo = debajo.length ? <span className="tv-debajo">{debajo}</span> : null;
    return columnas.map((c) => {
      const clases = [
        "tv-celda",
        c.seVa ? `tv-se-va-${c.seVa}` : "",
        c.principal ? "tv-principal" : "",
        c.destacadaEnTarjeta ? "tv-destacada" : "",
        c.alinear === "izquierda" ? "tv-izq" : "",
      ].join(" ");
      return (
        <div key={c.clave} role="cell" className={clases} data-guia={i === 0 ? c.guiaCelda : undefined}>
          {!c.principal && !c.destacadaEnTarjeta && !c.sinNombreEnTarjeta && <span className="tv-etq">{c.titulo}</span>}
          {contenidoDeCelda(c, f, i, nodoDebajo)}
          {c.destacadaEnTarjeta && c.unidadEnTarjeta && <span className="tv-unidad"> {c.unidadEnTarjeta}</span>}
        </div>
      );
    });
  }

  function contenidoDeCelda(c: ColumnaViva<F>, f: F, i: number, debajo: ReactNode): ReactNode {
    const propio = c.celda ? c.celda(f, { indice: i, debajo: c.principal ? debajo : null }) : null;
    if (c.tipo === "monto" || c.tipo === "numero") {
      const w = anchoMonto.get(c.clave);
      return (
        <span className="tv-monto" style={w ? { minWidth: `calc(${w} * var(--tv-cifra))` } : undefined}>
          {propio ?? c.texto?.(f) ?? c.valor(f) ?? "—"}
        </span>
      );
    }
    if (propio !== null) return propio;
    if (c.tipo === "fecha" && hoy) {
      const v = c.valor(f);
      if (typeof v !== "string") return "—";
      const r = fechaRelativa(v, hoy);
      return (
        <>
          <span className="tv-dato">{fechaDiaMes(v, hoy)}</span>
          <span className="tv-sub" data-paso={(c.avisaSiPaso?.(f) && r.pasada) || undefined}>
            {r.texto}
          </span>
        </>
      );
    }
    return c.texto?.(f) ?? c.valor(f) ?? "—";
  }

  return (
    <div className="tv-zona">
      <div className="tv-barra">
        <p className="tv-frase" aria-live="polite" data-guia={guiaFrase}>
          {frase.map((p, k) => (p.fuerte ? <b key={k}>{p.texto}</b> : <Fragment key={k}>{p.texto}</Fragment>))}
        </p>
        <div className="tv-letra">
          <Interruptor activo={letraGrande} onActivo={ponerLetraGrande} etiqueta="Letra grande" />
        </div>
        {pildoras.length > 0 && (
          <div className="tv-puestos">
            {pildoras.map((p) => (
              <FiltroPuesto key={p.clave} onQuitar={p.quitar} etiqueta={`Quitar ${p.texto}`}>
                {p.texto}
              </FiltroPuesto>
            ))}
            {pildoras.length > 1 && <BotonLimpiar onClick={limpiarTodo}>{textoLimpiar}</BotonLimpiar>}
          </div>
        )}
      </div>

      {/* En la tarjeta (bajo 660 px de tabla) la cabecera no cabe: sus globos se abren desde estas píldoras. */}
      <div className="tv-filtros-m">
        {conOrden.length > 0 && (
          <button
            type="button"
            className="pildora-cayla tv-pildora-m"
            aria-haspopup="dialog"
            aria-expanded={globo?.tipo === "orden"}
            aria-label={columnaOrdenada && orden ? `Ordenar. Ahora: ${columnaOrdenada.titulo}, ${(columnaOrdenada.textosOrden ?? textosDeOrden(columnaOrdenada.tipo))[orden.dir]}` : "Ordenar"}
            onClick={(e) => abrirGlobo({ tipo: "orden" }, e.currentTarget)}
          >
            {columnaOrdenada && orden ? (
              <>
                {columnaOrdenada.titulo}
                <ArrowDown aria-hidden className="tv-flecha-puesta h-3.5 w-3.5" data-dir={orden.dir} />
              </>
            ) : (
              <>
                <ArrowDownUp aria-hidden className="h-3.5 w-3.5" />
                Ordenar
              </>
            )}
          </button>
        )}
        {columnas
          .filter((c) => c.filtra)
          .map((c) => {
            const puestas = filtros[c.clave] ?? [];
            return (
              <button
                key={c.clave}
                type="button"
                className="pildora-cayla tv-pildora-m"
                aria-pressed={puestas.length > 0}
                aria-haspopup="dialog"
                aria-expanded={globo?.tipo === "columna" && globo.clave === c.clave}
                onClick={(e) => abrirGlobo({ tipo: "columna", clave: c.clave }, e.currentTarget)}
              >
                {c.titulo}
                {puestas.length === 1 ? `: ${puestas[0]}` : puestas.length > 1 ? `: ${puestas.length}` : ""}
                <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              </button>
            );
          })}
      </div>

      <div ref={tablaRef} className="tv-tabla" role="table" aria-label={etiqueta} data-guia={guia} data-letra={letraGrande ? "grande" : undefined} style={estiloTabla}>
        <div className="tv-fondo" aria-hidden />
        <div ref={cabezaRef} className="tv-cabeza" role="rowgroup">
          <div className="tv-enc" role="row">
            {columnas.map((c) => {
              const ordenada = orden?.clave === c.clave ? orden.dir : undefined;
              const puestas = (filtros[c.clave] ?? []).length;
              const tocable = c.filtra || c.ordena !== false;
              // Con «Mostrar solo», el nombre abre el globo. Si solo ordena no hay nada que elegir: la flecha cambia al tocar, sin globo.
              const siguiente = ordenAlTocar(c, orden);
              const textos = c.textosOrden ?? textosDeOrden(c.tipo);
              const clases = ["tv-celda", c.seVa ? `tv-se-va-${c.seVa}` : "", c.alinear === "izquierda" ? "tv-izq" : ""].join(" ");
              return (
                <div
                  key={c.clave}
                  role="columnheader"
                  className={clases}
                  title={c.ayuda}
                  aria-sort={ordenada ? (ordenada === "asc" ? "ascending" : "descending") : undefined}
                  data-guia={c.guia}
                >
                  {tocable ? (
                    <button
                      type="button"
                      className="tv-col"
                      aria-haspopup={c.filtra ? "dialog" : undefined}
                      aria-expanded={c.filtra ? globo?.tipo === "columna" && globo.clave === c.clave : undefined}
                      aria-label={
                        c.filtra
                          ? `${c.titulo}: ${c.ordena !== false ? "ordenar y filtrar" : "filtrar"}${puestas ? `, ${puestas} ${puestas === 1 ? "filtro puesto" : "filtros puestos"}` : ""}`
                          : `${c.titulo}: ordenar, ${textos[siguiente.dir]}`
                      }
                      title={c.filtra ? undefined : [c.ayuda, `Ordenar: ${textos[siguiente.dir]}.`].filter(Boolean).join(" ")}
                      data-ordenada={ordenada}
                      data-filtrada={puestas > 0 || undefined}
                      onClick={(e) => (c.filtra ? abrirGlobo({ tipo: "columna", clave: c.clave }, e.currentTarget) : tabla.ordenarPor(siguiente.clave, siguiente.dir))}
                    >
                      <span className="tv-col-nombre">{c.titulo}</span>
                      {c.filtra && <Funnel aria-hidden className="tv-col-embudo" />}
                      {ordenada ? <ArrowDown aria-hidden className="tv-col-flecha" /> : !c.filtra && <ArrowUpDown aria-hidden className="tv-col-flecha" />}
                      <span aria-hidden className="tv-col-punto" />
                    </button>
                  ) : (
                    <span className="tv-col tv-col-quieta">{c.titulo}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="tv-vacio">
            <Vacio
              icono={<FunnelX />}
              titulo={tituloSinResultados(sustantivo)}
              filtros={pildoras.map((p) => ({ texto: p.texto, onQuitar: p.quitar }))}
              acciones={hayAlgo ? <BotonLimpiar onClick={limpiarTodo}>{textoLimpiar}</BotonLimpiar> : undefined}
            >
              Quita alguno de los filtros, o todos de una vez.
            </Vacio>
          </div>
        ) : (
          visibles.map((f, i) => {
            const abiertaYa = abierta?.(f) ?? false;
            const comun = {
              role: "row",
              "data-fila": clave(f),
              "data-guia": i === 0 ? guiaFila : undefined,
              "aria-current": abiertaYa ? ("true" as const) : undefined,
            };
            const debajo = debajoDeFila?.(f, i);
            return (
              <Fragment key={clave(f)}>
                {href ? (
                  <Link href={href(f)} {...comun} className="fila-cayla tv-fila">
                    {celdas(f, i)}
                  </Link>
                ) : (
                  <div {...comun} className={`fila-cayla tv-fila ${onAbrir ? "cursor-pointer" : ""}`} onClick={onAbrir ? (e) => clicEnFila(e, f) : undefined}>
                    {celdas(f, i)}
                  </div>
                )}
                {debajo ? <div className="tv-detalle">{debajo}</div> : null}
              </Fragment>
            );
          })
        )}

        {visibles.length > 0 && columnas.some((c) => c.suma) && (
          <div className="tv-pie" role="row" data-guia={guiaPie}>
            {columnas.map((c) => {
              const clases = ["tv-celda", c.seVa ? `tv-se-va-${c.seVa}` : "", c.principal ? "tv-principal" : "", c.alinear === "izquierda" ? "tv-izq" : ""].join(" ");
              if (c.principal)
                return (
                  <div key={c.clave} role="cell" className={clases}>
                    {hayAlgo ? "Total de lo que ves" : "Total"}
                  </div>
                );
              const w = anchoMonto.get(c.clave);
              return (
                <div key={c.clave} role="cell" className={`${clases} ${c.suma ? "tv-con-suma" : ""}`}>
                  {c.suma && (
                    <span className="tv-monto" style={w ? { minWidth: `calc(${w} * var(--tv-cifra))` } : undefined}>
                      {c.suma(visibles)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {globo && (
        <GloboDeLaTabla
          globo={globo}
          tabla={tabla}
          ancla={ancla}
          onCerrar={cerrarGlobo}
        />
      )}
    </div>
  );
}

/** El globo: flota bajo la cabecera que se tocó; en el celular, la hoja a media altura. Se aplica al tocar, sin «Aplicar». */
function GloboDeLaTabla<F>({ globo, tabla, ancla, onCerrar }: { globo: Globo; tabla: TablaVivaEstado<F>; ancla: RefObject<HTMLElement | null>; onCerrar: (devolverFoco: boolean) => void }) {
  const enCelular = useEnCelular();
  const columna = globo.tipo === "columna" ? tabla.columnas.find((c) => c.clave === globo.clave) : undefined;
  const titulo = columna ? columna.titulo : "Ordenar";
  if (enCelular)
    return (
      <Modal titulo={titulo} subtitulo={columna?.filtra ? "Ordena o elige qué mostrar. Se aplica al tocar." : "Elige cómo se ordena la lista."} onClose={() => onCerrar(false)} alCerrarEnfocar={ancla} mediaAltura conCerrar>
        <div className="tv-globo-cuerpo" data-en-hoja>
          <ContenidoGlobo globo={globo} tabla={tabla} />
        </div>
      </Modal>
    );
  return <GloboFlotante titulo={titulo} ancla={ancla} onCerrar={onCerrar} globo={globo} tabla={tabla} />;
}

function GloboFlotante<F>({ titulo, ancla, onCerrar, globo, tabla }: { titulo: string; ancla: RefObject<HTMLElement | null>; onCerrar: (devolverFoco: boolean) => void; globo: Globo; tabla: TablaVivaEstado<F> }) {
  const caja = useRef<HTMLDivElement>(null);
  const destino = useDestinoFlotante(ancla, true);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  // El cierre va por una referencia: con él en las dependencias, cada marca re-enfocaba el globo y le quitaba el foco a la casilla que se
  // acababa de tocar.
  const cerrar = useRef(onCerrar);
  useLayoutEffect(() => {
    cerrar.current = onCerrar;
  });

  // Sigue a su cabecera cuadro a cuadro (la cabecera se pega y se mueve al desplazar): como `usePosicionLista`, pero centrado bajo el
  // nombre y con su propio ancho. Si abajo no cabe, se abre hacia arriba.
  useLayoutEffect(() => {
    let previa = "";
    let cuadro = 0;
    const seguir = () => {
      const el = ancla.current;
      const g = caja.current;
      // La cabecera o la píldora que lo abrió dejó de verse (la tabla pasó a tarjetas, o volvió): el globo se cierra, no queda flotando
      // en una esquina.
      if (!el || !el.isConnected || el.getClientRects().length === 0) {
        cerrar.current(false);
        return;
      }
      const r = el.getBoundingClientRect();
      const w = g?.offsetWidth ?? 300;
      const left = Math.round(Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8));
      const abajo = window.innerHeight - r.bottom - 16;
      const arriba = r.top - 16;
      const nueva = abajo >= Math.min(320, arriba) ? { left, top: Math.round(r.bottom + 8), maxHeight: Math.max(160, abajo) } : { left, bottom: Math.round(window.innerHeight - r.top + 8), maxHeight: arriba };
      const k = JSON.stringify(nueva);
      if (k !== previa) {
        previa = k;
        setPos(nueva);
      }
      cuadro = requestAnimationFrame(seguir);
    };
    seguir();
    return () => cancelAnimationFrame(cuadro);
  }, [ancla]);

  // Al abrir, el foco entra al globo (Tab recorre sus opciones); tocar afuera lo cierra sin mover el foco.
  useEffect(() => {
    caja.current?.focus({ preventScroll: true });
    const afuera = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (caja.current?.contains(t) || ancla.current?.contains(t)) return;
      cerrar.current(false);
    };
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, [ancla, destino]);

  function alTeclado(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    // El Escape es del globo: una hoja de atrás no se cierra con él (ADR-0136, «Escape dentro de una hoja»).
    e.preventDefault();
    e.stopPropagation();
    cerrar.current(true);
  }

  if (!destino) return null;
  return createPortal(
    <div
      ref={caja}
      role="dialog"
      aria-label={`${titulo}: ordenar${globo.tipo === "columna" && tabla.columnas.find((c) => c.clave === globo.clave)?.filtra ? " y filtrar" : ""}`}
      tabIndex={-1}
      onKeyDown={alTeclado}
      className="tv-globo"
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: pos?.maxHeight, visibility: pos ? undefined : "hidden" }}
    >
      <ContenidoGlobo globo={globo} tabla={tabla} />
    </div>,
    destino,
  );
}

/** Las dos flechas de ordenar: ↑ de menor a mayor, ↓ de mayor a menor (la misma de la cabecera). Lo que significa en esta columna lo dicen `title` y el lector de pantalla. */
function FlechasDeOrden<F>({ columna, tabla }: { columna: ColumnaViva<F>; tabla: TablaVivaEstado<F> }) {
  const textos = columna.textosOrden ?? textosDeOrden(columna.tipo);
  return (
    <SegmentoDeslizante
      forma="modo"
      etiqueta={`Ordenar por ${columna.titulo.toLowerCase()}`}
      valor={tabla.orden?.clave === columna.clave ? tabla.orden.dir : ""}
      onCambio={(d) => tabla.ordenarPor(columna.clave, d as DireccionOrden)}
      opciones={[
        { clave: "asc", icono: <ArrowUp aria-hidden />, etiqueta: <span className="sr-only">{textos.asc}</span>, ayuda: textos.asc },
        { clave: "desc", icono: <ArrowDown aria-hidden />, etiqueta: <span className="sr-only">{textos.desc}</span>, ayuda: textos.desc },
      ]}
      className="tv-flechas"
    />
  );
}

function ContenidoGlobo<F>({ globo, tabla }: { globo: Globo; tabla: TablaVivaEstado<F> }) {
  if (globo.tipo === "orden") return <ElegirOrden tabla={tabla} />;
  const c = tabla.columnas.find((x) => x.clave === globo.clave);
  if (!c) return null;
  return (
    <>
      {c.ordena !== false && (
        <div className="tv-globo-orden">
          <p className="tv-globo-titulo">Ordenar</p>
          <FlechasDeOrden columna={c} tabla={tabla} />
        </div>
      )}
      {c.filtra && <MostrarSolo columna={c} tabla={tabla} />}
    </>
  );
}

function MostrarSolo<F>({ columna, tabla }: { columna: ColumnaViva<F>; tabla: TablaVivaEstado<F> }) {
  const [busqueda, setBusqueda] = useState("");
  const opciones = contarOpciones(tabla.filas, columna, tabla.columnas, tabla.filtros);
  const conBuscador = comboNecesitaBuscador(opciones.length);
  // La misma búsqueda de todo combo (ADR-0209): junta espacios, separa letras de números y tolera el orden de las palabras.
  const mostradas = filtrarCombo(opciones, busqueda, (o) => ({ texto: o.valor }));
  const puestas = (tabla.filtros[columna.clave] ?? []).length;
  return (
    <>
      <p className="tv-globo-titulo">Mostrar solo</p>
      {conBuscador && (
        <Buscador valor={busqueda} onCambio={setBusqueda} etiqueta={`Buscar en ${columna.titulo.toLowerCase()}`} placeholder={`Busca en ${columna.titulo.toLowerCase()}`} className="tv-globo-buscar" />
      )}
      <div className="tv-globo-opciones" role="group" aria-label={columna.titulo}>
        {mostradas.map((o) => {
          const apagada = o.n === 0 && !o.elegida;
          return (
            <label key={o.valor} className="tv-op" data-apagada={apagada || undefined} data-elegida={o.elegida || undefined}>
              <Casilla marcada={o.elegida} onCambio={() => tabla.alternar(columna.clave, o.valor)} etiqueta={`${o.valor}: ${o.n}`} disabled={apagada} />
              <span className="tv-op-texto">{columna.dibujarOpcion ? columna.dibujarOpcion(o.valor) : o.valor}</span>
              <span className="tv-op-cuenta">{o.n.toLocaleString("es-PE")}</span>
            </label>
          );
        })}
        {mostradas.length === 0 && <Vacio tamano="chico" alinear="izquierda" icono={<FunnelX />}>Nada coincide con «{busqueda.trim()}».</Vacio>}
      </div>
      {puestas > 0 && (
        <div className="tv-globo-pie">
          <span>
            {puestas} {puestas === 1 ? "elegida" : "elegidas"}
          </span>
          <button type="button" className="btn-cayla btn-enlace" onClick={() => tabla.quitarColumna(columna.clave)}>
            Quitar este filtro
          </button>
        </div>
      )}
    </>
  );
}

/** En la tarjeta no hay cabeceras: una sola hoja con todas las columnas que ordenan, cada una con sus dos flechas. */
function ElegirOrden<F>({ tabla }: { tabla: TablaVivaEstado<F> }) {
  return (
    <div className="tv-orden-lista" role="group" aria-label="Ordenar por">
      {tabla.columnas
        .filter((c) => c.ordena !== false)
        .map((c) => (
          <div key={c.clave} className="tv-orden-fila" data-elegida={tabla.orden?.clave === c.clave || undefined}>
            <span className="tv-op-texto">{c.titulo}</span>
            <FlechasDeOrden columna={c} tabla={tabla} />
          </div>
        ))}
    </div>
  );
}
