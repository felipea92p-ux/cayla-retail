"use client";

import Image from "next/image";
import { useState } from "react";
import type { FotoTraslado } from "@/lib/producto-fotos-reglas";

// Hasta tres miniaturas REALES de lo que viaja (ver `fotosDelTraslado`), junto al
// texto de la celda «Contenido». Sin fotos —el caso más común mientras el catálogo
// se fotografía— se dibujan los COLORES de lo que va (rediseño 2026-09-22): es un
// dato real («van blusas negras y tops beige»), no un marcador de «sin foto». Sin
// fotos ni colores (Estampado, Multicolor) no se dibuja nada.
// Si una URL da 404 (el archivo se borró a mano, cambió el host) esa foto se
// descarta; si no queda ninguna, tampoco se dibuja nada: nunca una imagen rota.
// `unoptimized`: el repo no declara dominios remotos para el optimizador de
// imágenes (igual que las otras 8 imágenes de Storage), y una miniatura de
// 32 px no lo necesita.
export function TrasladoMiniaturas({ fotos, colores = [] }: { fotos: FotoTraslado[]; colores?: string[] }) {
  const [rotas, setRotas] = useState<Set<string>>(new Set());
  const buenas = fotos.filter((f) => !rotas.has(f.url));
  if (buenas.length === 0) {
    if (colores.length === 0) return null;
    return (
      <span aria-hidden className="flex shrink-0 -space-x-2">
        {colores.map((hex) => (
          <span key={hex} className="h-8 w-[26px] shrink-0 rounded-md border border-tinta/10 ring-2 ring-papel" style={{ background: hex }} />
        ))}
      </span>
    );
  }
  return (
    <span aria-hidden className="flex shrink-0 -space-x-2">
      {buenas.map((f) => (
        <Image
          key={f.url}
          src={f.url}
          alt=""
          title={f.referencia}
          width={32}
          height={32}
          unoptimized
          onError={() => setRotas((actual) => new Set(actual).add(f.url))}
          className="h-8 w-8 shrink-0 rounded-md border border-tinta/10 object-cover ring-2 ring-papel"
        />
      ))}
    </span>
  );
}
