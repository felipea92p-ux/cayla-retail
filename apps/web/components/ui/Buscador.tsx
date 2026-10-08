"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

/* ====================================================================
   Buscador · la caja donde se escribe para buscar (ADR-0358, ronda 5 de /unificar; Felipe 2026-10-08)

   Felipe eligió tocándolas (docs/unificar/buscador.md) entre 8 formas. Dos tamaños:

   · lista (40 px, sobre una tabla o una lista): la caja hundida (la más usada) + la lupa que se oscurece y crece al enfocar, el
     «/» a la vista que se va al escribir, el «×» que aparece al escribir y vuelve a poner el cursor, el «Buscando…» con el hilo
     que corre por el borde de abajo mientras la base responde, y una línea de conteo debajo (`conteo`).
   · mostrador (60 px: Vender, Cambios, Devoluciones, Apartados): la píldora que se despega al enfocar (sube 1 px, la sombra crece,
     anillo de 2 px), el ícono que se enciende en rojo (`icono="barras"` en Vender: «aquí se escanea»), el giro mientras busca y el
     botón de la derecha (`accion`) donde hoy existe. Sin «/» en celular.

   Lo que pidió Felipe al elegir: «que no salga buscando cuando no sea necesario, y que siempre se priorice que se vaya actualizando
   conforme se vaya escribiendo». Por eso:
     – la lista se filtra MIENTRAS se escribe (`onCambio` en cada tecla; quien filtra en la base lo hace con `useBusquedaEnUrl` y su
       pausa corta), nunca esperando un Enter;
     – «Buscando…» y el hilo salen SOLO si la espera de verdad tarda (`buscando` sigue en true pasados 350 ms). Lo que se filtra en
       el navegador nunca lo muestra, y una respuesta rápida tampoco: no parpadea.

   Teclado: «/» lleva el cursor aquí (si `atajo`, salvo que la persona ya esté escribiendo en otra caja o haya una hoja abierta);
   Escape borra lo escrito (y no cierra la hoja de alrededor si había algo que borrar, ADR-0136 act. 2026-09-26).
   CSS: app/estilos/vacio-aviso-buscador.css.
   ==================================================================== */

/** Cuánto tiene que durar una espera para que se vea «Buscando…» (Felipe 2026-10-08: solo cuando hace falta). */
export const ESPERA_SENAL_MS = 350;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> & {
  valor: string;
  onCambio: (valor: string) => void;
  /** La base todavía no respondió: el aviso sale solo si dura más de ESPERA_SENAL_MS. */
  buscando?: boolean;
  /** La línea de debajo al terminar («12 coinciden»). Solo en el tamaño lista. */
  conteo?: ReactNode;
  /** «/» lleva el cursor aquí. Uno solo por pantalla. */
  atajo?: boolean;
  tamano?: "lista" | "mostrador";
  icono?: "lupa" | "barras";
  /** Mostrador: el botón de la derecha («Buscar»). */
  accion?: ReactNode;
  /** Además de vaciar el texto (para quien guarda algo más al borrar). */
  onBorrar?: () => void;
  /** Nombre para el lector de pantalla; por defecto, el placeholder. */
  etiqueta?: string;
  ref?: Ref<HTMLInputElement>;
  className?: string;
};

function IconoBarras({ className }: { className?: string }) {
  // El código de barras de Vender: dice «aquí se escanea» sin una palabra más.
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
      <path d="M3 5v14M6.5 5v14M8.5 5v14M12 5v14M15 5v14M17 5v14M21 5v14" />
    </svg>
  );
}

export function Buscador({
  valor,
  onCambio,
  buscando = false,
  conteo,
  atajo = false,
  tamano = "lista",
  icono = "lupa",
  accion,
  onBorrar,
  etiqueta,
  ref,
  className = "",
  placeholder,
  onKeyDown,
  ...resto
}: Props) {
  const propio = useRef<HTMLInputElement | null>(null);
  const [esperaLarga, setEsperaLarga] = useState(false);

  // «Buscando…» solo si la espera dura: así una respuesta rápida o un filtro del navegador no hace parpadear nada.
  useEffect(() => {
    if (!buscando) return;
    const t = window.setTimeout(() => setEsperaLarga(true), ESPERA_SENAL_MS);
    return () => {
      window.clearTimeout(t);
      setEsperaLarga(false);
    };
  }, [buscando]);
  const senal = buscando && esperaLarga;

  useEffect(() => {
    if (!atajo) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const destino = e.target as HTMLElement | null;
      if (destino?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (!propio.current) return;
      e.preventDefault();
      propio.current.focus();
      propio.current.select();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [atajo]);

  const borrar = () => {
    onCambio("");
    onBorrar?.();
    propio.current?.focus();
  };

  const asignar = (nodo: HTMLInputElement | null) => {
    propio.current = nodo;
    if (typeof ref === "function") ref(nodo);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = nodo;
  };

  const Icono = icono === "barras" ? IconoBarras : Search;
  const mostrador = tamano === "mostrador";
  const caja = (
    <div
      className={`buscador ${mostrador ? "mostrador" : ""} ${conteo === undefined ? className : ""}`}
      data-con-texto={valor ? "" : undefined}
      data-buscando={senal ? "" : undefined}
      onClick={(e) => {
        // Tocar la caja (no un botón de adentro) lleva el cursor al texto.
        if (e.target === e.currentTarget) propio.current?.focus();
      }}
    >
      <Icono className="buscador-icono" />
      <input
        ref={asignar}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={valor}
        placeholder={placeholder}
        aria-label={etiqueta ?? (typeof placeholder === "string" ? placeholder : "Buscar")}
        aria-keyshortcuts={atajo ? "/" : undefined}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && valor) {
            // Este Escape lo usó el buscador: no cierra la hoja de alrededor (useEscapeLibre).
            e.stopPropagation();
            e.preventDefault();
            borrar();
          }
          onKeyDown?.(e);
        }}
        {...resto}
      />
      {!mostrador ? (
        <span className="buscador-senal" aria-hidden>
          Buscando…
        </span>
      ) : senal ? (
        <LoaderCircle className="buscador-giro" aria-hidden />
      ) : null}
      {valor ? (
        <button type="button" className="buscador-borrar" onClick={borrar} aria-label="Borrar la búsqueda">
          <X aria-hidden />
        </button>
      ) : null}
      {atajo ? (
        <kbd className="buscador-atajo" aria-hidden title="Atajo: / lleva el cursor a la búsqueda">
          /
        </kbd>
      ) : null}
      {accion}
      <span className="buscador-hilo" aria-hidden />
      <span role="status" className="sr-only">
        {senal ? "Buscando…" : ""}
      </span>
    </div>
  );
  if (conteo === undefined) return caja;
  return (
    <div className={className}>
      {caja}
      <div className="buscador-conteo" aria-live="polite">
        {conteo}
      </div>
    </div>
  );
}
