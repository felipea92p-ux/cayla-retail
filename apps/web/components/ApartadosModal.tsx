"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import {
  MOTIVOS_LIBERACION,
  estadoVencimiento,
  hoyLima,
  resumirApartados,
  textoVencimiento,
  type Apartado,
  type MotivoLiberacion,
} from "@/lib/apartados-reglas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Los apartados abiertos de esta tienda (ADR-0141). Lo que vence primero —o ya venció— sale arriba, y
// lo vencido va en rojo: NO se libera solo (la clienta pudo dejar adelanto), decide quien lo ve. El
// botón «Liberar» solo aparece donde la base lo permite (`puedeLiberar`, calculado en `listar_apartados`:
// quien apartó, o una líder) — nadie ve un botón que la base le va a rechazar.
export function ApartadosModal({ apartados, onClose }: { apartados: Apartado[]; onClose: () => void }) {
  const router = useRouter();
  const hoy = hoyLima();
  const resumen = resumirApartados(apartados, hoy);
  const [liberando, setLiberando] = useState<Apartado | null>(null);
  const [motivo, setMotivo] = useState<MotivoLiberacion | "">("");
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(false);
  // Liberar guarda en la tienda (la prenda vuelve a estar disponible): pide Responsable (ADR-0161).
  const responsable = useResponsable();

  async function liberar(e: React.FormEvent) {
    e.preventDefault();
    if (!liberando) return;
    setIntento(true);
    if (!motivo) return;
    if (!responsable.listo) return;

    setEnviando(true);
    const { error } = await firmar(
      createClient().rpc("liberar_apartado", { p_apartado_id: liberando.id, p_motivo: motivo }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "liberar el apartado"));
      return;
    }
    avisar.exito("Apartado liberado", {
      detalle: motivo === "entregada" ? `${liberando.referencia} — ya se puede cobrar en Vender` : `${liberando.referencia} vuelve a estar disponible`,
    });
    setLiberando(null);
    setMotivo("");
    setIntento(false);
    router.refresh();
  }

  const subtitulo =
    apartados.length === 0
      ? "Ninguna prenda apartada"
      : `${resumen.unidades} ${resumen.unidades === 1 ? "prenda" : "prendas"} para ${resumen.abiertos} ${resumen.abiertos === 1 ? "clienta" : "clientas"}${
          resumen.vencidos > 0 ? ` · ${resumen.vencidos} ${resumen.vencidos === 1 ? "vencido" : "vencidos"}` : ""
        }`;

  return (
    <Modal titulo={liberando ? "Liberar apartado" : "Apartados"} subtitulo={liberando ? undefined : subtitulo} onClose={onClose} ancho="max-w-2xl">
      {(cerrar) =>
        liberando ? (
          <form onSubmit={liberar} className="mt-2 space-y-4" noValidate>
            <div className="border-b border-tinta/10 pb-3">
              <p className="text-sm text-tinta">
                {liberando.referencia} <span className="text-tinta/55">· {liberando.cantidad} {liberando.cantidad === 1 ? "prenda" : "prendas"}</span>
              </p>
              <p className="text-xs text-tinta/65">
                Apartada para {liberando.clienta} · {liberando.contacto}
              </p>
            </div>
            <CampoSelect
              etiqueta="¿Por qué se libera?"
              valor={motivo}
              onValor={setMotivo}
              opciones={MOTIVOS_LIBERACION}
              marcador="Elegir motivo"
              pie={intento && !motivo ? "Elige por qué se libera." : motivo === "entregada" ? "Queda disponible: cóbrala en Vender enseguida." : undefined}
              tono={intento && !motivo ? "error" : undefined}
            />
            <ComboResponsable control={responsable} deshabilitado={enviando} />
            <div className="flex gap-2 pt-1">
              <Boton type="button" onClick={() => { setLiberando(null); setMotivo(""); setIntento(false); responsable.limpiar(); }} className="flex-1">
                Volver
              </Boton>
              <Boton
                type="submit"
                peso="primario"
                cargando={enviando}
                disabled={!responsable.listo}
                title={responsable.motivo ?? undefined}
                className="flex-1"
              >
                Liberar apartado
              </Boton>
            </div>
          </form>
        ) : apartados.length === 0 ? (
          <div className="mt-2 space-y-4">
            <p className="text-sm text-tinta/65">Cuando apartes una prenda para una clienta, aparece aquí con su fecha límite.</p>
            <Boton type="button" onClick={cerrar} className="w-full">
              Cerrar
            </Boton>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <ul className="divide-y divide-tinta/10">
              {apartados.map((a) => {
                const estado = estadoVencimiento(a.venceEl, hoy);
                const detalle = [a.talla, a.color].filter(Boolean).join(" · ");
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-tinta">
                        {a.referencia}
                        <span className="text-tinta/55"> · {a.cantidad} {a.cantidad === 1 ? "prenda" : "prendas"}</span>
                      </p>
                      <p className="font-mono text-[11px] text-tinta/55">
                        {a.sku}
                        {detalle ? ` · ${detalle}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-tinta">
                        {a.clienta} ·{" "}
                        <a href={`tel:${a.contacto.replace(/[^\d+]/g, "")}`} className="underline underline-offset-2 hover:text-rojo">
                          {a.contacto}
                        </a>
                      </p>
                      {a.nota && <p className="text-xs text-tinta/65">{a.nota}</p>}
                      <p className="text-[11px] text-tinta/45">Apartó {a.apartoNombre ?? "—"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Chip tono={estado === "vencido" ? "rojo" : estado === "hoy" ? "ambar" : "neutro"}>{textoVencimiento(a.venceEl, hoy)}</Chip>
                      {a.puedeLiberar && (
                        <button
                          type="button"
                          onClick={() => setLiberando(a)}
                          className="label-cayla text-[10px] text-tinta/55 underline underline-offset-2 hover:text-rojo hover:no-underline"
                        >
                          Liberar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Boton type="button" onClick={cerrar} className="w-full">
              Cerrar
            </Boton>
          </div>
        )
      }
    </Modal>
  );
}
