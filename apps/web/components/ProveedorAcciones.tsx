"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, MessageCircle, Pencil, Plus } from "lucide-react";
import { ProveedorModal, borradorDe } from "@/components/ProveedorModal";
import { avisar } from "@/components/ui/Avisos";
import { urlWhatsApp } from "@/lib/proveedores-reglas";
import type { ProveedorFicha } from "@/lib/proveedores";

// Las acciones de la ficha (maqueta 09): escribirle por WhatsApp desde el teléfono guardado, copiar el
// CCI para la transferencia, editar sin volver a la lista y registrar un comprobante con este
// proveedor ya elegido. Hasta hoy la ficha era solo lectura: para hacer cualquiera de estas cosas había
// que ir a otra pantalla.
//
// Cada acción aparece solo si hay con qué hacerla: sin teléfono (o con uno que no es un móvil) no hay
// botón de WhatsApp — mejor sin botón que uno que abre un chat equivocado; sin cuenta, no hay «Copiar».

const BOTON = "label-cayla inline-flex items-center gap-2 rounded-md border border-tinta/25 px-4 py-3 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo";

export function ProveedorAcciones({ proveedor, rubros }: { proveedor: ProveedorFicha; rubros: string[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const whatsapp = urlWhatsApp(proveedor.telefono);

  async function copiarCuenta() {
    if (!proveedor.cuenta_bancaria) return;
    try {
      await navigator.clipboard.writeText(proveedor.cuenta_bancaria);
      avisar.exito("Cuenta copiada", { detalle: proveedor.banco ? `${proveedor.banco} · ${proveedor.cuenta_bancaria}` : proveedor.cuenta_bancaria });
    } catch {
      avisar.error("No se pudo copiar la cuenta", { detalle: "Selecciónala y cópiala a mano." });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={BOTON}>
            <MessageCircle aria-hidden className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
        {proveedor.cuenta_bancaria && (
          <button type="button" onClick={copiarCuenta} className={BOTON}>
            <Copy aria-hidden className="h-3.5 w-3.5" /> Copiar CCI
          </button>
        )}
        <button type="button" onClick={() => setEditando(true)} className={BOTON}>
          <Pencil aria-hidden className="h-3.5 w-3.5" /> Editar
        </button>
        {proveedor.activo && (
          <Link href={`/compras/nueva?prov=${proveedor.id}`} className="label-cayla inline-flex items-center gap-2 rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo">
            <Plus aria-hidden className="h-3.5 w-3.5" /> Registrar comprobante
          </Link>
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
