"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RecepcionFormV2 } from "@/components/RecepcionFormV2";
import { RecepcionesRecientes } from "@/components/RecepcionesRecientes";
import type { RecepcionReciente } from "@/lib/compras-reglas";

type Variante = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };
type Proveedor = { id: string; nombre: string };

// 2026-09-17: antes, esta pantalla ERA el formulario — sin lista, sin
// forma de ver qué se había recibido antes. Mismo patrón que
// `ColoresLista`/`CategoriasLista` (lista primero, "+ Nuevo" abre un
// Modal): el formulario (`RecepcionFormV2`, sin tocar su lógica de
// escritura) pasa a vivir detrás del botón.
export function RecibirLotePanel({
  ubicacionId,
  ubicacionEtiqueta,
  variantes,
  proveedores,
  recepciones,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  variantes: Variante[];
  proveedores: Proveedor[];
  recepciones: RecepcionReciente[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label-cayla text-[11px] text-tinta/65">Recepciones sin factura · recientes</p>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="label-cayla shrink-0 rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
        >
          + Nueva recepción
        </button>
      </div>

      <RecepcionesRecientes recepciones={recepciones} vacio="Todavía no se recibió ningún lote sin factura en esta ubicación." />

      {abierto && (
        <Modal titulo="Recibir mercadería sin factura" subtitulo="Producción propia o un ajuste — si tienes la factura del proveedor, usa Compras." onClose={() => setAbierto(false)}>
          <RecepcionFormV2 ubicacionId={ubicacionId} ubicacionEtiqueta={ubicacionEtiqueta} variantes={variantes} proveedores={proveedores} />
        </Modal>
      )}
    </div>
  );
}
