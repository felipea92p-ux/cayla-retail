"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { Aviso } from "@/components/ui/Aviso";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { AVISO_DE_CORTE_ANULAR_ENVIO, TOPES_ENVIO, problemaDeMotivoEnvio, sePuedeAnularEnvio } from "@/lib/envio-orden-reglas";
import { ESTADO_ENVIO, numeroOrdenCompra, tieneEnvioVivo, type DetalleOrden, type EnvioDeOrden } from "@/lib/ordenes-compra-reglas";
import { textoParaBase } from "@/lib/orden-compra-alta";
import { anularEnvioDeOrden, leerVersionActualDelEnvio } from "@/lib/ordenes-compra-acciones";
import { TituloGrupo } from "@/components/ui/TituloSeccion";

// Los envíos de una orden (ADR-0362, fase 3): la lista que se ve en la orden abierta, del más reciente al más antiguo, con su estado
// (En camino, Abierto, Cerrado, Anulado) y «Anular envío» en los que siguen en camino. Una guía lleva lo de la orden a UNA sede; la sede
// la abre y la cierra al recibirla (fase 4) y desde entonces ya no se anula aquí. La orden no se edita ni se anula mientras tenga un
// envío vivo; la nota de abajo lo explica para que nadie busque un botón que no está.
//
// Anular es irreversible: la hoja pide el motivo y, desde una terminal, quién lo hace, con su guía de foco, y dice qué pasa antes de
// confirmar. Con la cuenta de una persona firma ella (`orden_compra_envio`, la misma clave que enviar, decisión 39). Corre dentro de la
// ventana de la orden (una hoja encima de otra), igual que «Anular comprobante».

const PLANTILLA = "@min-[44rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_4.5rem_6.5rem_7rem]";
const EN_COLUMNAS = "hidden @min-[44rem]:block";
const CIFRA = `${EN_COLUMNAS} min-w-0 whitespace-nowrap text-right tabular-nums`;

const unidadesTexto = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;
const salio = (e: EnvioDeOrden): string | null => {
  if (!e.despachadoEn) return null;
  const { dia, hora } = diaYHoraLima(e.despachadoEn);
  return `${dia} ${hora}`;
};

export function EnviosDeOrden({ orden }: { orden: DetalleOrden }) {
  const [anulando, setAnulando] = useState<EnvioDeOrden | null>(null);
  // El botón que abrió la hoja: al cerrarla, el foco vuelve a él (la hoja no tiene «disparador» de Radix).
  const origen = useRef<HTMLElement | null>(null);
  const envios = orden.envios ?? [];
  if (envios.length === 0) return null;

  return (
    <section aria-label="Envíos de la orden" data-guia="orden.envios" className="space-y-2">
      <TituloGrupo nota="lo que ya salió hacia las sedes">Envíos</TituloGrupo>
      <Tabla>
        <div className="hidden @min-[44rem]:block">
          <Encabezado
            plantilla={PLANTILLA}
            columnas={[
              { titulo: "Envío" },
              { titulo: "Va a" },
              { titulo: "Guía" },
              { titulo: "Salió", alinear: "der" },
              { titulo: "Unidades", alinear: "der" },
              { titulo: "Estado" },
              { titulo: "" },
            ]}
          />
        </div>
        {envios.map((e) => {
          const estado = ESTADO_ENVIO[e.estado];
          const cuando = salio(e);
          return (
            <div key={e.id} className={fila(PLANTILLA)}>
              <span className={celda("izq", "font-medium tabular-nums text-tinta")}>{e.numero}</span>
              <span className={celda("izq", "whitespace-normal text-sm text-tinta")}>
                {e.sede}
                {/* Sin columnas: lo demás en un renglón, con su contexto. */}
                <span className="mt-0.5 block text-xs tabular-nums text-taupe @min-[44rem]:hidden">
                  {[e.numeroGuia ? `guía ${e.numeroGuia}` : null, cuando, unidadesTexto(e.unidades)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={`${EN_COLUMNAS} min-w-0 truncate text-sm tabular-nums text-tinta/80`}>{e.numeroGuia ?? "—"}</span>
              <span className={`${CIFRA} text-tinta/80`}>{cuando ?? "—"}</span>
              <span className={`${CIFRA} text-tinta`}>{e.unidades.toLocaleString("es-PE")}</span>
              <span className="min-w-0">
                <Chip tono={estado.tono}>{estado.texto}</Chip>
              </span>
              <span className="min-w-0 @min-[44rem]:text-right">
                {sePuedeAnularEnvio(e) && (
                  <Boton
                    peso="peligro"
                    className="px-3 py-1.5 text-[11px]"
                    data-guia="orden.anular-envio"
                    onClick={(ev) => {
                      origen.current = ev.currentTarget;
                      setAnulando(e);
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Ban aria-hidden className="h-3 w-3" /> Anular envío
                    </span>
                  </Boton>
                )}
              </span>
            </div>
          );
        })}
      </Tabla>
      {orden.estado === "generada" && (
        <p className="nota-cayla">
          {tieneEnvioVivo(orden)
            ? "Mientras la orden tenga un envío vigente, no se edita ni se anula. Si salió mal, anula el envío (solo mientras va en camino) y vuelve a enviar."
            : "Como esta orden ya tuvo un envío, no se edita."}
        </p>
      )}
      {anulando && <AnularEnvioModal envio={anulando} orden={numeroOrdenCompra(orden.numero)} onClose={() => setAnulando(null)} volverA={origen} />}
    </section>
  );
}

function AnularEnvioModal({
  envio,
  orden,
  onClose,
  volverA,
}: {
  envio: EnvioDeOrden;
  orden: string;
  onClose: () => void;
  volverA: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; recargar: boolean } | null>(null);
  const enVuelo = useRef(false);
  // La base anota quién anuló: con la cuenta de una persona, ella; desde una terminal, el responsable del combo.
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  // Lo que falta = lo que `anular_envio` rechazaría: el motivo y, desde una terminal, quién lo hace.
  const problema = problemaDeMotivoEnvio(motivo);
  const campos: CampoDeGuia[] = [
    { id: "motivo", nombre: "Motivo", requerido: true, hecho: problema === null, pendiente: problema ?? "" },
    ...(esPersona
      ? []
      : [{ id: "responsable", nombre: "Quién lo anula", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo anula." }]),
  ];
  const guia = useGuiaCampos(campos);

  async function confirmar() {
    // Dos clics en el mismo instante: el candado se pone en el mismo tick (ver `enviar` en EnviarOrdenASede).
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
      // La versión que se vio: la orden la trae; si no, se lee del envío mismo. Con ella la base rechaza anular si la sede ya lo abrió.
      const version = envio.version ?? (await leerVersionActualDelEnvio(envio.id));
      if (version == null) {
        setGuardando(false);
        setError({ texto: "No pudimos leer el envío. Recarga la orden y vuelve a intentarlo.", recargar: true });
        return;
      }
      const firma = esPersona ? firmaOmitida("orden_compra_envio") : responsable.firma();
      const { error: falla } = await anularEnvioDeOrden({ p_despacho_id: envio.id, p_version: version, p_motivo: textoParaBase(motivo) }, firma);
      setGuardando(false);
      if (!esPersona) responsable.despues(falla);
      if (falla) {
        // Se cortó la señal: pudo anularse. Con el mismo motivo, reintentar no repite nada (anular algo ya anulado no hace nada).
        if (esFalloDeRed(falla)) setError({ texto: AVISO_DE_CORTE_ANULAR_ENVIO, recargar: false });
        // La sede lo abrió mientras se miraba (o alguien más lo cambió): se recarga para ver qué dice ahora, antes de decidir.
        else setError({ texto: traducirError(falla, "anular el envío"), recargar: esVersionCambiada(falla) });
        return;
      }
      avisar.exito(`${envio.numero} anulado`, { detalle: `Lo que llevaba vuelve a quedar por enviar en ${orden}. Su número no vuelve a usarse.` });
      onClose();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Anular ${envio.numero}`}
      subtitulo={`${envio.sede} · ${unidadesTexto(envio.unidades)} · ${orden}`}
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
            El envío queda anulado y lo que llevaba vuelve a quedar por enviar en la orden. No se borra: queda a la vista, anulado y con su
            motivo. <b className="font-medium text-tinta">Esto no se puede deshacer.</b>
          </p>
          {/* El título va en el bloque (`titulo`, con su marca de la guía): la caja hundida deja su etiqueta solo para el lector. */}
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué se anula">
            <CampoTexto etiqueta="Por qué se anula" caja autoFocus maxLength={TOPES_ENVIO.motivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <p className="mt-1.5 text-xs text-taupe">Lo verá quien revise la orden después.</p>
          </CampoGuiado>
          {!esPersona && (
            <CampoGuiado id="responsable" guia={guia} titulo="Quién lo anula">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          <PieGuia guia={guia} listo="Todo listo para anular." />
          {error && (
            <Aviso
              tono="error"
              titulo="No se pudo anular el envío"
              accion={
                error.recargar ? (
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
              {error.texto}
            </Aviso>
          )}
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="peligro" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {guardando ? "Anulando…" : "Anular envío"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
