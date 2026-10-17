"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { quitarAviso } from "@/app/acciones/club";
import { MENSAJES_CLUB } from "@/lib/club";
import { useAvisoBreve } from "./useAvisoBreve";

/** «Quitar» de una espera en «Mi cuenta ▸ Te avisamos cuando llegue» (maqueta, `w-quitar-aviso`). Quitar no borra nada en la base:
 *  la espera queda como historia de lo que se pidió; la lista se vuelve a leer y ya no la muestra. */
export function QuitarEspera({ esperaId, prenda }: { esperaId: string; prenda: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const { aviso, mostrar } = useAvisoBreve();

  function tocar() {
    if (pendiente) return;
    iniciar(async () => {
      const estado = await quitarAviso(esperaId);
      if (estado === "quitada") {
        router.refresh();
        return;
      }
      if (estado === "no_esta") {
        mostrar(MENSAJES_CLUB.quitarNoEsta, false);
        router.refresh();
        return;
      }
      mostrar(estado === "sin_sesion" ? "Entra a tu cuenta para quitarlo." : MENSAJES_CLUB.quitarSinRespuesta, false);
    });
  }

  return (
    <>
      <button type="button" className="c-quitar" onClick={tocar} disabled={pendiente} aria-busy={pendiente || undefined} aria-label={`Quitar el aviso de ${prenda}`}>
        Quitar
      </button>
      {aviso}
    </>
  );
}
