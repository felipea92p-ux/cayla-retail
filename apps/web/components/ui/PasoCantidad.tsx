import type { HTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";
import { Minus, Plus } from "lucide-react";

/* ====================================================================
   PasoCantidad · subir o bajar una cantidad de uno en uno («− 1 +») (ADR-0358, ronda 17: Felipe la eligió mirando el 2026-10-17).

   LA CAJA DEL CAMPO con el − y el + adentro: la misma caja que se enciende con su hilo rojo cuando el cursor está en el número
   (`caja-cayla caja-campo`), los signos de lucide y el número en medio, que se puede escribir (`campo`) o solo mostrar (`children`).
   Reemplaza a las siete caras que había (botones sueltos, cajas con borde, celdas hueso, glifos escritos, la píldora del Taller).

   Tres tamaños: «celda» (26 px, dentro de una matriz de tallas × colores), «fila» (36 px con mouse, que crece sola a 44 px en una
   pantalla táctil, el celular del mostrador) y «grande» (68 px, el número en la serif de 36 px y − y + de 44 px: el descuento de la
   hoja «Configuración» de una campaña, ADR-0488, Felipe 2026-10-23). `sufijo` pone la unidad al lado del número («%»), sobre su
   misma línea base. Las teclas grandes de contar (el escáner, Contar el envío y el paso a paso de Existencias, 56 px con el número
   enorme) son un teclado de contar y quedan aparte.

   La pieza NO decide nada: cada pantalla le pasa qué hace cada botón (`menos`, `mas`), cuándo se apaga y qué dice para el lector, y
   las props del número (`campo`: value, onChange, onBlur, aria-label…). El envoltorio acepta `title`, `className` y `data-*` (los
   estados de una celda de Editar producto). `tono` tiñe el borde y el número con lo que el dato dice (lo que llegó en Recibir);
   `sinTab` saca los botones del Tab (una matriz: el Tab salta de celda en celda); `claseBotones` ubica los botones (los que se
   esconden en una tabla ancha hasta pasar el mouse).

   Movimiento (ADR-0136): el botón se tiñe de arena al pasar el mouse y se encoge un poco al presionar; con el cursor en el número,
   la caja se enciende como un campo. CSS: app/estilos/campos-y-casillas.css (`.paso-cantidad`).
   ==================================================================== */

type Boton = {
  onClick: () => void;
  deshabilitado?: boolean;
  /** Lo que oye el lector: «Una menos de Blusa Emma S». */
  etiqueta?: string;
  title?: string;
};

type Props = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  tamano?: "celda" | "fila" | "grande";
  menos: Boton;
  mas: Boton;
  /** El número se puede escribir: las props de su <input>. */
  campo?: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };
  /** El número a la vista, si no se escribe. */
  children?: ReactNode;
  /** La unidad al lado del número («%»): va con él, al centro y sobre su misma línea base. Quien escribe el número le da a su campo
   *  el ancho de lo escrito (`style.width` en `ch`): así el número y su unidad quedan al centro de la caja. */
  sufijo?: ReactNode;
  /** El borde y el número dicen algo del dato: se pasó (error), está completo (exito), falta (atencion). */
  tono?: "error" | "exito" | "atencion";
  /** Los botones fuera del orden del Tab. */
  sinTab?: boolean;
  /** Clases que ubican los dos botones (no los pintan). */
  claseBotones?: string;
};

export function PasoCantidad({ tamano = "fila", menos, mas, campo, children, sufijo, tono, sinTab = false, claseBotones = "", className = "", ...resto }: Props) {
  const boton = (b: Boton, signo: "menos" | "mas") => (
    <button
      type="button"
      tabIndex={sinTab ? -1 : undefined}
      aria-label={b.etiqueta ?? (signo === "menos" ? "Una menos" : "Una más")}
      title={b.title}
      disabled={b.deshabilitado}
      onClick={b.onClick}
      className={`paso-cantidad-b ${claseBotones}`}
    >
      {signo === "menos" ? <Minus aria-hidden /> : <Plus aria-hidden />}
    </button>
  );
  const numero = campo ? (
    <input {...campo} className={`paso-cantidad-n ${campo.className ?? ""}`} />
  ) : (
    <span className="paso-cantidad-n" aria-live="polite">
      {children}
    </span>
  );
  return (
    <span {...resto} data-tam={tamano} data-tono={tono} className={`caja-cayla caja-campo paso-cantidad ${className}`}>
      {boton(menos, "menos")}
      {sufijo === undefined ? (
        numero
      ) : (
        <span className="paso-cantidad-c">
          {numero}
          <span aria-hidden className="paso-cantidad-s">
            {sufijo}
          </span>
        </span>
      )}
      {boton(mas, "mas")}
    </span>
  );
}
