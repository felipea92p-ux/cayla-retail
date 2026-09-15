"use client";

import { useState } from "react";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { MovimientoDetalle } from "@/components/MovimientoDetalle";
import {
  ETIQUETA_CATEGORIA,
  etiquetaDia,
  etiquetaProceso,
  textoDelta,
  textoOrigenDestino,
  textoReferencia,
  tonoCategoria,
  type Movimiento,
} from "@/lib/movimientos-reglas";

// La lista del historial, agrupada por día. Cada fila es un botón que abre
// el detalle en un modal — la fila ya trae todo (fn_movimientos resolvió las
// referencias), así que abrir el detalle no consulta nada.
//
// Hora · Tipo · Prenda · Proceso y referencia · Cantidad · Persona
// La persona solo entra desde lg: en una pantalla mediana las dos columnas de
// texto (prenda y proceso) valen más que quién lo hizo, que sigue en el detalle.
const PLANTILLA = "sm:grid-cols-[3rem_6.75rem_1.1fr_1fr_3.5rem] lg:grid-cols-[3rem_6.75rem_1.1fr_1fr_3.5rem_7rem]";

export function MovimientosLista({ movimientos, hoyLima }: { movimientos: Movimiento[]; hoyLima: string }) {
  const [abierto, setAbierto] = useState<Movimiento | null>(null);

  // Agrupar por día de Lima (`fecha` ya viene calculada en SQL): la lista
  // llega ordenada por fecha desc, así que los grupos salen en orden solos.
  const dias: { fecha: string; filas: Movimiento[] }[] = [];
  for (const m of movimientos) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === m.fecha) ultimo.filas.push(m);
    else dias.push({ fecha: m.fecha, filas: [m] });
  }

  return (
    <>
      <Tabla>
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[
            { titulo: "Hora" },
            { titulo: "Tipo" },
            { titulo: "Prenda" },
            { titulo: "Proceso · Referencia" },
            { titulo: "Cant.", alinear: "der" },
            { titulo: "Persona", desdeLg: true },
          ]}
        />
        {dias.map((dia) => (
          <div key={dia.fecha} className="divide-y divide-tinta/10">
            <div className="flex items-baseline justify-between bg-tinta/[0.03] px-5 py-1.5">
              <span className="label-cayla text-[11px] text-tinta">{etiquetaDia(dia.fecha, hoyLima)}</span>
              <span className="text-xs text-tinta/55">
                {dia.filas.length} {dia.filas.length === 1 ? "movimiento" : "movimientos"}
              </span>
            </div>
            {dia.filas.map((m) => {
              const origenDestino = m.categoria === "interno" || m.categoria === "transferencia" ? textoOrigenDestino(m) : null;
              const referencia = textoReferencia(m);
              const detallePrenda = [m.talla, m.color].filter(Boolean).join(" · ");
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAbierto(m)}
                  className={fila(PLANTILLA, "w-full text-left transition-colors hover:bg-tinta/[0.03] focus-visible:bg-tinta/[0.03] focus-visible:outline-none")}
                >
                  <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{m.hora}</span>
                  <span className={celda("izq", "overflow-visible")}>
                    <Chip tono={tonoCategoria(m.categoria, m.delta)}>{ETIQUETA_CATEGORIA[m.categoria]}</Chip>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-tinta" title={m.referencia}>{m.referencia}</span>
                    <span className="block truncate text-xs text-tinta/65" title={`${m.sku}${detallePrenda ? ` · ${detallePrenda}` : ""}`}>
                      <span className="font-mono">{m.sku}</span>
                      {detallePrenda && ` · ${detallePrenda}`}
                    </span>
                  </span>
                  <span className="min-w-0 text-xs">
                    <span className="block truncate text-sm text-tinta">
                      {etiquetaProceso(m.motivo)}
                      {m.esSistema && <span className="label-cayla ml-1.5 text-[10px] text-tinta/50">Sistema</span>}
                    </span>
                    {referencia && (
                      <span className="block truncate text-tinta/65" title={referencia}>{referencia}</span>
                    )}
                    {origenDestino && (
                      <span className="block truncate text-tinta/65" title={origenDestino}>{origenDestino}</span>
                    )}
                  </span>
                  <span
                    className={celda(
                      "der",
                      `text-sm font-semibold ${m.delta > 0 ? "text-verde-profundo" : m.delta < 0 ? "text-tinta" : "text-tinta/65"}`
                    )}
                  >
                    {textoDelta(m)}
                  </span>
                  <span className={celda("izq", "hidden text-xs text-tinta/65 lg:block")} title={m.usuario ?? undefined}>
                    {m.esSistema ? "—" : (m.usuario ?? "—")}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </Tabla>

      {abierto && <MovimientoDetalle movimiento={abierto} onClose={() => setAbierto(null)} />}
    </>
  );
}
