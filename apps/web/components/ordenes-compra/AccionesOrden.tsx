"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BotonEditarOrden } from "@/components/ordenes-compra/BotonEditarOrden";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { MAX_MOTIVO_ANULACION, numeroOrdenCompra, problemaDeMotivo } from "@/lib/ordenes-compra-reglas";
import { anularOrdenCompra } from "@/lib/ordenes-compra-acciones";

// Lo que se hace con una orden «generada» (ADR-0362, fase 1 · actividades 4 y 5): «Editar» y «Anular orden». Una anulada no tiene
// acciones. Va al pie de la ventana de la orden (`lugar="pie"`: anular a la izquierda, como «Anular comprobante» en una factura, y editar
// a la derecha, donde la mano ya está al terminar de leer) y en la cabecera de su página (`lugar="cabecera"`).
//
// Anular es irreversible: pide el motivo en una hoja, con su guía de foco (el motivo y, desde una terminal, quién lo hace), y dice qué
// pasa antes de confirmar. Con la cuenta de una persona firma ella (`orden_compra_anular`, decisión 39).

export type OrdenParaAcciones = { id: string; numero: number; version: number; proveedor: string; total: number };

export function AccionesOrden({ orden, lugar }: { orden: OrdenParaAcciones; lugar: "pie" | "cabecera" }) {
  const [anulando, setAnulando] = useState(false);
  const anular = (
    <Boton peso="peligro" onClick={() => setAnulando(true)}>
      <span className="inline-flex items-center gap-2">
        <Ban aria-hidden className="h-3.5 w-3.5" /> Anular orden
      </span>
    </Boton>
  );
  return (
    <>
      {lugar === "pie" ? (
        <div className="flex w-full flex-wrap items-center gap-3">
          {anular}
          <div className="ml-auto">
            <BotonEditarOrden id={orden.id} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {anular}
          <BotonEditarOrden id={orden.id} />
        </div>
      )}
      {anulando && <AnularOrdenModal orden={orden} onClose={() => setAnulando(false)} />}
    </>
  );
}

function AnularOrdenModal({ orden, onClose }: { orden: OrdenParaAcciones; onClose: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const nombre = numeroOrdenCompra(orden.numero);

  // Lo que falta = lo que `anular_orden_compra` rechazaría: el motivo y, desde una terminal, quién lo hace.
  const problema = problemaDeMotivo(motivo);
  const campos: CampoDeGuia[] = [
    { id: "motivo", nombre: "Motivo", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    ...(esPersona
      ? []
      : [{ id: "responsable", nombre: "Quién la anula", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién la anula." }]),
  ];
  const guia = useGuiaCampos(campos);

  async function confirmar() {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setGuardando(true);
    const firma = esPersona ? firmaOmitida("orden_compra_anular") : responsable.firma();
    const { version, error } = await anularOrdenCompra({ p_id: orden.id, p_version_esperada: orden.version, p_motivo: motivo.trim() }, firma);
    setGuardando(false);
    if (!esPersona) responsable.despues(error);
    if (error || version == null) {
      if (esVersionCambiada(error)) {
        // Otra persona la editó (o la anuló) mientras se miraba: se recarga para ver qué dice ahora, antes de decidir.
        avisar.error(traducirError(error, "anular la orden"), { accion: { texto: "Recargar", onClick: () => router.refresh() } });
        onClose();
        return;
      }
      avisar.error(traducirError(error, "anular la orden"));
      return;
    }
    avisar.exito(`${nombre} anulada`, { detalle: "Deja de contar en lo pedido. Su número no vuelve a usarse." });
    onClose();
    router.refresh();
  }

  return (
    <Modal titulo={`Anular ${nombre}`} subtitulo={`${orden.proveedor} · ${soles(orden.total)}`} onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <p className="text-sm text-tinta/75">
            La orden queda anulada: deja de contar en lo pedido y su número no vuelve a usarse. No se borra; queda a la vista con quién la
            anuló, cuándo y por qué. <b className="font-medium text-tinta">Esto no se puede deshacer.</b>
          </p>
          {/* El título va en el bloque (`titulo`, con su marca de la guía): la caja hundida deja su etiqueta solo para el lector. */}
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué se anula">
            <CampoTexto
              etiqueta="Por qué se anula"
              caja
              autoFocus
              maxLength={MAX_MOTIVO_ANULACION}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-taupe">Lo verá quien revise la orden después.</p>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién la anula">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para anular." />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Anulando…" : "Anular orden"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
