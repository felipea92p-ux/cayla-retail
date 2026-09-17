"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import type { PrendaDanada } from "@/lib/inventario-v2";

// "Dañado" (2026-09-17, ADR-0071, Opción A): cola de prendas en cuarentena
// (`aprobar_devolucion`, condición danada_reparacion/danada_donar) esperando
// que un líder de sede decida su destino final. Los 3 estados son
// literalmente los que pidió Felipe — fijos en código, no en una tabla
// editable: eso queda en 🔖 Pendientes Benja (BACKLOG.md) para un futuro
// módulo de administrador.
//
// "Liquidada" acá es una ETIQUETA + nota libre, no una venta: no registra
// comprobante ni pasa por caja. Si en el futuro se quiere que "Liquidada"
// sea una venta real con SUNAT de por medio, es una decisión de negocio
// aparte (mueve dinero real) que hay que confirmar explícitamente antes de
// construir — no se asumió acá.
const ESTADOS_RESOLUCION = [
  { valor: "liquidada", texto: "Liquidada" },
  { valor: "se_boto", texto: "Se botó" },
  { valor: "donada", texto: "Donada" },
] as const;

type EstadoResolucion = (typeof ESTADOS_RESOLUCION)[number]["valor"];

export function ResolverDanadosModal({
  pendientes,
  esLider,
  onClose,
}: {
  pendientes: PrendaDanada[];
  esLider: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [resolviendo, setResolviendo] = useState<string | null>(null);

  async function resolver(id: string, estado: EstadoResolucion) {
    setResolviendo(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("resolver_prenda_danada", {
      p_id: id,
      p_estado: estado,
      p_nota: notas[id]?.trim() || undefined,
    });
    setResolviendo(null);
    if (error) {
      avisar.error(traducirError(error, "resolver esta prenda dañada"));
      return;
    }
    avisar.exito("Prenda resuelta", { detalle: ESTADOS_RESOLUCION.find((e) => e.valor === estado)?.texto });
    router.refresh();
  }

  return (
    <Modal
      titulo="Prendas dañadas"
      subtitulo={`${pendientes.length} ${pendientes.length === 1 ? "pendiente" : "pendientes"} de resolver`}
      onClose={onClose}
      ancho="max-w-lg"
    >
      {(cerrar) => (
        <div className="space-y-4">
          {!esLider && pendientes.length > 0 && (
            <p className="rounded-md bg-sand/40 p-3 text-xs text-tinta/65">
              Solo un líder de sede puede resolver una prenda dañada — se ven acá, pero no se pueden marcar.
            </p>
          )}
          {pendientes.length === 0 ? (
            <p className="text-sm text-tinta/65">No hay prendas dañadas pendientes en esta ubicación.</p>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {pendientes.map((p) => (
                <div key={p.id} className="space-y-2 border-b border-tinta/10 pb-3 last:border-b-0">
                  <div>
                    <p className="text-sm text-tinta">{p.referencia}</p>
                    <p className="font-mono text-[11px] text-tinta/55">
                      {p.sku} {[p.talla, p.color].filter(Boolean).join("/")} · {p.cantidad}{" "}
                      {p.cantidad === 1 ? "unidad" : "unidades"} · en cuarentena desde{" "}
                      {new Date(p.creadoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                  </div>
                  {esLider && (
                    <>
                      <CampoTexto
                        etiqueta="Nota (opcional)"
                        value={notas[p.id] ?? ""}
                        onChange={(e) => setNotas((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        maxLength={200}
                        placeholder="Detalle de la resolución"
                      />
                      <div className="flex flex-wrap gap-2">
                        {ESTADOS_RESOLUCION.map((e) => (
                          <Boton
                            key={e.valor}
                            type="button"
                            onClick={() => resolver(p.id, e.valor)}
                            cargando={resolviendo === p.id}
                            disabled={resolviendo !== null}
                            className="flex-1"
                          >
                            {e.texto}
                          </Boton>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <Boton type="button" onClick={cerrar} className="w-full">
            Cerrar
          </Boton>
        </div>
      )}
    </Modal>
  );
}
