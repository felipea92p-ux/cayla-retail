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
      <div className="flex items-center justify-between card-cayla p-5">
        <div>
          <p className="label-cayla text-[10px] text-rojo">Caja cerrada</p>
          <p className="mt-1.5 text-sm text-tinta/60">Abre la caja de {sedeCodigo} para registrar ventas hoy.</p>
        </div>
        <button
          onClick={() => setModal("abrir")}
          className="label-cayla shrink-0 bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
        >
          Abrir caja
        </button>
        {modal === "abrir" && <AbrirCajaModal sedeId={sedeId} sedeCodigo={sedeCodigo} onClose={() => setModal(null)} />}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between card-cayla p-5">
      <div>
        <p className="label-cayla text-[10px] text-tinta/55">Caja abierta · {sedeCodigo}</p>
        <p className="mt-1.5 text-sm text-tinta/60">
          Apertura <span className="font-display text-base text-tinta">S/{cajaAbierta.montoApertura.toFixed(2)}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => setModal("vender")}
          className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
        >
          Vender
        </button>
        <button
          onClick={() => setModal("cerrar")}
          className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          Cerrar
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
