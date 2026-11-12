"use client";

import { useState } from "react";
import { Merge } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { MOTIVO_DUPLICADO, type ParDuplicado } from "@/lib/posibles-duplicados-reglas";
import { FusionarProductosHoja, type FichaParaFusionar } from "./FusionarProductosHoja";

/**
 * «N posibles fichas repetidas» en Catálogo ▸ Productos (ADR-0650, decisión 3): el sistema sugiere los pares que parecen la misma
 * prenda y la persona decide. «Revisar» abre la lista; cada par abre la hoja de fusión con las dos fichas, donde se ve todo antes de
 * confirmar. Nada se fusiona solo.
 */
export function PosiblesDuplicados({ pares }: { pares: ParDuplicado[] }) {
  const [lista, setLista] = useState(false);
  const [fusionando, setFusionando] = useState<FichaParaFusionar[] | null>(null);
  if (pares.length === 0) return null;
  return (
    <>
      <Aviso
        guia="productos.posibles-duplicados"
        tono="info"
        titulo={pares.length === 1 ? "1 posible ficha repetida" : `${pares.length.toLocaleString("es-PE")} posibles fichas repetidas`}
        accion={
          <button type="button" onClick={() => setLista(true)} className="btn-cayla btn-enlace text-[13px]">
            Revisar
          </button>
        }
      >
        Prendas con el nombre igual o casi igual. Si son la misma, fusiónalas: las ventas, las fotos y el stock no se pierden.
      </Aviso>
      {lista && (
        <Modal
          variante="hoja"
          tamano="mediana"
          conCerrar
          titulo="Posibles fichas repetidas"
          subtitulo="Revisa cada par. Si son la misma prenda, fusiónalas; si no, déjalas como están."
          onClose={() => setLista(false)}
        >
          <ul className="divide-y divide-sand border-y border-sand">
            {pares.map((p) => (
              <li key={`${p.productoA}-${p.productoB}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 space-y-1">
                  <span className="block text-[15px] text-tinta">
                    {p.referenciaA} <span className="text-taupe">y</span> {p.referenciaB}
                  </span>
                  <Chip tono="pizarra" versalitas={false}>
                    {MOTIVO_DUPLICADO[p.motivo]}
                  </Chip>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLista(false);
                    setFusionando([
                      { productoId: p.productoA, referencia: p.referenciaA },
                      { productoId: p.productoB, referencia: p.referenciaB },
                    ]);
                  }}
                  className="btn-cayla btn-secundario btn-chico"
                >
                  <Merge aria-hidden className="h-4 w-4" />
                  Revisar y fusionar
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {fusionando && <FusionarProductosHoja inicial={fusionando} onClose={() => setFusionando(null)} />}
    </>
  );
}
