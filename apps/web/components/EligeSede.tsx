"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarUbicacionActiva } from "@/app/actions/ubicacion";
import { AvisoCambioDeSede } from "@/components/AvisoCambioDeSede";
import { NOMBRE_VISTA_GLOBAL } from "@/lib/vista-global";

// CAYLA Global (ADR-0275): un botón por sede. Elegir una la deja parada ahí (la misma acción del selector de la
// cabecera) y la lleva a la pantalla que quería abrir.
export function EligeSede({ sedes, destino }: { sedes: { id: string; nombre: string }[]; destino: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [elegida, setElegida] = useState("");

  return (
    <>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {sedes.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={pendiente}
            onClick={() => {
              setElegida(s.nombre);
              startTransition(async () => {
                if (await cambiarUbicacionActiva(s.id)) router.push(destino);
              });
            }}
            className="btn-cayla btn-secundario"
          >
            {s.nombre}
          </button>
        ))}
      </div>
      <AvisoCambioDeSede activo={pendiente} de={NOMBRE_VISTA_GLOBAL} a={elegida} />
    </>
  );
}
