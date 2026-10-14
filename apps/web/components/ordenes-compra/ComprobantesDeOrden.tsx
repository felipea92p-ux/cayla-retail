"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { ETIQUETA_ESTADO_PAGO, ETIQUETA_TIPO_DOCUMENTO, TONO_ESTADO_PAGO, fechaCorta, soles, type EstadoPago, type TipoDocumentoCompra } from "@/lib/compras-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { MAX_MOTIVO_COMPROBANTE, problemaDeMotivoComprobante, sePuedeAnularComprobante } from "@/lib/comprobante-orden-reglas";
import { numeroOrdenCompra, tieneComprobanteVigente, type ComprobanteDeOrden, type DetalleOrden } from "@/lib/ordenes-compra-reglas";
import { textoParaBase } from "@/lib/orden-compra-alta";
import { anularComprobanteDeOrden } from "@/lib/ordenes-compra-acciones";
import { TituloGrupo } from "@/components/ui/TituloSeccion";

// Los comprobantes de una orden (ADR-0362, fase 2 · actividad 8): la lista que se ve en la orden abierta, del más reciente al más antiguo,
// con «Anular» en los que se pueden anular. Anular un comprobante es anular la compra (`anular_compra`, la misma función de Facturas de
// proveedor): la base no deja anular uno con pagos, con mercadería recibida, con notas de crédito o con líneas cerradas, y lo dice. La
// orden no se edita mientras tenga un comprobante y no se anula mientras tenga uno vigente; la nota de abajo lo explica para que nadie
// busque un botón que no está.
//
// Anular es irreversible: la hoja pide el motivo y, desde una terminal, quién lo hace, con su guía de foco, y dice qué pasa antes de
// confirmar. Con la cuenta de una persona firma ella (`orden_compra_comprobante`, la misma clave que registrar el comprobante, decisión 39).
// Corre dentro de la ventana de la orden (una hoja encima de otra), igual que «Anular orden».

const PLANTILLA = "@min-[40rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_5.5rem_6.5rem_6.5rem_7rem_6rem]";
const EN_COLUMNAS = "hidden @min-[40rem]:block";
const CIFRA = `${EN_COLUMNAS} min-w-0 whitespace-nowrap text-right tabular-nums`;

const CONDICION: Record<string, string> = { credito: "Crédito", contado: "Contado" };

/** El estado de un comprobante como un chip: anulado, o su estado de pago (Por pagar, Pago parcial, Pagada). */
function estadoDe(c: ComprobanteDeOrden): { texto: string; tono: TonoChip } {
  if (c.estado === "anulada") return { texto: "Anulado", tono: "apagado" };
  const pago = c.estadoPago as EstadoPago | null;
  if (pago && pago in ETIQUETA_ESTADO_PAGO) return { texto: ETIQUETA_ESTADO_PAGO[pago], tono: TONO_ESTADO_PAGO[pago] };
  return { texto: "Vigente", tono: "neutro" };
}

export function ComprobantesDeOrden({ orden }: { orden: DetalleOrden }) {
  const [anulando, setAnulando] = useState<ComprobanteDeOrden | null>(null);
  // El botón que abrió la hoja: al cerrarla, el foco vuelve a él (la hoja no tiene «disparador» de Radix).
  const origen = useRef<HTMLElement | null>(null);
  if (orden.comprobantes.length === 0) return null;

  return (
    <section aria-label="Comprobantes de la orden" data-guia="orden.comprobantes" className="space-y-2">
      <TituloGrupo nota="el papel que ya llegó">Comprobantes</TituloGrupo>
      <Tabla>
        <div className="hidden @min-[40rem]:block">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Documento" },
              { titulo: "Tipo" },
              { titulo: "Emisión", alinear: "der" },
              { titulo: "Total", alinear: "der" },
              { titulo: "Por pagar", alinear: "der" },
              { titulo: "Estado" },
              { titulo: "" },
            ]}
          />
        </div>
        {orden.comprobantes.map((c) => {
          const estado = estadoDe(c);
          const vigente = c.estado === "vigente";
          return (
            <div key={c.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "font-medium tabular-nums text-tinta")}>{c.documento}</span>
              <span className={celda("izq", "whitespace-normal text-sm text-tinta/80")}>
                {ETIQUETA_TIPO_DOCUMENTO[c.tipo as TipoDocumentoCompra] ?? c.tipo}
                {CONDICION[c.condicion] ? ` · ${CONDICION[c.condicion]}` : ""}
                {/* Sin columnas: lo demás en un renglón, con su contexto. */}
                <span className="mt-0.5 block text-xs tabular-nums text-taupe @min-[40rem]:hidden">
                  {c.fechaEmision ? `${fechaCorta(c.fechaEmision)} · ` : ""}
                  {soles(c.total)}
                  {vigente && c.saldo > 0 ? ` · por pagar ${soles(c.saldo)}` : ""}
                </span>
              </span>
              <span className={`${CIFRA} text-tinta/80`}>{c.fechaEmision ? fechaCorta(c.fechaEmision) : "—"}</span>
              <span className={`${CIFRA} text-tinta`}>{soles(c.total)}</span>
              <span className={`${CIFRA} text-tinta/80`}>{vigente ? soles(c.saldo) : "—"}</span>
              <span className="min-w-0">
                <Chip tono={estado.tono}>{estado.texto}</Chip>
              </span>
              <span className="min-w-0 @min-[40rem]:text-right">
                {sePuedeAnularComprobante(c) ? (
                  <Boton
                    peso="peligro"
                    className="px-3 py-1.5 text-[11px]"
                    data-guia="orden.anular-comprobante"
                    onClick={(e) => {
                      origen.current = e.currentTarget;
                      setAnulando(c);
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Ban aria-hidden className="h-3 w-3" /> Anular
                    </span>
                  </Boton>
                ) : vigente ? (
                  <span className="text-xs text-taupe" title="Un comprobante con pagos no se anula">
                    Con pagos
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </Tabla>
      {orden.estado === "generada" && (
        <p className="nota-cayla">
          {tieneComprobanteVigente(orden)
            ? "Mientras tenga un comprobante vigente, la orden no se edita ni se anula. Si el papel está mal, anula el comprobante y regístralo de nuevo."
            : "Como esta orden ya tuvo comprobante, no se edita. Si hace falta, registra el papel de nuevo."}
        </p>
      )}
      {anulando && (
        <AnularComprobanteModal
          comprobante={anulando}
          orden={numeroOrdenCompra(orden.numero)}
          onClose={() => setAnulando(null)}
          volverA={origen}
        />
      )}
    </section>
  );
}

function AnularComprobanteModal({
  comprobante,
  orden,
  onClose,
  volverA,
}: {
  comprobante: ComprobanteDeOrden;
  orden: string;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);
  // La base anota quién anuló (`compras.anulada_por`): con la cuenta de una persona, ella; desde una terminal, el responsable del combo.
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  // Lo que falta = lo que `anular_compra` rechazaría: el motivo y, desde una terminal, quién lo hace.
  const problema = problemaDeMotivoComprobante(motivo);
  const campos: CampoDeGuia[] = [
    { id: "motivo", nombre: "Motivo", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    ...(esPersona
      ? []
      : [{ id: "responsable", nombre: "Quién lo anula", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo anula." }]),
  ];
  const guia = useGuiaCampos(campos);

  async function confirmar() {
    // Dos clics en el mismo instante: el candado se pone en el mismo tick (ver `registrar` en RegistrarComprobanteOrden).
    if (guardando || enVuelo.current) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    try {
      setError(null);
      setGuardando(true);
      const firma = esPersona ? firmaOmitida("orden_compra_comprobante") : responsable.firma();
      const { error: falla } = await anularComprobanteDeOrden({ p_compra_id: comprobante.id, p_motivo: textoParaBase(motivo) }, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(falla);
      if (falla) {
        // Se cortó la señal: pudo anularse. Con el mismo motivo, reintentar no repite nada (anular algo ya anulado no hace nada).
        setError(
          esFalloDeRed(falla)
            ? "Se cortó la conexión y no sabemos si el comprobante llegó a anularse. Vuelve a pulsar «Anular comprobante» con el mismo motivo: si ya se anuló, no se repite."
            : traducirError(falla, "anular el comprobante"),
        );
        return;
      }
      avisar.exito(`Comprobante ${comprobante.documento} anulado`, { detalle: "Deja de contar en Por pagar. La orden vuelve a tener pendiente lo que traía." });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo="Anular comprobante"
      subtitulo={`${comprobante.documento} · ${orden} · ${soles(comprobante.total)}`}
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
            El comprobante deja de contar en Por pagar y la orden vuelve a tener pendiente lo que traía. No se borra: queda a la vista, anulado y con su motivo.{" "}
            <b className="font-medium text-tinta">Esto no se puede deshacer.</b>
          </p>
          {/* El título va en el bloque (`titulo`, con su marca de la guía): la caja hundida deja su etiqueta solo para el lector. */}
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué se anula">
            <CampoTexto etiqueta="Por qué se anula" caja autoFocus maxLength={MAX_MOTIVO_COMPROBANTE} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <p className="mt-1.5 text-xs text-taupe">Lo verá quien revise la orden después.</p>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién lo anula">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para anular." />
          {error && (
            <Aviso tono="error" titulo="No se pudo anular el comprobante">
              {error}
            </Aviso>
          )}
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Anulando…" : "Anular comprobante"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
