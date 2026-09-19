"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CuentasProveedor } from "@/components/CuentasProveedor";
import { ProveedorModal, borradorDe } from "@/components/ProveedorModal";
import { datosPagoDe } from "@/lib/proveedores-reglas";
import type { ProveedorFicha } from "@/lib/proveedores";

// «Datos para pagar» en la ficha del proveedor (ADR-0134). La página es un Server Component y no puede tener el
// estado del formulario de edición, así que esta pieza cliente lo guarda y reutiliza el MISMO `ProveedorModal` que
// abren «Editar» (ProveedorAcciones) y la lista: un solo formulario, no una copia por pantalla.
//
// La tarjeta ya dice, en ámbar y con «Agregar →», que faltan datos cuando el proveedor no tiene cuenta, CCI ni
// Yape/Plin (y no lo dice si cobra en efectivo: no le falta nada). El «Agregar» y el «Editar» abren el formulario.
export function ProveedorCuentasFicha({ proveedor, rubros }: { proveedor: ProveedorFicha; rubros: string[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  return (
    <>
      <CuentasProveedor datos={datosPagoDe(proveedor)} titulo="Datos para pagar" onEditar={() => setEditando(true)} />

      {editando && (
        <ProveedorModal
          inicial={borradorDe(proveedor)}
          rubros={rubros}
          onClose={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
