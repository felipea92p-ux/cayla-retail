"use client";

import { useMemo, useRef, useState } from "react";
import { MuestraPatron } from "@/components/MuestraPatron";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoMonto, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { campoEtiqueta, botonCancelar, botonPrimario } from "@/components/ui/Modal";
import { compararTallas } from "@/lib/tallas";
import type { EjesPorCategoria } from "@/lib/catalogo-v2";

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
//
// TALLA CERRADA (20260917100000/100500): ya no se puede tipear "Otra talla"
// libre acá — talla es vocabulario cerrado, filtrado por categoría
// (categoria_tallas). Si falta un valor, se propone desde Catálogo →
// Atributos (`/productos/atributos`, pestaña Tallas) — el Líder, que es
// quien siempre llega a esta pantalla, la aprueba al toque — y recién
// después aparece acá.

type CategoriaAlta = { id: string; nombre: string };
type ColorVocabulario = { codigo: string; nombre: string; hex: string | null };

type Celda = { tallaId: string | null; color: string | null; clave: string };

function claveCelda(tallaId: string | null, color: string | null) {
  return `${tallaId ?? ""}|${color ?? ""}`;
}

export function NuevoProductoForm({
  categorias,
  colores,
  ejes,
}: {
  categorias: CategoriaAlta[];
  colores: ColorVocabulario[];
  ejes: EjesPorCategoria;
}) {
  const router = useRouter();
  const token = useRef<string>(crypto.randomUUID());

  const [referencia, setReferencia] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tallasElegidas, setTallasElegidas] = useState<string[]>([]);
  const [coloresElegidos, setColoresElegidos] = useState<string[]>([]);
  const [tejidoId, setTejidoId] = useState("");
  const [patronId, setPatronId] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [costoBase, setCostoBase] = useState("");
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [overridePrecio, setOverridePrecio] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  const tallasCategoria = ejes.tallas[categoriaId] ?? [];
  const tejidosCategoria = ejes.tejidos[categoriaId] ?? [];
  const patronesCategoria = ejes.patrones[categoriaId] ?? [];
  const tallaTexto = (id: string) => tallasCategoria.find((t) => t.id === id)?.texto ?? "";

  function elegirCategoria(id: string) {
    setCategoriaId(id);
    setTallasElegidas([]);
    setTejidoId("");
    setPatronId("");
    setExcluidas(new Set());
    setOverridePrecio({});
  }

  function alternarTalla(id: string) {
    setTallasElegidas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort((a, b) => compararTallas(tallaTexto(a), tallaTexto(b)))
    );
  }

  function alternarColor(codigo: string) {
    setColoresElegidos((prev) => (prev.includes(codigo) ? prev.filter((x) => x !== codigo) : [...prev, codigo]));
  }

  // Sin ejes elegidos = una sola variante (una correa, un gorro — el mismo
  // caso que ya contempla la RPC con talla_id/color_codigo en null).
  const celdas: Celda[] = useMemo(() => {
    const tallas: (string | null)[] = tallasElegidas.length > 0 ? tallasElegidas : [null];
    const cods: (string | null)[] = coloresElegidos.length > 0 ? coloresElegidos : [null];
    const out: Celda[] = [];
    for (const color of cods) for (const tallaId of tallas) out.push({ tallaId, color, clave: claveCelda(tallaId, color) });
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
      return { talla_id: c.tallaId, color_codigo: c.color, precio, costo };
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
      p_tejido_id: tejidoId || undefined,
      p_patron_id: patronId || undefined,
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
        {tallasCategoria.length === 0 ? (
          <p className="text-sm text-tinta/55">
            {categoriaId
              ? "Esta categoría todavía no tiene tallas habilitadas — agrégalas desde Catálogo → Atributos."
              : "Elige una categoría para ver sus tallas."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tallasCategoria.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => alternarTalla(t.id)}
                className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                  tallasElegidas.includes(t.id) ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/75 hover:border-tinta/35"
                }`}
              >
                {t.texto}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-tinta/55">
          ¿Falta una talla? Propónla en <span className="font-medium">Catálogo → Atributos</span> — la apruebas ahí mismo y ya
          aparece acá.
        </p>
      </div>

      <div className="card-cayla space-y-3 p-5">
        <span className={campoEtiqueta}>Tejido (opcional)</span>
        <div className="flex flex-wrap gap-1.5">
          {tejidosCategoria.length === 0 && <p className="text-sm text-tinta/55">Sin tejidos habilitados para esta categoría.</p>}
          {tejidosCategoria.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTejidoId((prev) => (prev === t.id ? "" : t.id))}
              className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                tejidoId === t.id ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/75 hover:border-tinta/35"
              }`}
            >
              {t.texto}
            </button>
          ))}
        </div>
      </div>

      <div className="card-cayla space-y-3 p-5">
        <span className={campoEtiqueta}>Patrón (opcional)</span>
        <div className="flex flex-wrap gap-1.5">
          {patronesCategoria.length === 0 && <p className="text-sm text-tinta/55">Sin patrones habilitados para esta categoría.</p>}
          {patronesCategoria.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPatronId((prev) => (prev === t.id ? "" : t.id))}
              aria-pressed={patronId === t.id}
              className={`flex w-[112px] flex-col gap-1.5 rounded-md border p-1.5 text-left text-sm transition-colors ${
                patronId === t.id ? "border-rojo/60 bg-rojo/5 text-rojo" : "border-tinta/15 text-tinta/75 hover:border-tinta/35"
              }`}
            >
              <MuestraPatron nombre={t.texto} />
              <span className="px-0.5">{t.texto}</span>
            </button>
          ))}
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
              const etiqueta = [c.tallaId ? tallaTexto(c.tallaId) : null, c.color ? colores.find((x) => x.codigo === c.color)?.nombre : null].filter(Boolean).join(" · ") || "Única";
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
