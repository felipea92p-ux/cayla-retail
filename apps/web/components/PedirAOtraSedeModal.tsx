"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Modal, botonCancelar, botonPrimario, campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { useSedeActiva } from "@/components/SedeActiva";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { ajustarCantidad, lineasParaRpc, motivoNoSePuedePedir, textoPrendas, type LineaParaPedir } from "@/lib/pedidos-entre-sedes-reglas";

// «Pedir a otra sede» (ADR-0242 D-7, `pedir_a_otra_sede`): la sede activa le pide prendas a otra tienda para reponer,
// sin clienta. Lo abre Análisis (lo que falta aquí y sobra allá); la otra tienda lo ve en Traslados, «Te piden», y lo
// envía en un solo traslado. Pedir no reserva nada en la otra tienda: si mientras tanto lo vende, responde «No la tengo».

export type LineaPedirAOtraSede = LineaParaPedir;

export type PedirAOtraSedeModalProps = {
  /** La sede que pide (la activa). */
  ubicacionId: string;
  /** La tienda a la que se le pide. */
  origen: { id: string; nombre: string };
  /** Las prendas propuestas: `etiqueta` como «Blusa Carlita · Blanco · M», `cantidad` la sugerida (se topa a lo disponible). */
  lineas: LineaPedirAOtraSede[];
  abierto: boolean;
  onCerrar: () => void;
  /** Tras pedir con éxito, con el `grupo_id` del pedido (opcional). */
  onPedido?: (grupoId: string) => void;
};

export function PedirAOtraSedeModal(props: PedirAOtraSedeModalProps) {
  if (!props.abierto) return null;
  // Montado solo mientras está abierto: cada apertura trae sus cantidades y su token nuevos.
  return <PedirAOtraSedeHoja {...props} />;
}

function PedirAOtraSedeHoja({ ubicacionId, origen, lineas: iniciales, onCerrar, onPedido }: PedirAOtraSedeModalProps) {
  const router = useRouter();
  const activa = useSedeActiva();
  const [lineas, setLineas] = useState<LineaParaPedir[]>(() =>
    iniciales.map((l) => ({ ...l, cantidad: ajustarCantidad(l.cantidad, 0, l.disponibleEnOrigen) })),
  );
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Un token por apertura: el doble clic (o reintentar tras un corte) no crea dos pedidos.
  const token = useRef<string>(crypto.randomUUID());
  const etiquetaSede = activa?.ubicacionId === ubicacionId ? activa.etiqueta : "esta tienda";
  const responsable = useResponsable({ ubicacionId, etiqueta: etiquetaSede });
  const motivo = motivoNoSePuedePedir(lineas);
  const total = lineasParaRpc(lineas).reduce((s, l) => s + l.cantidad, 0);

  function cambiar(varianteId: string, delta: number) {
    setLineas((ls) => ls.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: ajustarCantidad(l.cantidad, delta, l.disponibleEnOrigen) } : l)));
  }

  async function pedir(cerrar: () => void) {
    if (motivo || !responsable.listo) return;
    setEnviando(true);
    const { data, error } = await firmar(
      createClient().rpc("pedir_a_otra_sede", {
        p_ubicacion_id: ubicacionId,
        p_origen_id: origen.id,
        p_lineas: lineasParaRpc(lineas),
        p_nota: nota.trim() || undefined,
        p_token: token.current,
      }),
      responsable.firma(),
    );
    setEnviando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "pedir las prendas", { confirmarAntesDeRepetir: true }));
    avisar.exito(`Pedido enviado a ${origen.nombre}`, { detalle: `${textoPrendas(total)}. Lo verás en Traslados hasta que llegue.` });
    if (typeof data === "string") onPedido?.(data);
    router.refresh();
    cerrar();
  }

  return (
    <Modal titulo={`Pedir a ${origen.nombre}`} subtitulo="Para reponer: al llegar entra a tu stock." onClose={onCerrar} ancho="max-w-md" bloqueado={enviando}>
      {(cerrar) => (
        <div className="space-y-4">
          <ul className="divide-y divide-sand rounded-xl border border-sand">
            {lineas.map((l) => (
              <li key={l.varianteId} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-tinta">{l.etiqueta}</p>
                  <p className="text-xs text-taupe">
                    {l.disponibleEnOrigen > 0 ? `${origen.nombre} tiene ${l.disponibleEnOrigen}` : `${origen.nombre} ya no tiene`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Una menos de ${l.etiqueta}`}
                    disabled={enviando || l.cantidad <= 0}
                    onClick={() => cambiar(l.varianteId, -1)}
                    className="btn-cayla btn-sutil h-9 w-9 justify-center p-0"
                  >
                    <Minus aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <span className="w-7 text-center tabular-nums font-semibold text-tinta" aria-live="polite">
                    {l.cantidad}
                  </span>
                  <button
                    type="button"
                    aria-label={`Una más de ${l.etiqueta}`}
                    disabled={enviando || l.cantidad >= l.disponibleEnOrigen}
                    onClick={() => cambiar(l.varianteId, 1)}
                    className="btn-cayla btn-sutil h-9 w-9 justify-center p-0"
                  >
                    <Plus aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <label className="block">
            <span className={campoEtiqueta}>Nota (opcional)</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Para el fin de semana" className={campoTexto} />
          </label>
          <ComboResponsable control={responsable} deshabilitado={enviando} />
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button
              type="button"
              disabled={enviando || !!motivo || !responsable.listo}
              title={motivo ?? responsable.motivo ?? undefined}
              onClick={() => pedir(cerrar)}
              className={botonPrimario}
            >
              {enviando ? "Pidiendo…" : `Pedir a ${origen.nombre}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
