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
import { CANTIDAD_ILEGIBLE, UNIDADES_INSUMO, cantidadTexto, leerCantidad } from "@/lib/insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE, costoUnitarioIlegible, costoUnitarioTexto, numeroDeCostoUnitario } from "@/lib/monto-plata-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Saldo inicial (ADR-0133, F3; ADR-0614): lo que ya estaba en el estante antes de usar el sistema, sin proveedor ni deuda. Solo del líder, mete dinero (el costo del lote).
// Lo que se le compró a un proveedor entra por «Llegó una compra» (`LlegoUnaCompraModal`), y lo que aparece en el corte, por «Encontré tela».

export function IngresarInsumoModal({ insumos, insumoInicialId, tallerId, onClose }: { insumos: InsumoVista[]; insumoInicialId: string | null; tallerId: string; onClose: () => void }) {
  const router = useRouter();
  const [insumoId, setInsumoId] = useState(insumoInicialId ?? insumos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const [documento, setDocumento] = useState("");
  // Doble clic (ADR-0190): un token por intento. Si el mismo intento llega dos veces (dos clics, un reintento tras
  // una red que se cae), la base devuelve lo ya guardado en vez de abrir dos lotes. Uno por cada vez que se abre la ventana.
  const token = useRef<string>(crypto.randomUUID());
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  // Responsable (ADR-0161/0162): el ingreso firma con quien se elige en el combo (lista del Taller, la sede activa).
  const responsable = useResponsable();

  const insumo = insumos.find((i) => i.id === insumoId);
  // Lo escrito se lee con las reglas únicas (coma o punto decimal). Lo que no se entiende NO es cero: la hoja lo dice y no deja guardar (`ingresoListo`);
  // antes `Number("2,5")` daba NaN, luego 0, y el lote se abría a costo cero.
  const q = leerCantidad(cantidad) ?? 0;
  const costoLeido = numeroDeCostoUnitario(costo);
  const c = Number.isFinite(costoLeido) ? costoLeido : 0;
  const total = q * c;
  const cantidadIlegible = cantidad.trim() !== "" && leerCantidad(cantidad) === null;
  const costoIlegible = costoUnitarioIlegible(costo);
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
      p_origen: "saldo_inicial",
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    }), responsable.firma());
    responsable.despues(error);
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "ingresar el insumo", { confirmarAntesDeRepetir: true }));
      return;
    }
    avisar.exito(`${cantidadTexto(q, unidad)} de ${insumo.nombre} entraron`, { detalle: `Se abrió un lote a ${costoUnitarioTexto(c)} por ${UNIDADES_INSUMO[unidad].corta}.` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Saldo inicial" subtitulo="Lo que ya había en el estante antes de usar el sistema: no lleva proveedor ni deuda" variante="hoja" onClose={onClose}>
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
            <CampoTexto
              etiqueta={guia.etiqueta("cantidad", `Cantidad (${UNIDADES_INSUMO[unidad].corta})`)}
              inputMode="decimal"
              placeholder="0"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              tono={cantidadIlegible ? "error" : undefined}
              pie={cantidadIlegible ? CANTIDAD_ILEGIBLE : undefined}
            />
          </CampoGuiado>
          <CampoGuiado id="costo" guia={guia}>
            <CampoMonto
              etiqueta={guia.etiqueta("costo", `Costo por ${UNIDADES_INSUMO[unidad].corta}`)}
              pie={costoIlegible ? COSTO_UNITARIO_ILEGIBLE : "sin IGV"}
              tono={costoIlegible ? "error" : undefined}
              inputMode="decimal"
              placeholder="0.00"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
          </CampoGuiado>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={codigoLote} onChange={(e) => setCodigoLote(e.target.value)} maxLength={40} />
          <CampoTexto etiqueta="Documento" mono placeholder="Opcional" value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={40} />
        </div>
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
            <Boton textoCargando="Ingresando…" peso="primario" type="submit" cargando={cargando} confirma={guia} title={guia.frase ?? responsable.motivo ?? undefined} className={guia.claseConfirmar}>
              Abrir lote y sumar al saldo
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
