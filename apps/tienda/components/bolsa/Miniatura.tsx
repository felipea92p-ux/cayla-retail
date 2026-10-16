"use client";

import { useState } from "react";
import Image from "next/image";
import type { Forma } from "@/lib/catalogo";
import { DibujoPrenda } from "../DibujoPrenda";

/**
 * La prenda en chico (la bolsa, el pedido, «Mis pedidos»; maqueta `tile`): su foto o, si no tiene o no carga, la silueta de su
 * categoría en su color. `optimizar`: si el optimizador de Next puede achicarla (`fotoOptimizable`); si no, va tal cual.
 */
export function Miniatura({
  foto,
  optimizar,
  forma,
  color,
}: {
  foto: string | null;
  optimizar: boolean;
  forma: Forma;
  color: string | null;
}) {
  const [rota, setRota] = useState(false);
  const conFoto = Boolean(foto) && !rota;
  return (
    <span className={`t-mini${conFoto ? "" : " sin-foto"}`} aria-hidden="true">
      <span className="t-dibujo">
        <DibujoPrenda forma={forma} color={color} />
      </span>
      {conFoto && foto && <Image src={foto} alt="" fill sizes="96px" unoptimized={!optimizar} onError={() => setRota(true)} />}
    </span>
  );
}
