"use client";

import { useMemo, useState } from "react";
import { clave } from "@/lib/buscar-prenda-v2";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { CampoTexto, CampoSelect } from "@/components/ui/campos";
import { ReponerPisoModal } from "@/components/ReponerPisoModal";
import type { EstadoStock, FilaStock, ResumenInventario } from "@/lib/inventario-v2";
import type { Sububicacion } from "@/lib/sububicaciones";

const ETIQUETA_ESTADO: Record<EstadoStock, string> = {
  normal: "Normal",
  reponer_piso: "Reponer piso",
  sin_stock: "Sin stock en tienda",
};

const TONO_ESTADO: Record<EstadoStock, string> = {
  normal: "text-tinta/45",
  reponer_piso: "text-ambar",
  sin_stock: "text-rojo",
};

const TODAS = "__todas__";

// Piso de venta / almacén de tienda (Felipe, 2026-09-14): la pantalla no
// asume que toda ubicación separa piso y almacén — se adapta según lo que
// `getSububicaciones` encontró para ESA ubicación (`resumen.separaPisoAlmacen`),
// nunca por el nombre ("Taller" vs. "Tienda X"). Taller sigue viendo la
// tabla simple de siempre.
export function InventarioPanel({
  ubicacionId,
  stock,
  resumen,
  sububicacionPiso,
  sububicacionAlmacen,
}: {
  ubicacionId: string;
  stock: FilaStock[];
  resumen: ResumenInventario;
  sububicacionPiso: Sububicacion | null;
  sububicacionAlmacen: Sububicacion | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(TODAS);
  const [talla, setTalla] = useState(TODAS);
  const [color, setColor] = useState(TODAS);
  const [estado, setEstado] = useState(TODAS);
  const [reponiendo, setReponiendo] = useState<FilaStock | null>(null);

  const categorias = useMemo(
    () => Array.from(new Set(stock.map((f) => f.categoria).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );
  const tallas = useMemo(() => Array.from(new Set(stock.map((f) => f.talla).filter((t): t is string => !!t))).sort(), [stock]);
  const colores = useMemo(
    () => Array.from(new Set(stock.map((f) => f.color).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "es")),
    [stock]
  );

  const k = clave(busqueda);
  const filtradas = useMemo(() => {
    return stock.filter((f) => {
      if (k && !clave(f.referencia).includes(k) && !clave(f.sku).includes(k) && !f.codigosBarras.some((c) => clave(c) === k)) {
        return false;
      }
      if (categoria !== TODAS && f.categoria !== categoria) return false;
      if (talla !== TODAS && f.talla !== talla) return false;
      if (color !== TODAS && f.color !== color) return false;
      if (estado !== TODAS && f.estado !== estado) return false;
      return true;
    });
  }, [stock, k, categoria, talla, color, estado]);

  const puedeReponer = Boolean(resumen.separaPisoAlmacen && sububicacionPiso && sububicacionAlmacen);

  const plantilla = resumen.separaPisoAlmacen
    ? "sm:grid-cols-[1fr_7rem_3.5rem_5.5rem_3.5rem_4.5rem_3.5rem_9rem]"
    : "sm:grid-cols-[1fr_7rem_3.5rem_5.5rem_4rem]";

  return (
    <div className="space-y-6">
      <div className={`grid gap-3 ${resumen.separaPisoAlmacen ? "sm:grid-cols-4" : "sm:grid-cols-1"}`}>
        <TarjetaResumen etiqueta="Total tienda" valor={resumen.total} />
        {resumen.separaPisoAlmacen && (
          <>
            <TarjetaResumen etiqueta="Piso de venta" valor={resumen.piso ?? 0} />
            <TarjetaResumen etiqueta="Almacén de tienda" valor={resumen.almacen ?? 0} />
            <TarjetaResumen
              etiqueta="Requieren reposición"
              valor={resumen.requierenReposicion}
              tono={resumen.requierenReposicion > 0 ? "text-ambar" : undefined}
            />
          </>
        )}
      </div>

      {stock.length > 0 && (
        <div className={`card-cayla grid gap-4 p-5 ${resumen.separaPisoAlmacen ? "sm:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]" : "sm:grid-cols-[1.4fr_1fr_1fr_1fr]"}`}>
          <CampoTexto etiqueta="Buscar" placeholder="Producto, SKU o código de barras" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <CampoSelect
            etiqueta="Categoría"
            valor={categoria}
            onValor={setCategoria}
            marcador="Todas"
            opciones={[{ valor: TODAS, texto: "Todas" }, ...categorias.map((c) => ({ valor: c, texto: c }))]}
          />
          <CampoSelect
            etiqueta="Talla"
            valor={talla}
            onValor={setTalla}
            marcador="Todas"
            opciones={[{ valor: TODAS, texto: "Todas" }, ...tallas.map((t) => ({ valor: t, texto: t }))]}
          />
          <CampoSelect
            etiqueta="Color"
            valor={color}
            onValor={setColor}
            marcador="Todos"
            opciones={[{ valor: TODAS, texto: "Todos" }, ...colores.map((c) => ({ valor: c, texto: c }))]}
          />
          {resumen.separaPisoAlmacen && (
            <CampoSelect
              etiqueta="Estado"
              valor={estado}
              onValor={setEstado}
              marcador="Todos"
              opciones={[
                { valor: TODAS, texto: "Todos" },
                ...(Object.keys(ETIQUETA_ESTADO) as EstadoStock[]).map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] })),
              ]}
            />
          )}
        </div>
      )}

      {stock.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Esta ubicación no tiene stock todavía.</p>
      ) : filtradas.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Ningún producto coincide con la búsqueda.</p>
      ) : (
        <Tabla>
          <Encabezado
            plantilla={plantilla}
            columnas={
              resumen.separaPisoAlmacen
                ? [
                    { titulo: "Producto" },
                    { titulo: "SKU" },
                    { titulo: "Talla" },
                    { titulo: "Color" },
                    { titulo: "Piso", alinear: "der" },
                    { titulo: "Almacén", alinear: "der" },
                    { titulo: "Total", alinear: "der" },
                    { titulo: "Estado", alinear: "der" },
                  ]
                : [{ titulo: "Producto" }, { titulo: "SKU" }, { titulo: "Talla" }, { titulo: "Color" }, { titulo: "Total", alinear: "der" }]
            }
          />
          {filtradas.map((f) => (
            <div key={f.varianteId} className={fila(plantilla)}>
              <span className={celda("izq")}>{f.referencia}</span>
              <span className={celda("izq", "font-mono text-xs text-tinta/75")}>{f.sku}</span>
              <span className={celda("izq", "text-tinta/75")}>{f.talla ?? "—"}</span>
              <span className={celda("izq", "text-tinta/75")}>{f.color ?? "—"}</span>
              {resumen.separaPisoAlmacen ? (
                <>
                  <span className={celda("der")}>{f.piso}</span>
                  <span className={celda("der")}>{f.almacen}</span>
                  <span className={celda("der", "font-semibold text-tinta")}>{f.total}</span>
                  <span className={celda("der")}>
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className={`label-cayla text-[10px] ${TONO_ESTADO[f.estado!]}`}>{ETIQUETA_ESTADO[f.estado!]}</span>
                      {f.estado === "reponer_piso" && puedeReponer && (
                        <button
                          type="button"
                          onClick={() => setReponiendo(f)}
                          className="label-cayla text-[10px] text-rojo underline underline-offset-2 hover:no-underline"
                        >
                          Reponer
                        </button>
                      )}
                    </span>
                  </span>
                </>
              ) : (
                <span className={celda("der", "font-semibold text-tinta")}>{f.total}</span>
              )}
            </div>
          ))}
        </Tabla>
      )}

      {reponiendo && sububicacionPiso && sububicacionAlmacen && (
        <ReponerPisoModal
          fila={reponiendo}
          ubicacionId={ubicacionId}
          sububicacionPisoId={sububicacionPiso.id}
          sububicacionAlmacenId={sububicacionAlmacen.id}
          onClose={() => setReponiendo(null)}
        />
      )}
    </div>
  );
}

function TarjetaResumen({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: string }) {
  return (
    <div className="card-cayla p-5">
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className={`font-display mt-1 text-3xl tabular-nums ${tono ?? "text-tinta"}`}>{valor}</p>
    </div>
  );
}
