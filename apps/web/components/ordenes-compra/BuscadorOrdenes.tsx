"use client";

import { useEffect, useRef, useState } from "react";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";
import { hrefLista, type FiltrosLista } from "@/lib/ordenes-compra-reglas";

// El buscador de Órdenes de compra (ADR-0362, fase 1 · actividad 3): una orden se encuentra por su número («OC-000012», «oc12» o
// «12») o por el nombre del proveedor, sin importar tildes ni mayúsculas (lo resuelve `fn_ordenes_compra` en la base).
//
// Vive en la URL (`?q=`) como los demás filtros de la lista, igual que el del Historial de ventas: se manda solo tras una pausa corta
// (sin una consulta por letra), con `replace` para que «atrás» no recorra la búsqueda letra por letra, y sin el loader general
// (`useBusquedaEnUrl`): mientras la base responde, la lista marcada con `data-resultados` se atenúa. Conserva la sede y el estado
// elegidos y vuelve a la primera página (`hrefLista`).

const PAUSA_MS = 350;

export function BuscadorOrdenes({ filtros }: { filtros: FiltrosLista }) {
  const [texto, setTexto] = useState(filtros.q);
  const ultimoEnviado = useRef(filtros.q);
  const { buscando, buscar } = useBusquedaEnUrl();

  // Si la URL cambia desde afuera («Borrar la búsqueda», atrás del navegador), el campo la sigue.
  useEffect(() => {
    if (filtros.q !== ultimoEnviado.current) {
      ultimoEnviado.current = filtros.q;
      setTexto(filtros.q);
    }
  }, [filtros.q]);

  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === ultimoEnviado.current) return;
    const t = window.setTimeout(() => {
      ultimoEnviado.current = limpio;
      buscar(hrefLista(filtros, { q: limpio }), { reemplazar: true });
    }, PAUSA_MS);
    return () => window.clearTimeout(t);
  }, [texto, filtros, buscar]);

  return (
    <Buscador
      valor={texto}
      onCambio={setTexto}
      buscando={buscando}
      atajo
      enterKeyHint="search"
      etiqueta="Buscar una orden de compra por su número o por el proveedor"
      // sugerir-fijo: dice qué se puede buscar (el número o el proveedor); no depende de la sede ni del estado elegidos
      placeholder="N.º de orden o proveedor"
      className="w-full min-w-0 sm:w-auto sm:min-w-[16rem] sm:flex-1"
    />
  );
}
