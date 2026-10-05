"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { MOTIVOS_CIERRE, type MotivoCierre, type SedeParaCerrar } from "@/lib/cola-arranque-reglas";
import { sePuedeConfirmar, type CampoDeGuia } from "@/lib/guia-campos";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** «el 04/10» o «entre el 30/09 y el 04/10»: cuándo se vendió lo que se va a cerrar. */
const cuandoSeVendio = (desde: string, hasta: string) => {
  const a = diaYHoraLima(desde).dia;
  const b = diaYHoraLima(hasta).dia;
  return a === b ? `el ${a}` : `entre el ${a} y el ${b}`;
};

/**
 * «Cerrar la cola de arranque» (ADR-0334, opción B de Felipe, 2026-10-04): un líder da por hechas, en bloque, las ventas sin
 * registrar de UNA tienda cuando ya no se puede saber qué prenda era cada una. No mueve stock ni toca la venta: la prenda queda sin
 * identificar y la fila pasa a «Cerrada sin prenda». Solo lo que el líder VE aquí (hasta `corte`): lo que se venda desde ahora sigue
 * pendiente. La base vuelve a exigir líder, plazo y motivo (`cerrar_cola_arranque`); aquí solo se evita ofrecer lo que rechazaría.
 *
 * Sin combo «Responsable»: firma la cuenta del líder (`cola_arranque_cerrar`, como regularizar). La guía de foco dice qué falta: la
 * tienda (si hay varias), el motivo y, opcional, una nota.
 */
export function CerrarColaArranqueModal({ sedes, inicial, onClose }: { sedes: SedeParaCerrar[]; inicial: string | null; onClose: () => void }) {
  const router = useRouter();
  const varias = sedes.length > 1;
  // Con una sola tienda se parte de ella; con varias, de la que se está mirando (si se puede) o de ninguna: cerrar la tienda equivocada
  // no se debe poder hacer con un clic distraído.
  const [ubicacionId, setUbicacionId] = useState(sedes.length === 1 ? sedes[0].ubicacionId : (sedes.find((s) => s.ubicacionId === inicial)?.ubicacionId ?? ""));
  const [motivo, setMotivo] = useState<MotivoCierre | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const sede = sedes.find((s) => s.ubicacionId === ubicacionId) ?? null;

  // «Falta» = lo mismo que apaga el botón: la tienda (si se elige) y el motivo. La nota es opcional.
  const campos: CampoDeGuia[] = [
    ...(varias ? [{ id: "tienda", nombre: "Tienda", requerido: true, hecho: sede !== null, pendiente: "Elige la tienda que vas a cerrar." }] : []),
    { id: "motivo", nombre: "Motivo", requerido: true, hecho: motivo !== null, pendiente: "Elige por qué se cierran sin identificar la prenda." },
    { id: "nota", nombre: "Nota", requerido: false, hecho: nota.trim() !== "", pendiente: "Si quieres, deja una nota." },
  ];
  const guia = useGuiaCampos(campos);

  async function cerrarCola() {
    if (!sede || !motivo || !sePuedeConfirmar(campos)) return;
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("cerrar_cola_arranque", {
        p_ubicacion_id: sede.ubicacionId,
        p_hasta: sede.corte,
        p_motivo: motivo,
        p_nota: nota.trim() || undefined,
      }),
      firmaOmitida("cola_arranque_cerrar"),
    );
    setGuardando(false);
    if (error) {
      avisar.error(traducirError(error, "cerrar la cola de arranque"));
      return;
    }
    avisar.exito("Cola cerrada", {
      detalle: `${sede.pendientes} ${sede.pendientes === 1 ? "prenda" : "prendas"} de ${sede.sede} quedaron cerradas sin prenda.`,
    });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo="Cerrar la cola de arranque"
      subtitulo="Para las ventas sin registrar que ya no se pueden identificar. Se cierran todas juntas, sin tocar el stock."
      onClose={onClose}
      variante="hoja"
    >
      {(cerrar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void cerrarCola();
          }}
          className="space-y-6"
        >
          {varias && (
            <CampoGuiado id="tienda" guia={guia} titulo="Tienda">
              <CampoSelect
                etiqueta="Tienda"
                valor={ubicacionId}
                onValor={setUbicacionId}
                opciones={sedes.map((s) => ({ valor: s.ubicacionId, texto: `${s.sede} · ${s.pendientes} pendientes` }))}
                marcador="Elige la tienda"
                caja
              />
            </CampoGuiado>
          )}

          {sede && (
            <div className="rounded-md bg-hueso px-4 py-3 text-sm text-tinta">
              <p>
                Se cerrarán <strong>{sede.pendientes} {sede.pendientes === 1 ? "prenda vendida" : "prendas vendidas"} sin registrar</strong> de {sede.sede} ({soles(sede.soles)}), vendidas {cuandoSeVendio(sede.desde, sede.corte)}.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-tinta/75">
                <li>El stock no cambia y el dinero de cada venta tampoco: solo queda sin identificar qué prenda era.</li>
                <li>Lo que se venda desde ahora sigue pendiente.</li>
                <li>Antes de cerrar, usa «Identificar con sugerencias»: las que tienen una sola prenda posible se pueden unir a su prenda y dejar el stock cuadrado.</li>
                <li>Si una cliente devuelve o cambia una de estas prendas, un líder tiene que reabrirla antes.</li>
                {sede.diasDePlazo !== null && (
                  <li>
                    Esta opción está abierta {sede.diasDePlazo === 0 ? "solo hoy" : `${sede.diasDePlazo} ${sede.diasDePlazo === 1 ? "día más" : "días más"}`} para esta tienda.
                  </li>
                )}
              </ul>
            </div>
          )}

          <CampoGuiado id="motivo" guia={guia} titulo="¿Por qué no se pueden identificar?">
            <div role="radiogroup" aria-label="Motivo del cierre" className="grid gap-2">
              {MOTIVOS_CIERRE.map((m) => {
                const elegido = motivo === m.clave;
                return (
                  <button
                    key={m.clave}
                    type="button"
                    role="radio"
                    aria-checked={elegido}
                    onClick={() => setMotivo(m.clave)}
                    className={`rounded-md border px-3.5 py-2.5 text-left transition-colors ease-cayla ${
                      elegido ? "border-tinta bg-hueso" : "border-tinta/15 bg-papel hover:border-tinta/40"
                    }`}
                  >
                    <span className="block text-sm text-tinta">{m.titulo}</span>
                    <span className="mt-0.5 block text-xs text-taupe">{m.ayuda}</span>
                  </button>
                );
              })}
            </div>
          </CampoGuiado>

          <CampoGuiado id="nota" guia={guia} titulo="Nota">
            <CampoTexto etiqueta="Nota (opcional)" caja maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} />
          </CampoGuiado>

          <PieGuia guia={guia} listo={sede ? `Todo listo para cerrar ${sede.pendientes} ${sede.pendientes === 1 ? "prenda" : "prendas"}.` : "Todo listo."} />
          <div className="pie-hoja-fijo flex justify-end gap-3 pt-2">
            <Boton type="button" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              {sede ? `Cerrar ${sede.pendientes} ${sede.pendientes === 1 ? "prenda" : "prendas"}` : "Cerrar la cola"}
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
