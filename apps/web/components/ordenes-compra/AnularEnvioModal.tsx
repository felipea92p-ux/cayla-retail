"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Aviso, AvisoNoSeDeshace } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, esVersionCambiada, traducirError } from "@/lib/error-escritura";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { AVISO_DE_CORTE_ANULAR_ENVIO, TOPES_ENVIO, problemaDeMotivoEnvio } from "@/lib/envio-orden-reglas";
import { textoParaBase } from "@/lib/orden-compra-alta";
import { anularEnvioDeOrden, leerVersionActualDelEnvio } from "@/lib/ordenes-compra-acciones";

/** Lo que la hoja necesita del envío: lo mismo lo trae una orden (`EnvioDeOrden`) que «Mis envíos» (`EnvioMio`). */
export type EnvioPorAnular = {
  id: string;
  numero: string;
  sede: string;
  unidades: number;
  /** La versión que vio la pantalla; `null` = se lee del envío antes de anular (Mis envíos no la trae). */
  version: number | null;
};

const unidadesTexto = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "unidad" : "unidades"}`;

// «Anular envío» (ADR-0362, fase 3): la hoja que pide el motivo y, desde una terminal, quién lo hace, con su guía de foco. Nació dentro de
// `EnviosDeOrden` (el detalle de la orden); desde el 2026-11-13 la usa también la hoja de un envío en «Mis compras ▸ Mis envíos» (Felipe:
// «que se pueda mientras Recibir todavía dice "En camino"; si ya no, ya no»). La regla es UNA y es de la base: `anular_envio` solo anula un
// envío en camino y lo rechaza apenas la sede lo abre. Con la cuenta de una persona firma ella (`orden_compra_envio`, la misma clave que
// enviar, decisión 39). `contexto` dice de dónde viene (la orden o la ronda) y `queVuelve`, adónde vuelve lo que llevaba.
export function AnularEnvioModal({
  envio,
  contexto,
  queVuelve,
  onClose,
  alAnular,
  volverA,
}: {
  envio: EnvioPorAnular;
  /** El subtítulo después de la sede y las unidades: «OC-000012» o «Ronda RC-000003». */
  contexto: string;
  /** Adónde vuelve lo que llevaba, en una frase: «vuelve a quedar por enviar en OC-000012». */
  queVuelve: string;
  onClose: () => void;
  /** Después de anular (además de `onClose`): quien la abrió desde otra hoja la cierra también, para no seguir mostrando «En camino». */
  alAnular?: () => void;
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
        setError({ texto: "No pudimos leer el envío. Recarga la pantalla y vuelve a intentarlo.", recargar: true });
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
      avisar.exito(`${envio.numero} anulado`, { detalle: `Lo que llevaba ${queVuelve}. Su número no vuelve a usarse.` });
      onClose();
      alAnular?.();
      router.refresh();
    } finally {
      enVuelo.current = false;
    }
  }

  return (
    <Modal
      titulo={`Anular ${envio.numero}`}
      subtitulo={`${envio.sede} · ${unidadesTexto(envio.unidades)} · ${contexto}`}
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
            Lo que llevaba {queVuelve}. El envío sigue a la vista, anulado y con su motivo.
          </p>
          {/* El título va en el bloque (`titulo`, con su marca de la guía): la caja hundida deja su etiqueta solo para el lector. */}
          <CampoGuiado id="motivo" guia={guia} titulo="Por qué se anula">
            <CampoTexto etiqueta="Por qué se anula" caja autoFocus maxLength={TOPES_ENVIO.motivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <p className="mt-1.5 text-sm text-taupe">Lo verá quien revise la compra después.</p>
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
          <AvisoNoSeDeshace />
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton textoCargando="Anulando…" type="submit" peso="primario" cargando={guardando} confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Anular envío
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
