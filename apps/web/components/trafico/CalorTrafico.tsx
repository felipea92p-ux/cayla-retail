"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import {
  DIAS_CORTOS,
  celdaTexto,
  diasTexto,
  horaRedonda,
  lecturaDeCalor,
  miles,
  personas,
  tramoTexto,
  type CalorTrafico as Calor,
} from "@/lib/trafico-reglas";

/** «12a · 3 · 6 · 9 · 12p · 3 · 6 · 9»: las horas del encabezado, cada 3 (24 nombres no caben). */
const nombreHora = (h: number) => (h % 3 ? "" : h === 0 ? "12a" : h < 12 ? String(h) : h === 12 ? "12p" : String(h - 12));
/** Cuánto rojo lleva una celda: de 6 % (nadie) a 92 % (la más fuerte). */
const tinte = (v: number, max: number) => Math.round(6 + (max > 0 ? v / max : 0) * 86);
/** «de 7 a 10 p. m.» ya termina en punto: no lleva otro. */
const conPunto = (t: string) => (t.endsWith(".") ? t : `${t}.`);
const unDecimal = (v: number) => (v >= 10 ? miles(Math.round(v)) : v.toLocaleString("es-PE", { maximumFractionDigits: 1 }));

/**
 * «Cuándo entra la gente» (actividad 4; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): el mapa de calor día de la semana × hora,
 * en rojo CAYLA, con las 6 horas más fuertes marcadas, el total de cada día a la derecha y cuánta gente entra en cada hora abajo. Mira el
 * período, pero nunca menos de 4 semanas (con un día no hay patrón). La respuesta va en una frase; el detalle de cada celda, al pasar el
 * mouse o al tocarla.
 */
export function CalorTrafico({ calor, ampliado, ahora }: { calor: Calor; ampliado: boolean; ahora: { dia: number; hora: number } | null }) {
  const l = lecturaDeCalor(calor);
  const [tip, setTip] = useState<{ x: number; y: number; titulo: string; texto: string } | null>(null);
  const maxDia = Math.max(0, ...l.porDia);
  const maxHora = Math.max(0, ...l.porHora);
  const frase =
    l.dias && l.pico
      ? `Entra más gente los ${diasTexto(l.dias)}, ${conPunto(tramoTexto(l.pico.desde, l.pico.hasta))}`
      : "Todavía es muy poca gente para saber cuándo entra más.";

  const mostrar = (e: PointerEvent<HTMLDivElement>) => {
    const celda = (e.target as HTMLElement).closest<HTMLElement>("[data-celda]");
    if (!celda) return setTip(null);
    const caja = e.currentTarget.getBoundingClientRect();
    const r = celda.getBoundingClientRect();
    const [d, h] = celda.dataset.celda!.split("-").map(Number);
    setTip({ x: r.left - caja.left + r.width / 2, y: r.top - caja.top, titulo: celdaTexto(d, h), texto: `${unDecimal(l.prom[d][h])} por hora, en promedio` });
  };

  return (
    <section className="trafico-calor-tarjeta anim-sube card-cayla px-5 py-4" style={{ "--i": 6 } as CSSProperties} aria-labelledby="trafico-calor" data-guia="trafico.calor">
      <TituloSeccion id="trafico-calor" dato={`Personas por hora, en promedio${ampliado ? " · últimas 4 semanas" : ""}`}>
        Cuándo entra la gente
      </TituloSeccion>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {l.dias && l.pico && <Chip tono="verde">Hora pico</Chip>}
        <p className="min-w-0 flex-1 basis-[18rem] text-[14.5px] text-tinta/70">
          {l.dias && l.pico ? (
            <>
              Entra más gente los <b className="font-semibold text-tinta">{diasTexto(l.dias)}</b>,{" "}
              <b className="font-semibold text-tinta">{conPunto(tramoTexto(l.pico.desde, l.pico.hasta))}</b>
              {l.tranquilo && ` Lo más tranquilo, ${conPunto(tramoTexto(l.tranquilo.desde, l.tranquilo.hasta))}`}
            </>
          ) : (
            frase
          )}
        </p>
      </div>
      <div className="relative mt-4" onPointerOver={mostrar} onPointerLeave={() => setTip(null)}>
        <div className="trafico-calor" role="img" aria-label={`Mapa de personas por día de la semana y hora. ${frase}`}>
          <span />
          {l.porHora.map((_, h) => (
            <span key={h} className="trafico-calor-hora">
              {nombreHora(h)}
            </span>
          ))}
          <span className="trafico-calor-hora trafico-calor-total text-right">Total</span>
          {l.prom.map((fila, d) => (
            <div key={d} className="contents">
              <span className="trafico-calor-dia">{DIAS_CORTOS[d]}</span>
              {fila.map((v, h) => (
                <span
                  key={h}
                  className="trafico-calor-celda"
                  data-celda={`${d}-${h}`}
                  data-fuerte={l.fuertes.has(d * 24 + h) || undefined}
                  style={{ background: `color-mix(in srgb, var(--color-rojo) ${tinte(v, l.maximo)}%, var(--color-hueso))` }}
                >
                  {ahora?.dia === d && ahora.hora === h && <i className="trafico-calor-ahora" title="Ahora" />}
                </span>
              ))}
              <span className="trafico-calor-total trafico-calor-suma">
                <b>{unDecimal(l.porDia[d])}</b>
                <i style={{ width: `${maxDia > 0 ? Math.round((l.porDia[d] / maxDia) * 100) : 0}%` }} />
              </span>
            </div>
          ))}
          <span className="trafico-calor-dia self-end text-[11px]">Por hora</span>
          {l.porHora.map((n, h) => (
            <span key={h} className="trafico-calor-barra" title={`${horaRedonda(h)}: ${personas(n)}`}>
              <i
                data-pico={(l.pico && h >= l.pico.desde && h < l.pico.hasta) || undefined}
                style={{ height: `${Math.max(3, maxHora > 0 ? Math.round((n / maxHora) * 34) : 0)}px` }}
              />
            </span>
          ))}
          <span className="trafico-calor-total" />
        </div>
        {tip && (
          <div role="tooltip" className="linea-globo" style={{ left: tip.x, top: tip.y }}>
            <b className="block font-semibold">{tip.titulo}</b>
            {tip.texto}
          </div>
        )}
      </div>
      <p className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[12px] text-tinta/70">
        <span>Menos gente</span>
        <i aria-hidden className="trafico-calor-escala" />
        <span>Más gente</span>
        <span aria-hidden className="hidden h-3.5 w-px bg-sand sm:inline-block" />
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="trafico-calor-muestra" />
          Las 6 horas más fuertes
        </span>
        {ahora && (
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="trafico-calor-ahora relative" />
            Ahora
          </span>
        )}
      </p>
    </section>
  );
}
