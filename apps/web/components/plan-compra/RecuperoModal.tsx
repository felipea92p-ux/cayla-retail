"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDelRecupero } from "@/lib/plan-compra-guia";
import { RPC_GUARDAR_RECUPERO, argsGuardarRecupero } from "@/lib/plan-compra-propuesta";

// «Lo que sobra» de CAYLA para una campaña (ADR-0372, C5 · Felipe 2026-10-12): a qué % del precio se vende en la liquidación lo que queda sin
// vender. Es el punto de partida de cada categoría nueva del plan; cada una puede cambiarlo (un jean se recupera mejor que un polo de temporada).
// Lo fija quien tiene el módulo Plan de campaña (la base lo exige también; ADR-0387: ya no solo un líder). No cambia las categorías ya guardadas: esas tienen el suyo.

export function RecuperoModal({ planId, planNombre, actual, heredado, onClose }: { planId: string; planNombre: string; actual: number | null; heredado: boolean; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [texto, setTexto] = useState(actual === null ? "" : String(actual));
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale.
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDelRecupero(texto, { listo: responsable.listo, motivo: responsable.motivo }));

  async function guardar(valor: string | null, cerrar: () => void) {
    if (enviando.current) return;
    if (valor !== null && !guia.puedeConfirmar) return;
    if (valor === null && !responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setTrabajando(true);
    const { error } = await firmar(createClient().rpc(RPC_GUARDAR_RECUPERO as never, argsGuardarRecupero(planId, valor) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    // Fijar el % es idempotente: si la respuesta se perdió, volver a guardarlo deja lo mismo.
    if (error && esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas el %: no sabemos si llegó. Vuelve a pulsar el botón; si ya se había guardado, queda igual.");
    if (error) return void avisar.error(traducirError(error, "guardar lo que sobra"));
    avisar.exito(valor === null ? "Lo que sobra, sin % de CAYLA" : "Lo que sobra guardado", { detalle: valor === null ? planNombre : `${valor.trim()} % del precio · ${planNombre}` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo="Lo que sobra"
      subtitulo={`A qué % del precio vende CAYLA lo que queda de ${planNombre} en la liquidación. Cada categoría nueva arranca con este %; cada una puede cambiarlo.`}
      onClose={onClose}
      variante="hoja"
      ancho="max-w-md"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(texto, cerrar);
          }}
          className="space-y-5"
        >
          <CampoGuiado id="recupero" guia={guia} titulo="Lo que sobra" ayuda="En % del precio de venta">
            <div className="flex w-36 items-center gap-2">
              <div className="min-w-0 flex-1">
                <CampoTexto etiqueta="Lo que sobra, en % del precio" caja inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value.replace(/\D/g, "").slice(0, 3))} />
              </div>
              <span aria-hidden className="pb-4 text-sm text-tinta/70">
                %
              </span>
            </div>
          </CampoGuiado>
          {heredado && actual !== null && <p className="nota-cayla">Hoy esta campaña usa el {actual} % de la campaña anterior. Guárdalo para fijarlo en esta.</p>}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo="Todo listo para guardar." />
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {actual !== null && !heredado && (
                <Boton type="button" peso="peligro" disabled={trabajando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => void guardar(null, cerrar)} className="mr-auto">
                  Quitar el %
                </Boton>
              )}
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                Guardar
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
