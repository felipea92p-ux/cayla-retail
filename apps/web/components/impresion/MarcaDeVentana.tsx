"use client";

import { useEffect } from "react";
import { direccionSinMarca, ventanaDeLaDireccion, ventanaDelEquipo } from "@/lib/ventana-de-impresion";

/**
 * Lee la marca que traen los íconos «CAYLA Caja» y «CAYLA Etiquetas» (`?ventana=caja`), la guarda en esta ventana y la
 * quita de la dirección. Va en el layout raíz: si la sesión venció, el ícono cae primero en el login, que conserva la
 * dirección, y ahí también se lee. Montado una vez; no dibuja nada.
 */
export function MarcaDeVentana() {
  useEffect(() => {
    const marca = ventanaDeLaDireccion(window.location.search);
    if (!marca) return;
    ventanaDelEquipo.fijar(marca);
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${direccionSinMarca(search)}${hash}`);
  }, []);
  return null;
}
