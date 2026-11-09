"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { HistorialCierresModal } from "@/components/HistorialCierresModal";
import type { CierreCaja } from "@/lib/caja";

/**
 * «Historial de cierres» con la caja CERRADA: abre el MISMO modal por mes que con la caja abierta (los tickets con su sello,
 * «Cómo cerró cada día» y el detalle de cada cierre en la misma hoja). Antes (2026-10-08) este botón llevaba a la tabla de
 * `/caja/historial`, y el mismo nombre abría dos pantallas distintas según la hora (Felipe 2026-11-08: «debe mostrarse el
 * mismo modal con caja abierta o no»). La tabla de todas las sedes sigue a un toque, en «Ver todas las sedes» del modal.
 */
export function BotonHistorialCierres({ cierres, ubicacionId, ubicacionNombre }: { cierres: CierreCaja[]; ubicacionId: string; ubicacionNombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton type="button" data-guia="caja.historial-todas" onClick={() => setAbierto(true)}>
        <History className="h-4 w-4" aria-hidden />
        Historial de cierres
      </Boton>
      {abierto && <HistorialCierresModal cierres={cierres} ubicacionId={ubicacionId} ubicacionNombre={ubicacionNombre} onClose={() => setAbierto(false)} />}
    </>
  );
}
