"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";

type Ubicacion = { id: string; nombre: string };

// Extraído de `ProformasPanel` (ADR-0124) SIN cambiar su lógica. Lo dibuja
// `FacturacionShell` una sola vez, para que lo abran la cabecera y el botón de la vista
// Proformas. Igual que `EmitirComprobanteModal`, se dibuja siempre y solo se muestra u
// oculta: lo último elegido (la tienda) vive acá.
export function NuevaProformaModal({
  abierto,
  onCerrar,
  ubicaciones,
  ubicacionActualId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  ubicaciones: Ubicacion[];
  ubicacionActualId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [ubicacionId, setUbicacionId] = useState(ubicacionActualId);
  const [total, setTotal] = useState(0);
  const [clienteNombre, setClienteNombre] = useState("");
  const [venceEnDias, setVenceEnDias] = useState(7);

  // Igual que el `cerrarModal` de antes: limpia lo tipeado y NO la tienda elegida.
  function cerrar() {
    setTotal(0);
    setClienteNombre("");
    setVenceEnDias(7);
    onCerrar();
  }

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const igv = Math.round((total - total / 1.18) * 100) / 100;
    const subtotal = Math.round((total - igv) * 100) / 100;
    const venceAt = new Date(Date.now() + venceEnDias * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase.rpc("crear_proforma", {
      p_ubicacion_id: ubicacionId,
      // Sin catálogo de ítems en esta pantalla todavía (mismo nivel de detalle
      // que "Emitir comprobante" hoy: un total, no líneas) — se guarda como un
      // solo ítem para no inventar una estructura que nadie lee todavía.
      // `precio_unitario`, no `precio`: es la forma que espera emitir_comprobante()
      // cuando convertir_proforma_a_comprobante() reenvía estos items (0010) — con
      // el nombre viejo, Lucode recibía un precio undefined en cada línea.
      p_items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: total }],
      p_subtotal: subtotal,
      p_igv: igv,
      p_total: total,
      p_cliente_nombre: clienteNombre || undefined,
      p_vence_at: venceAt,
    });
    if (error) {
      avisar.error(traducirError(error, "crear la proforma"));
      setLoading(false);
      return;
    }
    setLoading(false);
    avisar.exito(`Proforma de S/ ${total.toFixed(2)} creada`, { detalle: `Vence en ${venceEnDias} ${venceEnDias === 1 ? "día" : "días"}.` });
    cerrar();
    router.refresh();
  }

  if (!abierto) return null;

  return (
    <Modal titulo="Nueva proforma" onClose={cerrar}>
      <form onSubmit={onCrear} className="mt-5 space-y-2">
        <CampoSelect
          etiqueta="Ubicación"
          valor={ubicacionId}
          onValor={setUbicacionId}
          opciones={ubicaciones.map((u) => ({ valor: u.id, texto: u.nombre }))}
        />

        <CampoTexto
          etiqueta="Cliente (opcional)"
          value={clienteNombre}
          onChange={(e) => setClienteNombre(e.target.value)}
          placeholder="Nombre de la clienta"
        />

        <CampoMonto
          etiqueta="Total (incluye IGV)"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="0.00"
          value={total || ""}
          onChange={(e) => setTotal(Number(e.target.value))}
        />

        <CampoTexto
          etiqueta="Vigente por (días)"
          type="number"
          min="1"
          required
          value={venceEnDias}
          onChange={(e) => setVenceEnDias(Number(e.target.value))}
        />

        <div className="flex gap-2 pt-3">
          <Boton type="button" peso="fantasma" className="flex-1" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" peso="primario" className="flex-1" cargando={loading}>
            {loading ? "Guardando…" : "Guardar proforma"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
