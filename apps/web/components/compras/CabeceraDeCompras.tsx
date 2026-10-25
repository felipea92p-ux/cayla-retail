import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Pestanas } from "@/components/ui/Pestanas";
import type { PestanaDeCompras, VistaCompras } from "@/lib/compras-pestanas-reglas";

// Lo que se DIBUJA de la cabecera de «Historial de compras» (ADR-0504): el título único, «Todas las tiendas», la frase, la fila de pestañas y,
// a su derecha, las acciones de la pestaña en que estás. No lee nada: qué pestañas trae esta cuenta y sus contadores los decide
// `CabeceraHistorialCompras`, que la llama.

const FRASE = "De la compra al pago: lo que anotaron, lo que se compró y lo que se debe.";

export function CabeceraDeCompras({ activa, items, acciones }: { activa: VistaCompras; items: PestanaDeCompras[]; acciones?: ReactNode }) {
  return (
    <>
      <EncabezadoPagina sede="Todas las tiendas" titulo="Historial de compras" subtitulo={FRASE} />
      {(items.length > 1 || acciones) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {items.length > 1 ? (
            <Pestanas
              etiquetaAccesible="Secciones de Historial de compras"
              activa={activa}
              idIndicador="compras"
              guia="compras.pestanas"
              items={items.map(({ clave, etiqueta, href, conteo, pide, tono }) => ({ clave, etiqueta, href, conteo, pide, tono }))}
            />
          ) : (
            <span />
          )}
          {/* `data-voz="cabecera"`: son las acciones de la cabecera de la pantalla, así que hablan en versalitas de 11 px (ADR-0358, «Botones»). */}
          {acciones && (
            <div data-voz="cabecera" className="ml-auto flex flex-wrap items-center gap-2">
              {acciones}
            </div>
          )}
        </div>
      )}
    </>
  );
}
