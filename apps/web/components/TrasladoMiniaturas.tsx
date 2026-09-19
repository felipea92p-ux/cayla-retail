"use client";

import Image from "next/image";
import { useState } from "react";
import type { FotoTraslado } from "@/lib/producto-fotos-reglas";

// Hasta tres miniaturas REALES de lo que viaja (ver `fotosDelTraslado`), debajo
// del texto de la celda «Contenido». Sin fotos —el caso más común mientras el
// catálogo se fotografía— no se dibuja NADA: ni un marcador ni cajas grises, la
// fila simplemente es más baja. Un marcador repetido en cada fila leería como
// una función rota, y debajo del texto no hay nada que alinear.
// Si una URL da 404 (el archivo se borró a mano, cambió el host) esa foto se
// descarta; si no queda ninguna, tampoco se dibuja nada: nunca una imagen rota.
// `unoptimized`: el repo no declara dominios remotos para el optimizador de
// imágenes (igual que las otras 8 imágenes de Storage), y una miniatura de
// 32 px no lo necesita.
export function TrasladoMiniaturas({ fotos }: { fotos: FotoTraslado[] }) {
  const [rotas, setRotas] = useState<Set<string>>(new Set());
  const buenas = fotos.filter((f) => !rotas.has(f.url));
  if (buenas.length === 0) return null;
  return (
    <span aria-hidden className="mt-1.5 flex -space-x-2">
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
