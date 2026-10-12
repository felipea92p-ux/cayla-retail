"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Download, Printer } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { AvisoStock } from "@/components/plan-compra/AvisoStock";
import { descargarCsv } from "@/lib/exportar-csv";
import {
  ENCABEZADOS_LISTA_COMPRA,
  enteroES,
  filasDeLaListaDeCompra,
  filasDelCsvDeCompra,
  nombreDelArchivoDeCompra,
  solesES,
  type ConfianzaDelStock,
  type FilaListaCompra,
  type FilaPlan,
} from "@/lib/plan-compra-reglas";

// «Exportar» del plan de campaña (ADR-0349): la lista de compra que se lleva al proveedor, por categoría y por talla, con su total.
// Se arma en el navegador con lo que la pantalla ya leyó (no toca la base). Una vista previa en papel; «Descargar Excel (CSV)» baja el
// archivo (el mismo `descargarCsv` de Existencias y Clientes: con BOM para las tildes) e «Imprimir» usa la impresora del navegador
// (lib/estilos: `#lista-compra-print`). Si el «Hay hoy» está incompleto lo dice aquí también: esta lista podría pedir de más.

function TablaDeCompra({ lista, comprar, inversion }: { lista: readonly FilaListaCompra[]; comprar: number; inversion: number }) {
  return (
    <table className="w-full border-collapse text-[13px] tabular-nums text-tinta">
      <thead>
        <tr className="border-b border-tinta text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tinta/65">
          <th className="px-2 py-1.5">Categoría</th>
          <th className="px-2 py-1.5 text-right">Comprar</th>
          <th className="px-2 py-1.5">Por talla</th>
          <th className="px-2 py-1.5 text-right">Inversión</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((f) => (
          <tr key={f.categoria} className="border-b border-sand">
            <td className="px-2 py-1.5">{f.categoria}</td>
            <td className="px-2 py-1.5 text-right">{enteroES.format(f.comprar)}</td>
            <td className="px-2 py-1.5">{f.porTalla}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right">{solesES(f.inversion)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <td className="px-2 py-2">Total</td>
          <td className="px-2 py-2 text-right">{enteroES.format(comprar)}</td>
          <td />
          <td className="whitespace-nowrap px-2 py-2 text-right">{solesES(inversion)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function ExportarPlan({ planNombre, filas, confianza, onClose }: { planNombre: string; filas: readonly FilaPlan[]; confianza: ConfianzaDelStock; onClose: () => void }) {
  const lista = useMemo(() => filasDeLaListaDeCompra(filas), [filas]);
  const comprar = lista.reduce((s, f) => s + f.comprar, 0);
  const inversion = lista.reduce((s, f) => s + f.inversion, 0);
  const hayQueComprar = lista.length > 0;
  const incompleto = confianza.sedes.filter((s) => !s.alDia).map((s) => s.nombre);

  return (
    <Modal
      titulo="Lista de compra"
      subtitulo={hayQueComprar ? `${planNombre} · ${lista.length} ${lista.length === 1 ? "categoría" : "categorías"} · ${enteroES.format(comprar)} prendas · ${solesES(inversion)} al costo` : planNombre}
      onClose={onClose}
      variante="hoja"
      ancho="max-w-2xl"
      conCerrar
    >
      {() => (
        <div className="space-y-4">
          <AvisoStock confianza={confianza} puedeContar={false} />
          {hayQueComprar ? (
            <div className="papel-fijo max-h-[46vh] overflow-auto rounded-xl border border-sand bg-papel p-3">
              <TablaDeCompra lista={lista} comprar={comprar} inversion={inversion} />
            </div>
          ) : (
            <p className="rounded-xl bg-hueso px-4 py-3 text-sm text-tinta/80">
              Con tus escenarios no hay nada que comprar: lo que ya hay en la red alcanza para lo que conviene tener. Corrige los escenarios o espera a que baje el stock.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Boton type="button" disabled={!hayQueComprar} onClick={() => window.print()}>
              <Printer aria-hidden className="h-4 w-4" />
              Imprimir
            </Boton>
            <Boton
              type="button"
              peso="primario"
              disabled={!hayQueComprar}
              onClick={() => descargarCsv(nombreDelArchivoDeCompra(planNombre), [...ENCABEZADOS_LISTA_COMPRA], filasDelCsvDeCompra(lista))}
            >
              <Download aria-hidden className="h-4 w-4" />
              Descargar Excel (CSV)
            </Boton>
          </div>
          {/* Lo que sale en papel: pegado a <body> para que, al imprimir, lo demás desaparezca (app/estilos/lista-compra.css). */}
          {typeof document !== "undefined" &&
            hayQueComprar &&
            createPortal(
              <div id="lista-compra-print" className="papel-fijo bg-papel text-tinta">
                <h1 className="font-display text-3xl">Lista de compra</h1>
                <p className="mb-4 mt-1 text-sm">
                  {planNombre} · {new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}
                </p>
                {incompleto.length > 0 && (
                  <p className="mb-3 text-sm font-semibold">
                    Ojo: el «Hay hoy» de {incompleto.join(", ")} está incompleto. Esta lista puede pedir de más: cuenta el stock antes de comprar.
                  </p>
                )}
                <TablaDeCompra lista={lista} comprar={comprar} inversion={inversion} />
              </div>,
              document.body,
            )}
        </div>
      )}
    </Modal>
  );
}
