"use client";

import Image from "next/image";
import { useState } from "react";
import { iniciales } from "@/lib/foto-perfil";
import { useFotoPersona } from "@/lib/useFotoPersona";

/**
 * La cara de una persona donde retail la nombra (lateral, «Mi perfil», combo «Responsable», Colaboradores): su foto de
 * Dynamic y, mientras se pregunta, si no tiene o si el archivo no carga, sus iniciales. Nunca el ícono de imagen rota.
 * El tamaño y el tipo de letra los pone quien lo usa (`className`); el círculo, el fondo y el recorte, este componente.
 * Decorativo para los lectores de pantalla: el nombre siempre va escrito al lado.
 */
export function AvatarPersona({ personaId, nombre, className = "h-9 w-9 text-sm" }: {
  personaId: string | null | undefined;
  nombre: string;
  className?: string;
}) {
  const url = useFotoPersona(personaId);
  // La URL que falló al cargar (se borró en Dynamic, sin red): se vuelve a las iniciales. Si la foto cambia, se reintenta.
  const [fallida, setFallida] = useState<string | null>(null);
  const conFoto = url !== null && url !== fallida;

  return (
    <span aria-hidden className={`font-display relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-sand text-tinta ${className}`}>
      {conFoto ? (
        <Image src={url} alt="" fill unoptimized sizes="80px" className="object-cover" onError={() => setFallida(url)} />
      ) : (
        iniciales(nombre)
      )}
    </span>
  );
}
