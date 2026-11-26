import { ArrowDownLeft, ArrowUpRight, HandCoins, type LucideIcon } from "lucide-react";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Chip } from "@/components/ui/Chip";
import { AnularMovimientoFondo } from "@/components/fondos/AccionesFondos";
import { TEXTO_MOVIMIENTO_FONDO, VUELVE_A_CAYLA, movimientosPorDia, type MovimientoFondo } from "@/lib/fondos-reglas";
import { diaCorto } from "@/lib/orden-pagina-reglas";
import { soles } from "@/lib/compras-reglas";

// «Entregas y devoluciones» (diseño A de Revisar compras, 2026-10-23), sacada tal cual de la hoja de `compras/fondos` (ADR-0704): ahora vive en el
// detalle de cada persona de Compradores, solo con lo suyo. La lista agrupada por día: cada movimiento con su ícono (la flecha que sale es una
// entrega; la que entra, en verde, una devolución; las monedas, el pago de una deuda), de dónde salió o a dónde volvió, el monto en serif y su
// «Anular». Lo anulado queda tachado con su chip «Anulada» y, en la línea de abajo, quién y por qué.

// El ícono de cada movimiento en «Entregas y devoluciones»: la plata que sale, la que vuelve y la que paga una deuda.
const ICONO_MOVIMIENTO: Record<MovimientoFondo["tipo"], LucideIcon> = {
  entrega_fondo: ArrowUpRight,
  devolucion_fondo: ArrowDownLeft,
  pago_deuda_fondo: HandCoins,
};

export function MovimientosDeFondo({ movimientos }: { movimientos: readonly MovimientoFondo[] }) {
  return (
    <div data-guia="fondos.movimientos" className="@container space-y-4">
      {movimientosPorDia(movimientos).map((g, i) => (
        <section key={g.dia}>
          <TituloGrupo retraso={120 + Math.min(i, 6) * 60}>{diaCorto(g.dia)}</TituloGrupo>
          <ul className="divide-y divide-sand/60">
            {g.movimientos.map((m) => {
              const anulado = m.estado === "anulado";
              const vuelve = VUELVE_A_CAYLA[m.tipo];
              const Icono = ICONO_MOVIMIENTO[m.tipo];
              const genero = m.tipo === "pago_deuda_fondo" ? "o" : "a";
              const linea = [
                m.tipo === "pago_deuda_fondo" ? "Pagó su deuda" : null,
                `${m.tipo === "entrega_fondo" ? "De" : "A"} ${m.cuenta}`,
                m.motivo,
                anulado ? `Anulad${genero}${m.anuladoPor ? ` por ${m.anuladoPor}` : ""}${m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 py-3 @min-[32rem]:grid-cols-[2.25rem_minmax(0,1fr)_auto_7rem]"
                >
                  <span
                    aria-hidden
                    className={`grid h-9 w-9 place-items-center rounded-full ${
                      anulado ? "border border-dashed border-taupe/40 text-taupe" : vuelve ? "bg-verde/10 text-verde" : "vd-gota-chica text-tinta"
                    }`}
                  >
                    <Icono className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${anulado ? "text-taupe line-through" : "text-tinta"}`}>
                      {m.persona}
                      <span className="sr-only"> · {TEXTO_MOVIMIENTO_FONDO[m.tipo]}</span>
                    </p>
                    <p className="truncate text-sm text-taupe" title={linea}>
                      {linea}
                    </p>
                  </div>
                  <p
                    className={`font-display whitespace-nowrap text-right text-xl leading-tight tabular-nums ${
                      anulado ? "text-taupe line-through" : vuelve ? "text-verde" : "text-tinta"
                    }`}
                  >
                    {vuelve ? "+ " : ""}
                    {soles(m.monto)}
                  </p>
                  <div className="col-span-full flex justify-end @min-[32rem]:col-span-1">
                    {anulado ? (
                      <Chip tono="apagado" tachado={false}>
                        Anulad{genero}
                      </Chip>
                    ) : (
                      m.puedeAnular && <AnularMovimientoFondo movimiento={m} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
