"use client";

import { useState } from "react";
import { soles } from "@/lib/compras-reglas";
import { diaMes, diasEntreFechas } from "@/lib/fechas-lima";
import { subeEnCadaCompra, variacionCosto } from "@/lib/proveedores-reglas";
import type { EvolucionCosto } from "@/lib/proveedores";

// «Evolución del costo» de la ficha (maqueta 09): lo que cobra ESTE proveedor por la prenda que más se
// le compra, compra a compra. Es el argumento para pactar el precio del próximo pedido: no es lo mismo
// «es caro» que «subió 8.7 % en tres compras». Sale de `compra_items` (lo que de verdad se pagó en
// cada comprobante), no de `costo_historial`, que mezcla a todos los proveedores de la misma prenda.
//
// ADR-0122: al llegar, la línea se dibuja y los puntos aparecen uno tras otro (una vez); al pasar el mouse
// por el gráfico una guía salta a la compra más cercana, su punto crece y las demás cifras se apagan — se
// lee UNA compra sin buscarla en la fila de abajo.
//
// Con una sola compra no hay evolución que dibujar, y no se inventa una línea: el estado vacío lo dice.
// El SVG se arma a mano (dos ejes implícitos, ningún gráfico de librería): son 2–6 puntos y el dato es
// el monto sobre cada uno, no el trazo.

const ANCHO = 420;
const ALTO = 120;
const MARGEN = 24;

export function ProveedorCostoEvolucion({ evolucion }: { evolucion: EvolucionCosto | null }) {
  const puntos = evolucion?.puntos ?? [];
  const costos = puntos.map((p) => p.costo);
  const variacion = variacionCosto(costos);
  const [cerca, setCerca] = useState<number | null>(null);

  function alMover(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * ANCHO;
    let mejor = 0;
    costos.forEach((c, i) => {
      if (Math.abs(punto(c, i, costos)[0] - x) < Math.abs(punto(costos[mejor], mejor, costos)[0] - x)) mejor = i;
    });
    setCerca(mejor);
  }

  return (
    <div className="card-cayla anim-entra p-5" style={{ ["--i" as string]: 11 }}>
      <p className="label-cayla text-[11px] text-tinta/65">Evolución del costo{evolucion ? ` · ${evolucion.referencia}` : ""}</p>
      {!evolucion || puntos.length < 2 || variacion == null ? (
        <div className="mt-3">
          <p className="font-display text-2xl text-tinta/45">{puntos.length === 1 ? soles(puntos[0].costo) : "—"}</p>
          <p className="mt-1 text-xs text-tinta/65">
            {puntos.length === 1
              ? `Solo hay una compra de ${evolucion?.referencia} a este proveedor. Con dos se ve cuánto cambia lo que cobra.`
              : "Todavía no hay compras de una misma prenda para comparar."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`font-display text-3xl tabular-nums ${variacion > 0 ? "text-ambar-profundo" : variacion < 0 ? "text-verde-profundo" : "text-tinta"}`}>
              {variacion > 0 ? "+" : ""}
              {variacion.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
            </span>
            <span className="text-xs text-tinta/65">{`en ${puntos.length} compras · ${duracion(puntos[0].fecha, puntos[puntos.length - 1].fecha)}`}</span>
          </div>

          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} onMouseMove={alMover} onMouseLeave={() => setCerca(null)} className="mt-2 h-[120px] w-full" role="img" aria-label={`Costo de ${evolucion.referencia}: ${costos.map((c) => soles(c)).join(", ")}`}>
            <line x1={MARGEN} y1={ALTO - 20} x2={ANCHO - MARGEN} y2={ALTO - 20} stroke="currentColor" className="text-tinta/10" />
            <polyline points={trazo(costos)} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ ["--i" as string]: 11 }} className={`trazo-linea anim-trazo ${variacion < 0 ? "text-verde-profundo" : "text-ambar-profundo"}`} />
            {cerca != null && <line x1={punto(costos[cerca], cerca, costos)[0]} x2={punto(costos[cerca], cerca, costos)[0]} y1={6} y2={ALTO - 20} stroke="currentColor" strokeWidth={1} className="text-rojo/60" />}
            {costos.map((c, i) => {
              const [x, y] = punto(c, i, costos);
              return <circle key={i} cx={x} cy={y} r={cerca === i ? 7 : 5} fill="currentColor" style={{ animationDelay: `${650 + i * 110}ms` }} className={`anim-velo transition-[r] duration-150 ${variacion < 0 ? "text-verde-profundo" : "text-ambar-profundo"}`} />;
            })}
          </svg>

          <div className="flex justify-between text-xs">
            {puntos.map((p, i) => (
              <span key={p.documento} className={`transition-opacity duration-200 ${cerca != null && cerca !== i ? "opacity-40" : ""} ${i === 0 ? "text-left" : i === puntos.length - 1 ? "text-right" : "text-center"}`}>
                <b className="block font-semibold tabular-nums text-tinta">{soles(p.costo)}</b>
                <span className="text-tinta/55">{diaMes(p.fecha)}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 border-t border-tinta/10 pt-3 text-xs text-tinta/65">
            {subeEnCadaCompra(costos)
              ? "Sube en cada compra: el dato para pactar el precio del próximo pedido."
              : "Compara con lo que se pagó en cada compra antes de pactar el precio del próximo pedido."}
          </p>
        </>
      )}
    </div>
  );
}

/** Coordenadas de un punto: repartidos parejo en horizontal, y en vertical entre el mínimo y el máximo con aire arriba. */
function punto(costo: number, i: number, costos: number[]): [number, number] {
  const min = Math.min(...costos);
  const max = Math.max(...costos);
  const x = costos.length === 1 ? ANCHO / 2 : MARGEN + (i * (ANCHO - 2 * MARGEN)) / (costos.length - 1);
  const arriba = 14;
  const abajo = ALTO - 34;
  const y = max === min ? (arriba + abajo) / 2 : abajo - ((costo - min) / (max - min)) * (abajo - arriba);
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

function trazo(costos: number[]): string {
  return costos.map((c, i) => punto(c, i, costos).join(",")).join(" ");
}

/** «4 semanas» / «12 días» entre la primera y la última compra. */
function duracion(desde: string, hasta: string): string {
  const dias = diasEntreFechas(desde, hasta);
  if (dias < 14) return `${dias} ${dias === 1 ? "día" : "días"}`;
  return `${Math.round(dias / 7)} semanas`;
}
