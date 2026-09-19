"use client";

import { useState } from "react";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { usePorPagar } from "@/components/PorPagarContexto";
import { soles } from "@/lib/compras-reglas";
import type { SalidaCaja } from "@/lib/compras-indicadores";
import { cubrirCaja, enCubetaCaja, parseMonto } from "@/lib/por-pagar-reglas";

// «Salidas de caja · próximos 30 días» (maqueta 02): cuánto vence cada semana, para saber si la caja alcanza ANTES de la fecha y no
// después. Seis columnas que entrega `salidas_caja_30d()`: lo ya vencido, cuatro semanas desde hoy (Lima) y «Después». Sin librería de
// gráficos: divs con altura proporcional al mayor monto, como la maqueta.
//
// Spike 2026-09-19 (mismo modelo que ADR-0128): la tarjeta decía «saber si la caja alcanza» pero no lo respondía. Ahora escribes cuánta
// caja tienes y cada semana muestra cuánto queda cubierto (filete verde bajo la barra) con una frase: «cubres lo vencido; a 18–24 sep
// le faltan S/ 1,856». El monto es solo de pantalla: no se guarda ni viaja a ningún lado. Además las columnas apuntan a sus filas de la
// lista (eco) y un clic deja solo esa semana (filtro local; `desde`/`hasta` son los bordes que devuelve la base «para filtrar al tocar»).
//
// Colores: rojo lo vencido (hay que actuar), ámbar la semana en curso, tinta el resto. Los montos van sobre cada barra porque el gráfico
// es chico y el dato es el punto.

const ALTO_MAX = 96; // px de la barra más alta

// `salidas_caja_30d()` numera desde 0: 0 = vencido, 1 = la semana en curso, 2–4 = las que siguen y 5 = «Después» (el único sin `hasta`).
function colorDe(s: SalidaCaja): string {
  if (s.esVencido) return "bg-rojo";
  if (s.orden === 1) return "bg-ambar"; // la semana actual
  if (s.hasta === null) return "bg-tinta/25"; // «Después»
  return "bg-tinta/55";
}

function comoSeDice(s: SalidaCaja): string {
  return s.esVencido ? "lo vencido" : s.hasta === null ? "lo de después" : `la semana ${s.etiqueta}`;
}

export function SalidasDeCaja({ salidas, indice = 0 }: { salidas: SalidaCaja[]; /** Posición en la entrada escalonada de la pantalla. */ indice?: number }) {
  const { apuntar, filtroLocal, alternarFiltro } = usePorPagar();
  const [cajaTxt, setCajaTxt] = useState("");
  const max = Math.max(0, ...salidas.map((s) => s.monto));
  const caja = parseMonto(cajaTxt);
  const hayCaja = Number.isFinite(caja) && caja > 0;
  const cobertura = cubrirCaja(hayCaja ? caja : 0, salidas.map((s) => s.monto));
  const hayFiltro = !!filtroLocal?.clave.startsWith("caja:");

  let veredicto: React.ReactNode = "Monto que vence en cada semana (S/). La semana actual en ámbar. Escribe cuánta caja tienes y verás hasta dónde alcanza.";
  if (hayCaja) {
    const { ultimaCubierta, primeraFaltante, sobra } = cobertura;
    if (primeraFaltante && ultimaCubierta === null) {
      veredicto = (
        <>
          Con <b className="font-semibold text-tinta">{soles(caja)}</b> no alcanza ni para {comoSeDice(salidas[primeraFaltante.indice])}: faltan <b className="font-semibold text-tinta">{soles(primeraFaltante.falta)}</b>.
        </>
      );
    } else if (primeraFaltante && ultimaCubierta !== null) {
      veredicto = (
        <>
          Con <b className="font-semibold text-tinta">{soles(caja)}</b> cubres <b className="font-semibold text-verde-profundo">{comoSeDice(salidas[ultimaCubierta])}</b>
          {ultimaCubierta > 0 ? " y todo lo anterior" : ""}. Para {comoSeDice(salidas[primeraFaltante.indice])} te faltarían <b className="font-semibold text-tinta">{soles(primeraFaltante.falta)}</b>.
        </>
      );
    } else {
      veredicto = (
        <>
          Con <b className="font-semibold text-tinta">{soles(caja)}</b> cubres <b className="font-semibold text-verde-profundo">toda la deuda</b> y te sobran <b className="font-semibold text-tinta">{soles(sobra)}</b>.
        </>
      );
    }
  }

  // Lo que se lleva vencido y por vencer hasta cada semana (el globo de cada barra lo dice).
  const acumulados = salidas.map((_, i) => Math.round(salidas.slice(0, i + 1).reduce((a, x) => a + x.monto, 0) * 100) / 100);
  return (
    <div className="card-cayla anim-entra p-5" style={{ ["--i" as string]: indice }}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="label-cayla text-[11px] text-tinta/65">Salidas de caja · próximos 30 días</p>
        {max > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-tinta/65">
            Tengo
            <span className="relative flex items-center gap-1 border-b border-tinta/25 px-0.5 [&:focus-within>span:last-child]:scale-x-100">
              S/
              <input
                inputMode="decimal"
                value={cajaTxt}
                onChange={(e) => setCajaTxt(e.target.value)}
                placeholder="caja"
                aria-label="Caja disponible, para ver hasta dónde alcanza"
                className="w-[5.25rem] bg-transparent text-right text-[13px] tabular-nums text-tinta outline-none placeholder:text-tinta/40"
              />
              <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 origin-left scale-x-0 bg-rojo transition-transform duration-300 ease-cayla" />
            </span>
          </label>
        )}
      </div>
      {max <= 0 ? (
        <p className="mt-4 text-sm text-tinta/65">No hay pagos que venzan en los próximos 30 días.</p>
      ) : (
        <>
          <div className="mt-3 flex h-[158px] items-end gap-2.5 border-b border-tinta/10">
            {salidas.map((s, i) => {
              const activa = filtroLocal?.clave === `caja:${s.orden}`;
              const cubierta = hayCaja ? cobertura.fracciones[i] : 0;
              return (
                <button
                  key={s.orden}
                  type="button"
                  aria-pressed={activa}
                  aria-label={`${s.etiqueta}: ${s.monto.toFixed(2)} soles en ${s.comprobantes} comprobantes. Filtrar la lista`}
                  onMouseEnter={() => apuntar({ tipo: "caja", cubeta: { desde: s.desde, hasta: s.hasta } })}
                  onMouseLeave={() => apuntar(null)}
                  onFocus={() => apuntar({ tipo: "caja", cubeta: { desde: s.desde, hasta: s.hasta } })}
                  onBlur={() => apuntar(null)}
                  onClick={() =>
                    alternarFiltro({
                      clave: `caja:${s.orden}`,
                      etiqueta: s.esVencido ? "Salidas: lo vencido" : `Salidas: ${s.etiqueta}`,
                      coincide: (c) => enCubetaCaja(c, { desde: s.desde, hasta: s.hasta }),
                    })
                  }
                  className={`group relative flex h-full flex-1 flex-col items-center justify-end gap-[5px] transition-opacity duration-200 ${hayFiltro && !activa ? "opacity-40" : ""}`}
                >
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-[calc(100%+4px)] z-10 w-max max-w-[11rem] rounded-[10px] bg-tinta px-2.5 py-2 text-left text-xs text-crema opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 ${i < 3 ? "left-0" : "right-0"}`}
                  >
                    <b className="block font-semibold">
                      {s.esVencido ? "Vencido" : s.etiqueta} · {s.comprobantes} {s.comprobantes === 1 ? "comprobante" : "comprobantes"}
                    </b>
                    <span className="mt-1 block border-t border-crema/20 pt-1 tabular-nums">Acumulado {soles(acumulados[i])}</span>
                  </span>
                  <span className="text-xs tabular-nums text-tinta/75">
                    <CifraQueCuenta valor={s.monto} formato="monto" alMontar />
                  </span>
                  <span
                    className={`anim-crece-y block w-full max-w-[58px] rounded-b-sm rounded-t-md transition-[height,transform] duration-700 ease-cayla group-hover:scale-x-[1.06] group-focus-visible:scale-x-[1.06] ${colorDe(s)}`}
                    style={{ height: `${s.monto > 0 ? Math.max(8, Math.round((s.monto / max) * ALTO_MAX)) : 0}px`, ["--i" as string]: i * 2 }}
                  />
                  <span
                    aria-hidden
                    className="absolute -bottom-[9px] left-[12%] right-[12%] h-[3px] origin-left rounded-full bg-verde transition-transform duration-700 ease-cayla"
                    style={{ transform: `scaleX(${cubierta})` }}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-3.5 flex gap-2.5">
            {salidas.map((s) => (
              <span key={s.orden} className="flex-1 text-center text-xs leading-tight text-tinta/65 sm:whitespace-nowrap">
                {s.etiqueta}
              </span>
            ))}
          </div>
          <p className="mt-2 min-h-5 text-xs text-tinta/60" aria-live="polite">
            {veredicto}
          </p>
        </>
      )}
    </div>
  );
}
