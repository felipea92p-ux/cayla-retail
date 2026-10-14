"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { createClient } from "@/lib/supabase/client";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { traducirError } from "@/lib/error-escritura";
import { enlaceFotoGastoViaje, subirFotoGastoViaje } from "@/lib/gastos-viaje-fotos";

// La foto del papel de un gasto del viaje (ADR-0362, fase 6 · actividad 5): «Ver foto» la abre en otra pestaña con un enlace de 10 minutos;
// «Subir foto» la toma con la cámara del celular (o un archivo en el computador) y la registra (`gasto_viaje_foto`: sin combo, como el
// adjunto de una factura). Las usan la hoja de rendir (la dueña) y la de revisar (quien aprueba: solo mira).

export function VerFoto({ gastoId }: { gastoId: string }) {
  const [abriendo, setAbriendo] = useState(false);
  return (
    <button
      type="button"
      className="btn-cayla btn-enlace min-h-6 text-xs"
      disabled={abriendo}
      onClick={async () => {
        setAbriendo(true);
        const url = await enlaceFotoGastoViaje(createClient(), gastoId);
        setAbriendo(false);
        if (url) window.open(url, "_blank", "noopener");
        else avisar.error("No se pudo abrir la foto", { detalle: "Vuelve a intentarlo en un momento." });
      }}
    >
      {abriendo ? "Abriendo…" : "Ver foto"}
    </button>
  );
}

export function SubirFoto({ gastoId, alSubir, deshabilitado }: { gastoId: string; alSubir: () => void; deshabilitado?: boolean }) {
  const [subiendo, setSubiendo] = useState(false);
  return (
    <label className={`btn-cayla btn-enlace min-h-6 cursor-pointer text-xs ${subiendo || deshabilitado ? "pointer-events-none opacity-60" : ""}`}>
      {subiendo ? "Subiendo…" : "Subir foto"}
      <input
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="sr-only"
        disabled={subiendo || deshabilitado}
        onChange={async (e) => {
          const archivo = e.target.files?.[0];
          e.target.value = "";
          if (!archivo) return;
          setSubiendo(true);
          const r = await subirFotoGastoViaje(createClient(), gastoId, archivo, firmaOmitida("gasto_viaje_foto"));
          setSubiendo(false);
          if (!r.ok) {
            avisar.error("La foto no se subió", { detalle: r.motivo ?? traducirError(r.error, "subir la foto") });
            return;
          }
          avisar.exito("Foto subida", { detalle: "Quedó junto a su gasto." });
          alSubir();
        }}
      />
    </label>
  );
}
