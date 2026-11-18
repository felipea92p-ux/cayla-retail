"use client";

import { useBuscarAlEscribir } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";
import { hrefLista, type FiltrosLista } from "@/lib/ordenes-compra-reglas";

// El buscador de Órdenes de compra (ADR-0362, fase 1 · actividad 3): una orden se encuentra por su número («OC-000012», «oc12» o
// «12») o por el nombre del proveedor, sin importar tildes ni mayúsculas (lo resuelve `fn_ordenes_compra` en la base).
//
// Vive en la URL (`?q=`) como los demás filtros de la lista, igual que el del Historial de ventas: se manda solo tras una pausa corta
// (sin una consulta por letra), con `replace` para que «atrás» no recorra la búsqueda letra por letra, y sin el loader general
// (`useBusquedaEnUrl`): mientras la base responde, la lista marcada con `data-resultados` se atenúa. Conserva la sede y el estado
// elegidos y vuelve a la primera página (`hrefLista`).

export function BuscadorOrdenes({ filtros }: { filtros: FiltrosLista }) {
  const { texto, setTexto, buscando } = useBuscarAlEscribir(filtros.q, (termino) => hrefLista(filtros, { q: termino }));

  return (
    <Buscador
      valor={texto}
      onCambio={setTexto}
      buscando={buscando}
      atajo
      guia="ordenes.buscador"
      enterKeyHint="search"
      etiqueta="Buscar una orden de compra por su número o por el proveedor"
      // sugerir-fijo: dice qué se puede buscar (el número o el proveedor); no depende de la sede ni del estado elegidos
      placeholder="N.º de orden o proveedor"
      className="w-full min-w-0 sm:w-auto sm:min-w-[16rem] sm:flex-1"
    />
  );
}
