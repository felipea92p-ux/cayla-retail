"use client";

import { useEffect, useRef, useState } from "react";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { Buscador } from "@/components/ui/Buscador";
import { hrefListaInsumo, type FiltrosListaInsumo } from "@/lib/ordenes-insumo-reglas";

// El buscador de Órdenes de insumos (ADR-0362, fase 7 · actividad 2), el mismo de Órdenes de compra: una orden se encuentra por su número
// («OI-000012», «oi12» o «12»), por el proveedor o por un insumo que lleva (su nombre o su código), sin importar tildes ni mayúsculas
// (lo resuelve `fn_ordenes_insumo` en la base).
//
// Vive en la URL (`?q=`) como el filtro de estado: se manda solo tras una pausa corta, con `replace` para que «atrás» no recorra la
// búsqueda letra por letra, y sin el loader general (`useBusquedaEnUrl`): mientras la base responde, la lista marcada con
// `data-resultados` se atenúa. Conserva el estado elegido y vuelve a la primera página (`hrefListaInsumo`).

const PAUSA_MS = 350;

export function BuscadorOrdenesInsumo({ filtros }: { filtros: FiltrosListaInsumo }) {
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
      buscar(hrefListaInsumo(filtros, { q: limpio }), { reemplazar: true });
    }, PAUSA_MS);
    return () => window.clearTimeout(t);
  }, [texto, filtros, buscar]);

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
