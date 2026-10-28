"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { entraEnLaMuestra } from "@/lib/medicion-muestra";

// Lo que mide (web-vitals y los toques) va en su propio archivo y se baja solo en las visitas de la muestra, al hidratar y sin que nada lo
// espere: medir no puede hacer más lenta la tienda que mide (ADR-0447). Las demás visitas no bajan nada más que este archivo.
const MedicionActiva = dynamic(() => import("./MedicionActiva").then((m) => m.MedicionActiva), { ssr: false });

/**
 * Cuánto tarda la tienda en el aparato del cliente, en 1 de cada 2 visitas (ADR-0447). Se sortea una vez por pestaña y se guarda en
 * `sessionStorage`: una recarga sigue en lo mismo, así una visita entra entera o no entra. En el servidor (y al hidratar) dice que no,
 * así el HTML es el mismo para todos.
 */
export function Medicion() {
  const enMuestra = useSyncExternalStore(sinCambios, enLaMuestra, () => false);
  return enMuestra ? <MedicionActiva /> : null;
}

const CLAVE_DE_MUESTRA = "cayla-medicion";
let decidida: boolean | null = null;

/** El sorteo no cambia mientras la pestaña vive: no hay nada a qué suscribirse. */
const sinCambios = () => () => {};

function enLaMuestra(): boolean {
  if (decidida !== null) return decidida;
  try {
    const guardada = sessionStorage.getItem(CLAVE_DE_MUESTRA);
    if (guardada === "si" || guardada === "no") return (decidida = guardada === "si");
    decidida = entraEnLaMuestra(Math.random());
    sessionStorage.setItem(CLAVE_DE_MUESTRA, decidida ? "si" : "no");
  } catch {
    // Sin almacenamiento (una ventana privada que lo bloquea): se sortea igual, solo para esta página.
    decidida = entraEnLaMuestra(Math.random());
  }
  return decidida;
}
