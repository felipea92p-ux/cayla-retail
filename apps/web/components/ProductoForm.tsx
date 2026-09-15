"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Campo, CampoTexto, Interruptor, Segmentado } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { compararTallas } from "@/lib/tallas";
import type { ProductoDetalle } from "@/lib/catalogo-v2";

/* ====================================================================
   ProductoForm · alta y edición de producto+variantes (V2, 2026-09-15)

   Un solo componente para /productos/nuevo y /productos/[id]/editar: la
   diferencia entre "crear" y "editar" es si llega `producto` — mismos
   campos, misma grilla de variantes, RPC distinta al guardar. Partirlo en
   dos componentes hubiera duplicado la grilla de variantes, que es la
   parte que de verdad tiene lógica (sugerir SKU, no dejar tocar la
   identidad de una variante que ya existe).

   SKU: se sugiere solo (referencia + talla + color, ver `sugerirSku`) y
   queda editable — decidido con Felipe 2026-09-15. Si la persona lo toca,
   `skuManual` se prende y deja de recalcularse aunque cambie color/talla.
   Es DISTINTO de `variantes.codigo` (el código corto BLU-0042-AZM-M que
   arma el trigger `variantes_asignar_codigo` y que se ve recién después de
   guardar) — acá no se intenta adivinar ese código, solo el SKU.

   Identidad de variante: una variante con `id` (ya existe en la base) solo
   deja tocar precio, costo y activo — igual que decide la RPC
   `catalogo_actualizar_producto` (20260915150000). Cambiar color o talla de
   una variante que ya se etiquetó es el hueco 3 que V1 nunca cerró
   (docs/datos/modulos/02-catalogo-y-vocabulario.md); para eso se desactiva
   y se agrega una fila nueva.
   ==================================================================== */

type Categoria = { id: string; nombre: string; prefijo: string | null };
type Color = { codigo: string; nombre: string; hex: string | null };

type FilaVariante = {
  /** Presente = variante existente (no se puede quitar, solo desactivar). */
  id: string | null;
  colorCodigo: string;
  talla: string;
  sku: string;
  skuManual: boolean;
  precio: string;
  costo: string;
  activo: boolean;
};

const NUMERO =
  "w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 text-sm tabular-nums text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const PLANTILLA = "sm:grid-cols-[1.6fr_4rem_1.1fr_5rem_5rem_4rem_2.5rem]";

const ESTADOS = [
  { valor: "activo", texto: "Activo" },
  { valor: "descontinuado", texto: "Descontinuado" },
] as const;

/** Referencia → token estable para el SKU sugerido: sin acentos, sin
 *  espacios, mayúsculas, cortado — no es `codigo` (eso lo arma el trigger
 *  con el correlativo real de la categoría; esto es solo una sugerencia
 *  legible que no gasta ningún número). */
function tokenReferencia(referencia: string): string {
  const limpio = referencia
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return limpio.slice(0, 12) || "PRENDA";
}

function tokenTalla(talla: string): string {
  const t = talla
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (!t) return "U";
  if (["U", "UNICA", "UNICO", "TALLAUNICA"].includes(t.replace(/\s+/g, ""))) return "U";
  return t.replace(/[^A-Z0-9]/g, "") || "U";
}

function sugerirSku(referencia: string, colorCodigo: string, talla: string): string {
  return [tokenReferencia(referencia), tokenTalla(talla), colorCodigo || null].filter(Boolean).join("-");
}

function filaVacia(referencia: string): FilaVariante {
  return { id: null, colorCodigo: "", talla: "", sku: referencia.trim() ? sugerirSku(referencia, "", "") : "", skuManual: false, precio: "", costo: "", activo: true };
}

export function ProductoForm({
  categorias,
  colores,
  producto,
}: {
  categorias: Categoria[];
  colores: Color[];
  /** Presente = modo edición. */
  producto?: ProductoDetalle;
}) {
  const router = useRouter();
  const editando = !!producto;

  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? "");
  const [referencia, setReferencia] = useState(producto?.referencia ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [estado, setEstado] = useState<(typeof ESTADOS)[number]["valor"]>(producto?.estado ?? "activo");
  const [variantes, setVariantes] = useState<FilaVariante[]>(() => {
    if (!producto) return [filaVacia("")];
    return [...producto.variantes]
      .sort((a, b) => compararTallas(a.talla ?? "", b.talla ?? ""))
      .map((v) => ({
        id: v.id,
        colorCodigo: v.colorCodigo ?? "",
        talla: v.talla ?? "",
        sku: v.sku,
        skuManual: true,
        precio: String(v.precio),
        costo: String(v.costo),
        activo: v.activo,
      }));
  });
  const [loading, setLoading] = useState(false);

  const opcionesCategoria = categorias.map((c) => ({ valor: c.id, texto: c.nombre, detalle: c.prefijo ?? undefined }));
  const opcionesColor = colores.map((c) => ({ valor: c.codigo, texto: c.nombre }));

  function actualizarFila(i: number, cambio: Partial<FilaVariante>) {
    setVariantes((actual) => actual.map((f, n) => (n === i ? { ...f, ...cambio } : f)));
  }

  // Al tocar color o talla de una fila SIN sku manual, el sugerido se
  // recalcula con el estado ya actualizado — no con el de la fila vieja.
  function cambiarColorOTalla(i: number, cambio: Partial<Pick<FilaVariante, "colorCodigo" | "talla">>) {
    setVariantes((actual) =>
      actual.map((f, n) => {
        if (n !== i) return f;
        const siguiente = { ...f, ...cambio };
        if (siguiente.skuManual) return siguiente;
        return { ...siguiente, sku: sugerirSku(referencia, siguiente.colorCodigo, siguiente.talla) };
      })
    );
  }

  function cambiarReferencia(v: string) {
    setReferencia(v);
    // Las filas nuevas (sin sku manual) siguen a la referencia; las que la
    // persona ya editó a mano quedan como están.
    setVariantes((actual) => actual.map((f) => (f.skuManual ? f : { ...f, sku: sugerirSku(v, f.colorCodigo, f.talla) })));
  }

  function agregarFila() {
    setVariantes((a) => [...a, filaVacia(referencia)]);
  }

  function quitarFila(i: number) {
    setVariantes((a) => a.filter((_, n) => n !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!referencia.trim()) return void avisar.error("Falta la referencia del producto.", { enfocar: "producto-referencia" });
    if (variantes.length === 0) return void avisar.error("Agrega al menos una variante (talla y/o color).", { enfocar: "producto-agregar-variante" });
    const sinPrecio = variantes.findIndex((v) => v.precio === "" || Number(v.precio) < 0);
    if (sinPrecio >= 0) return void avisar.error("Cada variante necesita un precio.", { enfocar: `producto-variante-${sinPrecio}-precio` });
    const sinSku = variantes.findIndex((v) => !v.sku.trim());
    if (sinSku >= 0) return void avisar.error("Cada variante necesita un SKU.", { enfocar: `producto-variante-${sinSku}-sku` });

    setLoading(true);
    const cerrarProceso = avisar.proceso(editando ? `Guardando ${referencia.trim()}…` : `Creando ${referencia.trim()}…`);

    const payloadVariantes = variantes.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      color_codigo: v.colorCodigo || null,
      talla: v.talla.trim() || null,
      sku: v.sku.trim(),
      precio: Number(v.precio),
      costo: v.costo === "" ? 0 : Number(v.costo),
      activo: v.activo,
    }));

    const supabase = createClient();
    const { error } = editando
      ? await supabase.rpc("catalogo_actualizar_producto", {
          p_producto_id: producto!.id,
          p_referencia: referencia.trim(),
          p_estado: estado,
          p_variantes: payloadVariantes,
          ...(categoriaId ? { p_categoria_id: categoriaId } : {}),
          ...(descripcion.trim() ? { p_descripcion: descripcion.trim() } : {}),
        })
      : await supabase.rpc("catalogo_crear_producto", {
          p_referencia: referencia.trim(),
          p_variantes: payloadVariantes,
          ...(categoriaId ? { p_categoria_id: categoriaId } : {}),
          ...(descripcion.trim() ? { p_descripcion: descripcion.trim() } : {}),
        });

    cerrarProceso();
    setLoading(false);

    if (error) {
      avisar.error(traducirError(error, editando ? "guardar el producto" : "crear el producto"));
      return;
    }

    avisar.exito(editando ? `${referencia.trim()} guardado` : `${referencia.trim()} creado`, {
      detalle: `${variantes.length} ${variantes.length === 1 ? "variante" : "variantes"}`,
    });
    router.replace("/productos");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {/* ---------- datos del producto ---------- */}
        <section className="card-cayla space-y-4 p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Producto</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              etiqueta="Referencia"
              id="producto-referencia"
              value={referencia}
              onChange={(e) => cambiarReferencia(e.target.value)}
              placeholder="Blusa Lino"
              autoFocus
            />
            <Campo etiqueta="Categoría">
              <ComboBuscable etiquetaAccesible="Categoría" valor={categoriaId} onValor={setCategoriaId} opciones={opcionesCategoria} marcador="Busca una categoría…" />
            </Campo>
            <CampoTexto etiqueta="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle interno, no se muestra a la clienta" className="sm:col-span-2" />
            {editando && (
              <Segmentado etiqueta="Estado" valor={estado} onValor={setEstado} opciones={ESTADOS} />
            )}
          </div>
        </section>

        {/* ---------- variantes ---------- */}
        <section className="card-cayla space-y-3 p-5">
          <p className="label-cayla text-[11px] text-tinta/65">Variantes (talla × color)</p>
          <div className={`hidden gap-2 border-b border-tinta/10 pb-1 sm:grid ${PLANTILLA}`}>
            {["Color", "Talla", "SKU", "Precio", "Costo", "Activa", ""].map((t, i) => (
              <span key={i} className={`label-cayla text-[11px] text-tinta/55 ${i >= 3 && i <= 4 ? "text-right" : ""}`}>
                {t}
              </span>
            ))}
          </div>
          {variantes.map((v, i) => (
            <div key={i} className={`grid gap-2 border-b border-tinta/10 pb-3 last:border-0 sm:items-center ${PLANTILLA}`}>
              <ComboBuscable
                etiquetaAccesible="Color"
                valor={v.colorCodigo}
                onValor={(c) => cambiarColorOTalla(i, { colorCodigo: c })}
                opciones={opcionesColor}
                marcador="Sin color"
              />
              <input
                aria-label="Talla"
                value={v.talla}
                onChange={(e) => cambiarColorOTalla(i, { talla: e.target.value })}
                placeholder="M"
                className="w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/40 focus:border-b-2 focus:border-rojo"
              />
              <input
                aria-label="SKU"
                id={`producto-variante-${i}-sku`}
                value={v.sku}
                onChange={(e) => actualizarFila(i, { sku: e.target.value, skuManual: true })}
                className="w-full min-w-0 border-b border-tinta/25 bg-transparent px-0.5 py-2 font-mono text-xs tracking-wide text-tinta outline-none focus:border-b-2 focus:border-rojo"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                aria-label="Precio"
                id={`producto-variante-${i}-precio`}
                placeholder="0.00"
                value={v.precio}
                onChange={(e) => actualizarFila(i, { precio: e.target.value })}
                className={`${NUMERO} text-right`}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                aria-label="Costo"
                placeholder="0.00"
                value={v.costo}
                onChange={(e) => actualizarFila(i, { costo: e.target.value })}
                className={`${NUMERO} text-right`}
              />
              <span className="flex justify-center py-2">
                {v.id && <Interruptor activo={v.activo} onActivo={(activo) => actualizarFila(i, { activo })} etiqueta={<span className="sr-only">Variante activa</span>} />}
              </span>
              <span className="py-2 text-right">
                {!v.id && (
                  <button type="button" onClick={() => quitarFila(i)} className="text-xs text-rojo">
                    Quitar
                  </button>
                )}
              </span>
            </div>
          ))}
          <button type="button" id="producto-agregar-variante" onClick={agregarFila} className="label-cayla text-[11px] text-tinta/65 hover:text-rojo">
            + Agregar variante
          </button>
        </section>
      </div>

      <aside className="card-cayla space-y-4 p-5 lg:sticky lg:top-24">
        <p className="label-cayla text-[11px] text-tinta/65">{editando ? "Guardar cambios" : "Crear producto"}</p>
        <p className="text-sm text-tinta/65">
          El código corto de cada variante (para etiqueta y pistola) se asigna solo al guardar — no hace falta escribirlo.
        </p>
        <div className="flex flex-col gap-2">
          <Boton type="submit" peso="primario" cargando={loading} className="w-full">
            {editando ? "Guardar cambios" : "Crear producto"}
          </Boton>
          <Boton type="button" peso="discreto" onClick={() => router.push("/productos")} disabled={loading} className="w-full">
            Cancelar
          </Boton>
        </div>
      </aside>
    </form>
  );
}
