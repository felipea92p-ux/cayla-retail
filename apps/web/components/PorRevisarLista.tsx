"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { RevisarProductoHoja } from "@/components/RevisarProductoHoja";
import { textoOrigen, textoPrecio, textoPropuesta, textoVariantes, type ModoRevision, type ProductoPorRevisar } from "@/lib/revisar-productos-reglas";

/**
 * La cola de «Por revisar» (Catálogo ▸ Productos, ADR-0371): una fila por prenda propuesta, la más vieja primero, con lo que hace falta
 * para decidir sin abrir la ficha —quién la propuso, desde dónde, sus variantes y su precio— y, en chips, lo que frena un rechazo
 * (órdenes en proceso, stock). Aprobar y Rechazar abren la misma hoja, que pide el responsable; la fila no decide nada por sí sola.
 */
export function PorRevisarLista({
  productos,
  ahoraIso,
  veProduccion,
  veExistencias,
}: {
  productos: ProductoPorRevisar[];
  /** El «ahora» del servidor: el mismo texto («hoy», «ayer») en el HTML del servidor y en el del navegador. */
  ahoraIso: string;
  veProduccion: boolean;
  veExistencias: boolean;
}) {
  const [abierta, setAbierta] = useState<{ modo: ModoRevision; productoId: string } | null>(null);
  const ahora = new Date(ahoraIso);
  const producto = abierta ? productos.find((p) => p.productoId === abierta.productoId) : undefined;

  return (
    <>
      <ul className="card-cayla divide-y divide-sand overflow-hidden p-0" data-resultados>
        {productos.map((p) => (
          <li key={p.productoId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 gap-3.5">
              <MiniaturaPrenda
                fotoUrl={null}
                colorHex={p.colorHex}
                tamano="lg"
                prefijo={p.categoriaPrefijo}
                familia={p.categoriaFamilia}
                categoria={p.categoria}
              />
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-tinta">
                  <Link href={`/productos/${p.productoId}/editar`} className="underline-offset-2 hover:underline" title="Abrir la ficha de la prenda">
                    {p.referencia}
                  </Link>
                  {p.codigo && <span className="font-mono text-xs font-normal text-tinta/55">{p.codigo}</span>}
                </p>
                <p className="text-[13px] text-tinta/75">
                  {textoVariantes(p)} · {textoPrecio(p.precioMin, p.precioMax)}
                </p>
                <p className="text-[13px] text-tinta/60">
                  {textoPropuesta(p, ahora)} · {textoOrigen(p)}
                </p>
                {(p.ordenesAbiertas > 0 || p.stock > 0) && (
                  <p className="flex flex-wrap gap-1.5 pt-1">
                    {p.ordenesAbiertas > 0 && (
                      <Chip tono="pizarra" versalitas={false}>
                        {p.ordenesAbiertas === 1 ? "1 orden en proceso" : `${p.ordenesAbiertas} órdenes en proceso`}
                      </Chip>
                    )}
                    {p.stock > 0 && (
                      <Chip tono="neutro" versalitas={false}>
                        {p.stock.toLocaleString("es-PE")} en stock
                      </Chip>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2 max-sm:[&>button]:flex-1">
              <Boton type="button" peso="fantasma" className="max-sm:min-h-11" onClick={() => setAbierta({ modo: "rechazar", productoId: p.productoId })}>
                Rechazar
              </Boton>
              <Boton type="button" peso="primario" className="max-sm:min-h-11" onClick={() => setAbierta({ modo: "aprobar", productoId: p.productoId })}>
                Aprobar
              </Boton>
            </div>
          </li>
        ))}
      </ul>
      {abierta && producto && (
        <RevisarProductoHoja
          key={`${abierta.modo}-${producto.productoId}`}
          modo={abierta.modo}
          producto={producto}
          veProduccion={veProduccion}
          veExistencias={veExistencias}
          onClose={() => setAbierta(null)}
        />
      )}
    </>
  );
}
