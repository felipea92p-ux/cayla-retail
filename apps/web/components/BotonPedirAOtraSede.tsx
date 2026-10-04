"use client";

import { useState } from "react";
import { PedirAOtraSedeModal } from "@/components/PedirAOtraSedeModal";

// El botón «Pedir a otra sede» de Traslados (ADR-0242 D-7, 2026-10-03): abre el modal con la tienda y las prendas por elegir.
// Sin tiendas a quienes pedirles (quien mira es el Taller, o no hay otra tienda activa) no se dibuja: un botón que solo
// puede fallar es peor que ninguno. `sedes` sale de `sedesParaPedir` (lib/pedidos-entre-sedes-reglas.ts).
export function BotonPedirAOtraSede({ ubicacionId, sedes }: { ubicacionId: string; sedes: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  if (sedes.length === 0) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-cayla btn-secundario">
        Pedir a otra sede
      </button>
      <PedirAOtraSedeModal ubicacionId={ubicacionId} sedesParaElegir={sedes} abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}
