"use client";

import { useMemo, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { formatoSolesCompacto } from "@/lib/resumen-formato";
import { DIAS_VENTANA, resumenComercial, type PrendaComercial } from "@/lib/existencias-comercial";
import type { FilaSemana } from "@/lib/existencias-categorias";

/* ====================================================================
   ResumenComercialOverlay · click en «Resumen disponible» (2026-09-29)

   Antes abría el stock por categoría con su cambio de 7 días (`DisponibleTotalOverlay`). Ahora responde a quien vende:
   cuánto salió esta semana, para cuántos días alcanza lo que hay, qué sale rápido y qué se quedó sin una sola venta.
   Las cuentas son `lib/existencias-comercial.ts` (puras, con su prueba). Usa `Modal` (ADR-0136): hereda el movimiento del
   sistema, no define ninguno propio. El valor a precio de venta solo lo ve un líder, como el costo y el margen de esta pantalla.
   ==================================================================== */

/** «7 días», «1 día», «menos de 1 día». */
function textoDias(d: number): string {
  if (d < 1) return "menos de 1 día";
  const n = Math.round(d);
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/** Cuánto urge: con 3 días o menos ya casi no hay; hasta 7, hay que ir pidiendo. */
function tonoCobertura(d: number): "rojo" | "ambar" | "verde" {
  return d <= 3 ? "rojo" : d <= 7 ? "ambar" : "verde";
}

function Cifra({ rotulo, valor, unidad, pie, tono = "tinta" }: { rotulo: string; valor: string; unidad?: string; pie: string; tono?: "tinta" | "rojo" | "ambar" }) {
  const color = tono === "rojo" ? "text-rojo-profundo" : tono === "ambar" ? "text-ambar-profundo" : "text-tinta";
  return (
    <div className="rounded-lg border border-tinta/10 bg-sand/25 p-3.5">
      <p className="label-cayla text-[10px] text-tinta/55">{rotulo}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={`font-display text-[28px] leading-none tabular-nums ${color}`}>{valor}</span>
        {unidad && <span className="text-sm text-taupe">{unidad}</span>}
      </p>
      <p className="mt-1.5 text-xs leading-snug text-taupe">{pie}</p>
    </div>
  );
}

function Seccion({ titulo, bajada, children }: { titulo: string; bajada?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-lg leading-tight text-tinta">{titulo}</h3>
      {bajada && <p className="mt-0.5 text-xs text-taupe">{bajada}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-hueso/60 px-3.5 py-3 text-sm text-taupe">{children}</p>;
}

function FilaPrenda({ p, derecha }: { p: PrendaComercial; derecha: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-tinta">{p.referencia}</span>
        <span className="block truncate text-xs text-taupe">{[p.color, p.categoria].filter(Boolean).join(" · ") || "Sin color"}</span>
      </span>
      <span className="shrink-0 text-right">{derecha}</span>
    </li>
  );
}

export function ResumenComercialOverlay({ filas, esLider, sedeNombre, onClose }: { filas: FilaSemana[]; esLider: boolean; sedeNombre: string; onClose: () => void }) {
  const r = useMemo(() => resumenComercial(filas, { esLider }), [filas, esLider]);
  const sinVentas = r.vendidas === 0;
  // La cifra de cobertura se pinta solo cuando urge (rojo o ámbar); con margen, en tinta.
  const urgenciaCobertura = r.coberturaDias === null ? "verde" : tonoCobertura(r.coberturaDias);
  const tonoDeLaCifra = urgenciaCobertura === "verde" ? "tinta" : urgenciaCobertura;

  return (
    <Modal titulo="Cómo se mueve el stock" subtitulo={`Ventas y cobertura de los últimos ${DIAS_VENTANA} días · ${sedeNombre}.`} onClose={onClose} ancho="max-w-2xl" variante="papel">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Cifra rotulo={`Vendidas en ${DIAS_VENTANA} días`} valor={r.vendidas.toLocaleString("es-PE")} unidad="uds" pie={sinVentas ? "Sin ventas registradas esta semana" : `${r.udsPorDia.toFixed(1)} uds por día`} />
          <Cifra
            rotulo="Lo que hay alcanza para"
            valor={r.coberturaDias === null ? "—" : r.coberturaDias < 1 ? "<1" : String(Math.round(r.coberturaDias))}
            unidad={r.coberturaDias === null ? undefined : "días"}
            pie={r.coberturaDias === null ? "Sin ventas no hay ritmo con qué medirlo" : `${r.disponible.toLocaleString("es-PE")} uds, al ritmo de esta semana`}
            tono={tonoDeLaCifra}
          />
          {esLider ? (
            <Cifra
              rotulo="Lo que hay, a precio de venta"
              valor={r.valorPrecio === null ? "—" : formatoSolesCompacto(r.valorPrecio)}
              pie={r.valorPrecio === null ? "Sin precios cargados" : `${r.disponible.toLocaleString("es-PE")} uds disponibles`}
            />
          ) : (
            <Cifra
              rotulo="Sin ventas esta semana"
              valor={String(r.quietasTotal.prendas)}
              unidad={r.quietasTotal.prendas === 1 ? "prenda" : "prendas"}
              pie={`${r.quietasTotal.unidades.toLocaleString("es-PE")} uds sin salida`}
              tono={r.quietasTotal.prendas > 0 ? "ambar" : "tinta"}
            />
          )}
        </div>

        <Seccion titulo="Sale rápido" bajada="Lo más vendido de la semana y para cuántos días le queda stock. Las que se acaban primero, en color.">
          {r.rapidas.length === 0 ? (
            <Vacio>Todavía no hay ventas registradas en los últimos {DIAS_VENTANA} días.</Vacio>
          ) : (
            <ul className="divide-y divide-tinta/10">
              {r.rapidas.map((p) => (
                <FilaPrenda
                  key={p.clave}
                  p={p}
                  derecha={
                    <>
                      <span className="block text-sm tabular-nums text-tinta">
                        <b className="font-semibold">{p.vendidas}</b> {p.vendidas === 1 ? "vendida" : "vendidas"} · {p.disponible === 1 ? "queda" : "quedan"} <b className="font-semibold">{p.disponible}</b>
                      </span>
                      {p.coberturaDias !== null && (
                        <Chip tono={tonoCobertura(p.coberturaDias)} versalitas={false} className="mt-1 text-xs">
                          Alcanza {textoDias(p.coberturaDias)}
                        </Chip>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion
          titulo="Sin ventas esta semana"
          bajada="Con stock toda la semana y ni una venta: son las que conviene mirar —precio, exhibición o pasarlas a otra sede—. Las recién llegadas no entran."
        >
          {r.quietas.length === 0 ? (
            <Vacio>Ninguna prenda con stock toda la semana se quedó sin vender.</Vacio>
          ) : (
            <>
              <ul className="divide-y divide-tinta/10">
                {r.quietas.map((p) => (
                  <FilaPrenda
                    key={p.clave}
                    p={p}
                    derecha={
                      <>
                        <span className="block text-sm font-semibold tabular-nums text-tinta">{p.disponible} uds</span>
                        {esLider && p.valorPrecio !== null && <span className="block text-xs text-taupe">{formatoSolesCompacto(p.valorPrecio)} a precio de venta</span>}
                      </>
                    }
                  />
                ))}
              </ul>
              {r.quietasTotal.prendas > r.quietas.length && (
                <p className="pt-2 text-xs text-taupe">
                  y {r.quietasTotal.prendas - r.quietas.length} {r.quietasTotal.prendas - r.quietas.length === 1 ? "prenda más" : "prendas más"} · {r.quietasTotal.unidades.toLocaleString("es-PE")} uds en total sin salida
                </p>
              )}
            </>
          )}
        </Seccion>

        {r.categorias.length > 0 && (
          <Seccion titulo="Por categoría" bajada="Qué categoría está saliendo y cuánto le queda.">
            <div className="overflow-hidden rounded-lg border border-tinta/10">
              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_4.5rem] gap-x-3 bg-hueso/60 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-taupe">
                <span>Categoría</span>
                <span className="text-right">Vendidas</span>
                <span className="text-right">Alcanza</span>
                <span className="text-right">Hay</span>
              </div>
              <ul className="divide-y divide-tinta/10">
                {r.categorias.map((c) => (
                  <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_4.5rem] items-center gap-x-3 px-3.5 py-2.5 text-sm tabular-nums">
                    <span className="truncate text-tinta">{c.nombre}</span>
                    <span className="text-right text-tinta">{c.vendidas}</span>
                    <span className={`text-right ${c.coberturaDias !== null && c.coberturaDias <= 7 ? "font-semibold text-ambar-profundo" : "text-taupe"}`}>
                      {c.coberturaDias === null ? "—" : textoDias(c.coberturaDias)}
                    </span>
                    <span className="text-right text-tinta">{c.disponible}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Seccion>
        )}
      </div>
    </Modal>
  );
}
