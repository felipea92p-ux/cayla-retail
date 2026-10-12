"use client";

import { useState } from "react";
import { Check, Flag } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { traducirError } from "@/lib/error-escritura";
import { registrarPedidoNoAtendido } from "@/lib/pedidos-no-atendidos-acciones";
import { avisoAnotado } from "@/lib/se-probo-reglas";
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
 *
 * Anota con el motivo «buscó y no había» (`no_habia_talla`, ADR-0288 D-6): es el único que avisará «Llegó tu talla». El
 * otro motivo de la misma tabla, «se la probó y no la llevó», nace en Cobrar al quitar una prenda del ticket.
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
  /** Las tallas de la prenda que no se pueden cobrar aquí, con su variante si se conoce. Con más de una, se toca la que pidió. */
  tallas: { talla: string; varianteId: string | null }[];
  clientaId: string | null;
  responsable: ControlResponsable;
}) {
  const [estado, setEstado] = useState<"listo" | "guardando" | "anotado">("listo");
  const [talla, setTalla] = useState<string | null>(tallas.length === 1 ? tallas[0].talla : null);
  // ADR-0348: la prenda exacta (producto, talla y color) viaja con lo anotado, para que el motor de demanda sume lo que se pidió y
  // no había en su grupo. Si no se conoce, queda como antes: el texto y la talla.
  const varianteId = tallas.find((t) => t.talla === talla)?.varianteId ?? null;

  async function anotar() {
    if (!responsable.listo || (tallas.length > 1 && !talla)) return;
    setEstado("guardando");
    const { error } = await registrarPedidoNoAtendido(
      { ubicacionId, motivo: "no_habia_talla", descripcion, talla, clientaId, varianteId },
      responsable.firma(),
    );
    if (error) {
      // Solo ante un rechazo: con éxito, `despues` vaciaría el combo y soltaría a quien atiende la venta en curso.
      responsable.despues(error);
      setEstado("listo");
      return void avisar.error(traducirError(error, "anotar el pedido"));
    }
    setEstado("anotado");
    const aviso = avisoAnotado("no_habia_talla", descripcion, talla);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
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
          className="btn-cayla btn-secundario ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[12.5px]"
        >
          {estado === "anotado" ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
          {estado === "guardando" ? "Anotando…" : estado === "anotado" ? "Anotado" : "Anotar que no había"}
        </button>
      </div>
      {estado === "listo" && tallas.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Talla que pidió">
          <span className="text-[11px] text-tinta/60">¿Qué talla pidió?</span>
          {tallas.map(({ talla: t }) => (
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
