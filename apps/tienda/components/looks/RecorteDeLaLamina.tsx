"use client";

import Image from "next/image";
import { useState } from "react";

/** El recorte de una prenda sobre la lámina. Si no se puede recortar (la ruta responde que no), queda lo que venga adentro: su foto. */
export function RecorteDeLaLamina({ src, nombre, pronto, children }: { src: string; nombre: string; pronto: boolean; children: React.ReactNode }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return children;
  return (
    <span className="t-card-foto">
      <Image className="t-pieza-recorte" src={src} alt={nombre} fill sizes="(min-width: 960px) 25vw, 50vw" unoptimized loading={pronto ? "eager" : undefined} onError={() => setFallo(true)} />
    </span>
  );
}
