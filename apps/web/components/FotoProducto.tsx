"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Foto del producto (una por modelo — decisión de Felipe, Fase B). Se sube al
// bucket público `fotos-productos` y la URL queda en productos.foto_url.
// Editar catálogo es de Líder (RLS productos_update_lider), igual que siempre.
export function FotoProducto({
  productoId,
  fotoUrl,
  referencia,
  esLider,
}: {
  productoId: string;
  fotoUrl: string | null;
  referencia: string;
  esLider: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) {
      setError("La foto pesa más de 5 MB — usa una más liviana.");
      return;
    }
    setSubiendo(true);
    setError(null);

    const supabase = createClient();
    const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
    // Nombre nuevo por subida (timestamp): evita que el navegador siga mostrando
    // la foto vieja desde su caché cuando se reemplaza.
    const ruta = `${productoId}-${Date.now()}.${extension}`;

    const { error: errSubida } = await supabase.storage.from("fotos-productos").upload(ruta, archivo, {
      cacheControl: "31536000",
      upsert: true,
    });
    if (errSubida) {
      setError(errSubida.message);
      setSubiendo(false);
      return;
    }

    const { data: publica } = supabase.storage.from("fotos-productos").getPublicUrl(ruta);
    const { error: errUpdate } = await supabase
      .from("productos")
      .update({ foto_url: publica.publicUrl })
      .eq("id", productoId);

    setSubiendo(false);
    if (errUpdate) {
      setError(errUpdate.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full max-w-56 overflow-hidden border border-tinta/10 bg-papel">
        {fotoUrl ? (
          <Image src={fotoUrl} alt={referencia} fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="font-display px-4 text-center text-sm italic text-tinta/35">Sin foto todavía</p>
          </div>
        )}
      </div>
      {esLider && (
        <>
          <input ref={inputRef} type="file" accept="image/*" onChange={onArchivo} className="hidden" />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="label-cayla border border-tinta/25 px-3 py-2 text-[9px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-50"
          >
            {subiendo ? "Subiendo…" : fotoUrl ? "Cambiar foto" : "Subir foto"}
          </button>
          {error && <p className="text-xs text-rojo">{error}</p>}
        </>
      )}
    </div>
  );
}
