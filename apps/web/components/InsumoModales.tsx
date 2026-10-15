"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { UNIDADES_INSUMO, cantidadTexto } from "@/lib/insumos-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Ingresar un lote de insumo (ADR-0133, F3): solo del líder, mete dinero (el costo del lote). «Nuevo insumo» vive en `components/insumos-taller/` desde la actividad 8e. Con `<Modal>` del sistema (ADR-0136): no se define otra animación ni otro overlay.

export function IngresarInsumoModal({ insumos, insumoInicialId, tallerId, onClose }: { insumos: InsumoVista[]; insumoInicialId: string | null; tallerId: string; onClose: () => void }) {
  const router = useRouter();
  const [insumoId, setInsumoId] = useState(insumoInicialId ?? insumos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const [documento, setDocumento] = useState("");
  const [origen, setOrigen] = useState<"compra" | "saldo_inicial">("compra");
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de abrir dos lotes. Uno por cada vez que se abre la ventana.
  const token = useRef<string>(crypto.randomUUID());
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  // Responsable (ADR-0161/0162): el ingreso firma con quien se elige en el combo (lista del Taller, la sede activa).
  const responsable = useResponsable();

  const insumo = insumos.find((i) => i.id === insumoId);
  const q = Number(cantidad) || 0;
  const c = Number(costo) || 0;
  const total = q * c;
  const unidad = insumo?.unidad ?? "unidad";
  const listo = !!insumo && q > 0 && c >= 0 && costo.trim() !== "";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!insumo || !listo) return;
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setCargando(true);
    const { error } = await firmar(createClient().rpc("recibir_insumo", {
      p_insumo_id: insumo.id,
      p_ubicacion_id: tallerId,
      p_cantidad: q,
      p_costo_total: Math.round(total * 100) / 100,
      p_codigo_lote: codigoLote.trim() || undefined,
      p_documento: documento.trim() || undefined,
      p_origen: origen,
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "ingresar el insumo"));
      return;
    }
    avisar.exito(`${cantidadTexto(q, unidad)} de ${insumo.nombre} entraron`, {
      detalle: `Se abrió un lote a ${soles(c)} por ${UNIDADES_INSUMO[unidad].corta}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ingresar insumo" subtitulo="Cada ingreso abre un lote con su propio costo" onClose={onClose} ancho="max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <CampoSelect
          etiqueta="¿Qué llegó?"
          valor={insumoId}
          onValor={(v) => setInsumoId(v)}
          opciones={insumos.map((i) => ({ valor: i.id, texto: `${i.nombre} · hay ${cantidadTexto(i.saldo, i.unidad)}` }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta={`Cantidad (${UNIDADES_INSUMO[unidad].corta})`} inputMode="decimal" placeholder="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          <CampoMonto etiqueta={`Costo por ${UNIDADES_INSUMO[unidad].corta}`} pie="sin IGV" inputMode="decimal" placeholder="0.00" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={codigoLote} onChange={(e) => setCodigoLote(e.target.value)} />
          <CampoTexto etiqueta="Documento" mono placeholder="F001-0000" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </div>
        <CampoSelect
          etiqueta="Origen"
          pie={origen === "saldo_inicial" ? "Lo que ya había en el estante antes de usar el sistema" : "Una compra que ya llegó"}
          valor={origen}
          onValor={(v) => setOrigen(v)}
          opciones={
            [
              { valor: "compra", texto: "Compra" },
              { valor: "saldo_inicial", texto: "Saldo inicial" },
            ] as const
          }
        />
        <CampoTexto etiqueta="Nota" placeholder="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} />

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">Valor del lote</span>
          <span className="font-display text-lg tabular-nums text-tinta">{listo ? soles(total) : "—"}</span>
        </div>
        <ComboResponsable control={responsable} deshabilitado={cargando} />
        <Boton peso="primario" type="submit" cargando={cargando} disabled={!listo || !responsable.listo} title={responsable.motivo ?? undefined} className="w-full">
          {cargando ? "Ingresando…" : "Abrir lote y sumar al saldo"}
        </Boton>
      </form>
    </Modal>
  );
}
