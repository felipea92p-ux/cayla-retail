"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { solesCentimos } from "@/lib/flujo-caja-reglas";
import { nombreMes, type PanelImpuestos } from "@/lib/impuestos-reglas";
import { NOTA_IGV_MAX, avisoDelIgvDicho, leerMontoDelIgv, referenciasDelIgv } from "@/lib/igv-del-mes-reglas";
import { sugerirNotaIgv } from "@/lib/sugerencias-igv-del-mes";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { useValidarAlSalir } from "@/components/ui/useValidarAlSalir";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";

// Impuestos ▸ «IGV del mes» (ADR-0620, Felipe 2026-11-06). El líder dice cuánto va a pagar de IGV por el mes que mira; Ganancias y pérdidas lo resta. No toca el libro, el Balance ni lo que se
// declara. Las cifras de arriba son para comparar y nunca precargan el campo: el monto es lo que dijo el líder, no lo que propuso la pantalla. Si el mes tiene una unidad cerrada, lo rechaza la base.
// Guía de foco (ADR-0284): «falta» es lo mismo que frena `decir_igv_del_mes` en esta hoja: el monto y quién lo dice; la nota es opcional.

const ID_MONTO = "igv-monto";
const ID_NOTA = "igv-nota";
const ID_RESPONSABLE = "responsable";

export function DecirIgvDelMesModal({ panel, dicho, onCerrar }: { panel: PanelImpuestos; dicho: number | null; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const { mes } = panel;
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);

  const lectura = leerMontoDelIgv(texto);
  const malEscrito = useValidarAlSalir(lectura.estado === "mal" ? lectura.motivo : null);
  const referencias = referenciasDelIgv(panel);
  const campos: CampoDeGuia[] = [
    { id: ID_MONTO, nombre: "Monto", requerido: true, hecho: lectura.estado === "ok", pendiente: lectura.estado === "mal" ? lectura.motivo : "Escribe cuánto vas a pagar de IGV." },
    { id: ID_NOTA, nombre: "Nota", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: ID_RESPONSABLE, nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo dice." },
  ];
  const guia = useGuiaCampos(campos);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (guardando || lectura.estado !== "ok" || !guia.puedeConfirmar) return;
    setGuardando(true);
    setErrorHoja(null);
    const { data, error } = await firmar(
      createClient().rpc("decir_igv_del_mes" as never, { p_mes: `${mes}-01`, p_monto: lectura.monto, p_nota: nota.trim() || null } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return setErrorHoja(traducirError(error, "guardar el IGV del mes"));
    const aviso = avisoDelIgvDicho(lectura.monto, mes, (data as { nuevo?: boolean } | null)?.nuevo !== false);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal
      variante="hoja"
      tamano="mediana"
      titulo={`IGV de ${nombreMes(mes)}`}
      subtitulo="Cuánto vas a pagar de IGV por este mes. Ganancias y pérdidas lo resta; el libro y lo que declaras no cambian."
      onClose={onCerrar}
    >
      {(cerrar) => (
        <form onSubmit={guardar} onKeyDown={enterNoGuarda} className="space-y-4">
          {(referencias.length > 0 || dicho !== null) && (
            <dl className="nota-cayla sin-i space-y-1 text-sm" aria-label="Cifras para comparar">
              {dicho !== null && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt>Lo que dijiste antes</dt>
                  <dd className="tabular-nums">{solesCentimos(dicho)}</dd>
                </div>
              )}
              {referencias.map((r) => (
                <div key={r.clave} className="flex items-baseline justify-between gap-4">
                  <dt>{r.nombre}</dt>
                  <dd className="tabular-nums">{solesCentimos(r.monto)}</dd>
                </div>
              ))}
            </dl>
          )}

          <CampoGuiado id={ID_MONTO} guia={guia}>
            <CampoMonto
              etiqueta={guia.etiqueta(ID_MONTO, "Cuánto vas a pagar de IGV")}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setErrorHoja(null);
              }}
              onBlur={malEscrito.alSalir}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00" /* sugerir-fijo: el formato de un monto en soles, no depende de nada elegido */
              disabled={guardando}
              tono={malEscrito.motivo ? "error" : undefined}
              pie={malEscrito.motivo ?? "Si no pagas IGV este mes, escribe 0."}
            />
          </CampoGuiado>

          <CampoGuiado id={ID_NOTA} guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta(ID_NOTA, "Nota · opcional")}
              value={nota}
              maxLength={NOTA_IGV_MAX}
              onChange={(e) => setNota(e.target.value)}
              placeholder={sugerirNotaIgv({ aPagar: panel.foco?.aPagar ?? 0, saldoAFavor: panel.foco?.saldoAFavor ?? 0 })}
              disabled={guardando}
            />
          </CampoGuiado>

          <CampoGuiado id={ID_RESPONSABLE} guia={guia}>
            <div>
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </div>
          </CampoGuiado>

          {errorHoja && <Aviso tono="error">{errorHoja}</Aviso>}
          <div className="pie-hoja-fijo space-y-2 pt-3">
            <PieGuia guia={guia} listo="Todo listo para guardar." />
            <div className="pie-acciones">
              <Boton type="button" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton peso="primario" type="submit" cargando={guardando} textoCargando="Guardando…" confirma={guia} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                Guardar
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
