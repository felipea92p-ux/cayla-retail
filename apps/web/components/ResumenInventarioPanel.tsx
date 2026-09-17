"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import type { FilaResumenProducto, SugerenciaTraslado } from "@/lib/resumen-inventario";
import type { CurvaIncompleta } from "@/lib/curva-variantes";

// Resumen de Inventario (2026-09-17, ADR-0097): pantalla de decisión, no de
// operación diaria — responde "¿cómo está el inventario en conjunto, y qué
// tengo que decidir hoy?", distinto de Existencias ("¿qué hay en ESTA
// fila?"). Cada fila lleva su número principal a la vista SIEMPRE (decisión
// de Felipe: un color solo puede significar demasiadas cosas) — el click
// abre el desglose completo, no el número en sí.

const TONO_ESTADO: Record<string, TonoChip> = {
  riesgo_quiebre: "rojo",
  sobrestock: "ambar",
  sin_movimiento: "neutro",
};

function formatoDias(dias: number | null): string {
  if (dias === null) return "sin datos suficientes";
  if (dias < 1) return "menos de 1 día";
  return `≈ ${Math.round(dias)} día${Math.round(dias) === 1 ? "" : "s"}`;
}

/** `0.0/día` al lado de "cobertura ≈3540 días" parece contradictorio —
 *  redondear a 1 decimal esconde una demanda real pero chica (0.03/día).
 *  Con menos de 1 unidad/día se muestran 2 decimales; con más, 1 alcanza. */
function formatoVentaDiaria(unidadesDia: number): string {
  return `${unidadesDia.toFixed(unidadesDia > 0 && unidadesDia < 1 ? 2 : 1)}/día`;
}

function FilaProducto({ f, tono }: { f: FilaResumenProducto; tono: TonoChip }) {
  const [abierto, setAbierto] = useState(false);
  const etiquetaPrincipal =
    f.estado === "riesgo_quiebre"
      ? `quedan ${formatoDias(f.coberturaDias)}`
      : f.estado === "sobrestock"
        ? `cobertura ${formatoDias(f.coberturaDias)}`
        : "sin ventas en 30 días";

  return (
    <li className="border-b border-tinta/10 py-2.5 last:border-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={abierto}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Chip tono={tono}>{etiquetaPrincipal}</Chip>
          <span className="truncate text-sm text-tinta">{f.referencia}</span>
        </span>
        <span className="label-cayla shrink-0 text-[10px] text-tinta/45">{abierto ? "ocultar" : "detalle"}</span>
      </button>
      {abierto && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-sand/40 p-3 text-xs sm:grid-cols-3">
          <div><dt className="text-tinta/55">Disponible</dt><dd className="tabular-nums text-tinta">{f.stockTotal}</dd></div>
          <div><dt className="text-tinta/55">Venta media</dt><dd className="tabular-nums text-tinta">{formatoVentaDiaria(f.demandaDiaria)}</dd></div>
          <div><dt className="text-tinta/55">Cobertura actual</dt><dd className="tabular-nums text-tinta">{formatoDias(f.coberturaDias)}</dd></div>
          <div><dt className="text-tinta/55">En camino</dt><dd className="tabular-nums text-tinta">+{f.enCamino}</dd></div>
          <div><dt className="text-tinta/55">Con lo que viene</dt><dd className="tabular-nums text-tinta">{formatoDias(f.coberturaProyectadaDias)}</dd></div>
          <div><dt className="text-tinta/55">Sell-through (30d)</dt><dd className="tabular-nums text-tinta">{f.sellThroughPct === null ? "sin datos" : `${f.sellThroughPct}%`}</dd></div>
          <div><dt className="text-tinta/55">Punto de reorden</dt><dd className="tabular-nums text-tinta">{f.puntoReorden}</dd></div>
          <div><dt className="text-tinta/55">Stock mínimo</dt><dd className="tabular-nums text-tinta">{f.stockMinimo ?? "sin definir"}</dd></div>
          <div><dt className="text-tinta/55">Merma (30d)</dt><dd className="tabular-nums text-tinta">{f.merma30d}</dd></div>
        </dl>
      )}
    </li>
  );
}

function SeccionProductos({ titulo, ayuda, filas, tono }: { titulo: string; ayuda: string; filas: FilaResumenProducto[]; tono: TonoChip }) {
  return (
    <section className="rounded-lg border border-tinta/10 bg-white p-4">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-tinta">{titulo}</h2>
        <span className="label-cayla text-[10px] text-tinta/45">{filas.length}</span>
      </header>
      <p className="mb-2 text-xs text-tinta/55">{ayuda}</p>
      {filas.length === 0 ? (
        <p className="py-3 text-xs text-tinta/45">Nada por acá — buena señal.</p>
      ) : (
        <ul>{filas.map((f) => <FilaProducto key={f.productoId} f={f} tono={tono} />)}</ul>
      )}
    </section>
  );
}

function SeccionCurvas({ curvas }: { curvas: CurvaIncompleta[] }) {
  return (
    <section className="rounded-lg border border-tinta/10 bg-white p-4">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-tinta">Curvas incompletas</h2>
        <span className="label-cayla text-[10px] text-tinta/45">{curvas.length}</span>
      </header>
      <p className="mb-2 text-xs text-tinta/55">
        Le falta una talla del medio de la curva en esa sede — la prenda parece disponible, pero nadie compra &ldquo;una talla cualquiera&rdquo;.
      </p>
      {curvas.length === 0 ? (
        <p className="py-3 text-xs text-tinta/45">Ninguna curva rota detectada.</p>
      ) : (
        <ul>
          {curvas.map((c, i) => (
            <li key={`${c.productoId}-${c.color}-${c.sedeId}-${c.tallaFaltante}-${i}`} className="flex items-center gap-2 border-b border-tinta/10 py-2 text-sm last:border-0">
              <Chip tono="ambar">talla {c.tallaFaltante}</Chip>
              <span className="text-tinta">{c.referencia}{c.color ? ` · ${c.color}` : ""} — {c.sedeNombre}</span>
              <span className="ml-auto text-xs text-tinta/45">tiene {c.tallasConStock.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionSugerencias({ sugerencias }: { sugerencias: SugerenciaTraslado[] }) {
  return (
    <section className="rounded-lg border border-tinta/10 bg-white p-4">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-tinta">Sugerencias de traslado</h2>
        <span className="label-cayla text-[10px] text-tinta/45">{sugerencias.length}</span>
      </header>
      <p className="mb-2 text-xs text-tinta/55">
        CAYLA sugiere, nunca mueve stock por su cuenta — vos confirmás y armás el traslado.
      </p>
      {sugerencias.length === 0 ? (
        <p className="py-3 text-xs text-tinta/45">Sin sugerencias por ahora.</p>
      ) : (
        <ul>
          {sugerencias.map((s, i) => (
            <li key={`${s.productoId}-${s.color}-${s.tallaFaltante}-${i}`} className="flex flex-wrap items-center gap-2 border-b border-tinta/10 py-2.5 text-sm last:border-0">
              <span className="text-tinta">
                {s.referencia}{s.color ? ` · ${s.color}` : ""} · talla {s.tallaFaltante}
              </span>
              <span className="text-tinta/55">
                {s.sedeOrigenNombre} ({s.cantidadDisponibleOrigen}) → {s.sedeDestinoNombre}
              </span>
              <Link
                href="/inventario/traslados"
                className="label-cayla ml-auto shrink-0 rounded-md border border-rojo/30 bg-rojo/10 px-2.5 py-1 text-[10px] text-rojo-profundo hover:bg-rojo/15"
              >
                Crear traslado
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ResumenInventarioPanel({
  productos,
  curvasIncompletas,
  sugerenciasTraslado,
}: {
  productos: FilaResumenProducto[];
  curvasIncompletas: CurvaIncompleta[];
  sugerenciasTraslado: SugerenciaTraslado[];
}) {
  const riesgoQuiebre = productos.filter((p) => p.estado === "riesgo_quiebre");
  const sobrestock = productos.filter((p) => p.estado === "sobrestock");

  return (
    <div className="flex flex-col gap-4">
      <SeccionProductos
        titulo="Riesgo de quiebre"
        ayuda="Se agotan pronto, con venta real detrás — candidatos a reponer ya."
        filas={riesgoQuiebre}
        tono={TONO_ESTADO.riesgo_quiebre}
      />
      <SeccionCurvas curvas={curvasIncompletas} />
      <SeccionSugerencias sugerencias={sugerenciasTraslado} />
      <SeccionProductos
        titulo="Sobrestock"
        ayuda="Cobertura muy alta para su venta real — candidatos a liquidar o dejar de reponer."
        filas={sobrestock}
        tono={TONO_ESTADO.sobrestock}
      />
    </div>
  );
}
