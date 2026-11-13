"use client";

import { useState } from "react";
import { escudoDe } from "@/lib/escudo-de-tienda";

/**
 * Cómo se ve una tienda en la cabecera: su escudo; si todavía no tiene o la imagen no llega (Vogels: la dependencia puede fallar), su
 * nombre en letras, como antes. El escudo es decorativo (`alt=""`): el botón que lo contiene ya dice «Tienda: Lima. Cambiar».
 */
export function MarcaDeTienda({ nombre }: { nombre: string }) {
  const escudo = escudoDe(nombre);
  // La imagen que falló, no un sí/no: si la tienda cambia, la nueva tiene su propia oportunidad.
  const [rota, setRota] = useState<string | null>(null);
  if (!escudo || rota === escudo) return <>{nombre}</>;
  // eslint-disable-next-line @next/next/no-img-element -- un SVG de 28 px: el optimizador de imágenes no aporta nada.
  return <img className="t-escudo" src={escudo} alt="" decoding="async" onError={() => setRota(escudo)} />;
}

/** El escudo chico de una fila de la lista de tiendas. Con `hueco`, una tienda sin escudo guarda su lugar para que los nombres queden alineados. */
export function EscudoDeFila({ nombre, hueco }: { nombre: string; hueco: boolean }) {
  const escudo = escudoDe(nombre);
  const [rota, setRota] = useState<string | null>(null);
  if (!escudo || rota === escudo) return hueco ? <span className="t-escudo t-escudo-hueco" aria-hidden="true" /> : null;
  // eslint-disable-next-line @next/next/no-img-element -- ver arriba.
  return <img className="t-escudo" src={escudo} alt="" decoding="async" onError={() => setRota(escudo)} />;
}
