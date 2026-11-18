"use client";

import { useCallback, useEffect, useState } from "react";
import { leerVistos, llaveDeVistos, type Vistos } from "@/lib/plan-compra-avisos";

/**
 * Los avisos del Plan que esta persona marcó como «ya lo vi», recordados en este navegador, uno por campaña (`llaveDeVistos`). Es una comodidad de
 * quien mira, no un dato del negocio: no cambia lo que el plan calcula y vale solo mientras el dato del aviso sea el mismo (`estaVisto`). Arranca
 * sin nada visto y lee lo guardado al montar; sin acceso al almacenamiento (ventana privada, datos bloqueados) la pantalla funciona igual, solo que
 * no recuerda.
 */
export function useAvisosVistos(planId: string | null): [Vistos, (siguiente: Vistos) => void] {
  const [vistos, setVistos] = useState<Vistos>({});
  useEffect(() => {
    if (!planId) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lo guardado solo existe en el navegador: leerlo al montar es lo que no rompe la hidratación (el servidor pinta «nada visto»)
      setVistos(leerVistos(localStorage.getItem(llaveDeVistos(planId))));
    } catch {
      /* sin almacenamiento: queda «nada visto» */
    }
  }, [planId]);
  const poner = useCallback(
    (siguiente: Vistos) => {
      setVistos(siguiente);
      if (!planId) return;
      try {
        localStorage.setItem(llaveDeVistos(planId), JSON.stringify(siguiente));
      } catch {
        /* no se pudo recordar: vale para esta visita */
      }
    },
    [planId],
  );
  return [vistos, poner];
}
