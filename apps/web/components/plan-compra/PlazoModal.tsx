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
import { camposDelPlazo } from "@/lib/plan-compra-guia";
import { DIAS_PARA_LLEGAR_DE_FABRICA, RPC_GUARDAR_PLAZO, argsGuardarPlazo, detalleDelNuevoPlazo, plazoDePedido } from "@/lib/plan-compra-plazo";

// Los días que tarda un pedido en llegar a las tiendas, para esta campaña (ADR-0499): con ellos, la fecha límite para pedir. Lo fija quien tiene
// el módulo Plan de campaña (la base lo exige también). Guía de foco (ADR-0284): `camposDelPlazo` sale de la misma regla que la base. Mientras se
// escribe, la hoja dice qué fecha límite resulta; al guardar, el aviso dice lo que cambió (subir el plazo mueve la fecha de TODAS las categorías).
// «Usar el supuesto» quita el número fijado.

export function PlazoModal({
  planId,
  planNombre,
  desde,
  hasta,
  hoy,
  diasActuales,
  onClose,
}: {
  planId: string;
  planNombre: string;
  desde: string;
  hasta: string;
  hoy: string;
  /** El número fijado hoy (null = el supuesto de fábrica). */
  diasActuales: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const [texto, setTexto] = useState(diasActuales === null ? String(DIAS_PARA_LLEGAR_DE_FABRICA) : String(diasActuales));
  const [trabajando, setTrabajando] = useState(false);
  // Un segundo envío mientras el primero viaja (doble clic, Enter repetido) no sale.
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDelPlazo(texto, { listo: responsable.listo, motivo: responsable.motivo }));
  const dias = argsGuardarPlazo(planId, texto).p_dias;
  // La fecha límite que resultaría con lo escrito: la persona la ve ANTES de guardar.
  const resultado = dias !== null ? plazoDePedido(desde, hasta, hoy, dias) : null;

  async function guardar(valor: string | null, cerrar: () => void) {
    if (enviando.current) return;
    if (valor !== null && !guia.puedeConfirmar) return;
    if (valor === null && !responsable.listo) return void avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    enviando.current = true;
    setTrabajando(true);
    const { error } = await firmar(createClient().rpc(RPC_GUARDAR_PLAZO as never, argsGuardarPlazo(planId, valor) as never), responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    // Fijar el plazo es idempotente: si la respuesta se perdió, volver a guardarlo deja lo mismo.
    if (error && esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas el plazo: no sabemos si llegó. Vuelve a pulsar el botón; si ya se había guardado, queda igual.");
    if (error) return void avisar.error(traducirError(error, "guardar el plazo"));
    const nuevo = valor === null ? DIAS_PARA_LLEGAR_DE_FABRICA : (argsGuardarPlazo(planId, valor).p_dias ?? DIAS_PARA_LLEGAR_DE_FABRICA);
    avisar.exito(valor === null ? `Volvió al supuesto de ${DIAS_PARA_LLEGAR_DE_FABRICA} días` : `Plazo de ${nuevo} días guardado`, { detalle: detalleDelNuevoPlazo(desde, hasta, hoy, nuevo) });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo="Días para llegar"
      subtitulo={`Cuánto tarda un pedido en estar en las tiendas, para ${planNombre}. Con eso se calcula hasta cuándo pedir; solo avisa, nunca te impide guardar un plan.`}
      onClose={onClose}
      variante="hoja"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(texto, cerrar);
          }}
          className="space-y-5"
        >
          <CampoGuiado id="dias" guia={guia} titulo="Días para llegar" ayuda="Desde que pides hasta que está en la tienda">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
              <div className="flex w-32 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CampoTexto etiqueta="Días para llegar a las tiendas" caja inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, ""))} />
                </div>
                <span aria-hidden className="pb-4 text-sm text-tinta/70">
                  días
                </span>
              </div>
              <p className="min-w-0 flex-1 basis-60 pt-2.5 text-[13px] leading-snug text-tinta/80" aria-live="polite">
                {resultado ? resultado.detalle : `Escribe un número de días: sin historia de recepciones, el supuesto es de ${DIAS_PARA_LLEGAR_DE_FABRICA}.`}
              </p>
            </div>
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo="Todo listo para guardar." />
            <div className="pie-acciones pt-2">
              {diasActuales !== null && (
                <Boton type="button" peso="peligro" disabled={trabajando || !responsable.listo} title={responsable.motivo ?? undefined} onClick={() => void guardar(null, cerrar)} className="mr-auto">
                  Usar el supuesto de 14
                </Boton>
              )}
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                Guardar plazo
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
