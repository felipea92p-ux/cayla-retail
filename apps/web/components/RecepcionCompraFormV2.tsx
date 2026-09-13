"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Boton, Campo, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { campoEtiqueta } from "@/components/ui/Modal";
import { fechaCorta, type CompraResumen, type LineaCompra } from "@/lib/compras-reglas";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";

// (check) · Documento · Proveedor y emisión · Pendiente
const PLANTILLA_FACTURAS = "sm:grid-cols-[1.25rem_7rem_1fr_10rem]";

// Recibir mercadería contra facturas (ADR-0035). Una guía = una recepción,
// que puede cubrir varias facturas del MISMO proveedor. Cada línea de
// factura se precarga con lo que falta por recibir; si la factura vino
// agrupada ("Blusa Lino x 24", sin talla/color), acá se reparte por
// variante. La regla dura —nunca recibir más de lo facturado— la aplica la
// RPC `recibir_compras`; el formulario solo la anticipa para no mandar algo
// que va a fallar.
type Variante = { varianteId: string; sku: string; talla: string | null; color: string | null; productoId: string };
type Ubicacion = { id: string; nombre: string };

// Por línea de factura: cuántas unidades de cada variante llegan.
type Reparto = Record<string /* lineaId */, Record<string /* varianteId */, number>>;

export function RecepcionCompraFormV2({
  compras,
  lineas,
  variantes,
  ubicaciones,
  ubicacionInicialId,
  compraInicialId,
}: {
  compras: CompraResumen[];
  lineas: LineaCompra[];
  variantes: Variante[];
  ubicaciones: Ubicacion[];
  ubicacionInicialId: string;
  compraInicialId: string | null;
}) {
  const router = useRouter();
  const [seleccionadas, setSeleccionadas] = useState<string[]>(
    compraInicialId && compras.some((c) => c.id === compraInicialId) ? [compraInicialId] : []
  );
  const [reparto, setReparto] = useState<Reparto>({});
  const [numeroGuia, setNumeroGuia] = useState("");
  const [nota, setNota] = useState("");
  const [ubicacionId, setUbicacionId] = useState(ubicacionInicialId || ubicaciones[0]?.id || "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ unidades: number; facturas: number } | null>(null);

  const variantesPorProducto = useMemo(() => {
    const m = new Map<string, Variante[]>();
    for (const v of variantes) m.set(v.productoId, [...(m.get(v.productoId) ?? []), v]);
    return m;
  }, [variantes]);

  const proveedorActivo = seleccionadas.length ? compras.find((c) => c.id === seleccionadas[0])?.proveedorId ?? null : null;
  const lineasActivas = lineas.filter((l) => seleccionadas.includes(l.compraId) && l.pendiente > 0);

  function cantidadLinea(l: LineaCompra): number {
    return Object.values(reparto[l.id] ?? {}).reduce((a, n) => a + n, 0);
  }

  function alternarFactura(c: CompraResumen) {
    setError(null);
    if (seleccionadas.includes(c.id)) {
      setSeleccionadas((s) => s.filter((id) => id !== c.id));
      setReparto((r) => {
        const copia = { ...r };
        lineas.filter((l) => l.compraId === c.id).forEach((l) => delete copia[l.id]);
        return copia;
      });
      return;
    }
    setSeleccionadas((s) => [...s, c.id]);
    // Precarga: lo que falta de cada línea. Las detalladas van a su variante;
    // las agrupadas quedan en cero para que quien recibe reparta lo que ve.
    setReparto((r) => {
      const copia = { ...r };
      for (const l of lineas.filter((x) => x.compraId === c.id && x.pendiente > 0)) {
        copia[l.id] = l.varianteId ? { [l.varianteId]: l.pendiente } : {};
      }
      return copia;
    });
  }

  function fijar(lineaId: string, varianteId: string, valor: number) {
    setReparto((r) => ({ ...r, [lineaId]: { ...(r[lineaId] ?? {}), [varianteId]: Math.max(0, Math.floor(valor) || 0) } }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const items = lineasActivas.flatMap((l) =>
      Object.entries(reparto[l.id] ?? {})
        .filter(([, n]) => n > 0)
        .map(([varianteId, n]) => ({ compra_item_id: l.id, variante_id: varianteId, cantidad: n }))
    );
    if (seleccionadas.length === 0) return setError("Elige al menos una factura.");
    if (items.length === 0) return setError("Indica cuántas unidades llegaron — al menos una línea con cantidad.");
    const excedida = lineasActivas.find((l) => cantidadLinea(l) > l.pendiente);
    if (excedida) return setError(`${excedida.referencia}: se intenta recibir ${cantidadLinea(excedida)} pero solo faltan ${excedida.pendiente}.`);
    if (!ubicacionId) return setError("Elige a qué ubicación entra la mercadería.");

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("recibir_compras", {
      p_ubicacion_id: ubicacionId,
      p_items: items,
      ...(numeroGuia.trim() ? { p_numero_guia: numeroGuia.trim() } : {}),
      ...(nota.trim() ? { p_nota: nota.trim() } : {}),
    });
    setLoading(false);
    if (error) {
      setError(traducirError(error, "recibir la mercadería"));
      return;
    }
    setOk({ unidades: items.reduce((a, i) => a + i.cantidad, 0), facturas: seleccionadas.length });
    router.refresh();
  }

  const ubicacionNombre = ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "";

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Mercadería recibida</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">
          Ya suman al stock de {ubicacionNombre}, contra {ok.facturas === 1 ? "una factura" : `${ok.facturas} facturas`}.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Boton
            peso="discreto"
            onClick={() => {
              setOk(null);
              setSeleccionadas([]);
              setReparto({});
              setNumeroGuia("");
              setNota("");
            }}
          >
            Recibir otra guía
          </Boton>
          <Link href="/compras" className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema hover:bg-rojo">
            Ver facturas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ---------- 1. facturas ---------- */}
      <section className="space-y-2">
        <p className={campoEtiqueta}>1 · ¿De qué facturas llega esta guía?</p>
        <Tabla>
          <Encabezado plantilla={PLANTILLA_FACTURAS} columnas={[{ titulo: "" }, { titulo: "Documento" }, { titulo: "Proveedor · Emitida" }, { titulo: "Pendiente", alinear: "der" }]} />
          {compras.map((c) => {
            const marcada = seleccionadas.includes(c.id);
            const bloqueada = proveedorActivo !== null && c.proveedorId !== proveedorActivo;
            return (
              <label
                key={c.id}
                className={fila(
                  PLANTILLA_FACTURAS,
                  `cursor-pointer transition-colors ${bloqueada ? "cursor-not-allowed opacity-40" : marcada ? "bg-rojo/[0.04]" : "hover:bg-tinta/[0.03]"}`
                )}
              >
                <input type="checkbox" checked={marcada} disabled={bloqueada} onChange={() => alternarFactura(c)} className="accent-rojo" />
                <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{c.documento}</span>
                <span className={celda("izq", "text-sm text-tinta")}>
                  {c.proveedorNombre} <span className="text-xs text-tinta/65">· {fechaCorta(c.fechaEmision)}</span>
                </span>
                <span className={celda("der", `label-cayla text-[11px] ${c.estadoRecepcion === "parcial" ? "text-ambar" : "text-tinta/65"}`)}>
                  {c.facturadoCantidad - c.recibidoCantidad} de {c.facturadoCantidad}
                </span>
              </label>
            );
          })}
        </Tabla>
        {proveedorActivo && (
          <p className="text-xs text-tinta/55">Una guía cubre facturas de un solo proveedor — las de otros quedan atenuadas.</p>
        )}
      </section>

      {/* ---------- 2. qué llegó ---------- */}
      {lineasActivas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className={campoEtiqueta}>2 · ¿Qué llegó?</p>
            <p className="text-xs text-tinta/55">Precargado con lo que falta. Ajusta si llegó menos.</p>
          </div>
          {seleccionadas.map((compraId) => {
            const c = compras.find((x) => x.id === compraId);
            const propias = lineasActivas.filter((l) => l.compraId === compraId);
            if (!c || propias.length === 0) return null;
            return (
              <div key={compraId} className="card-cayla divide-y divide-tinta/10">
                <p className="label-cayla px-5 py-2.5 text-[11px] text-tinta/65">{c.documento}</p>
                {propias.map((l) => {
                  const recibiendo = cantidadLinea(l);
                  const excede = recibiendo > l.pendiente;
                  return (
                    <div key={l.id} className="space-y-2 px-5 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="min-w-0 flex-1 text-sm text-tinta">
                          {l.referencia}
                          {l.varianteId ? (
                            <span className="text-tinta/65"> {[l.talla, l.color].filter(Boolean).join(" / ") || l.sku}</span>
                          ) : (
                            <span className="text-tinta/65"> · sin desglose, reparte por talla y color</span>
                          )}
                          {l.descripcion && <span className="block text-xs text-tinta/55">{l.descripcion}</span>}
                        </span>
                        <span className={`label-cayla shrink-0 text-[11px] ${excede ? "text-rojo" : recibiendo === l.pendiente ? "text-tinta" : "text-tinta/65"}`}>
                          {recibiendo} de {l.pendiente} pendientes
                        </span>
                      </div>

                      {l.varianteId ? (
                        <input
                          type="number"
                          min={0}
                          max={l.pendiente}
                          aria-label={`Cantidad recibida de ${l.referencia}`}
                          value={reparto[l.id]?.[l.varianteId] ?? 0}
                          onChange={(e) => fijar(l.id, l.varianteId!, Number(e.target.value))}
                          className={`w-24 border-b bg-transparent px-1 py-1.5 text-center text-sm tabular-nums text-tinta outline-none focus:border-rojo ${excede ? "border-rojo" : "border-tinta/20"}`}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(variantesPorProducto.get(l.productoId) ?? []).map((v) => (
                            <label key={v.varianteId} className="flex items-center gap-2 rounded-md border border-tinta/15 px-2.5 py-1.5">
                              <span className="text-xs text-tinta/75">{[v.talla, v.color].filter(Boolean).join(" / ") || v.sku}</span>
                              <input
                                type="number"
                                min={0}
                                aria-label={`${l.referencia} ${v.talla ?? ""} ${v.color ?? ""}`}
                                value={reparto[l.id]?.[v.varianteId] ?? 0}
                                onChange={(e) => fijar(l.id, v.varianteId, Number(e.target.value))}
                                className="w-14 border-b border-tinta/20 bg-transparent px-1 py-0.5 text-center text-sm tabular-nums text-tinta outline-none focus:border-rojo"
                              />
                            </label>
                          ))}
                          {(variantesPorProducto.get(l.productoId) ?? []).length === 0 && (
                            <p className="text-xs text-rojo">Este producto no tiene variantes activas en el catálogo — no se puede recibir hasta crearlas.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      {/* ---------- 3. guía y destino ---------- */}
      {seleccionadas.length > 0 && (
        <section className="card-cayla space-y-4 p-5">
          <p className={campoEtiqueta}>3 · Guía y destino</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoTexto etiqueta="Número de guía" mono value={numeroGuia} onChange={(e) => setNumeroGuia(e.target.value)} placeholder="T001-000123" autoComplete="off" />
            {ubicaciones.length > 1 ? (
              <CampoSelectNativo etiqueta="Entra a" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </CampoSelectNativo>
            ) : (
              <Campo etiqueta="Entra a">
                <p className="py-2 text-sm text-tinta">{ubicacionNombre}</p>
              </Campo>
            )}
            <CampoTexto etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Llegó una caja abierta…" />
          </div>
        </section>
      )}

      {error && <p className="text-sm text-rojo">{error}</p>}

      {seleccionadas.length > 0 && (
        <div className="flex justify-end">
          <Boton type="submit" peso="primario" cargando={loading}>
            Recibir en {ubicacionNombre}
          </Boton>
        </div>
      )}
    </form>
  );
}
