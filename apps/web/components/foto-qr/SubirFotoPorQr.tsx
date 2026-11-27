"use client";

import { useState } from "react";
import { Camera, Check } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { FOTOS_POR_QR } from "@/lib/foto-por-qr-reglas";

// Lo que ve el celular al escanear el QR (ADR-0699): el nombre del modelo y UN botón que abre la cámara. La foto sube apenas se toma y
// aparece sola en la computadora. Sin sesión, sin menú y sin ningún otro dato del ERP.

type Estado = { tipo: "listo" } | { tipo: "subiendo" } | { tipo: "subida"; quedan: number } | { tipo: "error"; texto: string };

export function SubirFotoPorQr({ permiso, nombre, quedan: quedanAlEntrar, error }: { permiso: string; nombre: string | null; quedan: number; error: string | null }) {
  const [estado, setEstado] = useState<Estado>(error ? { tipo: "error", texto: error } : { tipo: "listo" });
  const [quedan, setQuedan] = useState(quedanAlEntrar);
  const cerrado = !!error || quedan <= 0;

  async function subir(archivo: File) {
    setEstado({ tipo: "subiendo" });
    const datos = new FormData();
    datos.append("foto", archivo);
    try {
      const r = await fetch(`/api/foto-qr/${permiso}`, { method: "POST", body: datos });
      const cuerpo = (await r.json().catch(() => null)) as { ok?: boolean; quedan?: number; error?: string } | null;
      if (!r.ok || !cuerpo?.ok) {
        setEstado({ tipo: "error", texto: cuerpo?.error ?? "No se pudo subir la foto. Inténtalo otra vez." });
        return;
      }
      setQuedan(cuerpo.quedan ?? 0);
      setEstado({ tipo: "subida", quedan: cuerpo.quedan ?? 0 });
    } catch {
      setEstado({ tipo: "error", texto: "Sin conexión. Revisa el wifi e inténtalo otra vez." });
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-crema px-4 py-8">
      <div className="vd-placa grid w-full max-w-sm gap-5 rounded-tarjeta p-6 text-center">
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-secundario">CAYLA · Recibir mercadería</p>
          <h1 className="font-serif text-xl text-tinta">{nombre ?? "Foto de la prenda"}</h1>
          {!cerrado && <p className="texto-bajada">Saca la foto de frente, con la prenda entera.</p>}
        </div>

        {estado.tipo === "subida" && (
          <p className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-verde" role="status">
            <Check aria-hidden className="h-5 w-5" />
            Listo: ya está en la computadora
          </p>
        )}
        {estado.tipo === "error" && <Aviso tono="error">{estado.texto}</Aviso>}

        {!cerrado && (
          <label className={`btn-cayla btn-primario mov-boton h-14 cursor-pointer text-sm ${estado.tipo === "subiendo" ? "pointer-events-none" : ""}`} aria-busy={estado.tipo === "subiendo"}>
            <Camera aria-hidden className="h-5 w-5" />
            {estado.tipo === "subiendo" ? "Subiendo…" : estado.tipo === "subida" ? "Tomar otra" : "Tomar la foto"}
            <input
              type="file"
              aria-label="Foto de la prenda"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif"
              capture="environment"
              className="sr-only"
              disabled={estado.tipo === "subiendo"}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) void subir(archivo);
              }}
            />
          </label>
        )}
        {!error && <p className="texto-detalle">{quedan > 0 ? `Puedes subir ${quedan} de ${FOTOS_POR_QR}.` : "Ya subiste las fotos de este código."}</p>}
      </div>
    </main>
  );
}
