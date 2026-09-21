"use client";

import { useState } from "react";
import { CerrarFaltanteModal, type TiendaConFaltante } from "@/components/CerrarFaltanteModal";
import type { CompraResumen, LineaCompra } from "@/lib/compras-reglas";

// Acciones del libro de faltantes desde el DETALLE de un comprobante (D2, ADR-0111): cerrar con faltante una línea
// que ya tiene cantidades pendientes. El detalle es solo de líder (el layout de Compras lo exige), así que estas
// acciones asumen líder; la base lo vuelve a exigir.
//
// El formulario para REGISTRAR la nota de crédito salió de acá el 2026-09-19: era la segunda puerta al mismo
// documento (la primera vivía dentro de la guía de recepción) y ahora hay una sola, en `/compras/notas-credito`.
// El detalle sigue LISTANDO las notas ya emitidas (`NotasCreditoCompra`) con un enlace al módulo; cerrar el
// faltante se queda acá porque eso es operación —decir que esas prendas no llegaron—, no dinero.

export function BotonCerrarFaltante({ compra, linea, producto, tiendas }: { compra: CompraResumen; linea: LineaCompra; producto: string; tiendas?: TiendaConFaltante[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="label-cayla mt-1 block text-left text-[10px] text-rojo hover:underline">
        Cerrar con faltante
      </button>
      {abierto && <CerrarFaltanteModal compra={compra} linea={linea} producto={producto} tiendas={tiendas} onClose={() => setAbierto(false)} />}
    </>
  );
}
