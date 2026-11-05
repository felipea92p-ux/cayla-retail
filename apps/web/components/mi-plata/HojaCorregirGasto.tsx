"use client";

import { useEffect, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { CamposDelGasto } from "./CamposDelGasto";
import { subirFotoGasto } from "@/lib/mi-plata-acciones";
import { cargarGastoParaCorregir, corregirGasto } from "@/lib/corregir-gasto-acciones";
import {
  argumentosParaCorregir,
  borradorDelGasto,
  cambioDeLaPlata,
  cambiosDelGasto,
  fraseCorregirGasto,
  textoDeLaPlataDelGasto,
  textoMotivoGasto,
  type GastoParaCorregir,
} from "@/lib/corregir-gasto-reglas";
import { camposGasto, type ConceptoGasto } from "@/lib/mi-plata-reglas";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";

// «Corregir este gasto» (ADR-0572, Felipe 2026-10-29): la misma hoja de «Gasté en otra cosa», con lo anotado ya puesto. La compradora cambia lo que
// está mal y, antes de guardar, ve qué cambia y qué pasa con su plata. Guardar manda lo que queda: la base lo valida todo o nada, recalcula
// «Tienes para comprar» y el cuaderno de la ronda, y deja el rastro. Solo mientras Compras no lo revise y la ronda siga abierta (la base lo decide:
// aquí solo se dice por qué no).
//
// Con la cuenta de una persona firma ella (Mis compras no se muestra desde una terminal). El identificador nace al abrir la hoja: un doble clic o un
// reintento tras un corte no corrige dos veces. La foto se sube antes y su ruta se guarda, por lo mismo.

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

export function HojaCorregirGasto({ gastoId, onClose, volverA }: { gastoId: string; onClose: () => void; volverA?: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [lote] = useState(() => crypto.randomUUID());
  // `undefined`: leyendo; `null`: no se pudo leer.
  const [gasto, setGasto] = useState<GastoParaCorregir | null | undefined>(undefined);
  const [errorDeLectura, setErrorDeLectura] = useState<string | null>(null);
  const [concepto, setConcepto] = useState<ConceptoGasto | null>(null);
  const [nota, setNota] = useState("");
  const [monto, setMonto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subida, setSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);

  useEffect(() => {
    let vigente = true;
    void cargarGastoParaCorregir(gastoId).then(({ gasto: g, error }) => {
      if (!vigente) return;
      if (error) setErrorDeLectura(traducirError(error, "leer el gasto", { lectura: true }));
      setGasto(g);
      if (g) {
        const b = borradorDelGasto(g);
        setConcepto(b.concepto);
        setNota(b.nota);
        setMonto(b.monto);
      }
    });
    return () => {
      vigente = false;
    };
  }, [gastoId]);

  const sePuede = gasto?.sePuede === true;
  const guia = useGuiaCampos(camposGasto({ concepto, nota, monto, conFoto: archivo !== null || gasto?.conFoto === true }));
  const borrador = { concepto: concepto ?? gasto?.concepto ?? "otro", nota, monto };
  const cambios = gasto && concepto ? cambiosDelGasto(gasto, borrador, archivo !== null) : [];
  const plata = gasto && concepto ? cambioDeLaPlata(gasto, borrador) : 0;
  // En el celular la hoja se baja con el dedo (ADR-0479): un tirón sin querer, o el gesto «atrás», borraba lo cambiado sin avisar.
  const salida = useSalidaSinGuardar(cambios.length > 0, "Cambiaste datos de este gasto y todavía no se guardaron. Si cierras ahora, se pierden.");
  // Solo se lee (todavía leyendo, sin poder leerlo o ya no se corrige): la × cierra; con campos para guardar, el pie trae «Cancelar».
  const soloLeer = !gasto || !sePuede;

  const limpiar = <T,>(f: (v: T) => void) => (v: T) => {
    setRechazo(null);
    f(v);
  };

  async function guardar() {
    if (!gasto || !concepto || guardando || !sePuede) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    if (cambios.length === 0) return;
    setRechazo(null);
    setGuardando(true);
    let ruta: string | null = null;
    if (archivo) {
      if (subida?.archivo === archivo) ruta = subida.ruta;
      else {
        const r = await subirFotoGasto(archivo);
        if (!r.ruta) {
          setGuardando(false);
          return setRechazo({ titulo: "No se subió la foto", texto: r.motivo ?? "Vuelve a elegirla.", tono: "error" });
        }
        setSubida({ archivo, ruta: r.ruta });
        ruta = r.ruta;
      }
    }
    const { error } = await corregirGasto(argumentosParaCorregir(gasto, borrador, lote, ruta));
    setGuardando(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se guardó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se guardó", texto: traducirError(error, "corregir el gasto"), tono: "error" },
      );
    }
    avisar.exito("Corregiste el gasto", { detalle: textoDeLaPlataDelGasto(plata) });
    // La guardia del «atrás» se retira antes de refrescar: los dos a la vez pueden recargar la página entera (useSalidaSinGuardar).
    void salida.retirarYa().then(() => router.refresh());
    onClose();
  }

  return (
    <Modal
      titulo="Corregir este gasto"
      subtitulo="Cambia solo lo que está mal. Lo demás se queda como lo anotaste."
      onClose={onClose}
      variante="hoja"
      // En PC la hoja lleva dos columnas, como «Gasté en otra cosa»: el celular y la tablet, la hoja angosta de siempre.
      ancho="max-w-md lg:max-w-3xl" // unificar-fijo: hoja de dos columnas solo desde 1024 px; bajo eso es la hoja angosta de siempre
      conCerrar={soloLeer}
      alCerrarEnfocar={volverA}
      bloqueado={guardando}
      antesDeCerrar={salida.pedirAccion}
    >
      {(cerrar) => (
        <div className="space-y-5">
          {gasto === undefined ? (
            // Mientras llega la lectura: tres cajas quietas (sin movimiento en bucle, ADR-0136).
            <div aria-hidden className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-[14px] bg-hueso" />
              ))}
            </div>
          ) : gasto === null ? (
            <Aviso tono="error" titulo="No se pudo leer el gasto">
              {errorDeLectura ?? "Cierra esta hoja y vuelve a abrirla en un momento; si sigue, avísale a tu líder."}
            </Aviso>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void guardar();
              }}
              className="space-y-5"
            >
              {!sePuede && (
                <Aviso tono="atencion" titulo="Ya no se puede corregir">
                  {textoMotivoGasto(gasto.motivo)}
                </Aviso>
              )}
              <CamposDelGasto
                guia={guia}
                concepto={concepto}
                nota={nota}
                monto={monto}
                archivo={archivo}
                guardando={guardando || !sePuede}
                yaTieneFoto={gasto.conFoto}
                alConcepto={limpiar(setConcepto)}
                alNota={limpiar(setNota)}
                alMonto={limpiar(setMonto)}
                alArchivo={(f) => {
                  setRechazo(null);
                  setArchivo(f);
                }}
              />
              {sePuede && cambios.length > 0 && (
                <div className="rounded-[14px] bg-hueso px-3.5 py-3 text-sm">
                  <ul className="space-y-1">
                    {cambios.map((c) => (
                      <li key={c.campo} className="flex flex-wrap justify-between gap-x-4 tabular-nums">
                        <span className="text-taupe">{c.titulo}</span>
                        <span className="text-tinta">
                          {c.antes} → {c.ahora}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-sand pt-2 font-medium text-tinta">{textoDeLaPlataDelGasto(plata)}</p>
                </div>
              )}
              {rechazo && (
                <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
                  {rechazo.texto}
                </Aviso>
              )}
              {sePuede && (
                <>
                  <PieGuia guia={guia} listo={cambios.length > 0 ? "Todo listo para guardar." : "Cambia lo que está mal para guardar."} conFrase />
                  <div className="pie-hoja-fijo pie-acciones pt-1">
                    <Boton type="button" peso="fantasma" onClick={() => salida.pedirAccion(cerrar)} disabled={guardando}>
                      Cancelar
                    </Boton>
                    <Boton
                      textoCargando={archivo && subida?.archivo !== archivo ? "Subiendo la foto…" : "Guardando…"}
                      type="submit"
                      peso="primario"
                      cargando={guardando}
                      disabled={!guia.puedeConfirmar || cambios.length === 0}
                      title={guia.frase ?? undefined}
                      className={guia.claseConfirmar}
                    >
                      {fraseCorregirGasto(cambios.length)}
                    </Boton>
                  </div>
                </>
              )}
              {salida.aviso}
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
