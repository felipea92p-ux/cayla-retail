"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { cargarCorrecciones } from "@/lib/corregir-compra-acciones";
import { cargarCorreccionesDeGasto } from "@/lib/corregir-gasto-acciones";
import { textoDeCambio, type CorreccionHecha } from "@/lib/corregir-compra-reglas";
import { textoDeCambioGasto } from "@/lib/corregir-gasto-reglas";
import { cargarCorreccionesDeGastoFinanzas } from "@/lib/gastos-corregir-acciones";
import { textoDeCambioDeGasto } from "@/lib/gastos-corregir-reglas";
import { fechaCorta } from "@/lib/compras-reglas";

// El rastro de una compra corregida (ADR-0561), de un gasto de «otra cosa» corregido (ADR-0572) o de un gasto de Finanzas corregido (ADR-0588):
// quién lo corrigió, cuándo y qué cambió (antes → ahora). Lo ven la compradora, en el detalle de su fila; Compras, al revisarla; y quien ve los
// gastos de esa tienda, en la hoja del gasto. Se lee al abrirse; sin correcciones (o si no se pudo leer) no dibuja nada. Con `papelId`, el de una
// compra; con `gastoId`, el de un gasto de Mis compras; con `gastoDeFinanzasId`, el de un gasto de Finanzas.

export function CorreccionesDeCompra({ papelId, gastoId, gastoDeFinanzasId }: { papelId?: string; gastoId?: string; gastoDeFinanzasId?: string }) {
  const id = papelId ?? gastoId ?? gastoDeFinanzasId ?? "";
  const deFinanzas = gastoDeFinanzasId !== undefined;
  const esGasto = papelId === undefined;
  const que = deFinanzas ? "gasto-de-finanzas" : esGasto ? "gasto" : "compra";
  const [lista, setLista] = useState<CorreccionHecha[]>([]);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    let vigente = true;
    const leer = deFinanzas ? cargarCorreccionesDeGastoFinanzas(id) : esGasto ? cargarCorreccionesDeGasto(id) : cargarCorrecciones(id);
    void leer.then((c) => {
      if (vigente) setLista(c);
    });
    return () => {
      vigente = false;
    };
  }, [id, esGasto, deFinanzas]);
  if (lista.length === 0) return null;
  const ultima = lista[0]!;
  return (
    <div className="flex flex-col gap-1.5" data-pieza={`correcciones-de-${que}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-tinta">
        <Chip tono="ambar" versalitas={false}>
          {/* «el gasto» de Finanzas: corregido; «la compra», y el gasto de Mis compras de siempre: corregida. */}
          {`${deFinanzas ? "Corregido" : "Corregida"}${lista.length === 1 ? "" : ` ${lista.length} veces`}`}
        </Chip>
        <span className="text-taupe">
          {ultima.quien ? `${ultima.quien} · ` : ""}
          {fechaCorta(ultima.cuando)}
        </span>
      </p>
      <BotonVerMas forma="enlace" abierto={abierto} onCambiar={setAbierto} controla={`correcciones-${id}`} texto="Ver qué cambió" className="self-start" />
      <FilasDeMas abierto={abierto} id={`correcciones-${id}`}>
        <ul className="flex flex-col gap-2 text-sm">
          {lista.map((c) => (
            <li key={c.lote} className="rounded-[12px] bg-hueso px-3 py-2">
              <span className="block text-xs text-taupe">
                {c.quien ?? "Alguien"} · {fechaCorta(c.cuando)}
              </span>
              <ul className="mt-0.5">
                {c.cambios.map((x, i) => (
                  <li key={i} className="tabular-nums text-tinta">
                    {deFinanzas ? textoDeCambioDeGasto(x) : esGasto ? textoDeCambioGasto(x) : textoDeCambio(x)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </FilasDeMas>
    </div>
  );
}
