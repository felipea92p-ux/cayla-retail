"use client";

import { useState } from "react";
import { Check, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import { ComboResponsable } from "@/components/ComboResponsable";

/**
 * «Anotar que no había» en el modal de talla (spike 2026-09-26, hallazgo 3): la clienta pidió una talla que no hay en
 * esta sede y no le sirve esperar. Queda en `pedidos_no_atendidos` (D-79, ADR-0152) para que Compras vea qué se pidió y
 * no había. La función de la base ya existía; hasta hoy nadie la llamaba desde el mostrador.
 *
 * Firma el responsable del combo del ticket (la función usa `fn_actor_persona_id(true)`, que con el responsable
 * obligatorio rechaza una anotación sin él). Es el MISMO control que el del ticket: si aún no se eligió, el combo sale
 * aquí mismo y lo elegido vale también para la venta.
 */
export function AnotarNoHabia({
  ubicacionId,
  descripcion,
  tallas,
  clientaId,
  responsable,
}: {
  ubicacionId: string;
  /** Qué pidió, en palabras del catálogo: «Blusa Carlita · Blanco». */
  descripcion: string;
  /** Las tallas de la prenda que no se pueden cobrar aquí. Con más de una, se toca la que pidió. */
  tallas: string[];
  clientaId: string | null;
  responsable: ControlResponsable;
}) {
  const [estado, setEstado] = useState<"listo" | "guardando" | "anotado">("listo");
  const [talla, setTalla] = useState<string | null>(tallas.length === 1 ? tallas[0] : null);

  async function anotar() {
    if (!responsable.listo || (tallas.length > 1 && !talla)) return;
    setEstado("guardando");
    const { error } = await firmar(
      createClient().rpc("registrar_pedido_no_atendido", {
        p_ubicacion_id: ubicacionId,
        p_descripcion_libre: descripcion,
        p_talla: talla ?? undefined,
        p_clienta_id: clientaId ?? undefined,
      }),
      responsable.firma(),
    );
    if (error) {
      // Solo ante un rechazo: con éxito, `despues` vaciaría el combo y soltaría a quien atiende la venta en curso.
      responsable.despues(error);
      setEstado("listo");
      return void avisar.error(traducirError(error, "anotar el pedido"));
    }
    setEstado("anotado");
    avisar.exito("Anotado: no había", { detalle: `${descripcion}${talla ? ` · talla ${talla}` : ""}. Compras lo verá en Pedidos no atendidos.` });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-hueso px-3 py-2.5 text-xs text-tinta/75">
        <Flag className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-[12rem] flex-1">
          {estado === "anotado" ? "Anotado. Compras ya lo ve." : "¿La talla que pidió no está y no le sirve esperar? Anótalo para Compras."}
        </span>
        <button
          type="button"
          onClick={anotar}
          disabled={estado !== "listo" || !responsable.listo || (tallas.length > 1 && !talla)}
          className="label-cayla ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-tinta/25 bg-papel px-2.5 text-[10.5px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-60"
        >
          {estado === "anotado" ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
          {estado === "guardando" ? "Anotando…" : estado === "anotado" ? "Anotado" : "Anotar que no había"}
        </button>
      </div>
      {estado === "listo" && tallas.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Talla que pidió">
          <span className="text-[11px] text-tinta/60">¿Qué talla pidió?</span>
          {tallas.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={talla === t}
              onClick={() => setTalla(t)}
              className={`h-8 min-w-9 rounded-md border px-2 text-xs font-semibold transition-colors ${talla === t ? "border-tinta bg-tinta text-crema" : "border-sand bg-crema text-tinta hover:border-taupe"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {estado !== "anotado" && !responsable.listo && <ComboResponsable control={responsable} className="mt-2" />}
    </div>
  );
}
