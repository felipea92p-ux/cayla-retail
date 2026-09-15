"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoSelectNativo, CampoTexto, Segmentado } from "@/components/ui/campos";
import { Modal, campoEtiqueta, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import type { ModeloProducible } from "@/lib/produccion";

// Abrir una orden (abrir_produccion). Lo que se decide acá: qué modelo, cuántas
// por talla-color y el costo ESTIMADO. El costo real se corrige al cerrar.
//
// El token de idempotencia nace con el formulario (useRef): si el Taller
// pierde la red a mitad del clic y reintenta, la base devuelve la misma orden
// en vez de abrir dos. Mismo mecanismo que `registrar_venta` (p_token).

type Tipo = "produccion" | "muestra";
const TIPOS = [
  { valor: "produccion", texto: "Producción" },
  { valor: "muestra", texto: "Muestra" },
] as const;

function soles(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function NuevaOrdenProduccionForm({
  tallerId,
  modelos,
  onClose,
}: {
  tallerId: string;
  modelos: ModeloProducible[];
  onClose: () => void;
}) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());
  const [tipo, setTipo] = useState<Tipo>("produccion");
  const [productoId, setProductoId] = useState(modelos[0]?.productoId ?? "");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [tela, setTela] = useState("");
  const [avios, setAvios] = useState("");
  const [maquila, setMaquila] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);

  const modelo = useMemo(() => modelos.find((m) => m.productoId === productoId) ?? null, [modelos, productoId]);

  // Las variantes se agrupan por color: es como el Taller arma la curva de
  // tallas sobre la mesa — un color, todas sus tallas, y recién el siguiente.
  const porColor = useMemo(() => {
    const grupos = new Map<string, ModeloProducible["variantes"]>();
    for (const v of modelo?.variantes ?? []) {
      const clave = v.color ?? "Sin color";
      grupos.set(clave, [...(grupos.get(clave) ?? []), v]);
    }
    return [...grupos.entries()];
  }, [modelo]);

  const lineas = (modelo?.variantes ?? [])
    .map((v) => ({ variante_id: v.varianteId, cantidad: Math.floor(Number(cantidades[v.varianteId]) || 0) }))
    .filter((l) => l.cantidad > 0);
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);
  const costoTotal = (Number(tela) || 0) + (Number(avios) || 0) + (Number(maquila) || 0);
  const unitario = total > 0 ? costoTotal / total : 0;
  const precio = Math.max(0, ...(modelo?.variantes ?? []).map((v) => v.precio));

  function cambiarModelo(id: string) {
    setProductoId(id);
    setCantidades({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modelo) {
      avisar.error("Elige el modelo que se va a producir.");
      return;
    }
    if (lineas.length === 0) {
      avisar.error("Indica cuántas prendas de al menos una talla o color.");
      return;
    }
    setCargando(true);
    const { error } = await createClient().rpc("abrir_produccion", {
      p_ubicacion_id: tallerId,
      p_producto_id: modelo.productoId,
      p_lineas: lineas,
      p_costo_tela: Number(tela) || 0,
      p_costo_avios: Number(avios) || 0,
      p_costo_maquila: Number(maquila) || 0,
      p_es_muestra: tipo === "muestra",
      p_fecha_entrega: fechaEntrega || undefined,
      p_nota: nota.trim() || undefined,
      p_token: token.current,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "abrir la orden"));
      return;
    }
    avisar.exito(`Orden de ${modelo.referencia} abierta`, { detalle: `${total} prendas · ${tipo === "muestra" ? "muestra" : "producción"}` });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo="Nueva orden de producción" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmentado<Tipo>
            etiqueta="Tipo"
            valor={tipo}
            onValor={setTipo}
            opciones={TIPOS}
            pie={tipo === "muestra" ? "Desarrollar el modelo: patrón y prototipo. No entra al stock." : "Fabricar el lote. Al cerrar entra al stock del Taller."}
          />
          <CampoSelectNativo etiqueta="Modelo" value={productoId} onChange={(e) => cambiarModelo(e.target.value)}>
            {modelos.map((m) => (
              <option key={m.productoId} value={m.productoId}>
                {m.referencia}
                {m.categoria ? ` · ${m.categoria}` : ""}
              </option>
            ))}
          </CampoSelectNativo>
        </div>

        {modelo && (
          <div className="space-y-3">
            <span className={campoEtiqueta}>Cuántas por talla y color</span>
            {porColor.map(([color, variantes]) => (
              <div key={color} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs text-tinta/70">
                  {variantes[0]?.colorHex && (
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/15" style={{ background: variantes[0].colorHex }} />
                  )}
                  {color}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {variantes.map((v) => {
                    const valor = cantidades[v.varianteId] ?? "";
                    const activa = (Number(valor) || 0) > 0;
                    return (
                      <label
                        key={v.varianteId}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                          activa ? "border-rojo/60 bg-rojo/5" : "border-tinta/15"
                        }`}
                        title={v.sku}
                      >
                        <span className="w-10 text-tinta/80">{v.talla ?? "Única"}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="0"
                          value={valor}
                          onChange={(e) => setCantidades((c) => ({ ...c, [v.varianteId]: e.target.value }))}
                          className="w-14 border-b border-tinta/20 bg-transparent px-1 py-0.5 text-right text-sm text-tinta outline-none placeholder:text-tinta/30 focus:border-rojo"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <CampoMonto etiqueta="Tela" ayuda="De toda la corrida" inputMode="decimal" placeholder="0.00" value={tela} onChange={(e) => setTela(e.target.value)} />
          <CampoMonto etiqueta="Avíos" ayuda="Botones, cierres, etiquetas" inputMode="decimal" placeholder="0.00" value={avios} onChange={(e) => setAvios(e.target.value)} />
          <CampoMonto etiqueta="Maquila" ayuda="Lo tercerizado" inputMode="decimal" placeholder="0.00" value={maquila} onChange={(e) => setMaquila(e.target.value)} />
        </div>

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">
            {total} prendas · costo estimado {soles(costoTotal)}
            {precio > 0 && ` · se vende a ${soles(precio)}`}
          </span>
          <span className="font-display text-lg text-tinta">{soles(unitario)} / prenda</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Fecha de entrega" ayuda="Opcional" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          <CampoTexto etiqueta="Nota" ayuda="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Tela, cliente, urgencia…" />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={botonCancelar}>
            Cancelar
          </button>
          <button type="submit" disabled={cargando || !modelo} className={botonPrimario}>
            {cargando ? "Abriendo…" : "Abrir orden"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
