"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ColorAlta } from "@/lib/alta-producto";
import type { Lectura } from "@/lib/colores-de-la-foto";

// Las fotos del alta, POR COLOR, sin subir nada todavía (spike Nuevo producto, 2026-09-24).
//
// Por qué antes no se podía: la edición (`FotosPorColor`, con `useSubirFotos`) sube cada archivo al almacén apenas se elige.
// En el alta eso dejaba el archivo huérfano si la persona cancelaba el formulario, así que las fotos se habían dejado
// para después de crear. Felipe (2026-09-24): «cuando agrego un nuevo producto no puedo cargar imagen».
//
// Ahora el archivo se guarda en el NAVEGADOR (con una vista previa local, `URL.createObjectURL`) y recién se sube
// cuando la base ya creó el producto (`NuevoProductoForm.onSubmit`). Cancelar no deja nada en el almacén, y crear el
// producto sigue siendo una sola transacción: si una foto no sube, el producto ya existe y la pantalla de éxito dice
// cuál faltó (principio 9: se degrada, no pierde el producto).
//
// Desde el ADR-0442 (Felipe, 2026-10-17) la foto no pasa por ninguna revisión ni preparación: queda aquí TAL CUAL la entrega la IA del
// equipo (un PNG con fondo transparente, por ejemplo) y se sube igual al crear. Antes, `RevisarFotosModal` la preparaba (ADR-0228).

export type FotoPendiente = {
  clave: string;
  /** La foto tal cual la eligieron: la que se sube y se muestra. */
  archivo: File;
  /** URL local (blob:) solo para mostrarla; se libera al quitarla o al salir. */
  vista: string;
  colorCodigo: string | null;
  /** Cómo se leyeron sus colores (ADR-0663), si el color salió de la foto: lo usa el «¿Por qué?» de su tarjeta. */
  lectura?: Lectura<ColorAlta>;
  /**
   * «Catálogo con IA» (2026-11-13): la versión de catálogo de esta foto, ya preparada en el navegador. `usar` dice cuál queda: con la de IA,
   * `vista` es la suya y al crear el producto se sube el par (`subirParDeCatalogo`); con «Usar mi foto», `vista` vuelve a `vistaReal`.
   */
  ia?: { png: Blob; vistaIA: string; vistaReal: string; usar: boolean };
};

/** La × que va sobre la miniatura de una foto y dice, sin abrir nada, «aquí se quita». Antes «Quitar» solo vivía dentro de la
 *  hoja que abre el enlace «1 foto» (alta) o la tarjeta (ficha), y quien se equivocaba de foto no lo encontraba (Felipe,
 *  2026-10-14). Con una sola foto la quita; con varias, `onClick` abre la hoja donde se elige cuál. Quitar una foto no
 *  pide confirmación (ley 7 de /formidable: perdonar antes que preguntar): en el alta todavía no se subió nada y en la
 *  ficha no se guarda hasta «Guardar». `className` la ubica en su esquina. */
export function BotonQuitarFoto({
  onClick,
  etiqueta,
  disabled = false,
  grande = false,
  className = "",
}: {
  onClick: () => void;
  etiqueta: string;
  disabled?: boolean;
  /** Sobre una tarjeta grande (la ficha) el círculo es de 28 px; sobre la miniatura de la tabla, de 20. */
  grande?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      // `before:` agranda el área que se toca sin agrandar el círculo (queda sobre una miniatura de 34 px).
      className={`absolute z-[1] grid ${grande ? "h-7 w-7" : "h-5 w-5"} place-items-center rounded-full bg-tinta text-crema shadow-sm transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-rojo-profundo disabled:opacity-40 ${className}`}
    >
      <X /* unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15) */ aria-hidden className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

/** El botón que abre el selector de archivos. Sin `children` es la casilla «+» de siempre; la tabla de la prenda le
 *  pasa su propio aspecto (cámara, miniatura) con `className` y `children`. */
export function BotonFoto({
  onArchivos,
  disabled,
  etiqueta,
  className = "grid h-16 w-[3.25rem] place-items-center rounded-md border border-dashed border-tinta/25 text-lg text-taupe transition-colors hover:border-tinta/50 hover:text-tinta disabled:opacity-40",
  children = "+",
}: {
  onArchivos: (f: File[]) => void;
  disabled: boolean;
  etiqueta: string;
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          onArchivos(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label={etiqueta}
        title={etiqueta}
        className={className}
      >
        {children}
      </button>
    </>
  );
}
