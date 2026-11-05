"use client";

import { useCallback, useEffect, useState } from "react";
import { AJUSTES_DE_FABRICA, CLAVE_AJUSTES_RESUMEN, leerAjustes, type AjustesResumen } from "@/lib/ajustes-resumen-reglas";

/**
 * Las elecciones de «Qué se ve» en el Resumen, recordadas en este navegador (ver `ajustes-resumen-reglas.ts`: son una preferencia de quien mira
 * hasta que la base guarde «se ve en el Resumen»). Arranca con todo a la vista y lee lo guardado al montar: sin acceso al almacenamiento
 * (ventana privada, datos bloqueados) la pantalla funciona igual, solo que no recuerda.
 */
export function useAjustesResumen(): [AjustesResumen, (siguiente: AjustesResumen) => void] {
  const [ajustes, setAjustes] = useState<AjustesResumen>(AJUSTES_DE_FABRICA);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lo guardado solo existe en el navegador: leerlo al montar es lo que no rompe la hidratación (el servidor pinta la fábrica)
      setAjustes(leerAjustes(localStorage.getItem(CLAVE_AJUSTES_RESUMEN)));
    } catch {
      /* sin almacenamiento: se queda la fábrica */
    }
  }, []);
  const poner = useCallback((siguiente: AjustesResumen) => {
    setAjustes(siguiente);
    try {
      localStorage.setItem(CLAVE_AJUSTES_RESUMEN, JSON.stringify(siguiente));
    } catch {
      /* no se pudo recordar: vale para esta visita */
    }
  }, []);
  return [ajustes, poner];
}
