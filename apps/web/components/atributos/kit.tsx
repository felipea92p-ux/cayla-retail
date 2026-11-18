"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { FunnelX, Plus, Shapes } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Boton } from "@/components/ui/campos";
import { Buscador as BuscadorUnico } from "@/components/ui/Buscador";
import { BotonFiltros } from "@/components/ui/FiltrosPildora";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { paginar } from "@/lib/paginacion";
import { prefiereQuieto } from "@/lib/movimiento-cliente";
import { Vacio } from "@/components/ui/Vacio";

/**
 * Las piezas que comparten las seis pestañas de Catálogo ▸ Atributos (ADR-0261, Felipe 2026-09-28: «todo este módulo
 * debe tener la misma similitud»). Cada pestaña conserva su propia lógica —Colores tiene hex y Pantone, Tallas exige
 * comentario al aprobar, Etiquetas lleva campañas—, pero se VE igual: la misma barra arriba (píldoras de grupo a la
 * izquierda; buscador y «+ Agregar» a la derecha), el mismo título de grupo con su punto y la misma tarjeta (muestra 3:1
 * arriba, nombre de 15 px, una o dos líneas chicas, acciones al pie).
 *
 * Antes cada pestaña copiaba su barra y su tarjeta a mano, y en dos semanas ya había tres versiones: con sombra y sin
 * ella, título de grupo con punto y sin él, buscador de 56 y de 72. Una pestaña nueva se arma con estas piezas y no
 * vuelve a abrir esa grieta.
 */

/** Cinco tarjetas por fila en escritorio, dos en el celular: la misma medida en las seis pestañas, así la muestra no crece
 *  ni se corre al cambiar de una a otra. Las columnas las decide el ANCHO DE LA GRILLA, no el de la ventana: con el lateral
 *  fijo de 272 px, una tablet de 768 deja 436 px y la regla de ventana (`md:grid-cols-4`) daba tarjetas de 100 px, más
 *  angostas que en el celular, que recortaban «Aprobar / Rechazar». Cada tarjeta mide al menos 140 px y, como mucho, caben
 *  cinco (el quinto de lo que queda, con 60 px de holgura para los cuatro huecos de 12 px): 308 px → 2, 436 → 2, 692 → 4,
 *  968 o más → 5. */
export const GRILLA_ATRIBUTOS = "grid gap-3 grid-cols-[repeat(auto-fill,minmax(max(140px,calc((100%_-_60px)/5)),1fr))]";

type Busqueda = {
  valor: string;
  onValor: (valor: string) => void;
  /** Para lectores de pantalla: «Buscar talla». */
  etiqueta: string;
  /** Lo que se puede escribir, cuando no es solo el nombre («Buscar color o código»). */
  placeholder?: string;
};

/**
 * La barra de arriba de cada pestaña. `busqueda` y `agregar` son opcionales: Temporadas (nueve fijas, no se proponen) no
 * lleva ninguno de los dos, y la barra sigue en el mismo lugar con sus píldoras.
 *
 * En el celular (Felipe 2026-11-17) la barra es UNA fila: el buscador con todo el ancho que queda, el ícono de filtros y el «+».
 * Las píldoras de grupo no ocupan lugar hasta que se piden: con ocho familias eran cinco renglones antes de la primera tarjeta, y
 * «+ Agregar categoría» dejaba el buscador en «Categoría o p». Tocar el ícono las muestra bajo la fila y elegir una las vuelve a
 * guardar; el punto del ícono dice que hay un filtro puesto. Desde `sm` todo sigue como siempre: píldoras a la vista y el botón con su texto.
 */
export function BarraAtributos({
  etiqueta,
  filtros,
  filtrosPuestos = 0,
  busqueda,
  agregar,
  guia,
}: {
  /** El nombre del grupo de píldoras: «Filtrar tallas». */
  etiqueta: string;
  /** Las píldoras (`BotonFiltro`), empezando por «Todas». */
  filtros: ReactNode;
  /** Cuántos filtros hay puestos (0 = «Todas»): en el celular, con las píldoras guardadas, lo dice el punto del ícono. */
  filtrosPuestos?: number;
  busqueda?: Busqueda;
  agregar?: { texto: string; onClick: () => void };
  /** Ancla de la guía interactiva para la barra entera (`data-guia`, ADR-0389). Una por pestaña: al cambiar de pestaña, la
   *  guía tiene que encontrar la barra NUEVA, no la de la pestaña que se está yendo. */
  guia?: string;
}) {
  // Solo cuenta en el celular: desde `sm` las píldoras están siempre a la vista.
  const [abiertos, setAbiertos] = useState(false);
  // Sin buscador ni «+» (Temporadas) no hay a quién hacerle lugar: las píldoras se quedan a la vista también en el celular.
  const seGuardan = Boolean(busqueda || agregar);
  // «+ Agregar categoría»: en el celular queda el «+» solo; el nombre entero sigue para el lector de pantalla y al pasar el mouse.
  const nombreAgregar = agregar?.texto.replace(/^\s*\+\s*/, "");
  return (
    <div data-guia={guia} className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div
        id="filtros-panel"
        role="group"
        aria-label={etiqueta}
        data-guia="vocabulario.filtros"
        // Elegir una píldora las vuelve a guardar (en el celular): lo elegido se ve en la lista y en el punto del ícono.
        onClick={(e) => {
          if ((e.target as Element).closest("button")) setAbiertos(false);
        }}
        className={`flex flex-wrap items-center gap-1.5 ${seGuardan ? `max-sm:order-2 max-sm:w-full ${abiertos ? "anim-revelar" : "max-sm:hidden"}` : ""}`}
      >
        {filtros}
      </div>
      {seGuardan && (
      <div className="ml-auto flex w-full max-w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
        {busqueda && <Buscador {...busqueda} />}
        <span className="shrink-0 sm:hidden">
          {/* La misma ancla que las píldoras: la guía señala la primera pieza que se VE (`buscarAncla`), y en el celular es este ícono. */}
          <BotonFiltros soloIcono abierto={abiertos} activos={filtrosPuestos} onClick={() => setAbiertos((a) => !a)} data-guia="vocabulario.filtros" />
        </span>
        {agregar && (
          <>
            <Boton type="button" peso="primario" onClick={agregar.onClick} className="shrink-0 max-sm:hidden" data-guia="vocabulario.agregar">
              {agregar.texto}
            </Boton>
            {/* El mismo botón, solo con su «+», con la misma ancla de la guía (señala el que se ve).
                `p-0!`: el relleno de `btn-cayla` vive fuera de capa (vidrio) y le gana a una utilidad sin «!». */}
            <Boton type="button" peso="primario" onClick={agregar.onClick} aria-label={nombreAgregar} title={nombreAgregar} data-guia="vocabulario.agregar" className="h-10 w-10 shrink-0 p-0! pointer-coarse:h-11 pointer-coarse:w-11 sm:hidden">
              <Plus aria-hidden className="h-4 w-4" />
            </Boton>
          </>
        )}
      </div>
      )}
    </div>
  );
}

/** El buscador de la barra: la pieza única (`components/ui/Buscador`, ADR-0358 ronda 5), filtra mientras se escribe y «/» lo enfoca. */
function Buscador({ valor, onValor, etiqueta, placeholder = "Buscar" }: Busqueda) {
  return (
    <BuscadorUnico
      guia="vocabulario.buscador"
      valor={valor}
      onCambio={(v) => onValor(v)}
      placeholder={placeholder}
      etiqueta={etiqueta}
      atajo
      className="min-w-0 flex-1 sm:w-64 sm:flex-none"
    />
  );
}

/** «● ROTACIÓN 4»: el título de cada grupo de tarjetas, con cuántas hay en el globito. Sin `punto`, el de «Desactivadas». */
export function TituloGrupo({ punto, cuenta, children }: { punto?: string; cuenta: number; children: ReactNode }) {
  return (
    <p className="label-cayla flex items-center gap-1.5 text-[11px] text-tinta/65">
      {punto && <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${punto}`} />}
      {children}
      {/* Cuántos hay: el globito de los títulos y las pestañas (ADR-0358, ronda 9). */}
      <span className="titulo-cuenta ml-0.5">{cuenta.toLocaleString("es-PE")}</span>
    </p>
  );
}

/** Lo desactivado va de 8 en 8 (Felipe 2026-11-17): es lo que menos se mira y, entero, alargaba la pantalla sin fin. */
const DESACTIVADOS_POR_PAGINA = 8;

/**
 * El grupo de lo desactivado, al pie de cada pestaña: su título con cuántos hay y, si pasan de ocho, sus páginas. La lista ya está
 * entera en memoria (`PaginacionLocal`): cambiar de página no va a la base. Si la búsqueda la achica, cae sola en la última página
 * que exista. Sin nada que mostrar, no se dibuja.
 */
export function GrupoDesactivado<T>({
  titulo,
  lista,
  guia,
  children,
}: {
  titulo: ReactNode;
  lista: T[];
  /** Ancla de la guía interactiva (`data-guia`, ADR-0389). */
  guia?: string;
  /** Dibuja SOLO los de la página a la vista. */
  children: (visibles: T[]) => ReactNode;
}) {
  const [pagina, setPagina] = useState(1);
  const seccion = useRef<HTMLElement>(null);
  const salto = useRef(false);
  // Cambiar de página lleva la vista al título del grupo si quedó arriba (ADR-0185): una paginación al pie no se queda abajo.
  useEffect(() => {
    if (!salto.current) return;
    salto.current = false;
    const el = seccion.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: prefiereQuieto() ? "auto" : "smooth", block: "start" });
  }, [pagina]);
  if (lista.length === 0) return null;
  const p = paginar(lista, pagina, DESACTIVADOS_POR_PAGINA);
  return (
    <section ref={seccion} data-guia={guia} className="scroll-mt-24 space-y-3">
      <TituloGrupo cuenta={lista.length}>{titulo}</TituloGrupo>
      {children(p.filas)}
      {p.totalPaginas > 1 && (
        <div className="flex justify-end">
          <PaginacionLocal
            pagina={p.pagina}
            totalPaginas={p.totalPaginas}
            onPagina={(n) => {
              salto.current = true;
              setPagina(n);
            }}
          />
        </div>
      )}
    </section>
  );
}

/** Cuando los filtros o la búsqueda no dejan nada: lo dice y ofrece volver a verlo todo. */
export function SinCoincidencias({ children, onQuitar }: { children: ReactNode; onQuitar: () => void }) {
  // La pieza única del vacío (ADR-0358 ronda 5): los filtros o la búsqueda dejaron cero, y la acción que lo deshace va ahí mismo.
  return (
    <div className="card-cayla">
      <Vacio
        icono={<FunnelX />}
        titulo={children}
        acciones={
          <Boton type="button" peso="fantasma" onClick={onQuitar}>
            Limpiar filtros
          </Boton>
        }
      >
        Prueba con otra palabra o quita los filtros.
      </Vacio>
    </div>
  );
}

/** Un vocabulario que todavía no tiene ningún valor: lo dice, en vez de dejar la pantalla en blanco con «Todos 0». */
export function VocabularioVacio({ children, icono = <Shapes /> }: { children: ReactNode; icono?: ReactNode }) {
  return (
    <div className="card-cayla">
      <Vacio icono={icono}>{children}</Vacio>
    </div>
  );
}


/** La insignia de estado junto al nombre: «Pendiente», «Rechazada». */
function Insignia({ children }: { children: ReactNode }) {
  return <Chip tono="rojo" className="shrink-0">{children}</Chip>;
}

/** La parte de arriba de la tarjeta que abre un detalle (Tejidos y Patrones: su foto y sus prendas). Las acciones del pie
 *  quedan fuera del botón: un clic en «Aprobar» nunca abre el detalle. Su foco lo dibuja la placa (`FOCO_EN_LA_PLACA`), no
 *  el botón: la muestra va posicionada y tapaba el anillo del botón por arriba. */
const BOTON_ARRIBA = "group/muestra flex flex-1 flex-col gap-2 rounded-md text-left focus-visible:outline-none";

/** Con Tab en el botón de arriba, la placa entera lleva el anillo del sistema (ADR-0351, el mismo de `mi-plata/TarjetaFoto`).
 *  Antes el botón tenía `outline-none` y un anillo rojo al 60 % en el foco, y como `outline-none` deja `--tw-outline-style: none`,
 *  el anillo rojo tampoco se pintaba: con Tab no se veía nada (auditoría /milimetro 2026-11-16, WCAG 2.4.7).
 *  Solo el PRIMER hijo: «Reactivar» de una tarjeta desactivada también es un `<button>` hijo directo de la placa, y con
 *  `>button` a secas su foco encendía la placa entera además de su propio anillo (dos anillos). */
const FOCO_EN_LA_PLACA =
  "has-[>button:first-child:focus-visible]:[outline:var(--foco-ancho)_solid_var(--foco-color)] has-[>button:first-child:focus-visible]:[outline-offset:var(--foco-separacion)]";

/**
 * La tarjeta de un valor del vocabulario. Sin sombra (superficie pegada al fondo, ADR-0169): al pasar el mouse sube 2 px y
 * se marca el borde, y el dibujo de la muestra responde (`group/etq`).
 */
export function TarjetaAtributo({
  muestra,
  nombre,
  notas = null,
  insignia = null,
  detalle,
  apagada = false,
  abrir,
  children,
}: {
  muestra: ReactNode;
  nombre: string;
  /** La nota interna del valor: el «!» junto al nombre (no en las tarjetas que abren un detalle). */
  notas?: string | null;
  /** «Pendiente», «Rechazada»… (`null` = aprobado, sin insignia). */
  insignia?: string | null;
  /** Una o dos líneas chicas bajo el nombre: cuántas prendas, el código, cuándo termina. */
  detalle?: ReactNode;
  /** Desactivada: se ve apagada, y sigue abriéndose y reactivándose. */
  apagada?: boolean;
  abrir?: { onClick: () => void; titulo: string };
  /** El pie: las acciones (`BotonesPendiente`, `PieTarjeta`). */
  children?: ReactNode;
}) {
  const arriba = (
    <>
      {/* La muestra al aire (vidrio/catalogo.css): llega al borde de arriba de la placa, sin su recuadro. */}
      <div className="tarjeta-valor-muestra">{muestra}</div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[15px] font-medium leading-snug text-tinta">
            {nombre}
            {/* El «!» es un botón y no puede ir dentro del botón que abre el detalle: ahí la nota se lee en el detalle. */}
            {notas && !abrir && <Ayuda titulo={nombre}>{notas}</Ayuda>}
          </span>
          {insignia && <Insignia>{insignia}</Insignia>}
        </div>
        {detalle}
      </div>
    </>
  );
  return (
    <div
      data-guia="vocabulario.tarjeta"
      className={`tarjeta-valor group/etq card-cayla flex flex-col gap-2 p-4 transition-[transform,border-color] duration-260 ease-cayla hover:-translate-y-0.5 hover:border-tinta/25 ${FOCO_EN_LA_PLACA} ${
        apagada ? "opacity-60" : ""
      }`}
    >
      {abrir ? (
        <button type="button" onClick={abrir.onClick} title={abrir.titulo} className={BOTON_ARRIBA}>
          {arriba}
        </button>
      ) : (
        <div className="flex flex-1 flex-col gap-2">{arriba}</div>
      )}
      {children}
    </div>
  );
}

/** Aprobar y Rechazar de un valor propuesto. Si no caben lado a lado en una tarjeta angosta, bajan a dos filas en vez
 *  de cortarse («Rechazar» se cortaba a 1024 px). */
export function BotonesPendiente({ onAprobar, onRechazar, aprobando = false }: { onAprobar: () => void; onRechazar: () => void; aprobando?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Boton peso="primario" className="min-w-[6.5rem] flex-1 px-2.5! py-1.5 text-[11px] whitespace-nowrap" cargando={aprobando} onClick={onAprobar}>
        Aprobar
      </Boton>
      <Boton peso="discreto" className="min-w-[6.5rem] flex-1 px-2.5! py-1.5 text-[11px] whitespace-nowrap text-rojo" onClick={onRechazar}>
        Rechazar
      </Boton>
    </div>
  );
}

/** El pie de una tarjeta ya aprobada: sus enlaces («Prendas», «Editar») y, al final, «Desactivar». */
export function PieTarjeta({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{children}</div>;
}

/**
 * «Desactivar» no es lo que se hace a diario: aparece al pasar el mouse o al enfocarlo con el teclado, y en pantallas
 * táctiles (sin hover) se ve siempre. Reserva su lugar para que la tarjeta no salte de alto.
 */
export function DesactivarTarjeta({ onClick, cambiando = false }: { onClick: () => void; cambiando?: boolean }) {
  return (
    <button
      type="button"
      disabled={cambiando}
      onClick={onClick}
      className="label-cayla area-dedo ml-auto whitespace-nowrap pointer-coarse:py-1 text-[10px] text-tinta/55 underline-offset-4 opacity-0 transition-[opacity,color] duration-200 hover:text-tinta hover:underline focus:opacity-100 disabled:opacity-50 group-hover/etq:opacity-100 [@media(hover:none)]:opacity-100"
    >
      {cambiando ? "Desactivando…" : "Desactivar"}
    </button>
  );
}

/** «Reactivar» de una tarjeta desactivada. */
export function BotonReactivar({ onClick, cambiando = false }: { onClick: () => void; cambiando?: boolean }) {
  return (
    <Boton textoCargando="Reactivando…" peso="discreto" className="w-full px-2.5! py-1.5 text-sm whitespace-nowrap" cargando={cambiando} onClick={onClick}>
      Reactivar
    </Boton>
  );
}
