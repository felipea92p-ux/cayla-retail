"use client";

import { useState } from "react";
import { CambioFormV2 } from "@/components/CambioFormV2";
import type { LineaVentaReciente } from "@/lib/ventas-v2";

type VarianteCatalogo = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null; precio: number };

export function CambiosLista({
  lineas,
  ubicacionId,
  catalogo,
}: {
  lineas: LineaVentaReciente[];
  ubicacionId: string;
  catalogo: VarianteCatalogo[];
}) {
  const [enCambio, setEnCambio] = useState<LineaVentaReciente | null>(null);

  return (
    <div className="card-cayla divide-y divide-tinta/10">
      {lineas.map((l) => {
        const disponible = l.cantidad - l.yaCambiado;
        return (
          <div key={l.ventaItemId} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-tinta">
                {l.referencia} <span className="text-tinta/65">{[l.talla, l.color].filter(Boolean).join("/")}</span>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-tinta/65">
                {l.sku} · comprada × {l.cantidad}
                {l.yaCambiado > 0 && ` · ya cambiada × ${l.yaCambiado}`}
              </p>
            </div>
            <button
              type="button"
              disabled={disponible <= 0}
              onClick={() => setEnCambio(l)}
              className="label-cayla text-[11px] text-tinta/65 hover:text-rojo disabled:text-tinta/30 disabled:hover:text-tinta/30"
            >
              {disponible <= 0 ? "Sin cambio disponible" : "Cambiar"}
            </button>
          </div>
        );
      })}
      {enCambio && (
        <CambioFormV2 linea={enCambio} ubicacionId={ubicacionId} catalogo={catalogo} onClose={() => setEnCambio(null)} />
      )}
    </div>
  );
}
