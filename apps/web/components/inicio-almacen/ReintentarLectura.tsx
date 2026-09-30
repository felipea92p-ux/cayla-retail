"use client";

import { useRouter } from "next/navigation";
import { Ico } from "./iconos";

/** «Reintentar» de un bloque que no se pudo leer: pide de nuevo la pantalla (el resto ya estaba al día). */
export function ReintentarLectura({ className = "ia-mini" }: { className?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={className} onClick={() => router.refresh()}>
      <Ico clave="refresh" />
      Reintentar
    </button>
  );
}
