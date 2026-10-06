"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { Pestanas } from "@/components/ui/Pestanas";
import { esMesValido, hrefPestana, PESTANAS, pestanaDeRuta, type ConteosPestanas } from "@/lib/facturacion-reglas";

// Las cuatro vistas de Comprobantes. Desde el 2026-10-07 dibujan con la pestaña de vista del sistema (`<Pestanas>`, ADR-0357):
// este vidrio con la píldora que se desliza nació aquí (ADR-0124) y Felipe lo eligió para todo el ERP, en mayúsculas. La URL es
// la fuente de verdad (son enlaces: «atrás» funciona y una vista se comparte) y se conserva `?m=` entre Proformas y
// Comprobantes; por eso el shell la envuelve en <Suspense>. El contador: ámbar = hay algo por enviar, rojo = SUNAT rechazó
// alguno, neutro = solo informa; su texto va para el lector y en el `title`, porque el número solo no dice qué cuenta.
export function FacturacionPestanas({ conteos }: { conteos: ConteosPestanas }) {
  const pathname = usePathname();
  const m = useSearchParams().get("m");
  const activa = pestanaDeRuta(pathname);
  const mes = esMesValido(m) ? m : null;
  return (
    <Pestanas
      etiquetaAccesible="Vistas de Comprobantes"
      activa={activa}
      idIndicador="facturacion"
      items={PESTANAS.map((p) => {
        const c = conteos[p.clave];
        return {
          clave: p.clave,
          etiqueta: p.etiqueta,
          href: hrefPestana(p, mes),
          conteo: c ? c.valor : undefined,
          pide: c ? c.texto : undefined,
          tono: c?.tono === "rojo" ? "rojo" : c?.tono === "neutro" ? "neutro" : undefined,
        };
      })}
    />
  );
}
