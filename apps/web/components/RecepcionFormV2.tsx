"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, campoSelect, botonPrimario } from "@/components/ui/Modal";

// Fase UI 1 (2026-09-11): pantalla nueva sobre la RPC `recibir_lote` de V2
// (`supabase/migrations/0003_funciones.sql:179`). No es una adaptación de
// `RecibirLoteForm.tsx` (V1) — ese componente depende de `contenedores`,
// `ordenes_compra` y `producciones_pendientes`, ninguno con equivalente V2
// todavía. Mismo patrón de escritura que `RegistrarVentaModal.tsx`: RPC
// directa desde el cliente + `traducirError()`, sin backend propio.
type Variante = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };
type Proveedor = { id: string; nombre: string };

type Linea = { varianteId: string; cantidad: number; costoUnitario: string };

export function RecepcionFormV2({
  ubicacionId,
  ubicacionEtiqueta,
  variantes,
  proveedores,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  variantes: Variante[];
  proveedores: Proveedor[];
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: 1, costoUnitario: "" }]);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ unidades: number } | null>(null);
  // Un token no aplica acá: `recibir_lote` no tiene idempotencia propia (a
  // diferencia de `registrar_venta`) porque un lote repetido es una decisión
  // de negocio distinta a una venta duplicada — el motivo real de reintentar
  // es "me olvidé una línea", que se resuelve recibiendo un lote NUEVO, no
  // reenviando el mismo.

  function agregarLinea() {
    setLineas((actual) => [...actual, { varianteId: variantes[0]?.varianteId ?? "", cantidad: 1, costoUnitario: "" }]);
  }

  function quitarLinea(i: number) {
    setLineas((actual) => actual.filter((_, n) => n !== i));
  }

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    setLineas((actual) => actual.map((l, n) => (n === i ? { ...l, ...cambio } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validas = lineas.filter((l) => l.varianteId && l.cantidad > 0);
    if (validas.length === 0) {
      avisar.error("Agrega al menos una línea con una prenda y una cantidad mayor que cero.", { enfocar: "recepcion-linea-0" });
      return;
    }
    if (!proveedorId) {
      avisar.error("Elige un proveedor.", { enfocar: "recepcion-proveedor" });
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("recibir_lote", {
      p_ubicacion_id: ubicacionId,
      p_proveedor_id: proveedorId,
      p_items: validas.map((l) => ({
        variante_id: l.varianteId,
        cantidad: l.cantidad,
        ...(l.costoUnitario ? { costo_unitario: Number(l.costoUnitario) } : {}),
      })),
      p_numero_guia: numeroGuia || undefined,
    });

    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "recibir el lote"));
      return;
    }
    const unidades = validas.reduce((acc, l) => acc + l.cantidad, 0);
    avisar.exito(`Lote recibido · ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`, { detalle: "Ya suman al stock." });
    setOk({ unidades });
    router.refresh();
  }

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Lote recibido</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">Ya suman al stock de {ubicacionEtiqueta}.</p>
        <button
          type="button"
          onClick={() => {
            setOk(null);
            setLineas([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: 1, costoUnitario: "" }]);
            setNumeroGuia("");
          }}
          className={`${botonPrimario} w-full`}
        >
          Recibir otro lote
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-cayla space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="recepcion-proveedor">
            Proveedor
          </label>
          <select
            id="recepcion-proveedor"
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className={campoSelect}
          >
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="recepcion-guia">
            Número de guía (opcional)
          </label>
          <input
            id="recepcion-guia"
            value={numeroGuia}
            onChange={(e) => setNumeroGuia(e.target.value)}
            className={campoTexto}
          />
        </div>
      </div>

      <div className="space-y-3">
        <p className={campoEtiqueta}>Prendas recibidas</p>
        {lineas.map((l, i) => (
          <div key={i} id={`recepcion-linea-${i}`} className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Prenda"
              value={l.varianteId}
              onChange={(e) => actualizarLinea(i, { varianteId: e.target.value })}
              className={`${campoSelect} min-w-[14rem] flex-1`}
            >
              {variantes.map((v) => (
                <option key={v.varianteId} value={v.varianteId}>
                  {v.referencia} · {v.sku} {[v.talla, v.color].filter(Boolean).join("/")}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              aria-label="Cantidad"
              value={l.cantidad}
              onChange={(e) => actualizarLinea(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm text-tinta outline-none focus:border-rojo"
            />
            <input
              type="number"
              min={0}
              step="0.10"
              placeholder="Costo (opc.)"
              aria-label="Costo unitario"
              value={l.costoUnitario}
              onChange={(e) => actualizarLinea(i, { costoUnitario: e.target.value })}
              className="w-28 border-b border-tinta/20 bg-transparent px-1 py-2 text-right text-sm text-tinta outline-none placeholder:text-tinta/40 focus:border-rojo"
            />
            {lineas.length > 1 && (
              <button type="button" onClick={() => quitarLinea(i)} className="text-xs text-rojo">
                Quitar
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarLinea} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar línea
        </button>
      </div>


      <button type="submit" disabled={loading} className={botonPrimario}>
        {loading ? "Registrando…" : `Recibir en ${ubicacionEtiqueta}`}
      </button>
    </form>
  );
}
