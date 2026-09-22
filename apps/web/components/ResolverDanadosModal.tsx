"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto, CampoMonto, CampoSelect } from "@/components/ui/campos";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";
import type { PrendaDanada } from "@/lib/inventario-v2";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// "Dañado" (2026-09-17, ADR-0071, Opción A): cola de prendas en cuarentena
// (`aprobar_devolucion`, condición danada_reparacion/danada_donar) esperando
// que un líder de sede decida su destino final. Los 3 estados son
// literalmente los que pidió Felipe — fijos en código, no en una tabla
// editable: eso queda en 🔖 Pendientes Benja (BACKLOG.md) para un futuro
// módulo de administrador.
//
// "Liquidada" ES una venta real (corrección de Felipe, mismo día: "se tiene
// que tomar en cuenta liquidación como una venta, totalmente") — pide precio
// y forma de pago, y usa `liquidar_prenda_danada`, no `resolver_prenda_danada`
// (esa función ahora solo acepta Se botó/Donada). "Se botó"/"Donada" siguen
// siendo solo una etiqueta + nota, sin dinero de por medio.
const ESTADOS_SIMPLES = [
  { valor: "se_boto", texto: "Se botó" },
  { valor: "donada", texto: "Donada" },
] as const;

type EstadoSimple = (typeof ESTADOS_SIMPLES)[number]["valor"];

const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
};

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
  const [liquidando, setLiquidando] = useState<string | null>(null);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [metodos, setMetodos] = useState<Record<string, MetodoPago>>({});
  // Resolver o liquidar una prenda dañada es operación de tienda (sale del stock en cuarentena; liquidar es una
  // venta con caja): pide Responsable, también al líder (ADR-0161, A8/A9). Uno solo para todo el modal.
  const responsable = useResponsable();

  async function resolver(id: string, estado: EstadoSimple) {
    if (!responsable.listo) return;
    setResolviendo(id);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("resolver_prenda_danada", {
        p_id: id,
        p_estado: estado,
        p_nota: notas[id]?.trim() || undefined,
      }),
      responsable.firma(),
    );
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "resolver esta prenda dañada"));
      return;
    }
    avisar.exito("Prenda resuelta", { detalle: ESTADOS_SIMPLES.find((e) => e.valor === estado)?.texto });
    router.refresh();
  }

  async function confirmarLiquidacion(p: PrendaDanada) {
    const precio = Number(precios[p.id]);
    if (!Number.isFinite(precio) || precio <= 0) {
      avisar.error("Ingresa un precio de liquidación mayor a cero.");
      return;
    }
    if (!responsable.listo) return;
    setResolviendo(p.id);
    const supabase = createClient();
    const { error } = await firmar(
      supabase.rpc("liquidar_prenda_danada", {
        p_id: p.id,
        p_precio_unitario: precio,
        p_metodo_pago: metodos[p.id] ?? "efectivo",
        p_nota: notas[p.id]?.trim() || undefined,
      }),
      responsable.firma(),
    );
    setResolviendo(null);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "liquidar esta prenda"));
      return;
    }
    avisar.exito("Prenda liquidada", { detalle: `Venta registrada por S/${(precio * p.cantidad).toFixed(2)}` });
    setLiquidando(null);
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
          {/* Los botones van por prenda: el combo queda arriba de la lista, antes de cualquiera de ellos. */}
          {esLider && pendientes.length > 0 && <ComboResponsable control={responsable} deshabilitado={resolviendo !== null} />}
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
                  {esLider && liquidando !== p.id && (
                    <>
                      <CampoTexto
                        etiqueta="Nota (opcional)"
                        value={notas[p.id] ?? ""}
                        onChange={(e) => setNotas((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        maxLength={200}
                        placeholder="Detalle de la resolución"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Boton
                          type="button"
                          onClick={() => {
                            setLiquidando(p.id);
                            setPrecios((prev) => ({ ...prev, [p.id]: prev[p.id] ?? (p.precioReferencia || "").toString() }));
                          }}
                          disabled={resolviendo !== null || !responsable.listo}
                          title={responsable.motivo ?? undefined}
                          className="flex-1"
                        >
                          Liquidada
                        </Boton>
                        {ESTADOS_SIMPLES.map((e) => (
                          <Boton
                            key={e.valor}
                            type="button"
                            onClick={() => resolver(p.id, e.valor)}
                            cargando={resolviendo === p.id}
                            disabled={resolviendo !== null || !responsable.listo}
                            title={responsable.motivo ?? undefined}
                            className="flex-1"
                          >
                            {e.texto}
                          </Boton>
                        ))}
                      </div>
                    </>
                  )}
                  {esLider && liquidando === p.id && (
                    <div className="space-y-3 rounded-md bg-sand/30 p-3">
                      <p className="text-xs text-tinta/65">
                        Liquidar registra una venta real — {p.cantidad > 1 ? `${p.cantidad} unidades juntas, ` : ""}
                        exige caja abierta en esta ubicación.
                      </p>
                      <CampoMonto
                        etiqueta={p.cantidad > 1 ? "Precio por unidad" : "Precio de liquidación"}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={precios[p.id] ?? ""}
                        onChange={(e) => setPrecios((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                      <CampoSelect
                        etiqueta="Forma de pago"
                        valor={metodos[p.id] ?? "efectivo"}
                        onValor={(v) => setMetodos((prev) => ({ ...prev, [p.id]: v }))}
                        opciones={METODOS_PAGO.map((m) => ({ valor: m, texto: ETIQUETA_METODO[m] }))}
                      />
                      <div className="flex gap-2">
                        <Boton type="button" onClick={() => setLiquidando(null)} disabled={resolviendo !== null} className="flex-1">
                          Cancelar
                        </Boton>
                        <Boton
                          type="button"
                          peso="primario"
                          onClick={() => confirmarLiquidacion(p)}
                          cargando={resolviendo === p.id}
                          disabled={resolviendo !== null || !responsable.listo}
                          title={responsable.motivo ?? undefined}
                          className="flex-1"
                        >
                          Confirmar liquidación
                        </Boton>
                      </div>
                    </div>
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
