"use client";

import Image from "next/image";
import type { RefObject } from "react";
import { Modal } from "@/components/ui/Modal";

/** La foto de la prenda a tamaño completo (Felipe, 2026-10-09): se abre al tocar la miniatura del panel de Existencias (y, desde el
 *  2026-10-12, la foto de la vista rápida de Productos). Es la hoja del sistema (`<Modal>`), sin campos: solo la foto entera, sin
 *  recortar, con el color debajo del nombre. `alCerrarEnfocar`: lo que se tocó para abrirla; sin eso, el foco cae al `body` y quien
 *  usa el teclado queda fuera de la hoja de abajo. */
export function FotoAmpliada({
  fotoUrl,
  referencia,
  color,
  onCerrar,
  alCerrarEnfocar,
}: {
  fotoUrl: string;
  referencia: string;
  color: string | null;
  onCerrar: () => void;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
}) {
  return (
    <Modal titulo={referencia} subtitulo={color ?? undefined} variante="hoja" ancho="max-w-2xl" conCerrar focoEnLaHoja onClose={onCerrar} alCerrarEnfocar={alCerrarEnfocar}>
      <div className="grid place-items-center overflow-hidden rounded-xl bg-hueso">
        <Image
          src={fotoUrl}
          alt={`${referencia}${color ? ` — ${color}` : ""}`}
          width={1200}
          height={1600}
          unoptimized
          className="h-auto max-h-[72dvh] w-auto max-w-full object-contain"
        />
      </div>
    </Modal>
  );
}
