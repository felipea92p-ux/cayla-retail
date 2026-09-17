"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { campoEtiqueta, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { compararTallas } from "@/lib/tallas";

// Alta de producto con matriz talla×color, en una sola transacción
// (`crear_producto_con_variantes`) — hasta hoy esto era solo lectura. El
// token de idempotencia nace con el formulario (useRef): si la red falla a
// mitad de la matriz y se reintenta, la base devuelve el mismo producto en
// vez de crear uno segundo. Mismo mecanismo que NuevaOrdenProduccionForm.
//
// Precio y costo BASE se aplican a toda la matriz; cada celda incluida
// puede sobreescribir su propio precio (el caso real: "S/M/L a 89.90 pero
// el XXL a 99.90") — costo por celda queda fuera a propósito por ahora, la
// prenda casi nunca cambia de costo por talla/color, así que no paga la
// complejidad extra todavía.

type CategoriaAlta = { id: string; nombre: string; tallasSugeridas: string[] | null };
type ColorVocabulario = { codigo: string; nombre: string; hex: string | null };

type Celda = { talla: string | null; color: string | null; clave: string };

function claveCelda(talla: string | null, color: string | null) {
  return `${talla ?? ""}|${color ?? ""}`;
}

export function NuevoProductoForm({ categorias, colores }: { categorias: CategoriaAlta[]; colores: ColorVocabulario[] }) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());

  const [referencia, setReferencia] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tallasElegidas, setTallasElegidas] = useState<string[]>([]);
  const [tallaNueva, setTallaNueva] = useState("");
  const [coloresElegidos, setColoresElegidos] = useState<string[]>([]);
  const [precioBase, setPrecioBase] = useState("");
  const [costoBase, setCostoBase] = useState("");
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [overridePrecio, setOverridePrecio] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  const categoriaActual = categorias.find((c) => c.id === categoriaId) ?? null;
  const tallasSugeridas = categoriaActual?.tallasSugeridas ?? [];

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    setTallasElegidas([]);
    setExcluidas(new Set());
    setOverridePrecio({});
  }

  function alternarTalla(t: string) {
    setTallasElegidas((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort(compararTallas)));
  }

  function agregarTallaLibre() {
    const t = tallaNueva.trim();
    if (!t) return;
    if (!tallasElegidas.includes(t)) setTallasElegidas((prev) => [...prev, t].sort(compararTallas));
    setTallaNueva("");
  }

  function alternarColor(codigo: string) {
    setColoresElegidos((prev) => (prev.includes(codigo) ? prev.filter((x) => x !== codigo) : [...prev, codigo]));
  }

  // Sin ejes elegidos = una sola variante (una correa, un gorro — el mismo
  // caso que ya contempla la RPC con talla/color_codigo en null).
  const celdas: Celda[] = useMemo(() => {
    const tallas: (string | null)[] = tallasElegidas.length > 0 ? tallasElegidas : [null];
    const cods: (string | null)[] = coloresElegidos.length > 0 ? coloresElegidos : [null];
    const out: Celda[] = [];
    for (const color of cods) for (const talla of tallas) out.push({ talla, color, clave: claveCelda(talla, color) });
    return out;
  }, [tallasElegidas, coloresElegidos]);

  const celdasIncluidas = celdas.filter((c) => !excluidas.has(c.clave));

  function alternarCelda(clave: string) {
    setExcluidas((prev) => {
      const copia = new Set(prev);
      if (copia.has(clave)) copia.delete(clave);
      else copia.add(clave);
      return copia;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!referencia.trim()) {
      avisar.error("Escribe el nombre del producto.");
      return;
    }
    if (!categoriaId) {
      avisar.error("Elige una categoría.");
      return;
    }
    if (celdasIncluidas.length === 0) {
      avisar.error("Incluye al menos una talla o color.");
      return;
    }
    const base = Number(precioBase);
    if (!Number.isFinite(base) || base < 0) {
      avisar.error("El precio base tiene que ser 0 o más.");
      return;
    }
    const costo = Number(costoBase) || 0;
    if (costo < 0) {
      avisar.error("El costo no puede ser negativo.");
      return;
    }

    const variantes = celdasIncluidas.map((c) => {
      const overrideStr = overridePrecio[c.clave];
      const precio = overrideStr !== undefined && overrideStr !== "" ? Number(overrideStr) : base;
      return { talla: c.talla, color_codigo: c.color, precio, costo };
    });
    if (variantes.some((v) => !Number.isFinite(v.precio) || v.precio < 0)) {
      avisar.error("Una de las celdas tiene un precio inválido.");
      return;
    }

    setCargando(true);
    const { error } = await createClient().rpc("crear_producto_con_variantes", {
      p_referencia: referencia.trim(),
      p_categoria_id: categoriaId,
      p_variantes: variantes,
      p_descripcion: descripcion.trim() || undefined,
      p_token: token.current,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, "crear el producto"));
      return;
    }
    avisar.exito(`${referencia.trim()} creado`, {
      detalle: `${variantes.length} variante${variantes.length === 1 ? "" : "s"}`,
    });
    router.push("/productos");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="card-cayla space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            etiqueta="Referencia"
            placeholder="Blusa Aurora"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
          <CampoSelectNativo etiqueta="Categoría" value={categoriaId} onChange={(e) => elegirCategoria(e.target.value)}>
            <option value="">Elige una categoría…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </CampoSelectNativo>
        </div>
        <CampoTexto
          etiqueta="Descripción"
          pie="Opcional"
          placeholder="Tela, corte, detalle…"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>

      <div className="card-cayla space-y-3 p-5">
        <span className={campoEtiqueta}>Tallas</span>
        <div className="flex flex-wrap gap-1.5">
          {tallasSugeridas.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => alternarTalla(t)}
              className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                tallasElegidas.includes(t) ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/75 hover:border-tinta/35"
              }`}
            >
              {t}
            </button>
          ))}
          {tallasElegidas
            .filter((t) => !tallasSugeridas.includes(t))
            .map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => alternarTalla(t)}
                className="rounded-md border border-rojo/60 bg-rojo/5 px-2.5 py-1.5 text-sm text-rojo"
              >
                {t}
              </button>
            ))}
        </div>
        <div className="flex items-end gap-2">
          <CampoTexto
            etiqueta="Otra talla"
            placeholder="Ej. 3XL"
            value={tallaNueva}
            onChange={(e) => setTallaNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregarTallaLibre();
              }
            }}
          />
          <button type="button" onClick={agregarTallaLibre} className={`${botonCancelar} flex-none px-4`}>
            Agregar
          </button>
        </div>
      </div>

      <div className="card-cayla space-y-3 p-5">
        <span className={campoEtiqueta}>Colores</span>
        <div className="flex flex-wrap gap-1.5">
          {colores.map((c) => {
            const elegido = coloresElegidos.includes(c.codigo);
            return (
              <button
                key={c.codigo}
                type="button"
                onClick={() => alternarColor(c.codigo)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                  elegido ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/75 hover:border-tinta/35"
                }`}
              >
                {c.hex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-tinta/15" style={{ background: c.hex }} />}
                {c.nombre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-cayla space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoMonto
            etiqueta="Precio base"
            pie="Se aplica a toda la matriz"
            inputMode="decimal"
            placeholder="0.00"
            value={precioBase}
            onChange={(e) => setPrecioBase(e.target.value)}
          />
          <CampoMonto
            etiqueta="Costo base"
            pie="Opcional"
            inputMode="decimal"
            placeholder="0.00"
            value={costoBase}
            onChange={(e) => setCostoBase(e.target.value)}
          />
        </div>

        <div>
          <span className={campoEtiqueta}>
            Matriz · {celdasIncluidas.length} variante{celdasIncluidas.length === 1 ? "" : "s"}
          </span>
          <p className="mt-1 text-xs text-tinta/55">
            Todas incluidas por defecto — desmarca las que este modelo no trae. El precio de una celda se puede
            cambiar sin tocar las demás.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {celdas.map((c) => {
              const incluida = !excluidas.has(c.clave);
              const etiqueta = [c.talla, c.color ? colores.find((x) => x.codigo === c.color)?.nombre : null].filter(Boolean).join(" · ") || "Única";
              return (
                <div
                  key={c.clave}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                    incluida ? "border-tinta/20" : "border-tinta/10 opacity-40"
                  }`}
                >
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={incluida} onChange={() => alternarCelda(c.clave)} className="accent-rojo" />
                    <span className="text-sm text-tinta/80">{etiqueta}</span>
                  </label>
                  {incluida && (
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      inputMode="decimal"
                      placeholder={precioBase || "0.00"}
                      value={overridePrecio[c.clave] ?? ""}
                      onChange={(e) => setOverridePrecio((prev) => ({ ...prev, [c.clave]: e.target.value }))}
                      className="w-20 border-b border-tinta/20 bg-transparent px-1 py-0.5 text-right text-sm tabular-nums outline-none focus:border-rojo"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => router.push("/productos")} className={botonCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={cargando} className={botonPrimario}>
          {cargando ? "Creando…" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}
