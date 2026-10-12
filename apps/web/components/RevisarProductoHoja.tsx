"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import {
  bloqueoDeRechazo,
  mensajeDeRevision,
  textoPrecio,
  textoVariantes,
  textosRevision,
  yaSeRevisoOtraVez,
  type ModoRevision,
  type ProductoPorRevisar,
} from "@/lib/revisar-productos-reglas";

/**
 * Aprobar o rechazar UNA prenda propuesta (`revisar_producto_censo`, ADR-0371), con el combo «Responsable» (ADR-0161: revisar el
 * catálogo se firma). Se monta solo al abrirse: la lista no lee la asistencia mientras nadie va a guardar nada.
 *
 * Rechazar es permanente (la prenda queda descontinuada y ya no se reactiva), y la base se niega si tiene una orden de producción en
 * proceso o stock. La hoja lo adelanta con `bloqueoDeRechazo` (las mismas dos condiciones): en vez de pedir confirmar algo que va a
 * fallar, dice qué lo frena y qué hacer, y deja ir directo a Producción o a Existencias. El candado real sigue siendo el de la base.
 */
export function RevisarProductoHoja({
  modo,
  producto,
  veProduccion,
  veExistencias,
  onClose,
}: {
  modo: ModoRevision;
  producto: ProductoPorRevisar;
  /** ¿Esta cuenta ve Producción? Sin el módulo, el enlace a las órdenes caería en «Sin acceso». */
  veProduccion: boolean;
  veExistencias: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textos = textosRevision(modo, producto.referencia);
  const bloqueo = modo === "rechazar" ? bloqueoDeRechazo(producto) : null;

  async function confirmar() {
    if (!responsable.listo || bloqueo) return;
    setGuardando(true);
    setError(null);
    const supabase = createClient();
    const { error: fallo } = await firmar(
      supabase.rpc("revisar_producto_censo", { p_producto_id: producto.productoId, p_aprobar: modo === "aprobar" }),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(fallo);
    if (fallo) {
      const mensaje = mensajeDeRevision(fallo, textos.accionError);
      if (yaSeRevisoOtraVez(fallo)) {
        // Otra persona decidió primero: lo que se ve está viejo. Se dice, se cierra y la lista se actualiza.
        avisar.error(mensaje);
        onClose();
        router.refresh();
        return;
      }
      setError(mensaje);
      return;
    }
    avisar.exito(textos.exito);
    onClose();
    router.refresh();
  }

  return (
    <Modal variante="hoja" ancho="max-w-lg" bloqueado={guardando} titulo={bloqueo ? `No se puede rechazar «${producto.referencia}» todavía` : textos.titulo} subtitulo={bloqueo ? undefined : textos.subtitulo} onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-4">
          <p className="text-[13.5px] leading-normal text-tinta/70">
            {textoVariantes(producto)} · {textoPrecio(producto.precioMin, producto.precioMax)}
          </p>

          {bloqueo ? (
            <>
              <Aviso tono="atencion" titulo={bloqueo.texto}>
                {bloqueo.queHacer}
              </Aviso>
              <div className="flex flex-wrap gap-2 pt-1">
                <Boton type="button" peso="fantasma" onClick={cerrar} className="flex-1">
                  Volver
                </Boton>
                {bloqueo.motivo === "ordenes" && veProduccion && (
                  <BotonEnlace href="/produccion/ordenes" peso="primario" className="flex-1">
                    Ver las órdenes
                  </BotonEnlace>
                )}
                {bloqueo.motivo === "stock" && veExistencias && (
                  <BotonEnlace href="/inventario" peso="primario" className="flex-1">
                    Ir a Existencias
                  </BotonEnlace>
                )}
              </div>
            </>
          ) : (
            <>
              {modo === "rechazar" ? <Aviso tono="atencion">{textos.nota}</Aviso> : <p className="nota-cayla">{textos.nota}</p>}
              <ComboResponsable control={responsable} deshabilitado={guardando} />
              {error && (
                <Aviso tono="error" enfocable>
                  {error}
                </Aviso>
              )}
              <div className="flex gap-2 pt-1">
                <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando} className="flex-1">
                  Volver
                </Boton>
                <Boton
                  type="button"
                  peso={modo === "rechazar" ? "peligro" : "primario"}
                  onClick={() => void confirmar()}
                  cargando={guardando}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
                  className="flex-1"
                >
                  {guardando ? "Guardando…" : textos.boton}
                </Boton>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
