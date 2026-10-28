"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { quitarTuLook } from "@/app/acciones/probador";

/** «Quitar de favoritos» de un look guardado: lo quita (no se borra) y vuelve a «Tus favoritos». */
export function QuitarLookGuardado({ id }: { id: string }) {
  const router = useRouter();
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      className="t-enlace lg-quitar"
      disabled={quitando}
      aria-busy={quitando}
      onClick={async () => {
        setQuitando(true);
        setError(false);
        const ok = await quitarTuLook(id).catch(() => false);
        if (ok) router.push("/catalogo?lista=favoritos");
        else {
          setError(true);
          setQuitando(false);
        }
      }}
    >
      {quitando ? "Quitando…" : error ? "No se pudo: vuelve a intentarlo" : "Quitar de favoritos"}
    </button>
  );
}
