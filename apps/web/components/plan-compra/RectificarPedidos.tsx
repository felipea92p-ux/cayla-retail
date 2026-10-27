"use client";

import { useRef, useState } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { esFalloDeRed, traducirError, type ErrorEscritura } from "@/lib/error-escritura";
import { MOTIVOS_DE_RECTIFICACION, RPC_RECTIFICAR_PEDIDO, argsRectificar, type MotivoDeRectificacion } from "@/lib/plan-compra-envio";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { useResponsable } from "@/lib/useResponsable";

// Rectificar (ADR-0530, spike ⑦): cambiar de decisión ANTES de pedir. Retira de Compras los pedidos pendientes (no se pide nada: vuelven al Plan como «por enviar») y deja anotado quién, cuándo y por qué.
// Los que ya son orden de compra no se rectifican desde aquí: se anulan en Compras ▸ Órdenes, para que la orden y el plan no queden contradiciéndose. La misma hoja sirve al Plan («Rectificar el envío»
// de una categoría) y a Compras (un pedido): una función, una pieza.

export type PedidoARectificar = { id: string; proveedor: string };

export function RectificarPedidos({
  titulo,
  pendientes,
  yaSonOrden,
  onClose,
  onHecho,
}: {
  titulo: string;
  /** Los pedidos que se retiran de Compras. */
  pendientes: readonly PedidoARectificar[];
  /** Los proveedores cuyos pedidos YA son orden: se nombran, no se rectifican. */
  yaSonOrden: readonly string[];
  onClose: () => void;
  /** Se rectificó al menos uno: la pantalla vuelve a leer. */
  onHecho: () => void;
}) {
  const responsable = useResponsable();
  const [motivo, setMotivo] = useState<MotivoDeRectificacion>("Cambié de idea");
  const [guardando, setGuardando] = useState(false);
  const rectificando = useRef(false);

  async function rectificar(cerrar: () => void) {
    if (rectificando.current || pendientes.length === 0) return;
    if (!responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    rectificando.current = true;
    setGuardando(true);
    const firma = responsable.firma();
    let hechos = 0;
    let falla: ErrorEscritura = null;
    // Uno por uno: cada rectificación es independiente y repetible (rectificar lo ya rectificado no cambia nada), así que si una falla las demás no se pierden ni se duplican.
    for (const p of pendientes) {
      const r = await firmar(createClient().rpc(RPC_RECTIFICAR_PEDIDO as never, argsRectificar(p.id, motivo) as never), firma);
      if (r.error) {
        falla = r.error;
        break;
      }
      hechos++;
    }
    responsable.despues(falla);
    setGuardando(false);
    rectificando.current = false;
    if (hechos > 0) onHecho();
    if (falla) {
      if (esFalloDeRed(falla)) return void avisar.error("Se cortó la conexión mientras se rectificaba: no sabemos si llegó. Vuelve a pulsar «Rectificar»; rectificar dos veces no cambia nada.");
      return void avisar.error(traducirError(falla, "rectificar el envío"));
    }
    avisar.exito(hechos === 1 ? "Rectificado: vuelve al Plan como «por enviar»" : `Rectificados ${hechos} pedidos: vuelven al Plan como «por enviar»`, { detalle: `Motivo: ${motivo}.` });
    cerrar();
  }

  return (
    <Modal titulo={titulo} subtitulo="Rectificar es cambiar de decisión antes de pedir." onClose={onClose} variante="hoja" tamano="angosta">
      {(cerrar) => (
        <div className="space-y-4">
          {pendientes.length > 0 && (
            <p className="nota-cayla">
              <b className="font-semibold">Se retiran de Compras ({pendientes.length}):</b> {pendientes.map((p) => p.proveedor).join(", ")}. No se pide nada: vuelven al Plan como «por enviar» y queda anotado quién y cuándo.
            </p>
          )}
          {yaSonOrden.length > 0 && (
            <Aviso tono="atencion" titulo={yaSonOrden.length === 1 ? `${yaSonOrden[0]} ya es una orden` : `${yaSonOrden.length} ya son órdenes: ${yaSonOrden.join(", ")}`}>
              Lo pedido no se rectifica desde el Plan: se anula en Compras ▸ Órdenes, para que la orden y el plan no queden contradiciéndose.
            </Aviso>
          )}
          {pendientes.length > 0 && (
            <>
              <CampoSelect etiqueta="¿Por qué rectificas?" valor={motivo} onValor={setMotivo} opciones={MOTIVOS_DE_RECTIFICACION.map((m) => ({ valor: m, texto: m }))} />
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </>
          )}
          <PieAcciones>
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            {pendientes.length > 0 && (
              <Boton type="button" peso="primario" cargando={guardando} textoCargando="Rectificando…" onClick={() => void rectificar(cerrar)}>
                {pendientes.length > 1 ? `Rectificar los ${pendientes.length}` : "Rectificar este pedido"}
              </Boton>
            )}
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
