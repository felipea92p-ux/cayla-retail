"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { campoEtiqueta, campoTexto, campoSelect, botonPrimario } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

// Fase UI 1.1 (2026-09-12): sobre la RPC `transferir` de V2
// (`supabase/migrations/0003_funciones.sql:286`), pedida por Felipe tras ver
// que "+Nuevo" solo ofrecía Recepción. Mismo patrón que `RecepcionFormV2.tsx`.
//
// Traslado en dos fases (2026-09-16, `iniciar_traslado`,
// `20260916150000_traslados_dos_fases.sql`): este formulario ya NO deja el
// stock listo en destino — solo lo saca del origen. El destino confirma
// después en `/inventario/traslados/[id]`, con lo que realmente llegó.
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
// `cantidad` es texto, no número — mismo patrón que ya usa `ConteoPanel.tsx`
// para su campo de cantidad. Un input controlado con `value={numero}` y
// `onChange={(e) => setNumero(Number(e.target.value) || 1)}` nunca puede
// quedar vacío: `Number("") || 1` vuelve a "1" en la MISMA tecla que borra
// el campo, así que borrar para escribir un número nuevo no se podía hacer
// (bug real, reportado por Felipe 2026-09-17). Con texto libre se puede
// vaciar el campo mientras se escribe; el tope de stock se aplica recién al
// salir del campo (`normalizarCantidad`) y otra vez al enviar — nunca a
// mitad de tecla.
type Linea = { varianteId: string; cantidad: string };

export function MoverMercaderiaFormV2({
  origenId,
  origenEtiqueta,
  destinos,
  variantes,
  destinoInicialId,
  lineaInicial,
  lineasIniciales,
}: {
  origenId: string;
  origenEtiqueta: string;
  destinos: Ubicacion[];
  variantes: VarianteConStock[];
  /** Prellenado desde una sugerencia de Resumen (ADR-0101). La página ya
   *  validó que el destino existe y que la variante tiene stock movible en
   *  el origen; acá solo se usa como valor inicial — el usuario sigue
   *  decidiendo todo antes de enviar. */
  destinoInicialId?: string;
  lineaInicial?: { varianteId: string; cantidad: number };
  /** Varias líneas prellenadas (Producción, ADR-0133 F8): la página ya descartó lo que no tiene stock movible y topó cada cantidad. Si viene con datos, manda sobre `lineaInicial`. */
  lineasIniciales?: { varianteId: string; cantidad: number }[];
}) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState(destinoInicialId ?? destinos[0]?.id ?? "");
  const [nota, setNota] = useState("");
  const [etaLocal, setEtaLocal] = useState("");
  const [lineas, setLineas] = useState<Linea[]>(
    lineasIniciales && lineasIniciales.length > 0
      ? lineasIniciales.map((l) => ({ varianteId: l.varianteId, cantidad: String(Math.max(1, l.cantidad)) }))
      : [
    lineaInicial
      ? { varianteId: lineaInicial.varianteId, cantidad: String(Math.max(1, Math.min(lineaInicial.cantidad, variantes.find((v) => v.varianteId === lineaInicial.varianteId)?.cantidad ?? 1))) }
      : { varianteId: variantes[0]?.varianteId ?? "", cantidad: "1" },
  ]);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ unidades: number; destino: string } | null>(null);
  // Enviar un traslado saca stock del origen: pide Responsable (ADR-0161). La lista es la de turno en el ORIGEN,
  // que es donde está parada quien envía.
  const responsable = useResponsable({ ubicacionId: origenId, etiqueta: origenEtiqueta });

  function stockDe(varianteId: string): number {
    return variantes.find((v) => v.varianteId === varianteId)?.cantidad ?? 0;
  }

  function agregarLinea() {
    setLineas((actual) => [...actual, { varianteId: variantes[0]?.varianteId ?? "", cantidad: "1" }]);
  }

  function quitarLinea(i: number) {
    setLineas((actual) => actual.filter((_, n) => n !== i));
  }

  // El tope de una línea no es el stock total de la variante: hay que restar
  // lo que OTRAS líneas del mismo formulario ya le piden a esa misma
  // variante. Sin esto, la misma prenda con 10 unidades podía pedirse
  // 10+10 en dos líneas — `iniciar_traslado` rechaza la segunda con "Stock
  // insuficiente", pero el formulario nunca avisó por qué.
  function topeDeLinea(actual: Linea[], i: number, varianteId: string): number {
    const usadoEnOtras = actual.reduce(
      (acc, otra, m) => (m !== i && otra.varianteId === varianteId ? acc + (Number(otra.cantidad) || 0) : acc),
      0
    );
    return Math.max(0, stockDe(varianteId) - usadoEnOtras);
  }

  function actualizarLinea(i: number, cambio: Partial<Linea>) {
    setLineas((actual) =>
      actual.map((l, n) => {
        if (n !== i) return l;
        const siguiente = { ...l, ...cambio };
        // Cambiar la CANTIDAD se deja pasar tal cual, sin tocarla — es
        // exactamente lo que el usuario está escribiendo, vacío incluido.
        // Cambiar la PRENDA sí revalida al toque: el tope cambia con ella,
        // y una cantidad que ya no cabe se recorta antes de mostrarla.
        if (!("varianteId" in cambio)) return siguiente;
        const tope = topeDeLinea(actual, i, siguiente.varianteId);
        const actualN = Math.trunc(Number(siguiente.cantidad)) || 1;
        return { ...siguiente, cantidad: String(Math.max(1, Math.min(actualN, tope || 1))) };
      })
    );
  }

  // Al salir del campo (no en cada tecla): recorta a un entero entre 1 y el
  // tope real. Antes vivía a mitad de tecla y por eso nunca se podía borrar
  // el campo para escribir un número nuevo — ver el comentario en `Linea`.
  function normalizarCantidad(i: number) {
    setLineas((actual) =>
      actual.map((l, n) => {
        if (n !== i) return l;
        const tope = topeDeLinea(actual, i, l.varianteId);
        const num = Math.trunc(Number(l.cantidad)) || 1;
        return { ...l, cantidad: String(Math.max(1, Math.min(num, tope || 1))) };
      })
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!responsable.listo) return;
    if (!destinoId) {
      avisar.error("Elige a qué ubicación se mueve la mercadería.", { enfocar: "mover-destino" });
      return;
    }
    if (!etaLocal) {
      avisar.error("Indica cuándo esperas que llegue el traslado.", { enfocar: "mover-eta" });
      return;
    }
    const validas = lineas
      .map((l) => ({ ...l, cantidadNum: Math.trunc(Number(l.cantidad)) }))
      .filter((l) => l.varianteId && l.cantidadNum > 0);
    if (validas.length === 0) {
      avisar.error("Agrega al menos una línea con una prenda y una cantidad mayor que cero.", { enfocar: "mover-linea-0" });
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { error } = await firmar(supabase.rpc("iniciar_traslado", {
      p_ubicacion_origen_id: origenId,
      p_ubicacion_destino_id: destinoId,
      p_items: validas.map((l) => ({ variante_id: l.varianteId, cantidad: l.cantidadNum })),
      p_fecha_estimada_llegada: new Date(etaLocal).toISOString(),
      p_nota: nota || undefined,
    }), responsable.firma());

    setLoading(false);
    responsable.despues(error);
    if (error) {
      avisar.error(traducirError(error, "iniciar el traslado"));
      return;
    }
    const unidades = validas.reduce((acc, l) => acc + l.cantidadNum, 0);
    const destino = destinos.find((d) => d.id === destinoId)?.nombre ?? "";
    avisar.exito(`${unidades} ${unidades === 1 ? "unidad enviada" : "unidades enviadas"} a ${destino}`, {
      detalle: "Salió de tu almacén ahora. La otra sede confirma cuando llegue de verdad.",
    });
    setOk({ unidades, destino });
    router.refresh();
  }

  if (ok) {
    return (
      <div className="card-cayla space-y-3 p-5 text-center">
        <p className="label-cayla text-[11px] text-tinta/65">Traslado enviado</p>
        <p className="font-display text-3xl text-tinta">{ok.unidades} unidades</p>
        <p className="text-sm text-tinta/70">
          De {origenEtiqueta} hacia {ok.destino} — en tránsito hasta que {ok.destino} confirme lo recibido.
        </p>
        <Link href="/inventario/traslados" className="text-xs text-rojo hover:underline">
          Ver traslados en curso
        </Link>
        <button
          type="button"
          onClick={() => {
            setOk(null);
            setLineas([{ varianteId: variantes[0]?.varianteId ?? "", cantidad: "1" }]);
            setNota("");
            setEtaLocal("");
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-eta">
            Llega aproximadamente
          </label>
          <input
            id="mover-eta"
            type="datetime-local"
            value={etaLocal}
            onChange={(e) => setEtaLocal(e.target.value)}
            className={campoTexto}
          />
        </div>
        <div className="space-y-1.5">
          <label className={campoEtiqueta} htmlFor="mover-nota">
            Nota (opcional)
          </label>
          <input id="mover-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={campoTexto} />
        </div>
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
                onChange={(e) => actualizarLinea(i, { cantidad: e.target.value })}
                onBlur={() => normalizarCantidad(i)}
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

      <ComboResponsable control={responsable} deshabilitado={loading} />
      <button type="submit" disabled={loading || !responsable.listo} title={responsable.motivo ?? undefined} className={botonPrimario}>
        {loading ? "Moviendo…" : `Mover hacia ${destinos.find((d) => d.id === destinoId)?.nombre ?? "…"}`}
      </button>
    </form>
  );
}
