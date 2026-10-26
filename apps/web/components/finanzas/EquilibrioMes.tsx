import type { CSSProperties } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/flujo-caja-reglas";
import type { EquilibrioMes, EstadoEquilibrio } from "@/lib/equilibrio-mes-reglas";

// Finanzas ▸ Resumen, «¿Ya pagaste el mes?» (Felipe 2026-10-24, spike 4). Solo DIBUJA lo que arma `equilibrioMes`: el camino del mes, con lo vendido
// como relleno y dos rayitas —lo que hay que vender para pagar TODO el mes y, si hay, la meta de ventas—. La frase de arriba dice desde qué día se pagó.
// La barra es la del sistema (`<BarraAvance>` con sus marcas): esta pieza no dibuja ninguna pista a mano.

const TITULO = "¿Ya pagaste el mes?";
const ESTADO: Record<EstadoEquilibrio, { texto: string; tono: TonoChip }> = {
  cubierto: { texto: "Pagado", tono: "verde" },
  en_camino: { texto: "En camino", tono: "ambar" },
  no_llega: { texto: "No alcanza", tono: "rojo" },
};

/** La posición de una etiqueta sobre el camino: pegada a su rayita, pero sin salirse de la tarjeta. */
const posicion = (pct: number): CSSProperties => ({ left: `min(max(${pct}%, 14%), 86%)` });

export function EquilibrioMesPieza({ eq, provisional }: { eq: EquilibrioMes; provisional: boolean }) {
  if (eq.tipo !== "ok")
    return (
      <Superficie pad guia="fin-resumen.equilibrio">
        <CabeceraBloque titulo={TITULO} bajada={eq.motivo} />
      </Superficie>
    );
  const p = (v: number) => (eq.tope > 0 ? Math.min(100, (v / eq.tope) * 100) : 0);
  const est = ESTADO[eq.estado];
  return (
    <Superficie pad guia="fin-resumen.equilibrio">
      <CabeceraBloque titulo={TITULO} bajada={<b>{eq.titular}</b>}>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {provisional && (
            <Chip tono="pizarra" title="Faltan gastos por registrar: lo que hay que vender puede ser más de lo que dice aquí">
              Provisional
            </Chip>
          )}
          <Chip tono={est.tono}>{est.texto}</Chip>
        </div>
      </CabeceraBloque>

      <div className="relative mt-2 pb-9 pt-9">
        <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs text-tinta" style={posicion(p(eq.pe))}>
          Pagas todo el mes con <b className="num">{soles(eq.pe)}</b>
        </span>
        <BarraAvance
          pct={p(eq.vendido)}
          alto="gruesa"
          tono={eq.estado === "cubierto" ? "verde" : "tinta"}
          marca={eq.meta !== null ? [p(eq.pe), p(eq.meta)] : p(eq.pe)}
          etiqueta={`Vendido ${soles(eq.vendido)}; para pagar todo el mes hacen falta ${soles(eq.pe)}${eq.meta !== null ? `; tu meta es ${soles(eq.meta)}` : ""}`}
        />
        {eq.meta !== null && (
          <span className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-xs text-taupe" style={posicion(p(eq.meta))}>
            Tu meta <b className="num">{soles(eq.meta)}</b>
          </span>
        )}
      </div>

      <p className="text-sm">
        <b className="num">Llevas {soles(eq.vendido)}</b> vendidos sin IGV. {eq.detalle}
      </p>
      {provisional && (
        <p className="nota-cayla mt-3">Es provisional: si todavía faltan gastos por registrar, para pagar el mes hace falta vender más de lo que dice aquí.</p>
      )}
    </Superficie>
  );
}
