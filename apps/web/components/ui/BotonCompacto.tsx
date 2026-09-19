import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ====================================================================
   BotonCompacto · el botón de la isla de vidrio de Facturación (ADR-0124)

   Por qué existe aparte de `Boton` (ui/campos.tsx): `Boton` lo usa toda la app y
   habla en versalitas con seguimiento de 11 px; la isla habla en minúscula de 13 px
   y en dos alturas. Cambiar `Boton` movería cada pantalla, así que este es propio.

   Cuatro variantes, todas medidas contra el spec (§7):
   - `primario`   36 px · tinta sobre crema. La acción de la pantalla.
   - `vidrio`     36 px · blanco translúcido con desenfoque. La acción secundaria.
   - `fila`       30 px · borde fino; el hover rellena de tinta. Acción dentro de una fila.
   - `fila-alerta` 30 px · rojo profundo; el hover rellena de rojo. Lo que exige actuar.
   (`fila` y `fila-alerta` las estrenan las vistas de R2 y R3.)

   `cargando` no es solo texto: el hilo barre mientras algo está en vuelo, igual que en
   `Boton`, para que quien está en el mostrador sepa que el sistema NO se colgó.
   ==================================================================== */

export type VarianteBotonCompacto = "primario" | "vidrio" | "fila" | "fila-alerta";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap font-medium outline-none " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-cayla " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0";

const VARIANTE: Record<VarianteBotonCompacto, string> = {
  primario: "h-9 rounded-[10px] bg-tinta px-3.5 text-[13px] text-crema hover:-translate-y-px hover:shadow",
  vidrio: "vidrio-cayla h-9 rounded-[10px] px-3.5 text-[13px] text-tinta hover:-translate-y-px hover:shadow",
  fila: "h-[30px] rounded-[8px] border border-tinta/28 px-3 text-[12.5px] text-tinta hover:bg-tinta hover:text-crema",
  "fila-alerta":
    "h-[30px] rounded-[8px] border border-rojo-profundo px-3 text-[12.5px] text-rojo-profundo hover:border-rojo hover:bg-rojo hover:text-crema",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante: VarianteBotonCompacto;
  /** Un icono de `lucide-react`; el botón lo deja en 15 px. Pásalo con `aria-hidden`. */
  icono?: ReactNode;
  cargando?: boolean;
};

export function BotonCompacto({ variante, icono, cargando = false, className = "", children, type = "button", ...props }: Props) {
  return (
    <button {...props} type={type} disabled={props.disabled || cargando} className={`${BASE} ${VARIANTE[variante]} ${className}`}>
      {icono}
      {children}
      {cargando && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <span className={`block h-full w-1/3 rounded-full [animation:cayla-hilo-barrido_1.1s_linear_infinite] ${variante === "primario" ? "bg-crema" : "bg-rojo"}`} />
        </span>
      )}
    </button>
  );
}
