"use client";

import { Camera, Check } from "lucide-react";

// La foto de un papel (el voucher, la boleta del gasto, el papel de la compra) como una tarjeta punteada de un toque, con su ayuda; lista,
// con el borde verde y el nombre del archivo (maqueta docs/maquetas/compras-formidable-2026-10/). La usan las hojas de Mi plata y el paso
// del papel de «Compré ropa»: una sola cara para lo mismo (ADR-0358).
export function TarjetaFoto({
  archivo,
  onArchivo,
  titulo = "Tomar la foto",
  ayuda,
  deshabilitada = false,
  guia,
}: {
  archivo: File | null;
  onArchivo: (f: File | null) => void;
  titulo?: string;
  /** Lo que se lee debajo mientras no hay foto: «Que se lea el total y el número». */
  ayuda: string;
  deshabilitada?: boolean;
  guia?: string;
}) {
  return (
    <label
      data-guia={guia}
      className={`mov-boton flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] p-3.5 text-left ${
        archivo ? "border-solid border-verde" : "border-dashed border-taupe/55"
      } ${deshabilitada ? "pointer-events-none opacity-60" : ""}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hueso text-tinta">
        {archivo ? <Check className="h-5 w-5 text-verde" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-tinta">{archivo ? `Lista: ${archivo.name}` : titulo}</span>
        <span className="block text-xs text-taupe">{archivo ? "Toca para cambiarla" : ayuda}</span>
      </span>
      <input
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="sr-only"
        disabled={deshabilitada}
        onChange={(e) => {
          onArchivo(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );
}
