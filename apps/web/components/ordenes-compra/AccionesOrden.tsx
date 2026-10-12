"use client";

import { useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, Printer, ReceiptText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, BotonEnlace, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { BotonEditarOrden } from "@/components/ordenes-compra/BotonEditarOrden";
import { HojaOrdenCompra, type EmpresaDeLaOrden } from "@/components/ordenes-compra/HojaOrdenCompra";
import { useTituloDeImpresion } from "@/lib/useTituloDeImpresion";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import {
  MAX_MOTIVO_ANULACION,
  avisoDeCorte,
  numeroOrdenCompra,
  problemaDeMotivo,
  puedeAnularOrden,
  puedeEditarOrden,
  puedeRegistrarComprobante,
  type DetalleOrden,
} from "@/lib/ordenes-compra-reglas";
import { anularOrdenCompra } from "@/lib/ordenes-compra-acciones";
import { textoParaBase } from "@/lib/orden-compra-alta";

// Lo que se hace con una orden (ADR-0362, fase 1 · actividades 4, 5 y 6): «Imprimir o guardar PDF» siempre; «Editar» y «Anular orden»
// solo mientras está «generada». Con papel (fase 2, actividad 4) se suma «Registrar comprobante» —la acción principal— mientras la orden esté
// generada y con «Llega a». Y desde que tiene un comprobante «Editar» se va (la base no edita una orden con comprobante); mientras tenga uno
// vigente también se va «Anular orden» (primero se anula el comprobante; la orden abierta lo explica).
//
// Va al pie de la ventana de la orden (`lugar="pie"`: anular a la izquierda, como «Anular comprobante» en una factura; imprimir, editar y la
// acción principal a la derecha, donde la mano ya está al terminar de leer) y en la cabecera de su página (`lugar="cabecera"`).
//
// Anular es irreversible: pide el motivo en una hoja, con su guía de foco (el motivo y, desde una terminal, quién lo hace), y dice qué
// pasa antes de confirmar. Con la cuenta de una persona firma ella (`orden_compra_anular`, decisión 39).
//
// El PDF (decisión 1: se puede mandar al proveedor) sale del diálogo de impresión, como la guía de traslado: el papel
// (`HojaOrdenCompra`, A4) queda montado pegado a <body> mientras la orden está a la vista —así Ctrl+P también imprime la orden y no la
// pantalla— y el documento se llama como la orden, así el archivo se guarda como «OC-000129.pdf» (`useTituloDeImpresion`).

const sinSuscripcion = () => () => {};

export function AccionesOrden({ orden, empresa, lugar }: { orden: DetalleOrden; empresa: EmpresaDeLaOrden; lugar: "pie" | "cabecera" }) {
  const [anulando, setAnulando] = useState(false);
  // El botón que abrió la hoja: al cerrarla, el foco vuelve a él (la hoja no tiene «disparador» de Radix; chaos 2026-10-10, TEC-06).
  const origenAnular = useRef<HTMLElement | null>(null);
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  useTituloDeImpresion(numeroOrdenCompra(orden.numero));
  // Las mismas reglas que la base, dichas para no ofrecer un botón que ella rechazaría (`ordenes-compra-reglas.ts`).
  const puedeEditar = puedeEditarOrden(orden);
  const puedeAnular = puedeAnularOrden(orden);

  const imprimir = (
    <Boton onClick={() => window.print()}>
      <span className="inline-flex items-center gap-2">
        <Printer aria-hidden className="h-3.5 w-3.5" /> Imprimir o guardar PDF
      </span>
    </Boton>
  );
  const registrar = puedeRegistrarComprobante(orden) && (
    <BotonEnlace href={`/compras/ordenes/comprobante/${orden.id}`} peso="primario">
      <span className="inline-flex items-center gap-2">
        <ReceiptText aria-hidden className="h-3.5 w-3.5" /> Registrar comprobante
      </span>
    </BotonEnlace>
  );
  const anular = puedeAnular && (
    <Boton
      peso="peligro"
      onClick={(e) => {
        origenAnular.current = e.currentTarget;
        setAnulando(true);
      }}
    >
      <span className="inline-flex items-center gap-2">
        <Ban aria-hidden className="h-3.5 w-3.5" /> Anular orden
      </span>
    </Boton>
  );
  return (
    <>
      {lugar === "pie" ? (
        <div data-guia="orden.acciones" className="flex w-full flex-wrap items-center gap-3">
          {anular}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {imprimir}
            {puedeEditar && <BotonEditarOrden id={orden.id} />}
            {registrar}
          </div>
        </div>
      ) : (
        <div data-guia="orden.acciones" className="flex flex-wrap items-center gap-3">
          {anular}
          {imprimir}
          {puedeEditar && <BotonEditarOrden id={orden.id} />}
          {registrar}
        </div>
      )}
      {anulando && (
        <AnularOrdenModal
          orden={{ id: orden.id, numero: orden.numero, version: orden.version, proveedor: orden.proveedor.nombre, total: orden.total }}
          onClose={() => setAnulando(false)}
          volverA={origenAnular}
        />
      )}
      {montado &&
        createPortal(
          <div id="orden-compra-print" className="papel-fijo" aria-hidden>
            <HojaOrdenCompra orden={orden} empresa={empresa} />
          </div>,
          document.body,
        )}
    </>
  );
}

type OrdenParaAnular = { id: string; numero: number; version: number; proveedor: string; total: number };

function AnularOrdenModal({
  orden,
  onClose,
  volverA,
}: {
  orden: OrdenParaAnular;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enVuelo = useRef(false);
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
    // Dos clics en el mismo instante: el candado se pone en el mismo tick (ver `guardar` en NuevaOrdenCompra; chaos 2026-10-10).
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      const firma = esPersona ? firmaOmitida("orden_compra_anular") : responsable.firma();
      const { version, error } = await anularOrdenCompra({ p_id: orden.id, p_version_esperada: orden.version, p_motivo: textoParaBase(motivo) }, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error || version == null) {
        // Se cortó la señal: pudo anularse. Con el mismo motivo, reintentar no repite nada (Formidable, 2026-10-10).
        if (error && esFalloDeRed(error)) {
          avisar.error(avisoDeCorte("anular"));
          return;
        }
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
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Anular ${nombre}`}
      subtitulo={`${orden.proveedor} · ${soles(orden.total)}`}
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
    >
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
