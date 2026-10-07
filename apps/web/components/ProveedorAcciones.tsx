"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle, Pencil, Plus } from "lucide-react";
import { ProveedorModal, borradorDe } from "@/components/ProveedorModal";
import { Boton, BotonAncla, BotonEnlace } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { formatoCci, urlWhatsApp } from "@/lib/proveedores-reglas";
import type { ProveedorFicha } from "@/lib/proveedores";

// Las acciones de la ficha (maqueta 09): escribirle por WhatsApp desde el teléfono guardado, copiar el
// CCI para la transferencia, editar sin volver a la lista y registrar un comprobante con este
// proveedor ya elegido.
//
// Cada acción aparece solo si hay con qué hacerla: sin teléfono (o con uno que no es un móvil) no hay
// botón de WhatsApp — mejor sin botón que uno que abre un chat equivocado; sin CCI, no hay «Copiar CCI».
// Desde ADR-0134 «Copiar CCI» copia `cci` (20 dígitos, solo números, listos para pegar en la app del banco);
// antes copiaba `cuenta_bancaria` rotulada como CCI, que es otro dato. La cuenta y el Yape/Plin se copian desde
// la tarjeta «Datos para pagar», que tiene un «Copiar» por cada dato.


export function ProveedorAcciones({ proveedor, rubros }: { proveedor: ProveedorFicha; rubros: string[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const whatsapp = urlWhatsApp(proveedor.telefono);

  async function copiarCci() {
    if (!proveedor.cci) return;
    try {
      await navigator.clipboard.writeText(proveedor.cci);
      avisar.exito("CCI copiado", { detalle: proveedor.banco ? `${proveedor.banco} · ${formatoCci(proveedor.cci)}` : formatoCci(proveedor.cci) });
    } catch {
      avisar.error("No se pudo copiar el CCI", { detalle: "Ábrelo con «Ver completos» en Datos para pagar y cópialo a mano." });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        {whatsapp && (
          <BotonAncla href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle aria-hidden className="h-3.5 w-3.5" /> WhatsApp
          </BotonAncla>
        )}
        {proveedor.cci && (
          <Boton type="button" onClick={copiarCci}>
            <span className="inline-flex items-center gap-2">
              <Copy aria-hidden className="h-3.5 w-3.5" /> Copiar CCI
            </span>
          </Boton>
        )}
        <Boton type="button" onClick={() => setEditando(true)}>
          <span className="inline-flex items-center gap-2">
            <Pencil aria-hidden className="h-3.5 w-3.5" /> Editar
          </span>
        </Boton>
        {proveedor.activo && (
          <BotonEnlace href={`/compras/nueva?prov=${proveedor.id}`} peso="primario">
            <Plus aria-hidden className="h-3.5 w-3.5" /> Registrar factura
          </BotonEnlace>
        )}
      </div>

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
