"use client";

import Image from "next/image";
import { Modal } from "@/components/ui/Modal";

/** La foto de la prenda a tamaño completo (Felipe, 2026-10-09): se abre al tocar la miniatura del panel de Existencias. Es la
 *  hoja del sistema (`<Modal>`), sin campos: solo la foto entera, sin recortar, con el color debajo del nombre. */
export function FotoAmpliada({ fotoUrl, referencia, color, onCerrar }: { fotoUrl: string; referencia: string; color: string | null; onCerrar: () => void }) {
  return (
    <Modal titulo={referencia} subtitulo={color ?? undefined} variante="hoja" ancho="max-w-2xl" conCerrar focoEnLaHoja onClose={onCerrar}>
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
