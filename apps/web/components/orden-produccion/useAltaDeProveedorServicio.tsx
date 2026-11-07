"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ProveedorProduccionModal, type ProveedorProduccionNuevo } from "@/components/ProveedorProduccionModal";

// «+ Registrar proveedor nuevo» desde el combo «Proveedor» de una fase que sale afuera (la hoja de Nueva orden y «Cambiar quién»): quien hace el
// corte, la costura o el bordado y todavía no está en el directorio se registra ahí mismo, sin salir de la hoja ni perder lo escrito.
//
// CONTRATO
//   PROMETE: `proveedores` (la lista que le diste MÁS los que se registraron desde aquí, sin repetir), `abrir(alRegistrar)` (abre el formulario;
//            `alRegistrar` recibe el id del proveedor nuevo para que la fila lo elija) y `modal` (el formulario, o `null` si está cerrado).
//   ASUME:   quien lo usa dibuja `modal` FUERA de su <form>: un `submit` que sube desde un modal llegaría al «Guardar» de la hoja (CLAUDE.md, ADR-0128).
//   NO HACE: no decide quién puede (la base: `guardar_proveedor_produccion` es solo del Líder y lo rechaza con su mensaje); no refresca la página
//            (un refresco remontaría la hoja y se perdería lo llenado); no ofrece tela ni avíos (no cosen ni bordan: `fase_proveedor_rubro`);
//            no inventa tarifas: un proveedor nuevo no tiene lista de precios, la tarifa se escribe a mano en la fase.

/** Los rubros que pueden hacer una fase: lo contrario de `RUBROS_QUE_NO_SIRVEN` (lib/orden-fases-reglas). */
const RUBROS_DE_SERVICIO = ["maquila", "otro"] as const;

export function useAltaDeProveedorServicio<P extends { id: string; nombre: string; rubro: string; activo: boolean }>(base: readonly P[], conTarifas: (nuevo: { id: string; nombre: string; rubro: string; activo: true }) => P) {
  const [agregados, setAgregados] = useState<P[]>([]);
  const [abierto, setAbierto] = useState<{ alRegistrar: (id: string) => void } | null>(null);

  const proveedores = useMemo(() => [...base, ...agregados.filter((a) => !base.some((b) => b.id === a.id))], [base, agregados]);

  const abrir = useCallback((alRegistrar: (id: string) => void) => setAbierto({ alRegistrar }), []);

  const modal: ReactNode = abierto ? (
    <ProveedorProduccionModal
      proveedor={null}
      rubroInicial="maquila"
      rubros={RUBROS_DE_SERVICIO}
      onClose={() => setAbierto(null)}
      alGuardar={(nuevo: ProveedorProduccionNuevo) => {
        setAgregados((prev) => [...prev, conTarifas({ id: nuevo.id, nombre: nuevo.nombre, rubro: nuevo.rubro, activo: true })]);
        abierto.alRegistrar(nuevo.id);
      }}
    />
  ) : null;

  return { proveedores, abrir, modal };
}
