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
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
      >
        Registrar gasto
      </button>
      {abierto && (
        <RegistrarGastoModal sedeId={sedeId} sedeCodigo={sedeCodigo} otrasSedes={otrasSedes} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}
