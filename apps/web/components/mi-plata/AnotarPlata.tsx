"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Camera, HandCoins } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { FichasMedio } from "@/components/ui/FichasMedio";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { useIntento } from "@/lib/useIntento";
import { huellaDe } from "@/lib/intento-reglas";
import { AvisoIntentoIncierto, avisarCongelado } from "@/components/ui/AvisoIntentoIncierto";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { anotarPlata, subirVoucher } from "@/lib/mi-plata-acciones";
import { MEDIOS_PLATA, camposAnotar, fraseAnotar, type MedioPlata } from "@/lib/mi-plata-reglas";

// Compras simple (ADR-0480, actividad 2): «Me dieron plata». La compradora anota cómo le llegó (transferencia, Yape o Plin, efectivo),
// cuánto y, si lo tiene, la foto del voucher; la primera vez también puede anotar la plata que ya tenía. Queda «por confirmar» hasta que
// Compras la mire en «Revisar compras», pero ya la puede usar. Hecha para el celular.
//
// Las tres formas de recibir son las fichas de la hoja de cobro (`FichasMedio`, la pieza de «¿cómo se pagó?»). «Ya tenía» no es una forma
// de pago: es una casilla aparte que solo aparece mientras puede anotarla (la base la rechaza después).
//
// La foto se sube ANTES de anotar y su ruta queda guardada: si la conexión se corta y la persona vuelve a tocar, se manda lo mismo (la
// marca de `useIntento` sigue a lo que se manda: con otra ruta, la base diría `token_reusado`). Quién firma (decisión 39): con la cuenta
// de una persona no hay combo —firma ella—; desde una terminal, el combo «Responsable».

const FICHAS = [
  { clave: "transferencia", etiqueta: "Transferencia", corta: "Transf." },
  { clave: "yape", etiqueta: "Yape o Plin", corta: "Yape" },
  { clave: "efectivo", etiqueta: "Efectivo" },
] as const;
type Ficha = (typeof FICHAS)[number]["clave"];
const DE_FICHA: Record<Ficha, MedioPlata> = { transferencia: "transferencia", yape: "yape_plin", efectivo: "efectivo" };
const A_FICHA: Partial<Record<MedioPlata, Ficha>> = { transferencia: "transferencia", yape_plin: "yape", efectivo: "efectivo" };

export function AnotarPlata({ puedeYaTenia }: { puedeYaTenia: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        data-guia="mi-plata.me-dieron"
        className="card-cayla mov-boton flex w-full items-center gap-4 p-4 text-left"
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand/50 text-tinta">
          <HandCoins className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-serif text-xl leading-tight text-tinta">Me dieron plata</span>
          <span className="block text-sm text-taupe">Te yapearon, te transfirieron o te dieron efectivo para comprar.</span>
        </span>
      </button>
      {abierta && <AnotarPlataModal puedeYaTenia={puedeYaTenia} onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function AnotarPlataModal({ puedeYaTenia, onClose, volverA }: { puedeYaTenia: boolean; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [medio, setMedio] = useState<MedioPlata | null>(null);
  const [monto, setMonto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  // La ruta de la foto ya subida, junto al archivo del que salió: si se elige otra foto, se vuelve a subir.
  const [subida, setSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  const intento = useIntento("anotar_plata_compras");
  const guardando = intento.enviando || subiendo;
  const congelada = intento.incierto;
  const [revisando, setRevisando] = useState(false);
  const esPersona = Boolean(useSedeActiva()?.personaSesionId);
  const responsable = useResponsable();

  const guia = useGuiaCampos(
    camposAnotar({ medio, monto, conFoto: archivo !== null }, puedeYaTenia, { esPersona, listo: responsable.listo, motivo: responsable.motivo }),
  );
  const montoLeido = leerMontoPlata(monto);
  const yaTenia = medio === "ya_tenia";

  const limpiar = <T,>(f: (v: T) => void) => (v: T) => {
    setRechazo(null);
    f(v);
  };

  async function confirmar() {
    if (guardando) return;
    if (!congelada && !guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setRechazo(null);
    let ruta: string | null = null;
    if (archivo) {
      if (subida?.archivo === archivo) {
        ruta = subida.ruta;
      } else {
        setSubiendo(true);
        const r = await subirVoucher(archivo);
        setSubiendo(false);
        if (!r.ruta) return setRechazo({ titulo: "No se subió la foto", texto: r.motivo ?? "Vuelve a elegirla.", tono: "error" });
        setSubida({ archivo, ruta: r.ruta });
        ruta = r.ruta;
      }
    }
    const firma = esPersona ? firmaOmitida("plata_anotar") : responsable.firma();
    const args = { p_medio: medio!, p_monto: montoLeido ?? 0, p_foto_ruta: ruta };
    const r = await intento.enviar(huellaDe(args), (token, senal) => anotarPlata(args, firma, token, senal));
    if (r.tipo === "ocupado") return;
    if (r.tipo === "congelado") return avisarCongelado(avisar);
    if (!esPersona) responsable.despues(r.tipo === "error" || r.tipo === "incierto" ? r.error : null);
    if (r.tipo === "incierto") return;
    if (r.tipo === "error") {
      return setRechazo(
        esFalloDeRed(r.error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se anotó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se anotó", texto: traducirError(r.error, "anotar la plata"), tono: "error" },
      );
    }
    anotada();
  }

  // Lo que se anuncia es lo que se mandó: con la hoja congelada mientras estuvo en duda, es lo mismo que guardó la base.
  function anotada() {
    avisar.exito(`Anotaste ${soles(montoLeido ?? 0)}`, { detalle: "Ya está en tu plata y la puedes usar. Compras la revisa." });
    onClose();
    router.refresh();
  }

  async function revisar() {
    setRevisando(true);
    const res = await intento.revisar();
    setRevisando(false);
    if (res.tipo === "hecho") return anotada();
    if (res.tipo === "no_llego") return avisar.aviso("La plata no se anotó", { detalle: "No quedó nada guardado: revisa los datos y vuelve a anotarla." });
    avisar.error("Todavía no hay respuesta", { detalle: "Revisa el internet y vuelve a tocar «Revisar si se guardó»." });
  }

  return (
    <Modal
      titulo="Me dieron plata"
      subtitulo="Anótala aquí: la puedes usar de una vez, y Compras la revisa."
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={guardando || congelada}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <fieldset disabled={congelada} className="campos-congelables min-w-0 space-y-5">
            <CampoGuiado id="medio" guia={guia} titulo="¿Cómo te llegó?">
              {!yaTenia && (
                <FichasMedio<Ficha>
                  etiqueta="¿Cómo te llegó?"
                  opciones={FICHAS}
                  valor={medio ? (A_FICHA[medio] ?? null) : null}
                  onValor={(f) => limpiar(setMedio)(DE_FICHA[f])}
                  guia={(f) => (f === "yape" ? "mi-plata.medio" : undefined)}
                  deshabilitado={guardando}
                />
              )}
              {puedeYaTenia && (
                // La casilla solo dibuja el cuadrito: el texto va al lado, y tocarlo también la marca.
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-tinta" data-guia="mi-plata.ya-tenia">
                  <Casilla
                    marcada={yaTenia}
                    onCambio={() => limpiar(setMedio)(yaTenia ? null : "ya_tenia")}
                    etiqueta={`${MEDIOS_PLATA.ya_tenia.nombre} de antes`}
                    disabled={guardando}
                  />
                  <span>
                    {MEDIOS_PLATA.ya_tenia.nombre} de antes
                    <span className="block text-xs text-taupe">{MEDIOS_PLATA.ya_tenia.ejemplo}. Solo esta primera vez.</span>
                  </span>
                </label>
              )}
            </CampoGuiado>
            <CampoGuiado id="monto" guia={guia} titulo={yaTenia ? "¿Cuánto tenías?" : "¿Cuánto te dieron?"}>
              <CampoMonto
                etiqueta={yaTenia ? "¿Cuánto tenías?" : "¿Cuánto te dieron?"}
                etiquetaOculta
                data-guia="mi-plata.monto"
                inputMode="decimal"
                autoComplete="off"
                value={monto}
                disabled={guardando}
                onChange={(e) => limpiar(setMonto)(e.target.value)}
              />
            </CampoGuiado>
            {!yaTenia && (
              <CampoGuiado id="foto" guia={guia} titulo="Foto del voucher">
                <label
                  data-guia="mi-plata.foto"
                  className={`btn-cayla btn-secundario mov-boton w-full cursor-pointer justify-center ${guardando ? "pointer-events-none opacity-60" : ""}`}
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  {archivo ? "Cambiar la foto" : "Tomar o elegir la foto"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      setRechazo(null);
                      setArchivo(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="mt-1.5 text-xs text-taupe">{archivo ? `Lista: ${archivo.name}` : "Si no la tienes, igual puedes anotar la plata."}</p>
              </CampoGuiado>
            )}
            {!esPersona && (
              <CampoGuiado id="responsable" guia={guia} titulo="Quién anota">
                <ComboResponsable control={responsable} deshabilitado={guardando} />
              </CampoGuiado>
            )}
          </fieldset>
          {congelada ? (
            <AvisoIntentoIncierto onRevisar={() => void revisar()} revisando={revisando} />
          ) : (
            rechazo && (
              <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                {rechazo.texto}
              </Aviso>
            )
          )}
          <PieGuia guia={guia} listo="Todo listo para anotar." conFrase />
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando || congelada}>
              Cancelar
            </Boton>
            <Boton
              textoCargando={subiendo ? "Subiendo la foto…" : "Anotando…"}
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!congelada && !guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              {congelada ? "Volver a intentar" : fraseAnotar(montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
