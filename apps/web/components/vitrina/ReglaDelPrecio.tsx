"use client";

import { useState } from "react";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";

/**
 * «¿Qué precio ve el cliente?» de Tienda web ▸ Vitrina ▸ Modelos: el enlace va a la derecha de las pestañas, a la altura de su centro (Felipe
 * 2026-10-26), y la regla se abre debajo, a todo el ancho de esa fila. Devuelve DOS hijos de la fila de `VitrinaPestanas` (el enlace y la
 * nota, que se pasa a su propia línea con `basis-full`): por eso es un fragmento y no una caja.
 */
export function ReglaDelPrecio() {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <BotonVerMas forma="enlace" className="relative tw-toque ml-auto mt-2 sm:mt-0" data-guia="vitrina.nota" abierto={abierta} onCambiar={setAbierta} texto="¿Qué precio ve el cliente?" controla="vitrina-regla-precio" />
      <FilasDeMas abierto={abierta} id="vitrina-regla-precio" className="basis-full">
        <div className="nota-cayla mt-3 space-y-2 text-[13px]">
          <p>
            En la web cada modelo vale lo mismo que en la tienda que el cliente elige; con «Todas», el precio más alto entre ellas. Las campañas se
            aplican encima con la misma regla de la caja. El precio, las fotos, los colores y las tallas se cambian en su ficha, en Catálogo ▸
            Productos.
          </p>
        </div>
      </FilasDeMas>
    </>
  );
}
