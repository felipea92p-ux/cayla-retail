"use client";

import { Modal } from "@/components/ui/Modal";
import { ProveedorElegido } from "@/components/ProveedorElegido";
import type { ProveedorGasto } from "@/lib/gastos-reglas";

// «Cómo pagarle» (informe de Nueva orden de compra, tarea #9; Felipe 2026-10-21): una hoja que se lee, desde el proveedor elegido en la
// orden. Dice cómo contactarlo y a dónde va la plata, con el TITULAR primero (es lo que se compara con el nombre que muestra el banco
// antes de confirmar: pagar al celular equivocado no se revierte) y «Copiar» en cada dato.
//
// Es la misma pieza que ya usa el gasto (`ProveedorElegido`, que pide los datos bancarios al abrir con `fn_proveedor_datos_bancarios`):
// dos pantallas que muestran lo mismo se ven igual (ADR-0358). Sus estados: «Buscando…», los datos, «No puedes ver sus datos de pago»
// (la base devolvió cero filas por permiso: no se dice «sin cuenta», no se sabe), «No se pudieron leer» (falló la lectura) y «Falta cuenta»
// (puede verlos y el proveedor no los tiene: con su teléfono a la vista para llamar). Solo lectura: no guarda nada, y por eso no lleva
// «Cancelar» sino la ✕ (ADR-0358, «Las hojas»).
export function ComoPagarle({ proveedor, onClose }: { proveedor: ProveedorGasto; onClose: () => void }) {
  return (
    <Modal titulo="Cómo pagarle" subtitulo={proveedor.nombre} onClose={onClose} tamano="angosta" conCerrar>
      <ProveedorElegido proveedor={proveedor} />
    </Modal>
  );
}
