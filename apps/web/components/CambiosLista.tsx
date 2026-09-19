"use client";

import { useMemo, useState } from "react";
import { Shirt, RefreshCw, CalendarDays } from "lucide-react";
import { CambioFormV2, type VarianteCatalogo } from "@/components/CambioFormV2";
import { BuscarPorComprobante } from "@/components/BuscarPorComprobante";
import { Chip } from "@/components/ui/Chip";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import type { EstadisticasCambios } from "@/lib/cambios-estadisticas";
import { agruparPorDia, estadoPlazoCambio } from "@/lib/cambios-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

const CHIP_ESTADO = { vigente: "verde", por_vencer: "ambar", fuera_de_plazo: "rojo" } as const;
const TEXTO_ESTADO = {
  vigente: (d: number) => `Vigente · quedan ${d} día${d === 1 ? "" : "s"}`,
  por_vencer: (d: number) => `Por vencer · quedan ${d} día${d === 1 ? "" : "s"}`,
  fuera_de_plazo: () => "Fuera de plazo",
};

export function CambiosLista({
  lineas,
  ubicacionId,
  catalogo,
  busqueda,
  todasLasSedes = false,
  estadisticas,
}: {
  lineas: LineaVentaReciente[];
  ubicacionId: string;
  catalogo: VarianteCatalogo[];
  busqueda: string;
  todasLasSedes?: boolean;
  estadisticas: EstadisticasCambios;
}) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const ahora = useMemo(() => new Date(), []);

  const categorias = useMemo(() => [...new Set(lineas.map((l) => l.categoria).filter((c): c is string => c !== null))].sort(), [lineas]);
  const lineasFiltradas = categoria ? lineas.filter((l) => l.categoria === categoria) : lineas;
  const grupos = useMemo(() => agruparPorDia(lineasFiltradas, ahora), [lineasFiltradas, ahora]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TarjetaEstadistica icono={<RefreshCw className="h-4 w-4" aria-hidden />} etiqueta="Cambios hoy" valor={String(estadisticas.cambiosHoy)} />
        <TarjetaEstadistica icono={<CalendarDays className="h-4 w-4" aria-hidden />} etiqueta="Cambios este mes" valor={String(estadisticas.cambiosMes)} />
        <TarjetaEstadistica
          icono={<Shirt className="h-4 w-4" aria-hidden />}
          etiqueta="Prenda más cambiada"
          valor={estadisticas.prendaMasCambiada ? `${estadisticas.prendaMasCambiada.codigo}` : "—"}
          detalle={estadisticas.prendaMasCambiada?.referencia}
        />
      </div>

      <div className="card-cayla space-y-3 p-4">
        <BuscarPorComprobante valorInicial={busqueda} todasInicial={todasLasSedes} />
        {categorias.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-sand pt-3">
            <button
              type="button"
              onClick={() => setCategoria(null)}
              className={`label-cayla rounded-full border px-3 py-1 text-[11px] ${
                categoria === null ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-papel text-tinta/70 hover:border-tinta/30"
              }`}
            >
              Todas
            </button>
            {categorias.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c)}
                className={`label-cayla rounded-full border px-3 py-1 text-[11px] ${
                  categoria === c ? "border-tinta bg-tinta text-crema" : "border-tinta/15 bg-papel text-tinta/70 hover:border-tinta/30"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="label-cayla text-[11px] text-tinta/65">{busqueda ? `Resultado de "${busqueda}"` : "Ventas recientes"}</p>

      {lineasFiltradas.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {busqueda
            ? todasLasSedes
              ? "No encontramos esa boleta o factura en ninguna sede."
              : 'No encontramos esa boleta o factura en esta sede — prueba marcando "Buscar en todas las sedes".'
            : categoria
              ? `Sin ventas recientes de "${categoria}".`
              : "Todavía no hay ventas recientes."}
        </p>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <div key={grupo.etiqueta}>
              <p className="label-cayla mb-2.5 text-[11px] text-tinta/60">{grupo.etiqueta}</p>
              <div className="space-y-2.5">
                {grupo.lineas.map((l) => (
                  <TarjetaCambio
                    key={l.ventaItemId}
                    linea={l}
                    ubicacionId={ubicacionId}
                    catalogo={catalogo}
                    ahora={ahora}
                    expandido={expandidoId === l.ventaItemId}
                    onToggle={() => setExpandidoId((actual) => (actual === l.ventaItemId ? null : l.ventaItemId))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaEstadistica({ icono, etiqueta, valor, detalle }: { icono: React.ReactNode; etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="card-cayla flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rojo/10 text-rojo">{icono}</span>
      <div className="min-w-0">
        <p className="label-cayla text-[10.5px] text-tinta/60">{etiqueta}</p>
        <p className="truncate text-[15px] font-bold text-tinta">{valor}</p>
        {detalle && <p className="truncate text-[11px] text-tinta/55">{detalle}</p>}
      </div>
    </div>
  );
}

function TarjetaCambio({
  linea,
  ubicacionId,
  catalogo,
  ahora,
  expandido,
  onToggle,
}: {
  linea: LineaVentaReciente;
  ubicacionId: string;
  catalogo: VarianteCatalogo[];
  ahora: Date;
  expandido: boolean;
  onToggle: () => void;
}) {
  const disponible = linea.cantidad - linea.yaCambiado;
  const { estado, diasRestantes } = estadoPlazoCambio(linea.creadoEn, ahora);
  const fueraDePlazo = estado === "fuera_de_plazo";

  return (
    <div className={`card-cayla p-4 ${!fueraDePlazo ? "alza-cayla" : ""}`}>
      <div className="flex items-center gap-3.5">
        <span
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: linea.colorHex ? `${linea.colorHex}26` : "var(--color-sand)" }}
        >
          <Shirt className="h-5 w-5" style={{ color: linea.colorHex ?? "var(--color-tinta)" }} aria-hidden />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-papel"
            style={{ background: linea.colorHex ?? "var(--color-tinta-60)" }}
            aria-hidden
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-tinta">
            {linea.referencia}
            <span className="font-normal text-tinta/60">{[linea.talla, linea.color].filter(Boolean).join(" / ")}</span>
            <Chip tono={CHIP_ESTADO[estado]}>{TEXTO_ESTADO[estado](diasRestantes)}</Chip>
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-tinta/55">
            {codigoPrenda(linea)} · comprada × {linea.cantidad}
            {linea.yaCambiado > 0 && ` · ya cambiada × ${linea.yaCambiado}`} · {formatearHora(linea.creadoEn)}
          </p>
          {linea.vendedorNombre && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-tinta/65">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-rojo to-rojo-profundo text-[8px] font-bold text-crema">
                {linea.vendedorNombre
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase()}
              </span>
              Vendido por {linea.vendedorNombre}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={disponible <= 0 || fueraDePlazo}
          onClick={onToggle}
          title={fueraDePlazo ? "Fuera del plazo de cambio" : undefined}
          className={`label-cayla shrink-0 rounded-md border px-3.5 py-2 text-[11px] transition-colors ${
            expandido ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta hover:border-tinta/40"
          } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-tinta/20`}
        >
          {disponible <= 0 ? "Sin cambio disponible" : "Cambiar"}
        </button>
      </div>

      {expandido && (
        <div className="mt-3.5">
          <CambioFormV2 linea={linea} ubicacionId={ubicacionId} catalogo={catalogo} onCancelar={onToggle} />
        </div>
      )}
    </div>
  );
}
