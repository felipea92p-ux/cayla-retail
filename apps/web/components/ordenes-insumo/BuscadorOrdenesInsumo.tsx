"use client";

import { useBuscarAlEscribir } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";
import { hrefListaInsumo, type FiltrosListaInsumo } from "@/lib/ordenes-insumo-reglas";

// El buscador de Órdenes de insumos (ADR-0362, fase 7 · actividad 2), el mismo de Órdenes de compra: una orden se encuentra por su número
// («OI-000012», «oi12» o «12»), por el proveedor o por un insumo que lleva (su nombre o su código), sin importar tildes ni mayúsculas
// (lo resuelve `fn_ordenes_insumo` en la base).
//
// Vive en la URL (`?q=`) como el filtro de estado: se manda solo tras una pausa corta, con `replace` para que «atrás» no recorra la
// búsqueda letra por letra, y sin el loader general (`useBusquedaEnUrl`): mientras la base responde, la lista marcada con
// `data-resultados` se atenúa. Conserva el estado elegido y vuelve a la primera página (`hrefListaInsumo`).

export function BuscadorOrdenesInsumo({ filtros }: { filtros: FiltrosListaInsumo }) {
  const { texto, setTexto, buscando } = useBuscarAlEscribir(filtros.q, (termino) => hrefListaInsumo(filtros, { q: termino }));

  return (
    <Buscador
      valor={texto}
      onCambio={setTexto}
      buscando={buscando}
      atajo
      guia="oi-lista.buscador"
      enterKeyHint="search"
      etiqueta="Buscar una orden de insumos por su número, el proveedor o un insumo"
      // sugerir-fijo: dice qué se puede buscar (el número, el proveedor o un insumo); no depende del estado elegido
      placeholder="N.º, proveedor o insumo"
      className="w-full min-w-0 sm:w-auto sm:min-w-[16rem] sm:flex-1"
    />
  );
}
