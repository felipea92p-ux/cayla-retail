"use client";

import { BotonCompacto } from "@/components/ui/BotonCompacto";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";

/** Lo que dice una lista cuando la búsqueda de la cabecera no deja pasar ninguna fila: qué se buscó y la
 *  forma de volver a ver todo. Lee el texto del shell, así que las cuatro listas lo usan sin propiedades. */
export function SinCoincidencias() {
  const { texto, setTexto } = useFacturacionBusqueda();
  return (
    <div role="status" className="border-t border-tinta/10 px-5 py-8 text-center">
      <p className="font-display text-base italic text-tinta/65">Nada coincide con «{texto.trim()}».</p>
      <BotonCompacto variante="fila" className="mt-3" onClick={() => setTexto("")}>
        Borrar la búsqueda
      </BotonCompacto>
    </div>
  );
}
