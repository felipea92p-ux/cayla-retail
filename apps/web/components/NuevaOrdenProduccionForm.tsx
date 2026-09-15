"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoSelectNativo, CampoTexto, Segmentado } from "@/components/ui/campos";
import { Modal, campoEtiqueta, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import type { ModeloProducible, VarianteDeModelo } from "@/lib/produccion";
import { compararTallas } from "@/lib/tallas";

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

  // Matriz color × talla, como la grilla de variantes de Shopify: una fila
  // por color, una columna por talla, y en cada celda cuántas van. Solo
  // existen las celdas que el catálogo ya tiene como variante — Producción
  // no inventa tallas ni colores (decisión con Felipe, 2026-09-15: las
  // variantes nacen en Productos, con su SKU y su precio, nunca al vuelo desde
  // una orden; en V1 sí pasaba y dejaba colores duplicados y prendas sin precio).
  const matriz = useMemo(() => {
    const variantes = modelo?.variantes ?? [];
    const tallas = [...new Set(variantes.map((v) => v.talla ?? "Única"))].sort(compararTallas);
    const filas = new Map<string, { hex: string | null; celdas: Map<string, VarianteDeModelo> }>();
    for (const v of variantes) {
      const color = v.color ?? "Sin color";
      const fila = filas.get(color) ?? { hex: v.colorHex, celdas: new Map() };
      fila.celdas.set(v.talla ?? "Única", v);
      filas.set(color, fila);
    }
    return { tallas, filas: [...filas.entries()] };
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
          <div className="space-y-2">
            <span className={campoEtiqueta}>Cuántas por talla y color</span>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-tinta/65">
                    <th className="pb-1.5 pr-3 text-left font-normal">Color</th>
                    {matriz.tallas.map((t) => (
                      <th key={t} className="label-cayla pb-1.5 text-center text-[11px] font-normal">
                        {t}
                      </th>
                    ))}
                    <th className="label-cayla pb-1.5 pl-3 text-right text-[11px] font-normal">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tinta/10">
                  {matriz.filas.map(([color, fila]) => {
                    const totalFila = [...fila.celdas.values()].reduce((s, v) => s + (Math.floor(Number(cantidades[v.varianteId])) || 0), 0);
                    return (
                      <tr key={color}>
                        <td className="py-1.5 pr-3 text-tinta/80">
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            {fila.hex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/15" style={{ background: fila.hex }} />}
                            {color}
                          </span>
                        </td>
                        {matriz.tallas.map((t) => {
                          const v = fila.celdas.get(t);
                          if (!v) {
                            // El catálogo no tiene esta combinación: no hay variante a la que sumarle stock.
                            return (
                              <td key={t} className="py-1.5 text-center text-tinta/30" title="No existe esta talla en este color">
                                —
                              </td>
                            );
                          }
                          const valor = cantidades[v.varianteId] ?? "";
                          const activa = (Number(valor) || 0) > 0;
                          return (
                            <td key={t} className="px-0.5 py-1.5 text-center">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                placeholder="0"
                                aria-label={`${color} ${t}`}
                                title={v.sku}
                                value={valor}
                                onChange={(e) => setCantidades((c) => ({ ...c, [v.varianteId]: e.target.value }))}
                                className={`w-14 rounded-md border bg-transparent px-1.5 py-1 text-center text-sm tabular-nums text-tinta outline-none transition-colors placeholder:text-tinta/30 focus:border-rojo ${
                                  activa ? "border-rojo/60 bg-rojo/5" : "border-tinta/15"
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-3 text-right tabular-nums text-tinta/80">{totalFila > 0 ? totalFila : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-tinta/65">
              ¿Falta una talla o un color? Se agrega en{" "}
              <Link href="/productos" className="underline decoration-tinta/30 underline-offset-2 hover:text-rojo">
                Productos
              </Link>
              , no desde la orden.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <CampoMonto etiqueta="Tela" pie="De toda la corrida" inputMode="decimal" placeholder="0.00" value={tela} onChange={(e) => setTela(e.target.value)} />
          <CampoMonto etiqueta="Avíos" pie="Botones, cierres, etiquetas e hilo" inputMode="decimal" placeholder="0.00" value={avios} onChange={(e) => setAvios(e.target.value)} />
          <CampoMonto etiqueta="Maquila" pie="Lo que se manda afuera: planchado, corte, etc." inputMode="decimal" placeholder="0.00" value={maquila} onChange={(e) => setMaquila(e.target.value)} />
        </div>

        <div className="flex items-baseline justify-between rounded-md bg-sand/60 px-3 py-2 text-sm">
          <span className="text-tinta/70">
            {total} prendas · costo estimado {soles(costoTotal)}
            {precio > 0 && ` · se vende a ${soles(precio)}`}
          </span>
          <span className="font-display text-lg text-tinta">{soles(unitario)} / prenda</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto etiqueta="Fecha de entrega" pie="Opcional" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          <CampoTexto etiqueta="Nota" pie="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Tela, cliente, urgencia…" />
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
