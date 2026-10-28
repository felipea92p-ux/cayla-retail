"use client";

import { useEffect } from "react";

/**
 * En la bolsa vacía (2026-10-16): si la persona agrega una prenda desde sus carriles («Agregar» con la talla), la página pasa a ser la
 * bolsa llena y la vista sube a ella. Sin esto quedaba abajo, donde estaban los carriles, mirando la mitad de la bolsa. Sube al irse
 * esta pieza (cuando la bolsa deja de estar vacía); al ir a otra página, esa página ya empieza arriba.
 */
export function SubirAlLlenar() {
  useEffect(
    () => () => {
      window.scrollTo({ top: 0 });
    },
    [],
  );
  return null;
}
