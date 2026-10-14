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
import { camposDelReparto } from "@/lib/plan-compra-guia";
import { RPC_GUARDAR_MINIMO } from "@/lib/plan-compra-reparto";

// El mínimo por tienda del reparto (ADR-0372, act. 2026-10-12 · Felipe: Lima casi no vende todavía; «un mínimo que fija un líder»). Por cada
// tienda activa, un % opcional: en blanco, le toca según lo que vende. Solo un líder lo fija (la base lo exige). Guarda solo lo que cambió.

export function RepartoModal({
  planId,
  planNombre,
  tiendas,
  minimos,
  onClose,
}: {
  planId: string;
  planNombre: string;
  tiendas: readonly { id: string; nombre: string }[];
  minimos: ReadonlyMap<string, number>;
  onClose: () => void;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const inicial = Object.fromEntries(tiendas.map((t) => [t.id, minimos.has(t.id) ? String(Math.round(minimos.get(t.id)! * 100)) : ""]));
  const [textos, setTextos] = useState<Record<string, string>>(inicial);
  const [trabajando, setTrabajando] = useState(false);
  const enviando = useRef(false);
  const guia = useGuiaCampos(camposDelReparto(textos, tiendas, { listo: responsable.listo, motivo: responsable.motivo }));
  const cambiadas = tiendas.filter((t) => (textos[t.id] ?? "").trim() !== (inicial[t.id] ?? ""));

  async function guardar(cerrar: () => void) {
    if (enviando.current || !guia.puedeConfirmar || cambiadas.length === 0) return;
    enviando.current = true;
    setTrabajando(true);
    // Primero las que bajan o se quitan: así la suma nunca pasa de 100 % a mitad de camino.
    const orden = [...cambiadas].sort((a, b) => Number(textos[a.id] || 0) - Number(inicial[a.id] || 0) - (Number(textos[b.id] || 0) - Number(inicial[b.id] || 0)));
    for (const t of orden) {
      const s = (textos[t.id] ?? "").trim();
      const { error } = await firmar(createClient().rpc(RPC_GUARDAR_MINIMO as never, { p_plan_id: planId, p_ubicacion_id: t.id, p_pct: s === "" ? null : Number(s) } as never), responsable.firma());
      responsable.despues(error);
      if (error) {
        setTrabajando(false);
        enviando.current = false;
        router.refresh();
        if (esFalloDeRed(error)) return void avisar.error("Se cortó la conexión mientras guardabas el reparto: puede que una parte se haya guardado. Vuelve a abrir la hoja y revísalo.");
        return void avisar.error(traducirError(error, `guardar el mínimo de ${t.nombre}`));
      }
    }
    setTrabajando(false);
    enviando.current = false;
    avisar.exito("Reparto guardado", { detalle: planNombre });
    router.refresh();
    cerrar();
  }

  return (
    <Modal
      titulo="Reparto entre tiendas"
      subtitulo={`En ${planNombre}, lo que conviene tener se reparte según lo que vende cada tienda. A una que vende poco (o recién abre) puedes darle un mínimo.`}
      onClose={onClose}
      variante="hoja"
      ancho="max-w-md"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(cerrar);
          }}
          className="space-y-5"
        >
          {tiendas.map((t) => (
            <CampoGuiado key={t.id} id={`minimo-${t.id}`} guia={guia} titulo={t.nombre} ayuda="Mínimo, en % del objetivo">
              <div className="flex w-36 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CampoTexto
                    etiqueta={`Mínimo de ${t.nombre}, en %`}
                    caja
                    inputMode="numeric"
                    value={textos[t.id] ?? ""}
                    onChange={(e) => setTextos((x) => ({ ...x, [t.id]: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                  />
                </div>
                <span aria-hidden className="pb-4 text-sm text-tinta/70">
                  %
                </span>
              </div>
            </CampoGuiado>
          ))}
          <CampoGuiado id="suma" guia={guia}>
            <p className="nota-cayla">En blanco: le toca según lo que vende. Los mínimos de todas las tiendas no pueden sumar más de 100 %.</p>
          </CampoGuiado>
          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={trabajando} />
          </CampoGuiado>
          <div className="pie-hoja-fijo">
            <PieGuia guia={guia} listo={cambiadas.length > 0 ? "Todo listo para guardar." : "Sin cambios todavía."} />
            <div className="pie-acciones pt-2">
              <Boton type="button" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton type="submit" peso="primario" cargando={trabajando} disabled={!guia.puedeConfirmar || cambiadas.length === 0} title={responsable.motivo ?? guia.frase ?? undefined} className={guia.claseConfirmar}>
                Guardar
              </Boton>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
