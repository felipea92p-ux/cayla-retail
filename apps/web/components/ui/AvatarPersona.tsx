"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { iniciales } from "@/lib/foto-perfil";
import { useFotoPersona } from "@/lib/useFotoPersona";

/** Los cuatro tamaños de una cara (ADR-0358, ronda 8): 24 dentro de una línea, 32 en listas, 40 en fichas y combos, 80 en Mi perfil. */
export type TamanoAvatar = 24 | 32 | 40 | 80;

/**
 * La cara de una persona donde retail la nombra (lateral, «Mi perfil», combo «Responsable», Colaboradores, Actividad): su foto de
 * Dynamic y, mientras se pregunta, si no tiene o si el archivo no carga, sus iniciales en serif sobre arena. Nunca el ícono de imagen
 * rota. Decorativa para los lectores de pantalla: el nombre siempre va escrito al lado.
 *
 * Desde la ronda 8 de /unificar (ADR-0358, Felipe la eligió tocándola el 2026-10-13) el tamaño es uno de cuatro (`tamano`), la foto
 * entra con un fundido en vez de saltar sobre las iniciales, y quien está de turno lleva su punto verde (`deTurno`). `className` solo
 * la ubica (márgenes, un tinte al pasar el mouse por su fila), nunca le cambia el tamaño. Varias juntas: `<PilaPersonas>`.
 * Estilos: `app/estilos/enlaces-paginas-caras.css`.
 */
export function AvatarPersona({
  personaId,
  nombre,
  tamano = 40,
  deTurno = false,
  terminal = false,
  className = "",
}: {
  personaId: string | null | undefined;
  nombre: string;
  tamano?: TamanoAvatar;
  /** El punto verde de «está de turno hoy». */
  deTurno?: boolean;
  /** Una cuenta de terminal (Roles y accesos): no es una persona, su círculo es gris y nunca busca foto. */
  terminal?: boolean;
  className?: string;
}) {
  const url = useFotoPersona(terminal ? null : personaId);
  // La URL que falló al cargar (se borró en Dynamic, sin red): se vuelve a las iniciales. Si la foto cambia, se reintenta.
  const [fallida, setFallida] = useState<string | null>(null);
  const [cargada, setCargada] = useState<string | null>(null);
  const conFoto = url !== null && url !== fallida;

  return (
    <span aria-hidden className={`avatar avatar-${tamano} ${terminal ? "avatar-terminal" : ""} ${className}`}>
      <span className="avatar-recorte">
        {conFoto ? (
          <Image
            src={url}
            alt=""
            fill
            unoptimized
            sizes="80px"
            className={`object-cover avatar-foto ${cargada === url ? "avatar-foto-lista" : ""}`}
            onLoad={() => setCargada(url)}
            onError={() => setFallida(url)}
          />
        ) : (
          iniciales(nombre)
        )}
      </span>
      {deTurno && <span className="avatar-punto" title="De turno hoy" />}
    </span>
  );
}

/** Varias personas juntas (un rol, los de turno): las caras se pisan un poco con un borde de papel y se abren al pasar el mouse; las
 *  que no caben se cuentan al final («+2»). Quien la usa escribe los nombres en otro lado (o en `titulo`): la pila es decorativa. */
export function PilaPersonas({ children, mas = 0, titulo }: { children: ReactNode; mas?: number; titulo?: string }) {
  return (
    <span className="pila-personas" title={titulo}>
      {children}
      {mas > 0 && <span className="pila-personas-mas">+{mas}</span>}
    </span>
  );
}
