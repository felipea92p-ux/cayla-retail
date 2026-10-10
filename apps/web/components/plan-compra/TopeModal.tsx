"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDelTope } from "@/lib/plan-compra-guia";
import { RPC_GUARDAR_TOPE, argsGuardarTope, solesES } from "@/lib/plan-compra-reglas";

// El tope de inversión de una campaña (ADR-0372, B2): cuánto se decidió invertir, al costo. La pantalla lo compara con lo que suman las
// categorías con plan y AVISA si te pasas; nunca bloquea un plan. Solo un líder lo fija (la base lo exige también). Guía de foco
// (ADR-0284): `camposDelTope` sale de la misma regla (`problemaDelTope`) que la base. «Quitar el tope» deja la campaña sin tope.

export function TopeModal({ planId, planNombre, topeActual, onClose }: { planId: string; planNombre: string; topeActual: number | null; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [texto, setTexto] = useState(topeActual === null ? "" : String(topeActual));
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale (chaos 2026-10-10).
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDelTope(texto, { listo: responsable.listo, motivo: responsable.motivo }));

  async function guardar(valor: string | null, cerrar: () => void) {
    if (enviando.current) return;
    if (valor !== null && !guia.puedeConfirmar) return;
    if (valor === null && !responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setTrabajando(true);
    const { error } = await firmar(createClient().rpc(RPC_GUARDAR_TOPE as never, argsGuardarTope(planId, valor) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    // Fijar el tope es idempotente: si la respuesta se perdió, volver a guardarlo deja lo mismo.
    if (error && esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas el tope: no sabemos si llegó. Vuelve a pulsar el botón; si ya se había guardado, queda igual.");
    if (error) return void avisar.error(traducirError(error, "guardar el tope"));
    const nuevo = valor === null ? null : argsGuardarTope(planId, valor).p_tope;
    avisar.exito(nuevo === null ? "Tope quitado" : "Tope guardado", { detalle: nuevo === null ? planNombre : `${solesES(nuevo)} · ${planNombre}` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo="Tope de inversión" subtitulo={`Cuánto invertir al costo en ${planNombre}. Te avisamos si el plan se pasa; nunca te impide guardarlo.`} onClose={onClose} variante="hoja" ancho="max-w-md">
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(texto, cerrar);
          }}
          className="space-y-5"
        >
          <CampoGuiado id="tope" guia={guia} titulo="Tope" ayuda="En soles, al costo">
            <CampoMonto etiqueta="" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value.replace(/[^\d.,\s]/g, ""))} />
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo="Todo listo para guardar." />
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {topeActual !== null && (
                <Boton type="button" peso="peligro" disabled={trabajando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => void guardar(null, cerrar)} className="mr-auto">
                  Quitar el tope
                </Boton>
              )}
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                Guardar tope
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
