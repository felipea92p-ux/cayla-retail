"use client";

// Aplicar UN precio propuesto en «Revisar precios» (ADR-0641; Felipe: «uno por uno, confirmando»), con el combo «Responsable» (ADR-0161:
// cambiar un precio se firma). La base vuelve a exigir el piso de 30 % con el costo de hoy y se niega si el precio cambió desde la propuesta.
// Cambia las tallas que estaban en el precio base; una talla con precio propio lo conserva. Se monta solo al abrirse.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { soles } from "@/lib/compras-reglas";
import { mensajeAplicar, pideReleer, textoAplicado, type PrendaARevisar } from "@/lib/revisar-precios-reglas";

export function AplicarPrecioHoja({
  prenda,
  propuesta,
  onClose,
}: {
  prenda: PrendaARevisar;
  propuesta: { id: string; precio: number; margen: number; costoEstimado: boolean };
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!responsable.listo) return;
    setGuardando(true);
    setError(null);
    const supabase = createClient();
    const { data, error: fallo } = await firmar(supabase.rpc("aplicar_precio_propuesto" as never, { p_propuesta_id: propuesta.id } as never), responsable.firma());
    setGuardando(false);
    responsable.despues(fallo);
    if (fallo) {
      const mensaje = mensajeAplicar(fallo);
      if (pideReleer(fallo)) {
        // Lo que se ve está viejo (otra persona cambió el precio, o ya se aplicó): se dice, se cierra y la lista se relee.
        avisar.error(mensaje);
        onClose();
        router.refresh();
        return;
      }
      setError(mensaje);
      return;
    }
    const r = (data ?? { cambiadas: 0, con_precio_propio: 0 }) as { cambiadas: number; con_precio_propio: number };
    avisar.exito(textoAplicado(prenda.referencia, propuesta.precio, r));
    onClose();
    router.refresh();
  }

  return (
    <Modal variante="hoja" tamano="mediana" bloqueado={guardando} titulo={`Cambiar el precio de «${prenda.referencia}»`} subtitulo="Queda en su historial, con quién lo cambió." onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[15px] tabular-nums text-taupe line-through decoration-taupe/60">{soles(prenda.precio)}</p>
            <p className="font-display text-[1.75rem] leading-none tabular-nums">{soles(propuesta.precio)}</p>
            <p className="text-sm tabular-nums text-taupe">
              margen {Math.round(propuesta.margen)} %{propuesta.costoEstimado ? " con el costo estimado" : ""}
            </p>
          </div>
          <p className="nota-cayla">
            Cambia las tallas que están en {soles(prenda.precio)}. Una talla con precio propio lo conserva, y los precios de una sede no se tocan.
          </p>
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          {error && (
            <Aviso tono="error" enfocable>
              {error}
            </Aviso>
          )}
          <div className="pie-acciones">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="button" peso="primario" onClick={() => void confirmar()} cargando={guardando} textoCargando="Cambiando…" disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
              Cambiar a {soles(propuesta.precio)}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
