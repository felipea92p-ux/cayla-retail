import { Layers, Wallet } from "lucide-react";
import { money } from "@/components/PuntoDeVenta";
import { textoDeEscalon } from "@/lib/campana-reglas";
import type { EnMonto, GrupoEnTicket } from "@/lib/ofertas-de-grupo";

/** Bajo la fila de una prenda con oferta de grupo (ADR-0655), en el ticket de Vender y en el de Apartar: «3 x 2 · Verano: ahorra S/ 26.63», o
 *  cuántas faltan para armar el grupo. En un monto (actividad 8): lo que ahorra con su escalón, o cuánto le falta a la compra. */
export function PieDeGrupo({ g }: { g: GrupoEnTicket }) {
  if (g.monto) return <PieDeMonto g={g} m={g.monto} />;
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

/** «S/ 30 menos desde S/ 300 · Verano: ahorra S/ 12.86 · con S/ 150.00 más, S/ 60 menos», o «…: faltan S/ 20.00». */
function PieDeMonto({ g, m }: { g: GrupoEnTicket; m: EnMonto }) {
  const otro = m.siguiente ? `con ${money(m.siguiente.falta)} más, ${textoDeEscalon(m.siguiente.escalon, m.ahorroEn)}` : null;
  return (
    <span className="flex items-center gap-1.5">
      <Wallet aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span>
        <b className="font-semibold text-tinta">{g.titular}</b> · {g.nombre}:{" "}
        {g.ahorro > 0 ? (
          <>
            ahorra <b className="font-semibold text-rojo-profundo tabular-nums">{money(g.ahorro)}</b>
            {otro ? ` · ${otro}` : ""}
          </>
        ) : m.siguiente ? (
          <>
            faltan <b className="font-semibold tabular-nums">{money(m.siguiente.falta)}</b>
          </>
        ) : null}
      </span>
    </span>
  );
}
