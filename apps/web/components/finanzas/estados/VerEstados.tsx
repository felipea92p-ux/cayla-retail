"use client";

import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { MenuAcciones } from "@/components/ui/MenuAcciones";

// «Ver» en la cabecera de Estados financieros (Felipe 2026-10-31: «un menú para ver las seis en pantalla»): las respuestas en palabras de
// tienda, o cualquiera de los seis cuadros del contador —los cuatro estados en su formato formal, los saldos por cuenta y el libro diario—,
// los mismos seis del menú «Descargar para el contador», ahora para mirarlos sin bajar nada. El botón dice cuál se está viendo.

export type OpcionVer = { clave: string; etiqueta: string; href: string; motivo?: string };

export function VerEstados({ opciones, activa }: { opciones: readonly OpcionVer[]; activa: string }) {
  const router = useRouter();
  const actual = opciones.find((o) => o.clave === activa) ?? opciones[0]!;
  return (
    <MenuAcciones
      texto={`Ver: ${actual.etiqueta}`}
      etiqueta="Qué ver en pantalla"
      guia="fin-estados.ver"
      icono={<Eye aria-hidden className="-my-1 h-4 w-4 shrink-0" />}
      items={opciones.map((o) => ({
        clave: o.clave,
        etiqueta: o.clave === activa ? `${o.etiqueta} ✓` : o.etiqueta,
        onSelect: () => router.push(o.href),
        ...(o.motivo ? { motivo: o.motivo } : {}),
      }))}
    />
  );
}
