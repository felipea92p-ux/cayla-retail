"use client";

import { useState, type ReactNode } from "react";
import { BORRADOR_VACIO, ProveedorModal } from "@/components/ProveedorModal";
import { borradorDeLoBuscado, rubrosSinGastos } from "@/lib/proveedores-reglas";

// «+ Agregar proveedor» dentro de una pantalla donde se elige a quién se le compra o se le recibe mercadería (ADR-0452, actualización
// 2026-10-21): el mismo formulario de Proveedores (`ProveedorModal`: RUC, aviso de parecidos, la RPC `registrar_proveedor`), sin salir
// de la pantalla ni perder lo que ya se llenó.
//
// CONTRATO
//   PROMETE: `crear` (la opción que un `ComboBuscable` pone arriba de su lista; `undefined` si no se puede), `abrir` (para quien dibuja su
//            propio botón o lista) y `modal` (el formulario, o `null` si está cerrado). Al guardar llama `alGuardar` con el proveedor nuevo.
//   ASUME:   quien lo usa dibuja `modal` FUERA de su <form>: un `submit` que sube desde un modal llegaría al «Guardar» de la pantalla
//            (CLAUDE.md, ADR-0128); y agrega el proveedor a su lista local y lo elige (el directorio no se vuelve a leer: ver abajo).
//   NO HACE: no decide quién puede (`habilitado` lo dice la pantalla: el módulo Proveedores, y que el directorio se haya leído); no
//            ofrece el rubro «Gastos» en los botones (un proveedor de servicios se suma desde Finanzas ▸ Gastos); no refresca la página:
//            sería un disparador de remontes (al editar, `key` = versión) y el proveedor nuevo ya quedó en la lista de quien lo usa.

/** Lo que el formulario guardó y la pantalla puede necesitar de inmediato (la factura sugiere su vencimiento con el plazo y su medio de pago con la forma preferida). */
export type ProveedorNuevo = { id: string; nombre: string; ruc: string | null; plazoCreditoDias: number | null; formaPagoPreferida: string | null };

export function useAltaDeProveedor({
  habilitado,
  rubrosEnUso,
  existentes,
  alGuardar,
}: {
  habilitado: boolean;
  /** Los rubros que ya usa el directorio: los botones del formulario. */
  rubrosEnUso: readonly string[];
  /** El directorio COMPLETO (también quien es solo de gastos), para avisar de un RUC o un nombre que ya está. */
  existentes: readonly { id: string; nombre: string; ruc: string | null }[];
  alGuardar: (proveedor: ProveedorNuevo) => void;
}) {
  // Lo que se buscó queda como punto de partida del alta: el nombre, o el RUC si son 11 dígitos.
  const [abierto, setAbierto] = useState<{ nombre: string; ruc: string } | null>(null);
  const abrir = (textoBuscado = "") => setAbierto(borradorDeLoBuscado(textoBuscado));

  const crear = habilitado
    ? { etiqueta: (q: string) => (q ? `+ Agregar «${q}» como proveedor nuevo` : "+ Agregar proveedor"), onCrear: abrir }
    : undefined;

  const modal: ReactNode = abierto ? (
    <ProveedorModal
      inicial={{ ...BORRADOR_VACIO, ...abierto }}
      elegirTipo={false}
      rubros={rubrosSinGastos(rubrosEnUso)}
      existentes={existentes.map((p) => ({ id: p.id, nombre: p.nombre, ruc: p.ruc, activo: true }))}
      onClose={() => setAbierto(null)}
      onGuardado={(id, datos) => {
        setAbierto(null);
        if (id && datos) alGuardar({ id, nombre: datos.nombre, ruc: datos.ruc, plazoCreditoDias: datos.plazoCreditoDias ?? null, formaPagoPreferida: datos.formaPagoPreferida ?? null });
      }}
    />
  ) : null;

  return { crear, abrir, modal };
}
