"use client";

import { useRef, useState } from "react";
import { accionTuFondo, caraTuFondo, type ResumenMiFondo } from "@/lib/fondos-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { TarjetaTuFondo } from "./TarjetaTuFondo";
import { RendirFondo } from "./RendirFondo";

/**
 * «Tu fondo» con su acción (ADR-0362, fase 6 · actividad 5): «Rendir» cuando hay algo nuevo que rendir y ninguna rendición abierta, o
 * «Ver tu rendición» mientras espera aprobación (`accionTuFondo`). La hoja vive en `RendirFondo`. Sin la lectura de la rendición (la base
 * todavía no la tiene), la tarjeta sale igual, sin acción.
 *
 * Vive en Órdenes de compra y, desde /formidable (Felipe 2026-10-14), también en el Inicio: rendir no pide módulo, y sin el de Órdenes de
 * compra el Inicio era el único lugar donde la persona veía su fondo y no tenía dónde rendirlo. `href` (solo el Inicio): a dónde lleva la
 * tarjeta cuando no hay nada que rendir, como antes; con una acción, la tarjeta no es un enlace (`TarjetaTuFondo` no lleva los dos).
 */
export function TuFondoConRendir({ fondo, guia, href, className }: { fondo: ResumenMiFondo; guia: string; href?: string; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  const texto = accionTuFondo(caraTuFondo(fondo, diaMes));
  return (
    <>
      <TarjetaTuFondo
        fondo={fondo}
        guia={guia}
        className={className}
        href={texto ? undefined : href}
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
