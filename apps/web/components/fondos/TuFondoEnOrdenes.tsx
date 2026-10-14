"use client";

import { useRef, useState } from "react";
import { caraTuFondo, type ResumenMiFondo } from "@/lib/fondos-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { TarjetaTuFondo } from "./TarjetaTuFondo";
import { RendirFondo } from "./RendirFondo";

/**
 * «Tu fondo» en Órdenes de compra, con su acción (ADR-0362, fase 6 · actividad 5): «Rendir» cuando hay algo nuevo que rendir y ninguna
 * rendición abierta, o «Ver tu rendición» mientras espera aprobación. La hoja vive en `RendirFondo`. Sin la lectura de la rendición (la
 * base todavía no la tiene), la tarjeta sale igual, sin acción.
 */
export function TuFondoEnOrdenes({ fondo, guia, className }: { fondo: ResumenMiFondo; guia: string; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const c = caraTuFondo(fondo, diaMes);
  const texto = c.rendicionAbierta ? "Ver tu rendición" : c.puedeRendir ? "Rendir" : null;
  return (
    <>
      <TarjetaTuFondo
        fondo={fondo}
        guia={guia}
        className={className}
        accion={
          texto
            ? {
                texto,
                onClick: () => {
                  origen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  setAbierta(true);
                },
              }
            : undefined
        }
      />
      {abierta && <RendirFondo fondo={fondo} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}
