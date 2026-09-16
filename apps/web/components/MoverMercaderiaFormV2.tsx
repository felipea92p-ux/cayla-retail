"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, campoSelect, botonPrimario } from "@/components/ui/Modal";

// Fase UI 1.1 (2026-09-12): sobre la RPC `transferir` de V2
// (`supabase/migrations/0003_funciones.sql:286`), pedida por Felipe tras ver
// que "+Nuevo" solo ofrecía Recepción. Mismo patrón que `RecepcionFormV2.tsx`.
//
// El origen NO es un campo del formulario: es siempre la ubicación de quien
// está parado ahí (`fn_puede_operar_ubicacion` en el RPC lo exige igual — un
// integrante no puede mover DESDE una sede que no es la suya). El destino
// viene exclusivamente de `retail.ubicaciones` vía props — nunca texto libre
// — así que un traslado nunca puede apuntar a un lugar que no existe en la
// tabla. La cantidad de cada línea se limita al stock real que ya trajo el
// servidor: no se puede mover lo que no hay, la UI lo impide antes de que el
// RPC tenga que rechazarlo.
type VarianteConStock = {
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  cantidad: number;
};
type Ubicacion = { id: string; nombre: string };
type Linea = { varianteId: string; cantidad: number };

export function MoverMercaderiaFormV2({
  origenId,
  origenEtiqueta,
  destinos,
  variantes,
}: {
  origenId: string;
  origenEtiqueta: string;
  destinos: Ubicacion[];
  variantes: VarianteConStock[];
}) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState(destinos[0]?.id ?? "");
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: 1 }]);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ unidades: number; destino: string } | null>(null);

  function stockDe(varianteId: string): number {
    return variantes.find((v) => v.varianteId === varianteId)?.cantidad ?? 0;
  }

  function agregarLinea() {
    setLineas((actual) => [...actual, { varianteId: variantes[0]?.varianteId ?? "", cantidad: 1 }]);
  }

  function quitarLinea(i: number) {
    setLineas((actual) => actual.filter((_, n) => n !== i));
  }

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    setLineas((actual) =>
      actual.map((l, n) => {
        if (n !== i) return l;
        const siguiente = { ...l, ...cambio };
        // El tope de esta línea no es el stock total de la variante: hay que
        // restar lo que OTRAS líneas del mismo formulario ya le piden a esa
        // misma variante. Sin esto, la misma prenda con 10 unidades podía
        // pedirse 10+10 en dos líneas — `transferir()` rechaza la segunda con
        // "Stock insuficiente", pero el formulario nunca avisó por qué.
        const usadoEnOtras = actual.reduce(
          (acc, otra, m) => (m !== i && otra.varianteId === siguiente.varianteId ? acc + otra.cantidad : acc),
          0
        );
        const tope = Math.max(0, stockDe(siguiente.varianteId) - usadoEnOtras);
        return { ...siguiente, cantidad: Math.max(1, Math.min(siguiente.cantidad, tope || 1)) };
      })
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destinoId) {
      avisar.error("Elige a qué ubicación se mueve la mercadería.", { enfocar: "mover-destino" });
      return;
    }
    const validas = lineas.filter((l) => l.varianteId && l.cantidad > 0);
    if (validas.length === 0) {
      avisar.error("Agrega al menos una línea con una prenda y una cantidad mayor que cero.", { enfocar: "mover-linea-0" });
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("transferir", {
      p_ubicacion_origen_id: origenId,
      p_ubicacion_destino_id: destinoId,
      p_items: validas.map((l) => ({ variante_id: l.varianteId, cantidad: l.cantidad })),
      p_nota: nota || undefined,
    });

    setLoading(false);
    if (error) {
      avisar.error(traducirError(error, "mover la mercadería"));
      return;
    }
    const unidades = validas.reduce((acc, l) => acc + l.cantidad, 0);
    const destino = destinos.find((d) => d.id === destinoId)?.nombre ?? "";
    avisar.exito(`${unidades} ${unidades === 1 ? "unidad movida" : "unidades movidas"} a ${destino}`, { detalle: "El stock de las dos ubicaciones ya está actualizado." });
    setOk({ unidades, destino });
    router.refresh();
  }

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Mercadería movida</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">
          De {origenEtiqueta} a {ok.destino}.
        </p>
        <button
          type="button"
          onClick={() => {
            setOk(null);
            setLineas([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: 1 }]);
            setNota("");
          }}
          className={`${botonPrimario} w-full`}
        >
          Mover otro lote
        </button>
      </div>
    );
  }

  if (variantes.length === 0) {
    return (
      <p className="card-cayla p-5 text-sm text-tinta/75">{origenEtiqueta} no tiene stock disponible para mover.</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-cayla space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className={campoEtiqueta}>Desde</span>
          <p className="w-full border-b border-tinta/10 px-1 py-2 text-sm text-tinta/75">{origenEtiqueta}</p>
        </div>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-destino">
            Hacia
          </label>
          <select
            id="mover-destino"
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            className={campoSelect}
          >
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={campoEtiqueta} htmlFor="mover-nota">
          Nota (opcional)
        </label>
        <input id="mover-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={campoTexto} />
      </div>

      <div className="space-y-3">
        <p className={campoEtiqueta}>Prendas a mover</p>
        {lineas.map((l, i) => {
          const tope = stockDe(l.varianteId);
          return (
            <div key={i} id={`mover-linea-${i}`} className="flex flex-wrap items-end gap-2">
              <select
                aria-label="Prenda"
                value={l.varianteId}
                onChange={(e) => actualizarLinea(i, { varianteId: e.target.value })}
                className={`${campoSelect} min-w-[14rem] flex-1`}
              >
                {variantes.map((v) => (
                  <option key={v.varianteId} value={v.varianteId}>
                    {v.referencia} · {v.sku} {[v.talla, v.color].filter(Boolean).join("/")} — stock {v.cantidad}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={tope}
                aria-label="Cantidad"
                value={l.cantidad}
                onChange={(e) => actualizarLinea(i, { cantidad: Number(e.target.value) || 1 })}
                className="w-20 border-b border-tinta/20 bg-transparent px-1 py-2 text-center text-sm text-tinta outline-none focus:border-rojo"
              />
              <span className="text-xs text-tinta/55">de {tope}</span>
              {lineas.length > 1 && (
                <button type="button" onClick={() => quitarLinea(i)} className="text-xs text-rojo">
                  Quitar
                </button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={agregarLinea} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
          + Agregar línea
        </button>
      </div>


      <button type="submit" disabled={loading} className={botonPrimario}>
        {loading ? "Moviendo…" : `Mover hacia ${destinos.find((d) => d.id === destinoId)?.nombre ?? "…"}`}
      </button>
    </form>
  );
}
