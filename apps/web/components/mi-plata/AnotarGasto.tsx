"use client";

import { AccionDelDia } from "./AccionDelDia";
import { ICONO_GASTO } from "./iconos";
import { TarjetaFoto } from "./TarjetaFoto";
import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { leerMontoPlata } from "@/lib/monto-plata-reglas";
import { soles } from "@/lib/compras-reglas";
import { registrarGastoRapido, subirFotoGasto } from "@/lib/mi-plata-acciones";
import { CONCEPTOS_GASTO, camposGasto, fraseGasto, type ConceptoGasto } from "@/lib/mi-plata-reglas";

// Compras simple (ADR-0480, actividad 5): «Gasté en otra cosa». La compradora anota lo que pagó con su plata de compras y no es ropa (taxi,
// cargador, comida, la encomienda, bolsas u otra cosa), cuánto y, si le dieron un papel, su foto. Como una compra: en su celular baja al
// instante y Compras lo revisa (los libros lo mueven recién ahí). Hecha para el celular.
//
// Solo se abre con la cuenta de una persona (la pantalla no la muestra desde una terminal): firma ella, sin combo. El identificador nace al
// abrir la hoja: si la conexión se corta y vuelve a tocar, la base devuelve lo que ya quedó en vez de anotarlo dos veces. La foto se sube
// antes y su ruta se guarda, por lo mismo.

export function AnotarGasto() {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLElement | null>(null);
  return (
    <>
      <AccionDelDia
        guia="mi-plata.gaste"
        titulo="Gasté en otra cosa"
        detalle="Taxi, cargador, comida…"
        icono={<Receipt className="h-5 w-5" aria-hidden />}
        onClick={(e) => {
          origen.current = e.currentTarget;
          setAbierta(true);
        }}
      />
      {abierta && <AnotarGastoModal onClose={() => setAbierta(false)} volverA={origen} />}
    </>
  );
}

type Rechazo = { titulo: string; texto: string; tono: "error" | "atencion" };

function AnotarGastoModal({ onClose, volverA }: { onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [concepto, setConcepto] = useState<ConceptoGasto | null>(null);
  const [nota, setNota] = useState("");
  const [monto, setMonto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subida, setSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);

  const guia = useGuiaCampos(camposGasto({ concepto, nota, monto, conFoto: archivo !== null }));
  const montoLeido = leerMontoPlata(monto);

  const limpiar = <T,>(f: (v: T) => void) => (v: T) => {
    setRechazo(null);
    f(v);
  };

  async function confirmar() {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
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
    const { error } = await registrarGastoRapido(
      { p_id: id, p_concepto: concepto!, p_nota: concepto === "otro" ? nota.trim() : null, p_monto: montoLeido ?? 0, p_foto_ruta: ruta },
      firmaOmitida("gasto_rapido"),
    );
    setGuardando(false);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { titulo: "Se cortó la conexión", texto: "No sabemos si se anotó. Vuelve a tocar el botón: si ya se guardó, no se repite.", tono: "atencion" }
          : { titulo: "No se anotó", texto: traducirError(error, "anotar el gasto"), tono: "error" },
      );
    }
    avisar.exito(`Anotaste ${soles(montoLeido ?? 0)}`, { detalle: "Ya bajó de tu plata. Compras lo revisa." });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo="Gasté en otra cosa"
      subtitulo="No es ropa: no se suma al costo de las prendas."
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={guardando}
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
          className="space-y-5"
        >
          <CampoGuiado id="concepto" guia={guia} titulo="¿En qué gastaste?">
            <div role="group" aria-label="¿En qué gastaste?" className="grid grid-cols-3 gap-2" data-guia="mi-plata.concepto">
              {(Object.keys(CONCEPTOS_GASTO) as ConceptoGasto[]).map((k) => {
                const Icono = ICONO_GASTO[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={concepto === k}
                    title={CONCEPTOS_GASTO[k].ejemplo}
                    disabled={guardando}
                    onClick={() => limpiar(setConcepto)(k)}
                    className={`card-cayla mov-boton flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[14px] p-2 text-center text-sm text-tinta ${concepto === k ? "border-tinta bg-sand/40" : ""}`}
                  >
                    <Icono className="h-5 w-5" aria-hidden />
                    {CONCEPTOS_GASTO[k].nombre}
                  </button>
                );
              })}
            </div>
          </CampoGuiado>
          {concepto === "otro" && (
            <CampoGuiado id="nota" guia={guia} titulo="¿Qué fue?">
              <CampoTexto
                etiqueta="¿Qué fue?"
                caja
                autoComplete="off"
                maxLength={120}
                value={nota}
                disabled={guardando}
                onChange={(e) => limpiar(setNota)(e.target.value)}
              />
            </CampoGuiado>
          )}
          <CampoGuiado id="monto" guia={guia} titulo="¿Cuánto fue?">
            <CampoMonto
              etiqueta="¿Cuánto fue?"
              etiquetaOculta
              data-guia="mi-plata.monto-gasto"
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              disabled={guardando}
              onChange={(e) => limpiar(setMonto)(e.target.value)}
            />
          </CampoGuiado>
          <CampoGuiado id="foto" guia={guia} titulo="Foto del papel">
            <TarjetaFoto
              titulo="Foto del papel, si te dieron"
              ayuda="Un taxi o un cargador pueden ir sin papel"
              archivo={archivo}
              deshabilitada={guardando}
              onArchivo={(f) => {
                setRechazo(null);
                setArchivo(f);
              }}
            />
          </CampoGuiado>
          {rechazo && (
            <Aviso tono={rechazo.tono} titulo={rechazo.titulo}>
              {rechazo.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo para anotar." conFrase />
          <div className="pie-hoja-fijo pie-acciones pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              textoCargando={archivo && subida?.archivo !== archivo ? "Subiendo la foto…" : "Anotando…"}
              type="submit"
              peso="primario"
              cargando={guardando}
              disabled={!guia.puedeConfirmar}
              title={guia.frase ?? undefined}
              className={guia.claseConfirmar}
            >
              {fraseGasto(montoLeido)}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
