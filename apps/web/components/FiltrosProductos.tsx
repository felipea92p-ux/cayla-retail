"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoSelectNativo, CampoTexto } from "@/components/ui/campos";

// Filtros de /productos. Mismo patrón que `FiltrosMovimientos.tsx`: viven en
// la URL, la página es un Server Component que filtra en Postgres
// (fn_productos/fn_productos_resumen), y cambiar un filtro vuelve a la
// página 1 — un filtro nuevo sobre "página 7" case casi siempre en vacío.
type Opcion = { id: string; nombre: string };

export function FiltrosProductos({ categorias, colores }: { categorias: Opcion[]; colores: Opcion[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [precioMin, setPrecioMin] = useState(params.get("precioMin") ?? "");
  const [precioMax, setPrecioMax] = useState(params.get("precioMax") ?? "");
  const primera = useRef(true);

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("pagina");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Búsqueda y precio se mandan solos al dejar de tipear (350 ms).
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      const cambios: Record<string, string> = {};
      if ((params.get("q") ?? "") !== busqueda.trim()) cambios.q = busqueda.trim();
      if ((params.get("precioMin") ?? "") !== precioMin.trim()) cambios.precioMin = precioMin.trim();
      if ((params.get("precioMax") ?? "") !== precioMax.trim()) cambios.precioMax = precioMax.trim();
      if (Object.keys(cambios).length > 0) aplicar(cambios);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, precioMin, precioMax]);

  const cat = params.get("cat");
  const color = params.get("color");
  const estado = params.get("estado");
  const stock = params.get("stock");

  const chips: { texto: string; quitar: Record<string, string> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: { q: "" } });
  if (cat) chips.push({ texto: categorias.find((c) => c.id === cat)?.nombre ?? "Categoría", quitar: { cat: "" } });
  if (color) chips.push({ texto: colores.find((c) => c.id === color)?.nombre ?? "Color", quitar: { color: "" } });
  if (estado) chips.push({ texto: estado === "activo" ? "Activo" : "Descontinuado", quitar: { estado: "" } });
  if (stock) {
    chips.push({
      texto: stock === "sin_stock" ? "Sin stock" : stock === "bajo" ? "Stock bajo" : "Pedir a proveedor",
      quitar: { stock: "" },
    });
  }
  if (precioMin || precioMax) {
    chips.push({
      texto:
        precioMin && precioMax
          ? `S/${precioMin} – S/${precioMax}`
          : precioMin
            ? `Desde S/${precioMin}`
            : `Hasta S/${precioMax}`,
      quitar: { precioMin: "", precioMax: "" },
    });
  }

  return (
    <div className="card-cayla p-4">
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
        <CampoTexto
          etiqueta="Buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Referencia, código, SKU o código de barras"
          autoComplete="off"
          type="search"
        />
        <CampoSelectNativo etiqueta="Categoría" value={cat ?? ""} onChange={(e) => aplicar({ cat: e.target.value })}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelectNativo>
        <CampoSelectNativo etiqueta="Color" value={color ?? ""} onChange={(e) => aplicar({ color: e.target.value })}>
          <option value="">Todos</option>
          {colores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelectNativo>
        <CampoSelectNativo etiqueta="Estado" value={estado ?? ""} onChange={(e) => aplicar({ estado: e.target.value })}>
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="descontinuado">Descontinuado</option>
        </CampoSelectNativo>
        <CampoTexto
          etiqueta="Precio desde"
          value={precioMin}
          onChange={(e) => setPrecioMin(e.target.value)}
          inputMode="decimal"
          placeholder="S/ 0"
        />
        <CampoTexto
          etiqueta="Precio hasta"
          value={precioMax}
          onChange={(e) => setPrecioMax(e.target.value)}
          inputMode="decimal"
          placeholder="S/ 999"
        />
        <CampoSelectNativo etiqueta="Stock" value={stock ?? ""} onChange={(e) => aplicar({ stock: e.target.value })}>
          <option value="">Todos</option>
          <option value="sin_stock">Sin stock</option>
          <option value="bajo">Stock bajo</option>
          <option value="reponer">Pedir a proveedor</option>
        </CampoSelectNativo>
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.texto}
              type="button"
              onClick={() => {
                if ("q" in c.quitar) setBusqueda("");
                if ("precioMin" in c.quitar) {
                  setPrecioMin("");
                  setPrecioMax("");
                }
                aplicar(c.quitar);
              }}
              className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
              aria-label={`Quitar filtro ${c.texto}`}
            >
              {c.texto}
              <span aria-hidden className="text-sm leading-none">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setPrecioMin("");
              setPrecioMax("");
              router.push(pathname);
            }}
            className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}
