import { MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import type { PropuestaMix } from "@/lib/mix-piso";
import { claseDeTramo, escalaDeMancuerna, posicionEnEscala } from "@/lib/mix-piso-visual";

// Plan del piso ▸ Propuesta: DÓNDE está cada cifra de cada grupo, en una sola línea. La tabla da los números; esto muestra su distancia: lo que
// cuelga hoy, lo que dice la industria, lo que vendió la sede (con el rango entre el que estaría la venta real) y lo que se propone. Cuando
// los cuatro puntos caen juntos, el grupo está bien; cuando se separan, se ve cuál empuja hacia dónde. Sin movimiento y sin rojo (solo tokens).

const n = (x: number) => x.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const pct = (x: number) => `${n(x)} %`;

export function Mancuerna({ propuesta: p }: { propuesta: PropuestaMix }) {
  if (p.motivoSinPropuesta) return null;
  const maximo = escalaDeMancuerna(p.enRiel.flatMap((f) => [f.hoyPct, f.partidaPct, f.ventaPct, f.rangoDeVenta?.hasta, f.propuestaPct]));
  const marcas = Array.from({ length: maximo / 10 + 1 }, (_, i) => i * 10);

  return (
    <section className="card-cayla anim-sube p-5" style={{ "--i": 3 } as React.CSSProperties} aria-label="Hoy, industria, venta y propuesta de cada grupo">
      <h2 className="font-display text-xl text-tinta">Dónde está cada grupo</h2>
      <p className="mt-0.5 max-w-2xl text-[13px] text-tinta/70">En % del riel. Cuando los puntos caen juntos, el grupo está en su lugar; cuando se separan, se ve quién empuja hacia dónde.</p>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-tinta/80" aria-label="Qué es cada marca">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full border-2 border-tinta bg-papel" />
          Hoy
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-0.5 bg-taupe" />
          Industria
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="flex items-center">
            <span className="h-0.5 w-2 bg-pizarra" />
            <span className="h-2.5 w-2.5 rounded-full bg-pizarra" />
            <span className="h-0.5 w-2 bg-pizarra" />
          </span>
          Venta propia y su rango
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rotate-45 bg-tinta" />
          Propuesta
        </li>
      </ul>

      <div className="mt-4 space-y-1">
        {p.enRiel.map((f, i) => {
          const resumen = [
            f.hoyPct !== null ? `hoy ${pct(f.hoyPct)}` : "hoy sin datos",
            f.partidaPct !== null ? `industria ${pct(f.partidaPct)}` : null,
            f.ventaPct !== null ? `venta propia ${pct(f.ventaPct)}${f.rangoDeVenta ? `, entre ${n(f.rangoDeVenta.desde)} y ${n(f.rangoDeVenta.hasta)}` : ""}` : "sin ventas confirmadas",
            f.propuestaPct !== null ? `propuesta ${pct(f.propuestaPct)}` : null,
          ].filter(Boolean).join("; ");
          return (
            <div key={f.grupo.clave} className="grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-x-3 sm:grid-cols-[minmax(0,12rem)_1fr_4.5rem]">
              <div className="flex min-w-0 items-center gap-2 text-[13px] text-tinta">
                <MuestraTramo clase={claseDeTramo(i)} />
                <span className="truncate">{f.grupo.nombre}</span>
              </div>
              <div role="img" aria-label={`${f.grupo.nombre}: ${resumen}`} className="relative h-9">
                {marcas.map((m) => (
                  <span key={m} aria-hidden className="absolute bottom-0 top-0 w-px bg-sand" style={{ left: `${posicionEnEscala(m, maximo)}%` }} />
                ))}
                <span aria-hidden className="absolute left-0 right-0 top-1/2 h-px bg-taupe/25" />
                {f.rangoDeVenta !== null && (
                  <>
                    <span
                      aria-hidden
                      title={`Venta propia: entre ${n(f.rangoDeVenta.desde)} y ${n(f.rangoDeVenta.hasta)} %`}
                      className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-pizarra/70"
                      style={{ left: `${posicionEnEscala(f.rangoDeVenta.desde, maximo)}%`, width: `${Math.max(0.5, posicionEnEscala(f.rangoDeVenta.hasta, maximo) - posicionEnEscala(f.rangoDeVenta.desde, maximo))}%` }}
                    />
                  </>
                )}
                {f.partidaPct !== null && (
                  <span aria-hidden title={`Industria: ${pct(f.partidaPct)}`} className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-taupe" style={{ left: `${posicionEnEscala(f.partidaPct, maximo)}%` }} />
                )}
                {f.ventaPct !== null && (
                  <span aria-hidden title={`Venta propia: ${pct(f.ventaPct)}`} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pizarra" style={{ left: `${posicionEnEscala(f.ventaPct, maximo)}%` }} />
                )}
                {f.hoyPct !== null && (
                  <span
                    aria-hidden
                    title={p.cuadrado ? `Hoy: ${pct(f.hoyPct)}` : `Hoy (por cuadrar): ${pct(f.hoyPct)}`}
                    className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-tinta bg-papel ${p.cuadrado ? "" : "opacity-50"}`}
                    style={{ left: `${posicionEnEscala(f.hoyPct, maximo)}%` }}
                  />
                )}
                {f.propuestaPct !== null && (
                  <span aria-hidden title={`Propuesta: ${pct(f.propuestaPct)}`} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-tinta" style={{ left: `${posicionEnEscala(f.propuestaPct, maximo)}%` }} />
                )}
              </div>
              <div className="col-span-2 text-right text-[13px] font-medium tabular-nums text-tinta sm:col-span-1">{f.propuestaPct === null ? "—" : pct(f.propuestaPct)}</div>
            </div>
          );
        })}
        <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] gap-x-3 sm:grid-cols-[minmax(0,12rem)_1fr_4.5rem]" aria-hidden>
          <span />
          <div className="relative h-4 text-[11px] tabular-nums text-taupe">
            {marcas.map((m, i) => (
              <span key={m} className="absolute -translate-x-1/2" style={{ left: `${posicionEnEscala(m, maximo)}%`, ...(i === 0 ? { transform: "none" } : {}) }}>
                {m}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>
      {!p.cuadrado && (
        <p className="mt-3 flex items-center gap-2 text-xs text-taupe">
          <Chip tono="ambar">Por cuadrar</Chip>
          El círculo de «Hoy» sale apagado: sin cuadrar el piso, lo que el sistema dice que cuelga no es lo que hay.
        </p>
      )}
    </section>
  );
}
