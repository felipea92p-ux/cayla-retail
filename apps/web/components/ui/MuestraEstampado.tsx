"use client";

import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";

const SIZES = { punto: "44px", lista: "80px" } as const;

/**
 * La foto de un estampado donde un color liso dibuja su punto (ADR-0634): un punto del tono dominante no dice cuál es.
 * Ocupa la caja que le dé quien la usa. Si la foto no carga, queda el tono dominante.
 */
export function MuestraEstampado({ fotoUrl, hex, forma = "punto" }: { fotoUrl: string; hex?: string | null; forma?: keyof typeof SIZES }) {
  return (
    <ImagenDePrenda
      src={fotoUrl}
      alt=""
      fill
      sizes={SIZES[forma]}
      className="object-cover"
      fondo={hex}
      fallback={<span aria-hidden data-color-dato className="absolute inset-0" style={{ backgroundColor: hex ?? "var(--color-hueso)" }} />}
    />
  );
}
