"use client";

import { useRouter } from "next/navigation";
import { useDescargaContador } from "@/components/finanzas/estados/DescargarContador";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import type { OpcionContador } from "@/lib/contador-reglas";

/** «Para el contador» (ADR-0611): lo que no se usa todos los días, en un solo botón: los saldos por cuenta, el libro diario y cada archivo del mes. Los permisos ya vienen resueltos. */
export function MenuContador({ opciones, mes }: { opciones: readonly OpcionContador[]; mes: string }) {
  const router = useRouter();
  const { bajar } = useDescargaContador(mes);
  return (
    <MenuAcciones
      etiqueta="Para el contador"
      texto="Para el contador"
      guia="fin-estados.contador"
      items={opciones.map((o) => ({ clave: o.clave, etiqueta: o.etiqueta, onSelect: () => ("href" in o ? router.push(o.href) : void bajar(o.archivo)) }))}
    />
  );
}
