"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { camposDeIngresoDeInsumo, ingresoListo } from "@/lib/insumos-guia";
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
  const listo = ingresoListo({ tieneInsumo: !!insumo, cantidad, costo });
  const guia = useGuiaCampos(camposDeIngresoDeInsumo({ tieneInsumo: !!insumo, cantidad, costo, responsableListo: responsable.listo }));

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
      avisar.error(traducirError(error, "ingresar el insumo", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`${cantidadTexto(q, unidad)} de ${insumo.nombre} entraron`, {
      detalle: `Se abrió un lote a ${soles(c)} por ${UNIDADES_INSUMO[unidad].corta}.`,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Ingresar insumo" subtitulo="Cada ingreso abre un lote con su propio costo" variante="hoja" onClose={onClose}>
      <form onSubmit={guardar} className="mt-3.5 space-y-4">
        <CampoGuiado id="insumo" guia={guia}>
          <CampoSelect
            etiqueta={guia.etiqueta("insumo", "¿Qué llegó?")}
            valor={insumoId}
            onValor={(v) => setInsumoId(v)}
            opciones={insumos.map((i) => ({ valor: i.id, texto: `${i.nombre} · hay ${cantidadTexto(i.saldo, i.unidad)}` }))}
          />
        </CampoGuiado>
        <div className="grid grid-cols-2 gap-3">
          <CampoGuiado id="cantidad" guia={guia}>
            <CampoTexto etiqueta={guia.etiqueta("cantidad", `Cantidad (${UNIDADES_INSUMO[unidad].corta})`)} inputMode="decimal" placeholder="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </CampoGuiado>
          <CampoGuiado id="costo" guia={guia}>
            <CampoMonto etiqueta={guia.etiqueta("costo", `Costo por ${UNIDADES_INSUMO[unidad].corta}`)} pie="sin IGV" inputMode="decimal" placeholder="0.00" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </CampoGuiado>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={codigoLote} onChange={(e) => setCodigoLote(e.target.value)} maxLength={40} />
          <CampoTexto etiqueta="Documento" mono placeholder="F001-0000" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={40} />
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
        <CampoTexto etiqueta="Nota" placeholder="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">Valor del lote</span>
          <span className="font-display text-lg tabular-nums text-tinta">{listo ? soles(total) : "—"}</span>
        </div>
        <div className="space-y-3">
          <CampoGuiado id="quien" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={cargando} compacto />
          </CampoGuiado>
          <PieGuia guia={guia} listo="Todo listo para abrir el lote." conFrase />
        </div>
        <div className="pie-hoja-fijo">
          <div className="pie-acciones border-t border-sand pt-3">
            <Boton type="button" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton textoCargando="Ingresando…" peso="primario" type="submit" cargando={cargando} disabled={!guia.puedeConfirmar} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Abrir lote y sumar al saldo
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
