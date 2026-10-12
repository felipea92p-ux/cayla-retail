"use client";

import { SearchX } from "lucide-react";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";
import { useFacturacionBusqueda } from "@/lib/useFacturacionBusqueda";

/** Lo que dice una lista cuando la búsqueda de la cabecera no deja pasar ninguna fila: qué se buscó y la
 *  forma de volver a ver todo. Lee el texto del shell, así que las cuatro listas lo usan sin propiedades. */
export function SinCoincidencias() {
  const { texto, setTexto } = useFacturacionBusqueda();
  return (
    <div className="border-t border-tinta/10">
      <Vacio
        icono={<SearchX />}
        titulo={`Nada coincide con «${texto.trim()}»`}
        acciones={
          <Boton peso="fantasma" onClick={() => setTexto("")}>
            Borrar la búsqueda
          </Boton>
        }
      />
    </div>
  );
}
