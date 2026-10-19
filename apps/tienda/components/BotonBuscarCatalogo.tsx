"use client";

import { EVENTO_BUSCAR } from "@/lib/buscar-evento";
import { Icono } from "./Icono";

/**
 * «Buscar», dentro del catálogo (A · Muro, Felipe 2026-10-19: la cabecera ya no lleva buscador). Abre el mismo buscador de siempre
 * (el de `CabeceraConCuenta`: busca mientras se escribe, por nombre, categoría o color): le avisa con un evento y la cabecera lo abre.
 * Solo la lupa (Felipe 2026-10-19: la palabra le quitaba lugar a las categorías en el celular); el lector la anuncia como «Buscar».
 */
export function BotonBuscarCatalogo() {
  return (
    <button
      type="button"
      className="t-buscar-cat"
      aria-label="Buscar"
      title="Buscar"
      onClick={(e) => window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR, { detail: { boton: e.currentTarget } }))}
    >
      <Icono nombre="lupa" />
    </button>
  );
}
