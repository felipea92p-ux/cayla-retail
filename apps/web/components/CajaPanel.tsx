"use client";

import { useState } from "react";
import { AbrirCajaModal } from "@/components/AbrirCajaModal";
import { RegistrarVentaModal } from "@/components/RegistrarVentaModal";
import { CerrarCajaModal } from "@/components/CerrarCajaModal";

type VarianteBusqueda = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  precio: number | null;
  stockAqui: number;
};

type CajaAbierta = { id: string; montoApertura: number; abiertaEn: string };

type Props = {
  sedeId: string;
  sedeCodigo: string;
  cajaAbierta: CajaAbierta | null;
  variantes: VarianteBusqueda[];
};

export function CajaPanel({ sedeId, sedeCodigo, cajaAbierta, variantes }: Props) {
  const [modal, setModal] = useState<"abrir" | "vender" | "cerrar" | null>(null);

  if (!cajaAbierta) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div>
          <p className="text-sm font-semibold text-amber-800">Caja cerrada</p>
          <p className="text-xs text-amber-600">Abre la caja de {sedeCodigo} para poder registrar ventas hoy.</p>
        </div>
        <button
          onClick={() => setModal("abrir")}
          className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Abrir caja
        </button>
        {modal === "abrir" && <AbrirCajaModal sedeId={sedeId} sedeCodigo={sedeCodigo} onClose={() => setModal(null)} />}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-neutral-900">Caja abierta — {sedeCodigo}</p>
        <p className="text-xs text-neutral-400">Apertura S/{cajaAbierta.montoApertura.toFixed(2)}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => setModal("vender")}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Vender
        </button>
        <button
          onClick={() => setModal("cerrar")}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cerrar caja
        </button>
      </div>

      {modal === "vender" && (
        <RegistrarVentaModal
          sedeCodigo={sedeCodigo}
          cajaId={cajaAbierta.id}
          variantes={variantes}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "cerrar" && (
        <CerrarCajaModal cajaId={cajaAbierta.id} sedeCodigo={sedeCodigo} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
