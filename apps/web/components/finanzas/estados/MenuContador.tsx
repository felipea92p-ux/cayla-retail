"use client";

import { useRouter } from "next/navigation";
import { MenuAcciones } from "@/components/ui/MenuAcciones";

/** «Para el contador» (ADR-0611): lo que no se usa todos los días, en un solo botón junto a las pestañas. Los permisos ya vienen resueltos: lo que la cuenta no ve, no llega aquí. */
export function MenuContador({ opciones }: { opciones: readonly { clave: string; etiqueta: string; href: string }[] }) {
  const router = useRouter();
  return (
    <MenuAcciones
      etiqueta="Para el contador"
      texto="Para el contador"
      guia="fin-estados.contador"
      items={opciones.map((o) => ({ clave: o.clave, etiqueta: o.etiqueta, onSelect: () => router.push(o.href) }))}
    />
  );
}
