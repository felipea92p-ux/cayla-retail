"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarSedeActiva } from "@/app/actions/sede";

// Selector de sede del Líder: "pararse" en TRU, AQP, LIM o el Taller y que toda la
// app (caja, almacén, recibir) trabaje sobre esa sede. Las Encargadas no lo ven.
export function SedeSwitcher({
  sedes,
  sedeActualId,
}: {
  sedes: { id: string; codigo: string }[];
  sedeActualId: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [valor, setValor] = useState(sedeActualId);

  return (
    <select
      value={valor}
      disabled={pendiente}
      onChange={(e) => {
        const sedeId = e.target.value;
        setValor(sedeId);
        startTransition(async () => {
          await cambiarSedeActiva(sedeId);
          router.refresh();
        });
      }}
      className="label-cayla cursor-pointer card-cayla px-2 py-1.5 text-[10px] text-tinta outline-none transition-colors hover:border-rojo focus:border-rojo disabled:opacity-50"
      title="Cambiar de sede"
    >
      {sedes.map((s) => (
        <option key={s.id} value={s.id}>
          {s.codigo}
        </option>
      ))}
    </select>
  );
}
