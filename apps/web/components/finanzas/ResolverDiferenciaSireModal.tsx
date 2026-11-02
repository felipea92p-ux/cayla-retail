"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { camposDeResolver } from "@/lib/sire-guia";
import { TEXTO_DECISION, type LineaConResolucion, type OpcionDecision } from "@/lib/sire-cruce-reglas";
import type { RegistroSire } from "@/lib/sire-propuesta-reglas";

// Resolver una diferencia con SUNAT, o deshacer lo resuelto (ADR-0601, actividad 2). La decisión llega elegida del menú de la fila; aquí
// se dice por qué, se deja una nota opcional para el contador y se firma. Resolver no cambia la propuesta ni el ERP: dice «ya se vio».

export type PedidoResolver = { linea: LineaConResolucion; opcion: OpcionDecision } | { linea: LineaConResolucion; deshacer: true };

export function ResolverDiferenciaSireModal({ registro, mes, pedido, onClose }: { registro: RegistroSire; mes: string; pedido: PedidoResolver; onClose: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDeResolver({ listo: responsable.listo, motivo: responsable.motivo }));
  const l = pedido.linea;
  const deshacer = "deshacer" in pedido;
  const comprobante = `${l.serie}-${l.numero}`;

  async function confirmar(cerrar: () => void) {
    if (enviando.current || !guia.puedeConfirmar) return;
    enviando.current = true;
    setTrabajando(true);
    const llamada = deshacer
      ? createClient().rpc("deshacer_resolucion_sire" as never, { p_id: l.resolucion?.id } as never)
      : createClient().rpc("resolver_diferencia_sire" as never, { p_registro: registro, p_mes: `${mes}-01`, p_clave: l.clave, p_decision: pedido.opcion.decision, p_nota: nota } as never);
    const { error } = await firmar(llamada, responsable.firma());
    responsable.despues(error);
    setTrabajando(false);
    enviando.current = false;
    // Si la respuesta se perdió, volver a pulsar es seguro: la base contesta «ya resuelta» (o «ya deshecha») y nada se duplica.
    if (error && esFalloDeRed(error)) return void avisar.error("Se cortó la conexión: no sabemos si llegó. Recarga la pantalla y mira si ya aparece.");
    if (error?.hint === "ya_resuelta" || error?.hint === "ya_deshecha") {
      avisar.error(error.hint === "ya_resuelta" ? "Alguien ya resolvió este comprobante." : "Esa resolución ya se había deshecho.");
      router.refresh();
      return cerrar();
    }
    if (error) return void avisar.error(traducirError(error, deshacer ? "deshacer la resolución" : "resolver la diferencia"));
    avisar.exito(deshacer ? "Vuelve a la lista" : "Diferencia resuelta", { detalle: deshacer ? comprobante : `${comprobante} · ${pedido.opcion.texto}` });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo={deshacer ? `Deshacer lo resuelto de ${comprobante}` : pedido.opcion.texto}
      subtitulo={l.ruc ? `${l.nombre} · RUC ${l.ruc}` : l.nombre}
      onClose={onClose}
      variante="hoja"
    >
      {(cerrar) => (
        <form
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar(cerrar);
          }}
          className="space-y-5"
        >
          {deshacer ? (
            <p className="text-sm">
              Se marcó «{l.resolucion ? TEXTO_DECISION[l.resolucion.decision] : ""}»{l.resolucion?.resueltaPor ? ` (${l.resolucion.resueltaPor})` : ""}. Al deshacerlo, {comprobante} vuelve a la lista de lo que hay que mirar. No se borra: queda dicho que se deshizo.
            </p>
          ) : (
            <>
              <p className="text-sm">{pedido.opcion.ayuda}</p>
              {pedido.opcion.decision === "no_es_nuestra" && (
                <Aviso tono="atencion" chico titulo="Avísale al contador">
                  Una factura a nombre de CAYLA que nadie pidió puede ser alguien usando el RUC. El contador sabe cómo informarlo a SUNAT.
                </Aviso>
              )}
              <CampoTexto etiqueta="Nota para el contador · opcional" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
            </>
          )}
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo={deshacer ? "Listo para deshacer." : "Listo para guardar."} />
            <div className="pie-acciones pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={trabajando}
                textoCargando={deshacer ? "Deshaciendo…" : "Guardando…"}
                disabled={!guia.puedeConfirmar}
                title={guia.frase ?? undefined}
                className={guia.claseConfirmar}
              >
                {deshacer ? "Deshacer" : "Guardar"}
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
