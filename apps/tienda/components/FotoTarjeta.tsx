"use client";

import { useState } from "react";
import Image from "next/image";
import type { Forma } from "@/lib/catalogo";
import { DibujoPrenda } from "./DibujoPrenda";

// Lo que se ve de una prenda en su tarjeta: su foto (y la segunda al pasar el mouse) o, si no tiene o no carga, su silueta en su
// color. La foto viene del almacén PÚBLICO de fotos de prendas del ERP: se muestra sin ninguna llave. La usan también los lugares
// chicos (el buscador, los círculos de categorías, las fotos del héroe), cada uno con su `tamanos`.
const TAMANOS = "(min-width: 960px) 25vw, (min-width: 700px) 33vw, 50vw";

export function FotoTarjeta({
  foto,
  segunda,
  optimizar,
  nombre,
  forma,
  color,
  tamanos = TAMANOS,
}: {
  foto: string | null;
  segunda: string | null;
  /** Por foto: si el optimizador de Next puede achicarla (`fotoOptimizable`). Si no, se muestra tal cual. */
  optimizar: [boolean, boolean];
  nombre: string;
  forma: Forma;
  color: string | null;
  /** El ancho con que se ve (el `sizes` de la imagen). */
  tamanos?: string;
}) {
  // Una foto que no carga (borrada, sin red): queda la silueta, nunca una imagen rota.
  const [rota, setRota] = useState(false);
  const conFoto = Boolean(foto) && !rota;
  return (
    <span className={`t-card-foto${conFoto ? "" : " sin-foto"}`}>
      <span className="t-dibujo">
        <DibujoPrenda forma={forma} color={color} />
      </span>
      {conFoto && foto && (
        <Image
          src={foto}
          alt={nombre}
          fill
          sizes={tamanos}
          unoptimized={!optimizar[0]}
          className={`f1${segunda ? " con-f2" : ""}`}
          onError={() => setRota(true)}
        />
      )}
      {conFoto && segunda && <Image src={segunda} alt="" fill sizes={tamanos} unoptimized={!optimizar[1]} className="f2" />}
    </span>
  );
}
