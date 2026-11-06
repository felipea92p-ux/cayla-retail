"use client";

import { useId, useState, type PointerEvent } from "react";
import { geometriaDeLinea, LIENZO, type PuntoDeLinea } from "@/lib/estados-linea";
import { soles } from "@/lib/flujo-caja-reglas";

const VERDE = { stopColor: "var(--color-verde)" };
const ROJO = { stopColor: "var(--color-rojo)" };

/**
 * Cómo viene mes a mes (ADR-0611; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`): una línea con su área, verde arriba del cero y roja debajo, de borde a borde de la
 * placa. Marca el mes que se mira y, si se miran unas fechas que no son un mes, una franja con lo de esas fechas. Al pasar el mouse lee cada mes. Es una pieza de esta
 * pantalla por decisión de Felipe (ADR-0611), no la `<Linea>` del sistema.
 */
export function LineaDeMeses({
  serie,
  activo,
  franja,
  etiqueta,
}: {
  serie: readonly PuntoDeLinea[];
  /** El mes que se mira: su posición en la serie. `null` si está fuera de la línea. */
  activo: number | null;
  /** Las fechas que se miran, si no son un mes entero, en % del ancho. */
  franja?: { de: number; a: number; valor: string; titulo: string } | null;
  /** Qué mide, para quien no ve el gráfico. */
  etiqueta: string;
}) {
  const id = useId();
  const [sobre, setSobre] = useState<number | null>(null);
  const geo = geometriaDeLinea(serie.map((p) => p.valor));
  if (!geo) return <p className="estados-linea-sin-datos">Cuando haya dos meses, aquí verás cómo viene.</p>;

  function alPasar(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setSobre(Math.max(0, Math.min(serie.length - 1, Math.floor(((e.clientX - r.left) / r.width) * serie.length))));
  }

  const conFranja = sobre === null && !!franja;
  const marcado = sobre ?? (franja ? null : activo);
  const punto = marcado === null ? null : geo.puntos[marcado]!;
  const altoCero = (geo.cero ?? 100) / 100;
  // El globito: sobre el mes marcado o sobre la franja, sin salirse de la placa.
  const centroFranja = franja ? (franja.de + franja.a) / 2 : 0;
  const yFranja = franja && activo !== null ? geo.puntos[activo]!.y : 40;
  const globo = conFranja ? { x: centroFranja, y: yFranja, b: franja!.valor, s: franja!.titulo } : punto ? { x: punto.x, y: punto.y, b: soles(serie[marcado!]!.valor), s: serie[marcado!]!.nombre } : null;
  return (
    <div className="estados-linea-marco">
      <div className="estados-linea">
        <svg viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`${id}-trazo`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2={LIENZO.alto}>
              <stop offset={0} style={VERDE} />
              <stop offset={altoCero} style={VERDE} />
              <stop offset={altoCero} style={ROJO} />
              <stop offset={1} style={ROJO} />
            </linearGradient>
            <linearGradient id={`${id}-area`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2={LIENZO.alto}>
              <stop offset={0} style={{ ...VERDE, stopOpacity: 0.42 }} />
              <stop offset={geo.cero === null ? 0.98 : altoCero} style={{ ...VERDE, stopOpacity: 0.03 }} />
              <stop offset={geo.cero === null ? 0.99 : altoCero} style={{ ...ROJO, stopOpacity: 0.03 }} />
              <stop offset={1} style={{ ...ROJO, stopOpacity: 0.36 }} />
            </linearGradient>
          </defs>
          <path d={geo.area} fill={`url(#${id}-area)`} />
          <path d={geo.trazo} fill="none" stroke={`url(#${id}-trazo)`} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {franja && <i className="estados-linea-franja" style={{ left: `${franja.de}%`, width: `${franja.a - franja.de}%` }} />}
        {geo.cero !== null && (
          <div className="estados-linea-cero" style={{ top: `${geo.cero}%` }}>
            <small>{soles(0)}</small>
          </div>
        )}
        <div className="estados-linea-zona" data-sobre={sobre !== null || undefined} onPointerMove={alPasar} onPointerLeave={() => setSobre(null)}>
          {punto && (
            <>
              <span className="estados-linea-guia" style={{ left: `${punto.x}%` }} />
              <span className="estados-linea-punto" data-mal={serie[marcado!]!.valor < 0 || undefined} style={{ left: `${punto.x}%`, top: `${punto.y}%` }} />
            </>
          )}
          {globo && (
            <div className="estados-linea-globo" style={{ left: `clamp(84px, ${globo.x}%, calc(100% - 84px))`, top: `${Math.max(globo.y, 26)}%` }}>
              <b className="tabular-nums">{globo.b}</b>
              <span>{globo.s}</span>
            </div>
          )}
        </div>
      </div>
      <div className="estados-linea-meses" aria-hidden>
        {serie.map((p, i) => (
          <span key={p.nombre} data-puesto={i === (sobre ?? activo) || undefined} data-alterno={i % 2 !== (activo ?? 0) % 2 || undefined} style={{ left: `${((i + 0.5) / serie.length) * 100}%` }}>
            {p.etiqueta}
          </span>
        ))}
      </div>
      <ul className="sr-only" aria-label={etiqueta}>
        {serie.map((p) => (
          <li key={p.nombre}>{`${p.nombre}: ${soles(p.valor)}`}</li>
        ))}
      </ul>
    </div>
  );
}
