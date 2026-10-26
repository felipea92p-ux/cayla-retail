"use client";

import { useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ESTADO_ENVIO, detalleDeEnvio, notaDeEnvio, type EnvioMio } from "@/lib/mis-envios-reglas";
import { HojaEnvio } from "./HojaEnvio";

// Mis envíos: una fila de la lista (código, tienda, cuándo salió, cuántas prendas y fardos) con su estado a la derecha. Al tocarla se
// abre su detalle. Dentro de otra hoja («Cerrar mi ronda») no se abre una sobre otra: la fila se lee y ya (`soloLeer`).

/** Lo de adentro de la fila: el mismo en la versión que se toca y en la que solo se lee. */
function Cara({ e, hoy, conRonda }: { e: EnvioMio; hoy?: string; conRonda: boolean }) {
  const nota = notaDeEnvio(e, hoy);
  const estado = ESTADO_ENVIO[e.estado];
  return (
    <>
      <span className="min-w-0">
        <span className="block text-sm text-tinta">
          <span className="envio-codigo-fila">{e.numero}</span> · {e.destino.replace(/^Tienda /, "")}
        </span>
        <span className="block text-xs text-taupe">{detalleDeEnvio(e, hoy, conRonda)}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <Chip tono={estado.tono} title={estado.texto}>
          {estado.texto}
        </Chip>
        {nota && <span className="text-xs text-ambar">{nota}</span>}
      </span>
    </>
  );
}

export function FilaEnvio({ e, hoy, conRonda = false, soloLeer = false }: { e: EnvioMio; hoy?: string; conRonda?: boolean; soloLeer?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLButtonElement>(null);
  if (soloLeer) {
    return (
      <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
        <Cara e={e} hoy={hoy} conRonda={conRonda} />
      </li>
    );
  }
  return (
    <li>
      <button
        ref={origen}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierta(true)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left"
      >
        <Cara e={e} hoy={hoy} conRonda={conRonda} />
      </button>
      {abierta && <HojaEnvio e={e} hoy={hoy} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}
