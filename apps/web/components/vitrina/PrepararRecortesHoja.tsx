"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { escucharDescargaModelo } from "@/lib/preparar-foto";
import { guardarRecorte, prepararRecorte } from "@/lib/recorte-probador";
import type { FotoDelProbador, RecorteDeFoto } from "@/lib/recorte-probador-reglas";
import { esErrorDeResponsable } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeRecortes } from "@/lib/vitrina-probador-guia";

type Fase = "antes" | "recortando" | "pausando" | "pausado" | "terminado";
type Fallo = { foto: string; nombre: string; motivo: string };

/** Tantas fotos seguidas que no se pudieron y se pausa sola: casi siempre es la conexión, y seguir solo llenaría la lista de fallas. */
const FALLAS_SEGUIDAS_PARA_PAUSAR = 3;

/**
 * «Preparar recortes» de Vitrina ▸ Probador (ADR-0434, actividad 1): recorta EN ESTE EQUIPO las fotos que todavía no tienen recorte, de lo
 * que más se vende a lo que menos, una por una (el recortador corre en el navegador, ~1 s por foto). Pide quién lo hace una vez (ADR-0162)
 * y firma con eso cada recorte. Se puede pausar: lo hecho queda guardado y se sigue otro día. Mientras recorta, la hoja no se cierra
 * (se pausa con su botón y recién ahí sale la ×): cerrarla a la mitad de una subida dejaría un archivo sin anotar.
 */
export function PrepararRecortesHoja({
  pendientes,
  onRecorte,
  onClose,
}: {
  pendientes: FotoDelProbador[];
  onRecorte: (foto: string, recorte: RecorteDeFoto) => void;
  onClose: () => void;
}) {
  const responsable = useResponsable();
  const guia = useGuiaCampos(camposDeRecortes({ responsableListo: responsable.listo, responsableMotivo: responsable.motivo }));
  // La lista con que se abrió la hoja: lo que se recorta en esta vuelta (la pantalla de atrás se va actualizando sola).
  const [lista] = useState(pendientes);
  const [fase, setFase] = useState<Fase>("antes");
  const [hechas, setHechas] = useState(0);
  const [dudosas, setDudosas] = useState(0);
  const [fallos, setFallos] = useState<Fallo[]>([]);
  const [actual, setActual] = useState<string | null>(null);
  const [descarga, setDescarga] = useState<number | null>(null);
  const pausar = useRef(false);
  const siguiente = useRef(0);
  // Un doble clic en «Empezar» o «Seguir» no arranca dos vueltas a la vez (el estado recién cambia en el próximo dibujo).
  const enCurso = useRef(false);
  const [pausaPorFallas, setPausaPorFallas] = useState(false);

  useEffect(() => {
    const dejar = escucharDescargaModelo((p) => setDescarga(p < 100 ? Math.round(p) : null));
    return () => {
      dejar();
    };
  }, []);

  const total = lista.length;
  const vistas = hechas + fallos.length;
  const corriendo = fase === "recortando" || fase === "pausando";

  async function correr() {
    if (enCurso.current) return;
    const firma = responsable.firma();
    if (!firma && !responsable.listo) return;
    enCurso.current = true;
    try {
      await recortarTodas(firma);
    } finally {
      enCurso.current = false;
    }
  }

  async function recortarTodas(firma: ReturnType<typeof responsable.firma>) {
    const supabase = createClient();
    pausar.current = false;
    setPausaPorFallas(false);
    setFase("recortando");
    let seguidas = 0;
    while (siguiente.current < lista.length) {
      if (pausar.current || seguidas >= FALLAS_SEGUIDAS_PARA_PAUSAR) {
        if (seguidas >= FALLAS_SEGUIDAS_PARA_PAUSAR) setPausaPorFallas(true);
        setFase("pausado");
        setActual(null);
        return;
      }
      const f = lista[siguiente.current];
      setActual(f.nombre);
      try {
        const recorte = await prepararRecorte(f);
        const r = await guardarRecorte(supabase, f, recorte, firma);
        if ("error" in r) {
          if (r.deResponsable && esErrorDeResponsable(r.deResponsable)) {
            // Quien firma ya no puede (salió de turno, perdió el acceso): se para todo y el combo lo dice.
            responsable.despues(r.deResponsable);
            setFase("pausado");
            setActual(null);
            avisar.error(r.error);
            return;
          }
          setFallos((fs) => [...fs, { foto: f.foto, nombre: f.nombre, motivo: r.error }]);
          seguidas++;
        } else {
          seguidas = 0;
          setHechas((n) => n + 1);
          if (r.recorte.estado === "por_revisar") setDudosas((n) => n + 1);
          onRecorte(f.foto, r.recorte);
        }
      } catch (err) {
        setFallos((fs) => [...fs, { foto: f.foto, nombre: f.nombre, motivo: err instanceof Error ? err.message : "No se pudo recortar." }]);
        seguidas++;
      }
      siguiente.current++;
    }
    setActual(null);
    setFase("terminado");
    responsable.despues(null);
  }

  async function empezar(e: React.FormEvent) {
    e.preventDefault();
    if (corriendo || !guia.puedeConfirmar) return;
    await correr();
  }

  const pct = total === 0 ? 100 : (vistas / total) * 100;
  const resumen = `${hechas} ${hechas === 1 ? "recortada" : "recortadas"}${dudosas ? ` (${dudosas} por revisar)` : ""}${fallos.length ? ` · ${fallos.length} no se ${fallos.length === 1 ? "pudo" : "pudieron"}` : ""}`;

  return (
    <Modal
      titulo="Preparar recortes"
      subtitulo={
        total === 1
          ? "Recorta en este equipo la foto que falta. Ninguna foto cambia: el recorte es un archivo aparte."
          : `Recorta en este equipo las ${total} fotos que faltan, de lo que más se vende a lo que menos. Ninguna foto cambia: el recorte es un archivo aparte.`
      }
      onClose={onClose}
      variante="hoja"
      tamano="angosta"
      bloqueado={corriendo}
      conCerrar={fase === "terminado" || fase === "pausado"}
    >
      <form onSubmit={empezar} className="space-y-5">
        {fase === "antes" ? (
          <>
            <p className="rounded-xl border border-sand bg-papel px-3.5 py-2.5 text-[13px] text-tinta">
              Tarda un par de segundos por foto; la primera vez en este equipo, un poco más mientras se prepara el recortador. Deja esta pestaña
              abierta; si la pausas, lo hecho queda guardado y sigues otro día.
            </p>
            <CampoGuiado id="responsable" guia={guia}>
              <div data-guia="recortes.responsable">
                <ComboResponsable control={responsable} />
              </div>
            </CampoGuiado>
          </>
        ) : (
          <div className="space-y-2.5" aria-live="polite">
            <BarraAvance pct={pct} alto="gruesa" etiqueta={`${vistas} de ${total} fotos`} />
            <p className="text-[13px] text-tinta">
              {fase === "terminado"
                ? "Listo."
                : descarga !== null
                  ? `Preparando el recortador… ${descarga} %`
                  : actual
                    ? `Recortando ${Math.min(vistas + 1, total)} de ${total} · ${actual}`
                    : fase === "pausado"
                      ? `Pausado en ${vistas} de ${total}.`
                      : "Empezando…"}
            </p>
            <p className="text-[12.5px] text-taupe">{resumen}</p>
          </div>
        )}

        {fase === "pausado" && pausaPorFallas && (
          <Aviso tono="atencion" titulo="Se pausó sola" chico>
            {`Las últimas ${FALLAS_SEGUIDAS_PARA_PAUSAR} fotos no se pudieron recortar: casi siempre es la conexión. Revísala y toca «Seguir».`}
          </Aviso>
        )}
        {fase === "terminado" && (
          <Aviso tono={fallos.length ? "atencion" : "exito"} titulo={fallos.length ? "Terminó, con fotos que no se pudieron" : "Terminó"} chico>
            {fallos.length
              ? "Las que no se pudieron siguen sin recorte: vuelve a intentarlas, o cambia la foto en Editar producto."
              : dudosas
                ? "Revisa las dudosas antes de que salgan en el probador."
                : "Todas quedaron listas para el probador."}
          </Aviso>
        )}
        {fallos.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[12.5px] text-taupe" aria-label="Fotos que no se pudieron recortar">
            {fallos.map((f) => (
              <li key={f.foto}>
                <span className="font-medium text-tinta">{f.nombre}</span> · {f.motivo}
              </li>
            ))}
          </ul>
        )}

        <div className="pie-hoja-fijo flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          {fase === "antes" && <PieGuia guia={guia} />}
          <div className="ml-auto pie-acciones" data-guia="recortes.empezar">
            {fase === "antes" ? (
              <>
                <Boton type="button" onClick={onClose}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" disabled={!guia.puedeConfirmar || total === 0} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Empezar
                </Boton>
              </>
            ) : corriendo ? (
              <Boton
                type="button"
                cargando={fase === "pausando"}
                textoCargando="Pausando…"
                onClick={() => {
                  pausar.current = true;
                  setFase("pausando");
                }}
              >
                Pausar
              </Boton>
            ) : fase === "pausado" ? (
              <Boton type="button" peso="primario" disabled={!responsable.listo} onClick={() => void correr()}>
                Seguir
              </Boton>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
