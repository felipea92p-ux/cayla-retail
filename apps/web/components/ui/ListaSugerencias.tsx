"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { CornerDownLeft } from "lucide-react";

/* ====================================================================
   ListaSugerencias · lo que aparece debajo de un buscador o de la pistola (ADR-0358, ronda 9: Felipe la eligió tocándola el
   2026-10-13, «P1 · una lista para las tres»).

   Por qué existe: la lista de todo combo (ronda 6) no sabía dibujar una foto, un dato a la derecha ni la tecla de la pistola, y las
   tres pantallas que sugieren mientras se escribe dibujaban la suya: Llegó mercadería (foto o un cuadrito de color), Recibir contra
   factura (sin foto, con la factura a la derecha) y Registrar nota de crédito (sus facturas con chip y montos). Ahora es una:
   la superficie de toda lista (`lista-flotante`) o, si la lista ES el contenido del paso, la misma en línea; cada fila con su
   miniatura (la de la prenda: `MiniaturaPrenda`), su título, su detalle debajo y un dato a la derecha.

   La ACTIVA es la que toma el Enter: lleva el hilo rojo de canto y la tecla «Enter» a su derecha. Quien llama decide cuál es
   (`activa`) y si el mouse la mueve (`onActiva`): en Llegó y Recepción el Enter toma siempre la primera, así que el mouse solo tiñe.
   La pieza no escucha el teclado: el buscador ya lo hace (las flechas, el Enter, el Escape), y `ariaDelBuscador` le da sus atributos
   de combobox para que el lector de pantalla siga la activa.

   Movimiento (ADR-0136): las filas entran en cascada (30 ms, hasta la 8.ª), el hilo crece desde el centro al llegar a una fila
   (200 ms) y la tecla asoma (200 ms). Sin rebote ni bucle; quieta con «reducir movimiento». Estilos: `app/estilos/campos-y-casillas.css`.
   ==================================================================== */

export type Sugerencia = {
  /** Única en la lista (la `key` de React). */
  clave: string;
  /** Lo que identifica la fila de un vistazo: la miniatura de la prenda (`MiniaturaPrenda`). Sin ella, la fila es solo texto. */
  miniatura?: ReactNode;
  titulo: ReactNode;
  /** La línea de abajo, en taupe: talla · color · código, o el estado y la fecha. */
  detalle?: ReactNode;
  /** Un dato a la derecha: la factura que la trae, el total y el saldo. */
  derecha?: ReactNode;
};

/** Los atributos del buscador que controla la lista (el patrón de combobox): quien escribe sigue en el buscador y el lector de
 *  pantalla oye la fila activa. */
export function ariaDelBuscador(id: string, abierta: boolean, activa: number | null) {
  return {
    role: "combobox" as const,
    "aria-expanded": abierta,
    "aria-controls": id,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": abierta && activa !== null ? `${id}-op-${activa}` : undefined,
  };
}

export function ListaSugerencias({
  id,
  etiqueta,
  sugerencias,
  activa = 0,
  onActiva,
  onElegir,
  enLinea = false,
  retenerFoco = true,
  tecla = "Enter",
  className = "",
  style,
  children,
}: {
  /** El id de la lista: el buscador lo nombra en `aria-controls` y cada fila es `${id}-op-${i}`. */
  id: string;
  etiqueta: string;
  sugerencias: readonly Sugerencia[];
  /** La fila que toma el Enter (o `null`, ninguna). */
  activa?: number | null;
  /** Si el mouse mueve la activa. Sin él, el mouse solo tiñe la fila que pasa. */
  onActiva?: (i: number) => void;
  onElegir: (i: number) => void;
  /** La lista ES el contenido del paso (las facturas de la nota de crédito): va en línea, con borde, sin flotar. */
  enLinea?: boolean;
  /** Elegir con el mouse deja el foco en el buscador (la pistola sigue leyendo). `false`: el clic se lleva el foco. */
  retenerFoco?: boolean;
  /** La tecla que se ve en la activa; `null` la oculta. */
  tecla?: string | null;
  /** Su lugar (posición, ancho, alto máximo), nunca su cara. */
  className?: string;
  style?: CSSProperties;
  /** Lo que se dibuja si no hay sugerencias (un <Vacio tamano="chico">, un error). */
  children?: ReactNode;
}) {
  // La activa siempre a la vista: con ↑ ↓ en una lista más alta que su caja (las facturas), no se va por debajo del borde.
  useEffect(() => {
    if (activa === null) return;
    document.getElementById(`${id}-op-${activa}`)?.scrollIntoView({ block: "nearest" });
  }, [id, activa]);

  return (
    <div
      id={id}
      role="listbox"
      aria-label={etiqueta}
      style={style}
      className={`lista-sugerencias scroll-cayla ${enLinea ? "lista-sugerencias-en-linea" : "anim-revelar lista-flotante"} ${className}`}
    >
      {sugerencias.length === 0
        ? children
        : sugerencias.map((s, i) => (
            <button
              key={s.clave}
              id={`${id}-op-${i}`}
              type="button"
              role="option"
              aria-selected={i === activa}
              data-activa={i === activa ? "" : undefined}
              onMouseDown={retenerFoco ? (e) => e.preventDefault() : undefined}
              onMouseMove={onActiva ? () => i !== activa && onActiva(i) : undefined}
              onClick={() => onElegir(i)}
              className="sugerencia"
              style={{ "--i": Math.min(i, 8) } as CSSProperties}
            >
              <span aria-hidden className="sugerencia-canto" />
              {s.miniatura}
              <span className="sugerencia-texto">
                <span className="sugerencia-titulo">{s.titulo}</span>
                {s.detalle && <span className="sugerencia-detalle">{s.detalle}</span>}
              </span>
              {s.derecha && <span className="sugerencia-derecha">{s.derecha}</span>}
              {tecla && (
                <kbd aria-hidden className="sugerencia-tecla">
                  <CornerDownLeft />
                  {tecla}
                </kbd>
              )}
            </button>
          ))}
    </div>
  );
}
