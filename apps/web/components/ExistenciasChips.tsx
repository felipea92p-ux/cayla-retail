import type { ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { AlertTriangle, ClipboardCheck } from "lucide-react";

/* ====================================================================
   Los dos chips de diagnóstico de Existencias (diseño aprobado, 2026-09-28)

   La tabla comunica el estado, nunca ofrece la acción (esa vive en el cajón de la prenda). Estos chips son ese estado:
   «alerta» = la prenda o la talla pide algo hoy (ámbar suave con el triángulo: «Por colgar · 6 uds», «1 talla sin stock en
   piso») y «mantener» = nada que hacer (contorno fino y el ✓ de la lista). Ninguno de los dos lleva botón. Hasta el 2026-10-04
   la alerta era rosa (rojo al 10 %): «por colgar» es trabajo, no un error, y el rojo queda para lo que de verdad falló.
   ==================================================================== */

export function ChipAlerta({ children, titulo }: { children: ReactNode; titulo?: string }) {
  return (
    <Chip tono="ambar" versalitas={false} title={titulo}>
      <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />
      {children}
    </Chip>
  );
}

export function ChipMantener({ children = "Mantener", titulo }: { children?: ReactNode; titulo?: string }) {
  return (
    <span title={titulo} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-tinta/15 bg-papel px-3 py-1.5 text-xs leading-none text-tinta/75">
      <ClipboardCheck aria-hidden className="h-3 w-3 shrink-0 text-tinta/60" />
      {children}
    </span>
  );
}
