"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { MAX_NOTA_DE_VERSION } from "@/lib/plan-compra-versiones";

// La hoja de una versión del plan (ADR-0523): «Guardar una versión», «Usar el plan con tope» y «Volver a esta versión» son tres caminos a la misma pregunta —«¿qué cambiaste?»,
// opcional— y a la misma respuesta de la base (una versión nueva). Esta hoja es de los tres: cada uno le pasa su título, su llamada y lo que dice al terminar. Nada se compra:
// solo cambia el plan. Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale; y si la base ya lo tenía (el plan no cambió), lo dice con sus palabras.

/** Lo que cambia entre los tres caminos. */
export type AccionDeVersion = {
  titulo: string;
  subtitulo: string;
  textoBoton: string;
  /** El texto con que arranca la nota; la persona lo cambia o lo borra. */
  notaInicial: string;
  /** La función de la base que se llama. */
  rpc: string;
  /** Los argumentos de esa llamada con la nota ya escrita. */
  args: (nota: string) => Record<string, unknown>;
  /** Lo que dice el aviso al terminar («Versión guardada»). */
  exito: string;
  /** «guardar la versión»: lo que se intentaba, para el aviso de error. */
  intento: string;
  /** Una línea bajo la nota: lo que pasa y lo que NO pasa («Nada se compra…»). */
  aclaracion: string;
};

export function NotaDeVersionModal({ accion, planNombre, onClose }: { accion: AccionDeVersion; planNombre: string; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nota, setNota] = useState(accion.notaInicial);
  const [trabajando, setTrabajando] = useState(false);
  const enviando = useRef(false);

  async function guardar(cerrar: () => void) {
    if (enviando.current || !responsable.listo) return;
    enviando.current = true;
    setTrabajando(true);
    const { error } = await firmar(createClient().rpc(accion.rpc as never, accion.args(nota.trim()) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    // Una versión no es idempotente: si la respuesta se perdió, no sabemos si llegó. Volver a pulsar es seguro: la base se niega a guardar dos veces el mismo plan.
    if (error && esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas: no sabemos si llegó. Vuelve a pulsar el botón; si ya se había guardado, te lo dirá y no se repite.");
    if (error) return void avisar.error(traducirError(error, accion.intento));
    avisar.exito(accion.exito, { detalle: planNombre });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={accion.titulo} subtitulo={accion.subtitulo} onClose={onClose} variante="hoja">
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(cerrar);
          }}
          className="space-y-5"
        >
          <CampoTexto etiqueta="¿Qué cambiaste? (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={MAX_NOTA_DE_VERSION} autoFocus />
          <p className="text-[13px] text-tinta-60">{accion.aclaracion}</p>
          <ComboResponsable control={responsable} deshabilitado={trabajando} />
          <div className="pie-hoja-fijo">
            <div className="pie-acciones pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
                {accion.textoBoton}
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
