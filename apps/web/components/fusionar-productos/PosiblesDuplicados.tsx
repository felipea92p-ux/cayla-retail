"use client";

import { useState } from "react";
import { Merge } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { PendienteDeCabecera } from "@/components/PendienteDeCabecera";
import {
  MOTIVO_DUPLICADO,
  type ParDuplicado,
} from "@/lib/posibles-duplicados-reglas";
import {
  FusionarProductosHoja,
  type FichaParaFusionar,
} from "./FusionarProductosHoja";

/**
 * «N posibles fichas repetidas» en Catálogo ▸ Productos (ADR-0650, decisión 3): el sistema sugiere los pares que parecen la misma
 * prenda y la persona decide. El botón abre la lista; cada par abre la hoja de fusión con las dos fichas, donde se ve todo antes de
 * confirmar. Nada se fusiona solo.
 *
 * Desde el 2026-11-17 (Felipe) ya no es una tarjeta de aviso: en el celular ocupaba casi media pantalla antes de la primera prenda. Es
 * un botón más de la cabecera con su número y su latido (`PendienteDeCabecera`). La frase que explicaba («no se pierden ventas, fotos
 * ni stock») vive ahora en la hoja que se abre, donde se usa.
 */
export function PosiblesDuplicados({ pares }: { pares: ParDuplicado[] }) {
  const [lista, setLista] = useState(false);
  const [fusionando, setFusionando] = useState<FichaParaFusionar[] | null>(
    null,
  );
  if (pares.length === 0) return null;
  const titulo =
    pares.length === 1
      ? "1 posible ficha repetida"
      : `${pares.length.toLocaleString("es-PE")} posibles fichas repetidas`;
  return (
    <>
      <PendienteDeCabecera
        guia="productos.posibles-duplicados"
        icono={<Merge aria-hidden className="h-4 w-4" />}
        palabra="Fichas repetidas"
        titulo={titulo}
        n={pares.length}
        onClick={() => setLista(true)}
      />
      {lista && (
        <Modal
          variante="hoja"
          tamano="mediana"
          conCerrar
          titulo="Posibles fichas repetidas"
          subtitulo="Si dos son la misma prenda, fusiónalas: no se pierden ventas, fotos ni stock."
          onClose={() => setLista(false)}
        >
          <ul className="divide-y divide-sand border-y border-sand">
            {pares.map((p) => (
              <li
                key={`${p.productoA}-${p.productoB}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
              >
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm text-tinta">
                    {p.referenciaA} <span className="text-taupe">y</span>{" "}
                    {p.referenciaB}
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
      {fusionando && (
        <FusionarProductosHoja
          inicial={fusionando}
          onClose={() => setFusionando(null)}
        />
      )}
    </>
  );
}
