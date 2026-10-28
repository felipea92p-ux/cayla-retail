"use client";

import { useState } from "react";
import { Camera, Check } from "lucide-react";
import { objecionArchivo } from "@/lib/adjuntos-compra";

// La foto de un papel (el voucher, la boleta del gasto, el papel de la compra) como una tarjeta punteada de un toque, con su ayuda; lista,
// con el borde verde y el nombre del archivo (maqueta docs/maquetas/compras-formidable-2026-10/). La usan las hojas de Mi plata y el paso
// del papel de «Compré ropa»: una sola cara para lo mismo (ADR-0358).
//
// `camara` (de fábrica): el celular abre la cámara directo, para fotografiar un papel. Sin ella deja elegir también de la galería: el
// voucher de un Yape o de una transferencia casi siempre es una captura de pantalla que ya está en el celular, y con la cámara forzada
// no había cómo adjuntarla.
//
// Un archivo que no se puede subir (muy pesado, de otro tipo) se rechaza al elegirlo, con el motivo en la tarjeta: antes se aceptaba y
// recién al tocar «Anotar» o «Guardar», con todo lo demás ya llenado, decía «No se subió la foto».
export function TarjetaFoto({
  archivo,
  onArchivo,
  titulo = "Tomar la foto",
  ayuda,
  camara = true,
  deshabilitada = false,
  guia,
}: {
  archivo: File | null;
  onArchivo: (f: File | null) => void;
  titulo?: string;
  /** Lo que se lee debajo mientras no hay foto: «Que se lea el total y el número». */
  ayuda: string;
  /** Abre la cámara directo (un papel); `false` deja elegir de la galería (una captura de pantalla). */
  camara?: boolean;
  deshabilitada?: boolean;
  guia?: string;
}) {
  const [rechazo, setRechazo] = useState<string | null>(null);
  return (
    <label
      data-guia={guia}
      // El `<input>` está oculto (`sr-only`): con el teclado, el anillo de foco del sistema se dibuja en la tarjeta entera (`has-…:focus-visible`).
      className={`mov-boton flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] p-3.5 text-left has-[:focus-visible]:[outline-offset:var(--foco-separacion)] has-[:focus-visible]:[outline:var(--foco-ancho)_solid_var(--foco-color)] ${
        archivo ? "border-solid border-verde" : "border-dashed border-borde-control"
      } ${deshabilitada ? "pointer-events-none opacity-60" : ""}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hueso text-tinta">
        {archivo ? <Check className="h-5 w-5 text-verde" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-tinta">{archivo ? `Lista: ${archivo.name}` : titulo}</span>
        {rechazo ? (
          <span className="block text-xs text-rojo-profundo" role="alert">
            {rechazo} Elige otra.
          </span>
        ) : (
          <span className="block text-xs text-taupe">{archivo ? "Toca para cambiarla" : ayuda}</span>
        )}
      </span>
      <input
        type="file"
        accept="image/*,application/pdf"
        capture={camara ? "environment" : undefined}
        className="sr-only"
        disabled={deshabilitada}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          // Cancelar el selector no borra la foto que ya estaba.
          if (!f) return;
          const motivo = objecionArchivo(f);
          setRechazo(motivo);
          if (!motivo) onArchivo(f);
        }}
      />
    </label>
  );
}
