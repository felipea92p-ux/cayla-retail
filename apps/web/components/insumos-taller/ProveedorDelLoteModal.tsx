"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ProveedorParaCompra } from "@/components/insumos-taller/CompraDelInsumo";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { traducirError } from "@/lib/error-escritura";
import type { InsumoVista } from "@/lib/insumos";
import { cantidadTexto, type LoteConSaldo } from "@/lib/insumos-reglas";
import { RPC_ASIGNAR_PROVEEDOR_LOTE } from "@/lib/regularizar-insumos-reglas";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// A quién se le compró un lote de antes (ADR-0614, actividad 6). Solo completa el nombre, no crea deuda: si todavía se le debe, eso es una factura.
export function ProveedorDelLoteModal({ insumo, lote, proveedores, onClose }: { insumo: InsumoVista; lote: LoteConSaldo; proveedores: readonly ProveedorParaCompra[]; onClose: () => void }) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState("");
  const [cargando, setCargando] = useState(false);
  const responsable = useResponsable();
  const listo = proveedorId !== "" && responsable.listo;

  async function guardar() {
    if (!listo || cargando) return;
    setCargando(true);
    const { error } = await firmar(createClient().rpc(RPC_ASIGNAR_PROVEEDOR_LOTE as never, { p_lote_id: lote.id, p_proveedor_id: proveedorId } as never), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "guardar a quién se le compró"));
      return;
    }
    avisar.exito("Listo: el lote ya dice a quién se le compró", { detalle: proveedores.find((p) => p.id === proveedorId)?.nombre });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="¿A quién se le compró?" subtitulo={`${insumo.nombre} · ${cantidadTexto(lote.cantidadIngresada, insumo.unidad)}`} tamano="mediana" onClose={onClose}>
      <div className="space-y-4">
        <ComboBuscable valor={proveedorId} onValor={setProveedorId} opciones={proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))} marcador="Busca al proveedor…" etiquetaAccesible="Proveedor del lote" />
        <p className="text-sm text-tinta/65">Esto no crea una deuda. Si todavía se le debe, registra su factura.</p>
        <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
        <PieAcciones className="pie-hoja-fijo">
          <Boton type="button" peso="fantasma" onClick={onClose} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton type="button" peso="primario" cargando={cargando} disabled={!listo} onClick={() => void guardar()}>
            Guardar
          </Boton>
        </PieAcciones>
      </div>
    </Modal>
  );
}
