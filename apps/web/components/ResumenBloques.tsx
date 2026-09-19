"use client";

import Link from "next/link";
import { useState } from "react";
import { BarrasHorizontales, DonaDistribucion } from "@/components/ui/Graficos";
import type { CambiosUrl } from "@/components/useResumenUrl";
import { formatoVelocidad } from "@/lib/resumen-formato";
import { resolverAccion } from "@/lib/resumen-acciones";
import type { ResumenParaPantalla } from "@/lib/resumen-armado";
import { ETIQUETA_BANDA, type BandaCobertura } from "@/lib/resumen-reglas";

// Los tres bloques de abajo. Ninguno tiene lógica propia: leen lo que ya calculó
// `resumirAlcance` (la MISMA que la tabla y las tarjetas), así el gráfico de
// cobertura, las curvas y los más rápidos no pueden contradecir a «Prioridades».

const COLOR_BANDA: Record<BandaCobertura, string> = {
  agotado: "var(--color-rojo)",
  critica: "var(--color-ambar)",
  atencion: "color-mix(in srgb, var(--color-ambar) 50%, var(--color-crema))",
  saludable: "color-mix(in srgb, var(--color-verde) 50%, var(--color-crema))",
  alta: "var(--color-verde-profundo)",
  sin_historial: "color-mix(in srgb, var(--color-taupe) 40%, var(--color-crema))",
};

function Bloque({ titulo, subtitulo, enlace, children, className = "" }: { titulo: string; subtitulo: string; enlace?: { texto: string; onClick: () => void }; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card-cayla flex min-w-0 flex-col p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.15rem] leading-tight text-tinta">{titulo}</h2>
          <p className="mt-0.5 text-xs text-tinta/65">{subtitulo}</p>
        </div>
        {enlace && (
          <button type="button" onClick={enlace.onClick} className="label-cayla shrink-0 text-[11px] text-tinta/70 underline-offset-2 transition-colors hover:text-rojo hover:underline">
            {enlace.texto} →
          </button>
        )}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

const SIN_DATOS = "text-sm text-tinta/60";

export function ResumenBloques({ datos, actualizar }: { datos: ResumenParaPantalla; actualizar: (cambios: CambiosUrl) => void }) {
  const { resumen, periodo, ubicacion, vista } = datos;
  const [modo, setModo] = useState<"producto" | "variante">("producto");

  const irATabla = () => document.getElementById("prioridades")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const totalVariantes = resumen.distribucion.reduce((n, d) => n + d.variantes, 0);

  const barras = (modo === "producto" ? resumen.topProductos : resumen.topVariantes).map((b) => ({
    clave: b.id,
    etiqueta: b.etiqueta,
    detalle: b.detalle,
    valor: b.unidadesDia,
    texto: formatoVelocidad(b.unidadesDia),
    // Tocar una barra deja en la tabla solo esa prenda (el mismo filtro de búsqueda de siempre).
    onClick: () => (actualizar({ q: b.detalle ? `${b.etiqueta} ${b.detalle}` : b.etiqueta }), irATabla()),
  }));

  // Tres en fila solo desde 1560 px (~1190 de contenido): con menos, el de curvas
  // rotas queda sin aire y se corta el producto.
  return (
    <div className="grid gap-3 min-[900px]:grid-cols-2 min-[1560px]:grid-cols-[1fr_1fr_1.3fr]">
      <Bloque
        titulo="Productos con mayor velocidad"
        subtitulo={`Unidades vendidas por día · ${periodo.etiqueta.charAt(0).toLowerCase()}${periodo.etiqueta.slice(1)}`}
        enlace={{ texto: "Ver todos", onClick: () => (actualizar({ orden: "velocidad" }), irATabla()) }}
      >
        <div role="group" aria-label="Agrupar por" className="mb-3 inline-flex overflow-hidden rounded-md border border-tinta/15">
          {(["producto", "variante"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={`label-cayla px-3 py-1.5 text-[10px] transition-colors ${modo === m ? "bg-tinta text-crema" : "text-tinta/70 hover:bg-tinta/[0.05]"}`}
            >
              {m === "producto" ? "Producto" : "Variante"}
            </button>
          ))}
        </div>
        {barras.length === 0 ? <p className={SIN_DATOS}>Todavía no hay ventas con días suficientes en venta para medir un ritmo.</p> : <BarrasHorizontales barras={barras} />}
      </Bloque>

      <Bloque titulo="Cobertura del inventario" subtitulo="Distribución actual de variantes según días de cobertura">
        {totalVariantes === 0 ? (
          <p className={SIN_DATOS}>Sin variantes con stock o historial en esta sede.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <DonaDistribucion
              segmentos={resumen.distribucion.map((d) => ({ clave: d.banda, valor: d.variantes, color: COLOR_BANDA[d.banda] }))}
              centro={{ valor: String(totalVariantes), etiqueta: totalVariantes === 1 ? "variante" : "variantes" }}
              onSegmento={(banda) => (actualizar({ cob: banda }), irATabla())}
            />
            <ul className="min-w-[10rem] flex-1 space-y-1.5">
              {resumen.distribucion.map((d) => {
                const activo = vista.cobertura === d.banda;
                return (
                  <li key={d.banda}>
                    <button
                      type="button"
                      aria-pressed={activo}
                      disabled={d.variantes === 0}
                      onClick={() => (actualizar({ cob: activo ? null : d.banda }), irATabla())}
                      className={`flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-sm transition-colors enabled:hover:bg-tinta/[0.04] disabled:cursor-default ${activo ? "bg-tinta/[0.06]" : ""}`}
                    >
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR_BANDA[d.banda] }} />
                      <span className="flex-1 text-tinta">{ETIQUETA_BANDA[d.banda]}</span>
                      <span className="tabular-nums text-tinta">{d.variantes}</span>
                      <span className="w-11 text-right text-xs tabular-nums text-tinta/60">({Math.round((d.variantes / totalVariantes) * 100)}%)</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Bloque>

      <Bloque
        titulo="Curvas rotas y oportunidades de redistribución"
        subtitulo="Productos con tallas faltantes y dónde encontrar stock"
        className="min-[900px]:col-span-2 min-[1560px]:col-span-1"
        enlace={resumen.curvas.length > 0 ? { texto: "Ver todas", onClick: () => (actualizar({ est: "curva_rota" }), irATabla()) } : undefined}
      >
        {resumen.curvas.length === 0 ? (
          <p className={SIN_DATOS}>Ninguna curva rota en esta sede: ninguna talla clave falta.</p>
        ) : (
          <div className="text-sm">
            <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,0.6fr)_minmax(0,1.1fr)_6.25rem] gap-x-3 pb-2 min-[560px]:grid">
              {["Producto", "Tallas con falta", "Dónde hay stock", "Acción"].map((t) => (
                <span key={t} className="label-cayla text-[10px] text-tinta/55">
                  {t}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-tinta/10 border-t border-tinta/10">
              {resumen.curvas.slice(0, 5).map((c) => {
                const una = c.acciones.length === 1 ? c.acciones[0] : null;
                const accion = una
                  ? resolverAccion(una.plan.principal, { destinoId: ubicacion.id, varianteId: una.varianteId, origenAbastecimiento: null, puedeBajarAlPiso: false })
                  : null;
                const clase = "label-cayla inline-flex min-h-8 w-full items-center justify-center rounded-md border border-tinta/25 bg-papel px-2 py-1 text-[10px] leading-tight text-tinta transition-colors hover:border-tinta/50";
                const etiquetaAccion = una?.plan.principal ? (una.plan.principal.tipo === "pedir_al_taller" ? "Pedir al Taller" : una.plan.principal.tipo === "trasladar" ? "Trasladar" : una.plan.principal.tipo === "esperar_llegada" ? "Esperar" : "Ver tallas") : "Ver tallas";
                return (
                  <li key={c.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 min-[560px]:grid-cols-[minmax(0,1.35fr)_minmax(0,0.6fr)_minmax(0,1.1fr)_6.25rem]">
                    <span className="min-w-0 truncate text-tinta" title={`${c.referencia}${c.color ? ` (${c.color})` : ""}`}>
                      {c.referencia}
                      {c.color && <span className="text-tinta/65"> ({c.color})</span>}
                    </span>
                    <span className="flex flex-wrap gap-1 justify-self-end min-[560px]:justify-self-start">
                      {c.acciones.map((x) => (
                        <span key={x.varianteId} className="rounded-full border border-rojo/30 bg-rojo/10 px-2 py-0.5 text-[11px] text-rojo-profundo" title={x.motivo === "hueco" ? "Falta entre tallas con stock" : "Falta y se vendió en el período"}>
                          {x.talla}
                        </span>
                      ))}
                    </span>
                    <span className="col-span-2 min-w-0 truncate text-xs text-tinta/75 min-[560px]:col-span-1" title={c.dondeHay}>
                      {c.dondeHay || "—"}
                    </span>
                    <span className="col-span-2 min-[560px]:col-span-1">
                      {accion?.via === "enlace" ? (
                        <Link href={accion.href} className={clase}>
                          {etiquetaAccion}
                        </Link>
                      ) : (
                        <button type="button" className={clase} onClick={() => (actualizar({ q: `${c.referencia}${c.color ? ` ${c.color}` : ""}`, est: "curva_rota" }), irATabla())}>
                          Ver tallas
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {resumen.curvas.length > 5 && <p className="mt-2 text-xs text-tinta/60">Y {resumen.curvas.length - 5} curva{resumen.curvas.length - 5 === 1 ? "" : "s"} más.</p>}
          </div>
        )}
      </Bloque>
    </div>
  );
}
