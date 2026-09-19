"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { formatoPorcentaje, formatoSoles, pluralizar } from "@/lib/resumen-formato";
import { UMBRAL_COBERTURA_ALTA_DIAS } from "@/lib/inventario-reglas";
import type { CapitalInfo } from "@/lib/resumen-reglas";

// Capital en inventario — el desglose, o la razón por la que no hay cifra.
// Definición (Felipe): stock FÍSICO de la sede, sin lo dañado, por el costo
// promedio vigente de cada variante. Es solo el valor del stock al costo: no es
// precio de venta, no es margen y no sirve para el estado de resultados.

const PIE = "Stock físico de la sede (piso + almacén + sin ubicar) × costo promedio vigente de cada variante. No es precio de venta, ni margen, ni sirve para el estado de resultados.";

export function ResumenCapitalModal({ capital, ubicacion, onClose }: { capital: CapitalInfo; ubicacion: string; onClose: () => void }) {
  return (
    <Modal titulo="Capital en inventario" subtitulo={`${ubicacion} · valor del stock al costo`} onClose={onClose} ancho="max-w-2xl">
      {(cerrar) => (
        <div className="mt-2 space-y-4">
          {capital.verificado ? (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-tinta/10 bg-tinta/10 min-[560px]:grid-cols-3">
                <Dato titulo="Total al costo" valor={formatoSoles(capital.total)} detalle={pluralizar(capital.unidades, "unidad", "unidades")} />
                <Dato titulo={`Con cobertura > ${UMBRAL_COBERTURA_ALTA_DIAS} días`} valor={formatoSoles(capital.conCoberturaAlta)} detalle={capital.total > 0 ? formatoPorcentaje((capital.conCoberturaAlta / capital.total) * 100) + " del total" : "—"} />
                <Dato titulo="En cuarentena (no incluido)" valor={formatoSoles(capital.cuarentena.valor)} detalle={pluralizar(capital.cuarentena.unidades, "unidad", "unidades")} />
              </div>

              <div>
                <p className="label-cayla text-[10px] text-tinta/55">Por categoría</p>
                <ul className="mt-1 divide-y divide-tinta/10 text-sm">
                  {capital.porCategoria.map((c) => (
                    <li key={c.categoria} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 py-2">
                      <span className="text-tinta">{c.categoria}</span>
                      <span className="text-xs tabular-nums text-tinta/60">{pluralizar(c.unidades, "ud", "uds")}</span>
                      <span className="w-24 text-right tabular-nums text-tinta">{formatoSoles(c.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-tinta/60">
                {capital.unidadesConCostoOficial > 0
                  ? `${capital.unidadesConCostoOficial} de ${capital.unidades} unidades tienen su costo calculado por promedio ponderado (compras y producción); el resto usa el costo con el que se dio de alta la prenda, que no se modificó.`
                  : "Todos los costos son los que se cargaron al dar de alta cada prenda (ninguna compra ni cierre de producción los recalculó todavía) y ninguno se modificó después."}
              </p>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-ambar/30 bg-ambar/[0.07] p-4">
                <p className="text-sm font-medium text-tinta">No se muestra el capital a costo</p>
                <p className="mt-1 text-sm text-tinta/75">
                  {capital.motivo}. Una cifra en soles con costos que no se pueden verificar sería «bonita pero incorrecta»: mientras tanto la tarjeta cuenta unidades, que sí son un dato confiable.
                </p>
              </div>
              <div>
                <p className="label-cayla text-[10px] text-tinta/55">
                  Prendas con el costo por revisar ({capital.variantes.length})
                </p>
                <ul className="mt-1 max-h-72 divide-y divide-tinta/10 overflow-y-auto pr-1 text-sm">
                  {capital.variantes.slice(0, 40).map((v) => (
                    <li key={v.varianteId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                      <span className="min-w-0 text-tinta">
                        {v.referencia} <span className="font-mono text-xs text-tinta/60">{v.sku}</span>
                      </span>
                      <span className="flex items-baseline gap-3">
                        <span className="text-xs text-tinta/65">{v.estado === "sin_costo" ? "sin costo cargado" : "costo modificado a mano"}</span>
                        <Link href={`/productos/${v.productoId}/editar`} className="label-cayla text-[10px] text-tinta/70 underline-offset-2 hover:text-rojo hover:underline">
                          Abrir producto
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
                {capital.variantes.length > 40 && <p className="mt-1 text-xs text-tinta/60">Y {capital.variantes.length - 40} más.</p>}
              </div>
            </>
          )}
          <p className="border-t border-tinta/10 pt-3 text-[11px] leading-4 text-tinta/55">{PIE}</p>
          <div className="flex justify-end">
            <button type="button" onClick={cerrar} className="label-cayla text-[10px] text-tinta/55 underline-offset-2 hover:text-rojo hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="bg-papel p-3">
      <p className="label-cayla text-[10px] text-tinta/55">{titulo}</p>
      <p className="mt-0.5 font-display text-xl tabular-nums text-tinta">{valor}</p>
      <p className="text-xs text-tinta/60">{detalle}</p>
    </div>
  );
}
