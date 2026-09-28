import type { ReactNode } from "react";
import { AlertTriangle, ClipboardCheck } from "lucide-react";

/* ====================================================================
   Los dos chips de diagnóstico de Existencias (diseño aprobado, 2026-09-28)

   La tabla comunica el estado, nunca ofrece la acción (esa vive en el cajón de la prenda). Estos chips son ese estado:
   «alerta» = la prenda o la talla pide algo hoy (rosa suave con el triángulo: «Por colgar · 6 uds», «1 talla sin stock en
   piso») y «mantener» = nada que hacer (contorno fino y el ✓ de la lista). El color de alerta solo aparece donde hay una
   alerta real, y ninguno de los dos lleva botón.
   ==================================================================== */

export function ChipAlerta({ children, titulo }: { children: ReactNode; titulo?: string }) {
  return (
    <span title={titulo} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rojo/10 px-2.5 py-1 text-xs leading-none text-rojo">
      <AlertTriangle aria-hidden className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
      {children}
    </span>
  );
}

export function ChipMantener({ children = "Mantener", titulo }: { children?: ReactNode; titulo?: string }) {
  return (
    <span title={titulo} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-tinta/15 bg-papel px-3 py-1.5 text-xs leading-none text-tinta/75">
      <ClipboardCheck aria-hidden className="h-[15px] w-[15px] shrink-0 text-tinta/60" strokeWidth={1.6} />
      {children}
    </span>
  );
}
