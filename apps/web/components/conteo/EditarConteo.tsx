"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ====================================================================
   EditarConteo · «Editar conteo» en el resultado de un conteo cerrado (Inventario ▸ Conteo, 2026-09-29)

   Reabre el conteo (`reabrir_conteo`): vuelve a Contar con todas sus variantes y lo que se contó. Se corrige lo que
   hizo falta y se cierra como siempre; el cierre ajusta SOLO lo que se volvió a contar, como diferencia sobre el stock
   de ese momento (nada se deshace: el primer cierre queda en Movimientos). Ver la migración 20260930020000.

   Va DIRECTO a lo que se corrige (2026-09-30): si el conteo ajustó variantes, Contar se abre solo con esas (el mismo filtro
   «Contar esta prenda» de ADR-0241, con su vuelta a la lista completa); quien busca una prenda encontrada después no recorre
   toda la lista. Con más de 40, o sin ajustes, se abre la lista completa como antes.

   Sin permiso para ajustar inventario el botón no desaparece: se apaga y dice quién sí puede. Si la base no deja
   (hay otro conteo abierto en la sede), su mensaje sale debajo del botón, en las palabras del negocio.
   ==================================================================== */

const MAX_VARIANTES_EN_URL = 40;

export function EditarConteo({ conteoId, puedeEditar, variantesCorregidas = [] }: { conteoId: string; puedeEditar: boolean; variantesCorregidas?: string[] }) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function editar() {
    if (abriendo || !puedeEditar) return;
    setAbriendo(true);
    setFallo(null);
    try {
      const { error } = await createClient().rpc("reabrir_conteo", { p_conteo_id: conteoId });
      if (error) {
        setFallo(error.message || "No se pudo abrir el conteo para editarlo.");
        setAbriendo(false);
        return;
      }
      // Se queda en «Abriendo…» hasta que la página se vuelva a dibujar como Contar (un segundo clic no reabre dos veces).
      if (variantesCorregidas.length > 0 && variantesCorregidas.length <= MAX_VARIANTES_EN_URL) router.push(`/inventario/conteo/${conteoId}?variantes=${variantesCorregidas.join(",")}`);
      else router.refresh();
    } catch (e) {
      console.error("Editar conteo:", e);
      setFallo("No se pudo abrir el conteo para editarlo: no llegó una respuesta. Vuelve a intentarlo.");
      setAbriendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={editar} disabled={abriendo || !puedeEditar} className="btn-cayla btn-secundario h-11 gap-2 self-start disabled:opacity-50">
        <Pencil aria-hidden className="h-4 w-4" />
        {abriendo ? "Abriendo…" : "Editar conteo"}
      </button>
      {!puedeEditar && <p className="text-xs text-taupe">Solo quien ajusta inventario puede editar un conteo cerrado.</p>}
      {fallo && (
        <p role="alert" className="text-sm text-rojo-profundo">
          {fallo}
        </p>
      )}
    </div>
  );
}
