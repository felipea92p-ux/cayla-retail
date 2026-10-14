"use client";

import { useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { HojaOrdenInsumo } from "@/components/ordenes-insumo/HojaOrdenInsumo";
import type { EmpresaDeLaOrden } from "@/components/ordenes-compra/HojaOrdenCompra";
import { useTituloDeImpresion } from "@/lib/useTituloDeImpresion";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { MAX_MOTIVO_ANULACION, avisoDeCorte, problemaDeMotivo } from "@/lib/ordenes-compra-reglas";
import { textoParaBase } from "@/lib/orden-compra-alta";
import {
  RUTA_ORDENES_INSUMO,
  numeroOrdenInsumo,
  puedeAnularOrdenInsumo,
  puedeEditarOrdenInsumo,
  type DetalleOrdenInsumo,
} from "@/lib/ordenes-insumo-reglas";
import { anularOrdenInsumo } from "@/lib/ordenes-insumo-acciones";
import { BotonImprimir } from "@/components/ui/BotonImprimir";

// Lo que se hace con una orden de insumos (ADR-0362, fase 7 · actividad 2), como en la orden de compra (fase 1): «Imprimir o guardar
// PDF» siempre; «Editar» y «Anular orden» solo mientras está «generada». El comprobante y la recepción del Taller llegan después (esperan
// a Felipe): cuando lleguen, sus botones se suman aquí y editar/anular sumarán su candado, como hicieron las fases 2 y 3.
//
// Va al pie de la ventana de la orden (`lugar="pie"`: anular a la izquierda; imprimir y editar a la derecha, donde la mano ya está al
// terminar de leer) y en la cabecera de su página (`lugar="cabecera"`).
//
// Anular es irreversible: pide el motivo en una hoja, con su guía de foco (el motivo y, desde una terminal, quién lo hace), y dice qué
// pasa antes de confirmar. Con la cuenta de una persona firma ella (`orden_insumo_anular`, decisión 39 extendida al Taller).
//
// El PDF sale del diálogo de impresión: el papel (`HojaOrdenInsumo`, A4) queda montado pegado a <body> mientras la orden está a la vista
// —así Ctrl+P también imprime la orden y no la pantalla— y el documento se llama como la orden: el archivo se guarda como «OI-000012.pdf».

const sinSuscripcion = () => () => {};

export function AccionesOrdenInsumo({ orden, empresa, lugar }: { orden: DetalleOrdenInsumo; empresa: EmpresaDeLaOrden; lugar: "pie" | "cabecera" }) {
  const [anulando, setAnulando] = useState(false);
  // El botón que abrió la hoja: al cerrarla, el foco vuelve a él (la hoja no tiene «disparador» de Radix).
  const origenAnular = useRef<HTMLElement | null>(null);
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  useTituloDeImpresion(numeroOrdenInsumo(orden.numero));

  const imprimir = (
    <BotonImprimir onClick={() => window.print()} title="También sirve para guardar la orden en PDF" guia="oi.imprimir">
      Imprimir la orden
    </BotonImprimir>
  );
  const editar = puedeEditarOrdenInsumo(orden) && (
    <BotonEnlace href={`${RUTA_ORDENES_INSUMO}/editar/${orden.id}`} data-guia="oi.editar">
      <span className="inline-flex items-center gap-2">
        <Pencil aria-hidden className="h-3.5 w-3.5" /> Editar
      </span>
    </BotonEnlace>
  );
  const anular = puedeAnularOrdenInsumo(orden) && (
    <Boton
      peso="peligro"
      data-guia="oi.anular"
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
        <div data-guia="oi.acciones" className="flex w-full flex-wrap items-center gap-3">
          {anular}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {imprimir}
            {editar}
          </div>
        </div>
      ) : (
        <div data-guia="oi.acciones" className="flex flex-wrap items-center gap-3">
          {anular}
          {imprimir}
          {editar}
        </div>
      )}
      {anulando && (
        <AnularOrdenInsumoModal
          orden={{ id: orden.id, numero: orden.numero, version: orden.version, proveedor: orden.proveedor.nombre, total: orden.total }}
          onClose={() => setAnulando(false)}
          volverA={origenAnular}
        />
      )}
      {montado &&
        createPortal(
          <div id="orden-insumo-print" className="papel-fijo" aria-hidden>
            <HojaOrdenInsumo orden={orden} empresa={empresa} />
          </div>,
          document.body,
        )}
    </>
  );
}

type OrdenParaAnular = { id: string; numero: number; version: number; proveedor: string; total: number };

function AnularOrdenInsumoModal({
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
  // Lo que la base dijo al rechazar (o el corte de la señal), sobre los botones: el error de toda la hoja (ADR-0358).
  const [rechazo, setRechazo] = useState<{ titulo: string; texto: string; tono: "error" | "atencion"; recargar?: boolean } | null>(null);
  const enVuelo = useRef(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();
  const nombre = numeroOrdenInsumo(orden.numero);

  // Lo que falta = lo que `anular_orden_insumo` rechazaría: el motivo y, desde una terminal, quién lo hace.
  const problema = problemaDeMotivo(motivo);
  const campos: CampoDeGuia[] = [
    { id: "motivo", nombre: "Motivo", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    ...(esPersona
      ? []
      : [{ id: "responsable", nombre: "Quién la anula", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién la anula." }]),
  ];
  const guia = useGuiaCampos(campos);

  async function confirmar() {
    // Dos clics en el mismo instante: el candado se pone en el mismo tick (como en la orden de compra).
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setGuardando(true);
      setRechazo(null);
      const firma = esPersona ? firmaOmitida("orden_insumo_anular") : responsable.firma();
      const { version, error } = await anularOrdenInsumo({ p_id: orden.id, p_version_esperada: orden.version, p_motivo: textoParaBase(motivo) }, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(error);
      if (error || version == null) {
        // Se cortó la señal: pudo anularse. Con el mismo motivo, reintentar no repite nada.
        if (error && esFalloDeRed(error)) {
          setRechazo({ titulo: "Se cortó la conexión", texto: avisoDeCorte("anular"), tono: "atencion" });
          return;
        }
        // Otra persona la editó (o la anuló) mientras se miraba: se recarga para ver qué dice ahora, antes de decidir.
        if (esVersionCambiada(error)) {
          setRechazo({ titulo: "No se anuló", texto: traducirError(error, "anular la orden"), tono: "error", recargar: true });
          return;
        }
        setRechazo({ titulo: "No se anuló", texto: traducirError(error, "anular la orden"), tono: "error" });
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
    <Modal titulo={`Anular ${nombre}`} subtitulo={`${orden.proveedor} · ${soles(orden.total)}`} onClose={onClose} variante="hoja" alCerrarEnfocar={volverA}>
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
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué se anula">
            <CampoTexto
              etiqueta="Por qué se anula"
              caja
              autoFocus
              maxLength={MAX_MOTIVO_ANULACION}
              value={motivo}
              onChange={(e) => {
                setRechazo(null);
                setMotivo(e.target.value);
              }}
            />
            <p className="mt-1.5 text-xs text-taupe">Lo verá quien revise la orden después.</p>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién la anula">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {rechazo && (
            <Aviso
              tono={rechazo.tono}
              titulo={rechazo.titulo}
              accion={
                rechazo.recargar ? (
                  <Boton
                    type="button"
                    onClick={() => {
                      onClose();
                      router.refresh();
                    }}
                  >
                    Recargar
                  </Boton>
                ) : undefined
              }
            >
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para anular." />
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton textoCargando="Anulando…" type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Anular orden
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
