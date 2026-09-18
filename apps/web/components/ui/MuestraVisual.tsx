"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { createClient } from "@/lib/supabase/client";
import { subirMuestra } from "@/lib/muestra-visual";

// Compartido entre Colores y Patrones (20260918140000) — antes vivía
// duplicado dentro de ColoresLista.tsx, un único bucket, un único
// mecanismo de subida. Ver `lib/muestra-visual.ts` para el porqué de
// reusar en vez de que cada vocabulario invente su propia variante.

// El cuadradito de la grilla: la muestra real si existe, si no el hex de
// respaldo (colores) o un neutro (patrones, que no tienen hex). Mismo
// tamaño en los dos casos para que la grilla no salte. `unoptimized`
// porque viene del bucket de Storage, no de /public.
export function Muestra({ url, hex, className = "h-12 w-full" }: { url: string | null; hex: string | null; className?: string }) {
  if (url) {
    return (
      <div className={`relative ${className} overflow-hidden rounded-lg border border-tinta/10`}>
        <Image src={url} alt="" fill unoptimized className="object-cover" />
      </div>
    );
  }
  return <div className={`${className} rounded-lg border border-tinta/10`} style={{ backgroundColor: hex ?? "#e8e0d0" }} aria-hidden />;
}

// El botón de subir/cambiar muestra, sobre un <input type=file> oculto.
// Sube al instante (bucket público, sin RPC de registro) y avisa la URL
// nueva por callback; quien lo usa decide si va al estado de "nuevo valor"
// o al PATCH de edición.
export function SelectorMuestra({
  urlActual,
  hex,
  bucket,
  onSubida,
}: {
  urlActual: string | null;
  hex: string | null;
  bucket: string;
  onSubida: (url: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    const { url, error } = await subirMuestra(createClient(), archivo, bucket);
    setSubiendo(false);
    if (error || !url) {
      avisar.error(error ?? "No se pudo subir la muestra.");
      return;
    }
    onSubida(url);
  }

  return (
    <div className="flex items-center gap-3">
      <Muestra url={urlActual} hex={hex} className="h-12 w-12 shrink-0" />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="sr-only"
        disabled={subiendo}
        onChange={onArchivo}
      />
      <Boton type="button" peso="discreto" className="px-2.5 py-1.5 text-[11px]" onClick={() => input.current?.click()} disabled={subiendo}>
        {subiendo ? "Subiendo…" : urlActual ? "Cambiar muestra" : "Subir muestra"}
      </Boton>
    </div>
  );
}
