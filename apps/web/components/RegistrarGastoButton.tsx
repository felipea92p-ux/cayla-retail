"use client";

import { useState } from "react";
import { RegistrarGastoModal } from "@/components/RegistrarGastoModal";

type Sede = { id: string; codigo: string };

export function RegistrarGastoButton({ sedeId, sedeCodigo, otrasSedes }: { sedeId: string; sedeCodigo: string; otrasSedes: Sede[] }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="label-cayla bg-rojo px-3 py-2 text-[10px] text-crema transition-colors hover:bg-rojo-profundo"
      >
        Registrar gasto
      </button>
      {abierto && (
        <RegistrarGastoModal sedeId={sedeId} sedeCodigo={sedeCodigo} otrasSedes={otrasSedes} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}
