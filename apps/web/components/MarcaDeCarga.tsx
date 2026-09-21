"use client";

import { useEffect } from "react";
import { marcarCarga } from "@/lib/ultima-carga-facturacion";

/** No dibuja nada: le avisa a la cabecera de Facturación que esta vista acaba de llegar del servidor.
 *  `en` no se usa como hora (el reloj del servidor no es el de quien mira): solo cambia cuando el
 *  servidor vuelve a armar la página (`router.refresh()`, cambiar de vista), y eso es lo que dispara
 *  el aviso. La hora que se guarda es la del navegador. */
export function MarcaDeCarga({ en }: { en: number }) {
  useEffect(() => {
    marcarCarga(Date.now());
  }, [en]);
  return null;
}
