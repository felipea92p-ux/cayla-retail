import type { ReactNode, Ref } from "react";
import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";

/* ====================================================================
   Aviso · el recuadro que avisa DENTRO de una pantalla o una hoja (ADR-0358, ronda 5 de /unificar; Felipe 2026-10-08)

   Felipe eligió la FRANJA a la izquierda (P2, docs/unificar/aviso.md) entre 6 recuadros que cambiaban a ojo de color, borde y
   esquinas. Cuatro tonos, y la forma del ícono lleva el tono además del color (como los avisos de la esquina, ADR-0146):
     atencion ⚠ (ámbar) · error ! (rojo) · exito ✓ (verde) · info i (pizarra)
   Título en negrita del color profundo, la frase en tinta y, si hay algo que hacer, el enlace a la derecha (`accion`). Dos tamaños:
   normal, y `chico` (una línea, en una fila o junto a un campo).

   Lo que NO es esta pieza: el aviso de la esquina (`avisar.*`, components/ui/Avisos.tsx), la nota que explica una regla
   (`nota-cayla`, que lleva su «i») y el error de UN dato, que va bajo su campo (`<Campo tono="error" pie>`).
   El error de toda una hoja (se cortó la red, la base dijo que no) va con `tono="error"` sobre los botones.

   Movimiento (ADR-0136): baja 4 px y aparece (280 ms), la franja se tiñe al entrar (520 ms), el ícono se DIBUJA trazo a trazo; el de
   error destella su borde UNA vez para que se vea aunque se esté mirando otra cosa. Sin bucle. CSS: app/estilos/vacio-aviso-buscador.css.
   ==================================================================== */

export type TonoAvisoLinea = "atencion" | "error" | "exito" | "info";

const ICONO: Record<TonoAvisoLinea, ReactNode> = {
  atencion: <TriangleAlert aria-hidden />,
  error: <CircleAlert aria-hidden />,
  exito: <Check aria-hidden />,
  info: <Info aria-hidden />,
};

type Props = {
  tono: TonoAvisoLinea;
  /** Qué pasa, corto («Faltan 3 prendas por contar»). Sin título, la frase va sola. */
  titulo?: ReactNode;
  /** La frase: por qué o qué hacer. */
  children?: ReactNode;
  /** El enlace o botón de la derecha («Ver cuáles», «Reintentar»). */
  accion?: ReactNode;
  chico?: boolean;
  id?: string;
  className?: string;
  /** El de error recibe el foco al aparecer en un flujo (para el lector de pantalla). */
  enfocable?: boolean;
  ref?: Ref<HTMLDivElement>;
};

export function Aviso({ tono, titulo, children, accion, chico = false, id, className = "", enfocable = false, ref }: Props) {
  return (
    <div
      ref={ref}
      id={id}
      data-tono={tono}
      role={tono === "error" ? "alert" : "status"}
      tabIndex={enfocable ? -1 : undefined}
      className={`aviso-linea ${chico ? "chico" : ""} ${className}`}
    >
      <span className="aviso-linea-ic trazo-dibuja">{ICONO[tono]}</span>
      {chico ? (
        <p className="aviso-linea-tit">
          {titulo}
          {titulo && children ? ". " : null}
          {children ? <span>{children}</span> : null}
        </p>
      ) : (
        <>
          {titulo ? <p className="aviso-linea-tit">{titulo}</p> : null}
          {children ? <div className={`aviso-linea-det${titulo ? "" : " solo"}`}>{children}</div> : null}
        </>
      )}
      {accion ? <span className="aviso-linea-acc">{accion}</span> : null}
    </div>
  );
}
