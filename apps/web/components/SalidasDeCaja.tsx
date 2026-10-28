"use client";

import { useState } from "react";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { BarrasTiempo, type TonoBarraTiempo } from "@/components/ui/BarrasTiempo";
import { usePorPagar } from "@/components/PorPagarContexto";
import { soles } from "@/lib/compras-reglas";
import type { SalidaCaja } from "@/lib/compras-indicadores";
import { cubrirCaja, enCubetaCaja, parseMonto } from "@/lib/por-pagar-reglas";
import { CalendarClock } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";

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

// `salidas_caja_30d()` numera desde 0: 0 = vencido, 1 = la semana en curso, 2–4 = las que siguen y 5 = «Después» (el único sin `hasta`).
// El color lo pone la pantalla: lo vencido en rojo y la semana en curso en ámbar; las demás, en la arena de la pieza.
function tonoDe(s: SalidaCaja): TonoBarraTiempo | undefined {
  if (s.esVencido) return "rojo";
  if (s.orden === 1) return "ambar"; // la semana actual
  return undefined;
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
    <div data-guia="por-pagar.salidas" className="card-cayla anim-entra min-w-0 p-5" style={{ ["--i" as string]: indice }}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="label-cayla text-[11px] text-tinta/65">Salidas de caja · próximos 30 días</p>
        {max > 0 && (
          <label data-guia="por-pagar.caja" className="flex items-center gap-1.5 text-xs text-tinta/65">
            Tengo
            {/* La caja que se enciende, baja (ADR-0358, ronda 6): antes una raya con su propio hilo. */}
            <span className="caja-cayla caja-campo caja-campo-baja min-h-8 w-[7.5rem] gap-1 px-2">
              <span aria-hidden className="text-tinta/70">S/</span>
              <input
                inputMode="decimal"
                value={cajaTxt}
                onChange={(e) => setCajaTxt(e.target.value)}
                placeholder="caja"
                aria-label="Caja disponible, para ver hasta dónde alcanza"
                className="self-stretch py-0 text-right text-[13px] tabular-nums"
              />
            </span>
          </label>
        )}
      </div>
      {max <= 0 ? (
        <Vacio tamano="chico" alinear="izquierda" className="mt-2 px-0" icono={<CalendarClock />}>No hay pagos que venzan en los próximos 30 días.</Vacio>
      ) : (
        <>
          {/* Las barras por tiempo del sistema (ronda 14 de /unificar), con la cifra sobre cada semana: tocar una filtra la lista, pasar el
              mouse resalta lo suyo, y la raya verde de abajo es lo que cubre la caja que escribiste. */}
          <BarrasTiempo
            className="mt-3"
            alto={150}
            cifras="todas"
            barras={salidas.map((s, i) => ({
              clave: String(s.orden),
              valor: s.monto,
              etiqueta: s.etiqueta,
              tono: tonoDe(s),
              aria: `${s.etiqueta}: ${s.monto.toFixed(2)} soles en ${s.comprobantes} comprobantes. Filtrar la lista`,
              cifra: <CifraQueCuenta valor={s.monto} formato="monto" alMontar />,
              tip: (
                <>
                  <b className="block font-semibold">
                    {s.esVencido ? "Vencido" : s.etiqueta} · {s.comprobantes} {s.comprobantes === 1 ? "comprobante" : "comprobantes"}
                  </b>
                  <span className="mt-1 block border-t border-crema/20 pt-1">Acumulado {soles(acumulados[i])}</span>
                </>
              ),
              debajo: (
                <span
                  aria-hidden
                  className="absolute -bottom-[9px] left-[12%] right-[12%] h-[3px] origin-left rounded-full bg-verde transition-transform duration-700 ease-cayla"
                  style={{ transform: `scaleX(${hayCaja ? cobertura.fracciones[i] : 0})` }}
                />
              ),
            }))}
            respuesta={{
              elegida: hayFiltro ? (filtroLocal?.clave.slice("caja:".length) ?? null) : null,
              onApuntar: (clave) => {
                const s = clave === null ? null : salidas.find((x) => String(x.orden) === clave);
                apuntar(s ? { tipo: "caja", cubeta: { desde: s.desde, hasta: s.hasta } } : null);
              },
              onElegir: (clave) => {
                const s = salidas.find((x) => String(x.orden) === clave)!;
                alternarFiltro({
                  clave: `caja:${s.orden}`,
                  etiqueta: s.esVencido ? "Salidas: lo vencido" : `Salidas: ${s.etiqueta}`,
                  coincide: (c) => enCubetaCaja(c, { desde: s.desde, hasta: s.hasta }),
                });
              },
            }}
            etiqueta="Salidas de caja de los próximos 30 días, por semana"
          />
          <p className="mt-2 min-h-5 text-xs text-tinta/70" aria-live="polite">
            {veredicto}
          </p>
        </>
      )}
    </div>
  );
}
