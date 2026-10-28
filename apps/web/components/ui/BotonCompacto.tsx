import type { ButtonHTMLAttributes, ReactNode } from "react";
import { HiloEnEspera, PalabraEnEspera } from "@/components/ui/campos";

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

// Un detalle de Tailwind 4 que no se ve a simple vista (comprobado en el CSS compilado):
// - El foco de teclado NO se escribe acá: lo pone el anillo común (`:focus-visible` de `globals.css`, ADR-0351).
//   Antes había un `outline-rojo/60` (2,5:1 contra crema, bajo el 3:1 de WCAG 1.4.11).
// - El movimiento (subir con sombra, la luz, encogerse al presionar, el «+» y la flecha) es el ÚNICO del ERP: `.mov-boton`
//   (globals.css; ADR-0358, ronda 3, Felipe 2026-10-07). Antes este botón solo subía 1 px con sombra.
const BASE =
  "mov-boton inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium " +
  "disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0";

// `enabled:hover:` y no `hover:`: `hover:` no excluye `:disabled`, así que un botón deshabilitado o
// `cargando` seguiría levantándose o rellenándose bajo el puntero (y en `fila-alerta` el relleno rojo
// taparía el hilo de carga, que también es rojo).
const VARIANTE: Record<VarianteBotonCompacto, string> = {
  primario: "h-9 rounded-[10px] bg-tinta px-3.5 text-[13px] text-crema enabled:hover:bg-rojo-profundo",
  vidrio: "vidrio-cayla h-9 rounded-[10px] px-3.5 text-[13px] text-tinta",
  fila: "h-[30px] rounded-[8px] border border-tinta/28 px-3 text-[12.5px] text-tinta enabled:hover:bg-tinta enabled:hover:text-crema",
  "fila-alerta":
    "h-[30px] rounded-[8px] border border-rojo-profundo px-3 text-[12.5px] text-rojo-profundo enabled:hover:border-rojo enabled:hover:bg-rojo enabled:hover:text-crema",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante: VarianteBotonCompacto;
  /** Un icono de `lucide-react`; el botón lo deja en 15 px. Pásalo con `aria-hidden`. */
  icono?: ReactNode;
  /** Está esperando a la base: la palabra pasa a `textoCargando`, corre el hilo y el botón se apaga. */
  cargando?: boolean;
  /** «Guardando…» por defecto; otro verbo si lo que hace no es guardar («Enviando…», «Consultando…»). */
  textoCargando?: string;
};

// Mientras espera, lo mismo que `Boton` (ADR-0358, ronda 12): la palabra pasa a `textoCargando` sin cambiar el ancho y corre el hilo.
export function BotonCompacto({ variante, icono, cargando, textoCargando = "Guardando…", className = "", children, type = "button", ...props }: Props) {
  return (
    <button {...props} type={type} disabled={props.disabled || cargando} aria-busy={cargando || undefined} className={`${BASE} ${VARIANTE[variante]} ${className}`}>
      {icono}
      {cargando !== undefined && children ? (
        <PalabraEnEspera cargando={cargando} texto={textoCargando}>
          {children}
        </PalabraEnEspera>
      ) : (
        children
      )}
      {cargando && <HiloEnEspera claro={variante === "primario"} />}
    </button>
  );
}
