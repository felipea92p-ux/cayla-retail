"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { soles } from "@/lib/compras-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoMonto, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { TIPOS_INSUMO, UNIDADES_INSUMO, cantidadTexto, type TipoInsumo, type UnidadInsumo } from "@/lib/insumos-reglas";
import type { InsumoVista } from "@/lib/insumos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Dos formularios de Insumos (ADR-0133, F3). Los dos son solo de líder: uno crea el catálogo, el otro mete dinero
// (el costo del lote). Con `<Modal>` del sistema (ADR-0136): no se define otra animación ni otro overlay.

/** Unidad que se propone según el tipo: la tela se compra por metro; un avío casi siempre por unidad. */
const UNIDAD_SUGERIDA: Record<TipoInsumo, UnidadInsumo> = { tela: "metro", avio: "unidad" };

export function NuevoInsumoModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoInsumo>("tela");
  const [unidad, setUnidad] = useState<UnidadInsumo>("metro");
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [merma, setMerma] = useState("");
  const [minimo, setMinimo] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);

  function cambiarTipo(t: TipoInsumo) {
    setTipo(t);
    setUnidad(UNIDAD_SUGERIDA[t]);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const mermaPct = merma.trim() === "" ? 0 : Number(merma) / 100;
    if (!codigo.trim() || !nombre.trim()) {
      avisar.error("Ponle un código y un nombre al insumo.");
      return;
    }
    if (!(mermaPct >= 0 && mermaPct < 0.5)) {
      avisar.error("La merma va de 0 % a menos de 50 %.");
      return;
    }
    setCargando(true);
    const { error } = await createClient()
      .from("insumos")
      .insert({
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        tipo,
        unidad_medida: unidad,
        merma_pct: mermaPct,
        stock_minimo: minimo.trim() === "" ? null : Number(minimo),
        nota: nota.trim() || null,
      });
    setCargando(false);
    if (error) {
      // 23505 = código repetido: la base lo impide con su restricción única.
      avisar.error(error.code === "23505" ? "Ya hay un insumo con ese código." : traducirError(error, "crear el insumo"));
      return;
    }
    avisar.exito(`${nombre.trim()} entró al catálogo`, { detalle: "Ahora puedes ingresar su primer lote." });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Nuevo insumo" subtitulo="Tela o avío que el Taller compra" onClose={onClose} ancho="max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <CampoSelectNativo etiqueta="Tipo" value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoInsumo)}>
            {TIPOS_INSUMO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </CampoSelectNativo>
          <CampoSelectNativo etiqueta="Se mide en" value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadInsumo)}>
            {Object.entries(UNIDADES_INSUMO).map(([k, u]) => (
              <option key={k} value={k}>
                {u.larga}
              </option>
            ))}
          </CampoSelectNativo>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <CampoTexto etiqueta="Código" mono placeholder="LIN-01" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} />
          <CampoTexto etiqueta="Nombre" placeholder="Lino lavado crudo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto
            etiqueta="Mínimo"
            pie={`Avisa cuando quede menos de esto (${UNIDADES_INSUMO[unidad].corta})`}
            inputMode="decimal"
            placeholder="Sin mínimo"
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
          />
          <CampoTexto etiqueta="Merma al cortar (%)" pie="Lo que se pierde de cada corte" inputMode="decimal" placeholder="0" value={merma} onChange={(e) => setMerma(e.target.value)} />
        </div>
        <CampoTexto etiqueta="Nota" placeholder="Ancho, composición, proveedor habitual…" value={nota} onChange={(e) => setNota(e.target.value)} />
        <Boton peso="primario" type="submit" cargando={cargando} className="w-full">
          {cargando ? "Guardando…" : "Agregar al catálogo"}
        </Boton>
      </form>
    </Modal>
  );
}

export function IngresarInsumoModal({ insumos, insumoInicialId, tallerId, onClose }: { insumos: InsumoVista[]; insumoInicialId: string | null; tallerId: string; onClose: () => void }) {
  const router = useRouter();
  const [insumoId, setInsumoId] = useState(insumoInicialId ?? insumos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [codigoLote, setCodigoLote] = useState("");
  const [documento, setDocumento] = useState("");
  const [origen, setOrigen] = useState<"compra" | "saldo_inicial">("compra");
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
        <CampoSelectNativo etiqueta="¿Qué llegó?" value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
          {insumos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre} · hay {cantidadTexto(i.saldo, i.unidad)}
            </option>
          ))}
        </CampoSelectNativo>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta={`Cantidad (${UNIDADES_INSUMO[unidad].corta})`} inputMode="decimal" placeholder="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          <CampoMonto etiqueta={`Costo por ${UNIDADES_INSUMO[unidad].corta}`} pie="sin IGV" inputMode="decimal" placeholder="0.00" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto etiqueta="Código de lote" mono placeholder="Opcional" value={codigoLote} onChange={(e) => setCodigoLote(e.target.value)} />
          <CampoTexto etiqueta="Documento" mono placeholder="F001-0000" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </div>
        <CampoSelectNativo
          etiqueta="Origen"
          pie={origen === "saldo_inicial" ? "Lo que ya había en el estante antes de usar el sistema" : "Una compra que ya llegó"}
          value={origen}
          onChange={(e) => setOrigen(e.target.value as "compra" | "saldo_inicial")}
        >
          <option value="compra">Compra</option>
          <option value="saldo_inicial">Saldo inicial</option>
        </CampoSelectNativo>
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
