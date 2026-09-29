"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { Boton, Hilo } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";

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
 *  ni se corre al cambiar de una a otra. */
export const GRILLA_ATRIBUTOS = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

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
 */
export function BarraAtributos({
  etiqueta,
  filtros,
  busqueda,
  agregar,
}: {
  /** El nombre del grupo de píldoras: «Filtrar tallas». */
  etiqueta: string;
  /** Las píldoras (`BotonFiltro`), empezando por «Todas». */
  filtros: ReactNode;
  busqueda?: Busqueda;
  agregar?: { texto: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div role="group" aria-label={etiqueta} className="flex flex-wrap items-center gap-1.5">
        {filtros}
      </div>
      {(busqueda || agregar) && (
        <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
          {busqueda && <Buscador {...busqueda} />}
          {agregar && (
            <button
              type="button"
              onClick={agregar.onClick}
              className="label-cayla shrink-0 rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
            >
              {agregar.texto}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Buscador({ valor, onValor, etiqueta, placeholder = "Buscar" }: Busqueda) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
      <Search aria-hidden className="pointer-events-none absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta/40" />
      <input
        type="search"
        value={valor}
        onChange={(ev) => onValor(ev.target.value)}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="h-9 w-full bg-transparent pl-6 pr-6 text-sm text-tinta outline-none placeholder:text-tinta/55 [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          type="button"
          onClick={() => onValor("")}
          aria-label="Borrar búsqueda"
          className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-tinta/40 transition-colors hover:text-tinta"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
      <Hilo activo={enfocado} />
    </div>
  );
}

/** «● ROTACIÓN 4»: el título de cada grupo de tarjetas. Sin `punto`, el de «Desactivadas». */
export function TituloGrupo({ punto, cuenta, children }: { punto?: string; cuenta: number; children: ReactNode }) {
  return (
    <p className="label-cayla flex items-center gap-1.5 text-[11px] text-tinta/65">
      {punto && <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${punto}`} />}
      {children}
      <span className="font-normal tabular-nums text-tinta/40">{cuenta}</span>
    </p>
  );
}

/** Cuando los filtros o la búsqueda no dejan nada: lo dice y ofrece volver a verlo todo. */
export function SinCoincidencias({ children, onQuitar }: { children: ReactNode; onQuitar: () => void }) {
  return (
    <div className="card-cayla flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-tinta/75">{children}</p>
      <Boton peso="discreto" className="px-3 py-1.5 text-[11px]" onClick={onQuitar}>
        Quitar filtros
      </Boton>
    </div>
  );
}

/** Un vocabulario que todavía no tiene ningún valor: lo dice, en vez de dejar la pantalla en blanco con «Todos 0». */
export function VocabularioVacio({ children }: { children: ReactNode }) {
  return (
    <div className="card-cayla flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm text-tinta/75">{children}</p>
    </div>
  );
}

/** La insignia de estado junto al nombre: «Pendiente», «Rechazada». */
function Insignia({ children }: { children: ReactNode }) {
  return <span className="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">{children}</span>;
}

/** La parte de arriba de la tarjeta que abre un detalle (Tejidos y Patrones: su foto y sus prendas). Las acciones del pie
 *  quedan fuera del botón: un clic en «Aprobar» nunca abre el detalle. */
const BOTON_ARRIBA =
  "group/muestra flex flex-1 flex-col gap-2 rounded-md text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60";

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
      {muestra}
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
      className={`group/etq card-cayla flex flex-col gap-2 p-4 transition-[transform,border-color] duration-260 ease-cayla hover:-translate-y-0.5 hover:border-tinta/25 ${
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

/** Un enlace del pie. Cada uno en una sola línea: «Configurar campaña» partido en dos se leía como dos acciones. */
export function AccionTarjeta({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="label-cayla whitespace-nowrap text-[10px] text-tinta/75 underline-offset-4 transition-colors hover:text-tinta hover:underline"
    >
      {children}
    </button>
  );
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
      className="label-cayla ml-auto whitespace-nowrap text-[10px] text-tinta/55 underline-offset-4 opacity-0 transition-[opacity,color] duration-200 hover:text-tinta hover:underline focus:opacity-100 disabled:opacity-50 group-hover/etq:opacity-100 [@media(hover:none)]:opacity-100"
    >
      {cambiando ? "Desactivando…" : "Desactivar"}
    </button>
  );
}

/** «Reactivar» de una tarjeta desactivada. */
export function BotonReactivar({ onClick, cambiando = false }: { onClick: () => void; cambiando?: boolean }) {
  return (
    <Boton peso="discreto" className="w-full px-2.5! py-1.5 text-[11px] whitespace-nowrap" cargando={cambiando} onClick={onClick}>
      Reactivar
    </Boton>
  );
}

/**
 * La "vuelta de tuerca" antes de editar (ADR-0261 extendido): un clic en una tarjeta ya no cae directo al
 * formulario — cae acá primero, de solo lectura, y `accion` recién ahí abre lo que corresponda (el modal de
 * editar en Colores/Tallas/Tejidos/Patrones, «Configurar campaña» en Etiquetas). Mismo molde que
 * `VistaRapidaCategoria` y `VistaRapidaMarca`: no se fusiona la lógica de cada pestaña, solo cómo se ve el paso
 * intermedio.
 */
export function VistaRapidaAtributo({
  titulo,
  muestra,
  children,
  accion,
  onClose,
}: {
  titulo: string;
  /** La misma muestra de la tarjeta (el rectángulo de color, el ícono…) — opcional, no todas las pestañas la tienen. */
  muestra?: ReactNode;
  /** El detalle: lo mismo que ya decía la tarjeta, sin repetir el nombre. */
  children?: ReactNode;
  /** El botón primario: «Editar» en la mayoría, «Configurar campaña» en Etiquetas. */
  accion: { texto: string; onClick: () => void };
  onClose: () => void;
}) {
  return (
    <Modal titulo={titulo} onClose={onClose}>
      {(cerrar) => (
        <div className="mt-5 space-y-4">
          {muestra}
          {children}
          <div className="flex justify-end gap-2">
            <Boton peso="fantasma" onClick={cerrar}>
              Cerrar
            </Boton>
            <Boton peso="primario" onClick={accion.onClick}>
              {accion.texto}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
