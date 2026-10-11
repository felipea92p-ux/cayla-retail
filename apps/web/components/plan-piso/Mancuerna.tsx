import { Chip } from "@/components/ui/Chip";
import { estiloDeGrupo, IconoDeGrupo } from "@/components/plan-piso/IconoDeGrupo";
import type { PropuestaMix } from "@/lib/mix-piso";
import { cifraEs, escalaDeMancuerna, pctEs, posicionEnEscala } from "@/lib/mix-piso-visual";

// Plan del piso ▸ Propuesta: DÓNDE está cada cifra de cada grupo, en una sola línea. La tabla da los números; esto muestra su distancia: lo que
// cuelga hoy, el punto de partida, lo que vendió la sede (con el rango entre el que estaría la venta real) y lo que se propone. Cuando
// los cuatro puntos caen juntos, la mezcla se parece; cuando se separan, se ve cuál empuja hacia dónde. Sin movimiento y sin rojo (solo tokens).
// Cada punto es la parte del grupo DENTRO DE SU PROPIO TOTAL (lo que cuelga, los lugares del riel, las ventas): por eso «hoy» no se compara con la propuesta
// para decir cuántas prendas faltan: eso lo dice la tabla.
// El ancho que manda es el de la TARJETA (`@container`), no el de la ventana: con el menú abierto una laptop de 1024 px deja la tarjeta en 657.

const n = cifraEs;
const pct = pctEs;

export function Mancuerna({ propuesta: p }: { propuesta: PropuestaMix }) {
  if (p.motivoSinPropuesta) return null;
  const maximo = escalaDeMancuerna(p.enRiel.flatMap((f) => [f.hoyPct, f.partidaPct, f.ventaPct, f.rangoDeVenta?.hasta, f.propuestaPct]));
  const marcas = Array.from({ length: maximo / 10 + 1 }, (_, i) => i * 10);

  return (
    <section className="card-cayla @container anim-sube p-5" style={{ "--i": 3 } as React.CSSProperties} aria-label="Hoy, punto de partida, tus ventas y propuesta de cada grupo">
      <h3 className="font-display text-xl text-tinta">Dónde está cada grupo</h3>
      <p className="mt-0.5 max-w-2xl text-[13px] text-tinta/70">
        En % de cada total (lo que cuelga, los lugares del riel, tus ventas). Cuando los puntos caen juntos, la mezcla se parece; cuando se separan, se ve quién empuja hacia dónde. Las prendas que faltan están en la tabla.
      </p>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-tinta/80" aria-label="Qué es cada marca">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full border-2 border-tinta bg-papel" />
          Hoy
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3.5 w-0.5 bg-taupe" />
          Punto de partida
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="flex items-center">
            <span className="h-0.5 w-2 bg-pizarra" />
            <span className="h-2.5 w-2.5 rounded-full bg-pizarra" />
            <span className="h-0.5 w-2 bg-pizarra" />
          </span>
          Tus ventas y su rango
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
            f.partidaPct !== null ? `punto de partida ${pct(f.partidaPct)}` : null,
            f.ventaPct !== null ? `tus ventas ${pct(f.ventaPct)}${f.rangoDeVenta ? `, entre ${n(f.rangoDeVenta.desde)} y ${n(f.rangoDeVenta.hasta)}` : ""}` : "sin ventas confirmadas",
            f.propuestaPct !== null ? `propuesta ${pct(f.propuestaPct)}` : null,
          ].filter(Boolean).join("; ");
          return (
            <div key={f.grupo.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @min-[560px]:grid-cols-[minmax(0,12rem)_1fr_4.5rem]">
              <div className="flex min-w-0 items-center gap-2 text-[13px] text-tinta" title={f.grupo.nombre}>
                <span className="shrink-0" style={estiloDeGrupo(i)}>
                  <IconoDeGrupo clave={f.grupo.clave} className="pp-ic-fila" />
                </span>
                <span className="line-clamp-2">{f.grupo.nombre}</span>
              </div>
              <div role="img" aria-label={`${f.grupo.nombre}: ${resumen}`} className="relative col-span-2 row-start-2 h-9 @min-[560px]:col-span-1 @min-[560px]:col-start-2 @min-[560px]:row-start-1">
                {marcas.map((m) => (
                  <span key={m} aria-hidden className="absolute bottom-0 top-0 w-px bg-sand" style={{ left: `${posicionEnEscala(m, maximo)}%` }} />
                ))}
                <span aria-hidden className="absolute left-0 right-0 top-1/2 h-px bg-taupe/25" />
                {f.rangoDeVenta !== null && (
                  <>
                    <span
                      aria-hidden
                      title={`Tus ventas: entre ${pct(f.rangoDeVenta.desde)} y ${pct(f.rangoDeVenta.hasta)}`}
                      className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-pizarra/70"
                      style={{ left: `${posicionEnEscala(f.rangoDeVenta.desde, maximo)}%`, width: `${Math.max(0.5, posicionEnEscala(f.rangoDeVenta.hasta, maximo) - posicionEnEscala(f.rangoDeVenta.desde, maximo))}%` }}
                    />
                  </>
                )}
                {f.partidaPct !== null && (
                  <span aria-hidden title={`Punto de partida: ${pct(f.partidaPct)}`} className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-taupe" style={{ left: `${posicionEnEscala(f.partidaPct, maximo)}%` }} />
                )}
                {f.ventaPct !== null && (
                  <span aria-hidden title={`Tus ventas: ${pct(f.ventaPct)}`} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pizarra" style={{ left: `${posicionEnEscala(f.ventaPct, maximo)}%` }} />
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
              <div className="col-start-2 row-start-1 text-right text-[13px] font-medium tabular-nums text-tinta @min-[560px]:col-start-3">{f.propuestaPct === null ? "—" : pct(f.propuestaPct)}</div>
            </div>
          );
        })}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 @min-[560px]:grid-cols-[minmax(0,12rem)_1fr_4.5rem]" aria-hidden>
          <span className="hidden @min-[560px]:block" />
          <div className="relative h-4 text-[11px] tabular-nums text-taupe">
            {/* En una tarjeta angosta solo cada 20: las marcas de 10 en 10 se amontonaban («0102030…»). */}
            {marcas.map((m, i) => (
              <span key={m} className={`absolute -translate-x-1/2 ${m % 20 === 0 ? "" : "hidden @min-[560px]:block"}`} style={{ left: `${posicionEnEscala(m, maximo)}%`, ...(i === 0 ? { transform: "none" } : {}) }}>
                {m}
              </span>
            ))}
          </div>
          <span className="hidden @min-[560px]:block" />
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
