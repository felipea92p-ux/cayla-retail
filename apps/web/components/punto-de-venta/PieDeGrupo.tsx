import { Layers } from "lucide-react";
import { money } from "@/components/PuntoDeVenta";
import type { GrupoEnTicket } from "@/lib/ofertas-de-grupo";

/** Bajo la fila de una prenda con oferta de grupo (ADR-0655), en el ticket de Vender y en el de Apartar: «3 x 2 · Verano: ahorra S/ 26.63», o
 *  cuántas faltan para armar el grupo. */
export function PieDeGrupo({ g }: { g: GrupoEnTicket }) {
  const faltan = g.faltan === 1 ? "lleva 1 más" : `lleva ${g.faltan} más`;
  return (
    <span className="flex items-center gap-1.5">
      <Layers aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>
        <b className="font-semibold text-tinta">{g.titular}</b> · {g.nombre}:{" "}
        {g.ahorro > 0 ? (
          <>
            ahorra <b className="font-semibold text-rojo-profundo tabular-nums">{money(g.ahorro)}</b>
            {g.faltan > 0 ? ` · ${faltan} y arma otro grupo` : ""}
          </>
        ) : (
          `${faltan} y se arma el grupo`
        )}
      </span>
    </span>
  );
}
