"use client";

import { useState } from "react";
import { CAMPOS, type Campo, type PlanDeMapeo, type FilaEstandar } from "@/lib/importacion/mapeo";

/**
 * Paso 2: qué es cada columna.
 *
 * LA IA PROPONE, LA PERSONA CONFIRMA. Cada columna se puede cambiar con un
 * desplegable, y corregir una NO gasta otra llamada al modelo: el recálculo va
 * por el camino determinista del mismo endpoint. Eso importa porque es lo que
 * hace barato equivocarse — si corregir costara dinero, la gente dejaría pasar
 * un mapeo dudoso.
 */

type Respuesta = {
  plan: PlanDeMapeo;
  variantes: FilaEstandar[];
  total: number;
  faltan: Campo[];
  uso?: { entrada: number; salida: number; cacheLeido: number };
};

const ETIQUETA: Record<Campo, string> = {
  referencia: "Nombre de la prenda",
  codigoCliente: "Código del cliente",
  categoria: "Categoría",
  talla: "Talla",
  color: "Color",
  costo: "Costo",
  precio: "Precio",
  marca: "Marca",
  genero: "Género",
  temporada: "Temporada",
  descripcion: "Descripción",
  tejido: "Tejido",
  patron: "Patrón",
  ignorar: "— no importar —",
};

export function MapearColumnas({
  filas,
  filaCabecera,
  onListo,
}: {
  filas: string[][];
  filaCabecera: number;
  onListo?: (plan: PlanDeMapeo, total: number) => void;
}) {
  const [r, setR] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedir(plan?: PlanDeMapeo) {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/mapear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas, filaCabecera, ...(plan ? { plan } : {}) }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? "No se pudo leer las columnas.");
        return;
      }
      setR(datos);
      onListo?.(datos.plan, datos.total);
    } catch {
      setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  /** Cambiar una columna recalcula por código, sin volver a llamar al modelo. */
  function cambiar(indice: number, campo: Campo) {
    if (!r) return;
    void pedir({
      ...r.plan,
      columnas: r.plan.columnas.map((c) =>
        c.indice === indice ? { ...c, campo, confianza: "alta", porque: "Corregido a mano." } : c
      ),
    });
  }

  const cabeceras = filas[filaCabecera] ?? [];

  if (!r) {
    return (
      <section className="card-cayla space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-lg text-tinta">Qué es cada columna</h2>
            <p className="mt-0.5 text-xs text-tinta/65">
              El sistema mira las cabeceras y las primeras filas, y propone. Después lo corriges tú.
            </p>
          </div>
          <button
            onClick={() => void pedir()}
            disabled={cargando}
            className="label-cayla rounded border border-tinta/20 px-3 py-1.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40"
          >
            {cargando ? "Leyendo columnas…" : "Leer las columnas"}
          </button>
        </div>
        {error && <p className="text-xs text-rojo">{error}</p>}
      </section>
    );
  }

  const esMatriz = r.plan.disposicion === "matriz_de_tallas";


  return (
    <section className="card-cayla space-y-4 p-4">
      <div>
        <h2 className="font-display text-lg text-tinta">Qué es cada columna</h2>
        <p className="mt-0.5 text-xs text-tinta/65">
          {esMatriz
            ? `Este archivo tiene una columna por talla — cada fila se abrirá en varias prendas.`
            : `Cada fila del archivo es una prenda.`}{" "}
          Salen <strong className="text-tinta">{r.total}</strong> prendas.
        </p>
        {r.plan.notas && <p className="mt-1 text-[11px] italic text-tinta/50">{r.plan.notas}</p>}
      </div>

      {error && <p className="text-xs text-rojo">{error}</p>}

      {r.faltan.length > 0 && (
        <p className="rounded border border-rojo/30 p-2 text-xs text-rojo">
          Falta indicar: {r.faltan.map((f) => ETIQUETA[f]).join(", ")}. Sin eso la importación quedaría incompleta.
        </p>
      )}

      <div className="space-y-1">
        {r.plan.columnas.map((c) => {
          // Una columna de talla NO va a un campo: sus cantidades abren la fila
          // en una variante por talla. Mostrarla con el desplegable en "no
          // importar" diría exactamente lo contrario de lo que hace.
          const talla = r.plan.columnasTalla.find((t) => t.indice === c.indice);
          return (
            <div key={c.indice} className="flex flex-wrap items-center gap-2 border-t border-tinta/10 py-1.5 text-xs">
              <span className="w-40 shrink-0 truncate text-tinta" title={cabeceras[c.indice]}>
                {cabeceras[c.indice]?.trim() || <span className="italic text-tinta/30">sin título</span>}
              </span>
              {talla ? (
                <>
                  <span className="rounded border border-tinta/15 px-2 py-1 text-tinta/65">
                    Talla «{talla.talla}»
                  </span>
                  <span className="text-tinta/50">Cada cantidad de esta columna crea una prenda en esa talla.</span>
                </>
              ) : (
                <>
                  <select
                    value={c.campo}
                    onChange={(e) => cambiar(c.indice, e.target.value as Campo)}
                    disabled={cargando}
                    className={`rounded border bg-transparent px-2 py-1 text-tinta ${
                      c.confianza === "baja" ? "border-rojo/40" : "border-tinta/15"
                    }`}
                  >
                    {CAMPOS.map((campo) => (
                      <option key={campo} value={campo}>
                        {ETIQUETA[campo]}
                      </option>
                    ))}
                  </select>
                  <span className={c.confianza === "baja" ? "text-rojo" : "text-tinta/50"}>{c.porque}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-tinta/10 pt-3">
        <p className="label-cayla mb-2 text-[10px] text-tinta/50">Así quedarían las primeras prendas</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="label-cayla text-[10px] text-tinta/50">
              <tr>
                {["Prenda", "Talla", "Color", "Costo", "Precio"].map((h) => (
                  <th key={h} className="pb-1.5 pr-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.variantes.slice(0, 12).map((v, i) => (
                <tr key={i} className="border-t border-tinta/10">
                  <td className="py-1.5 pr-3 text-tinta">{v.referencia}</td>
                  <td className="py-1.5 pr-3 text-tinta">{v.talla || "—"}</td>
                  <td className="py-1.5 pr-3 text-tinta">{v.color || "—"}</td>
                  <td className="py-1.5 pr-3 text-tinta/65">{v.costo || "—"}</td>
                  <td className="py-1.5 pr-3 text-tinta">{v.precio || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {r.uso && (
        <p className="text-[10px] text-tinta/35">
          {r.uso.entrada} tokens de entrada · {r.uso.salida} de salida ≈ $
          {((r.uso.entrada * 1) / 1e6 + (r.uso.salida * 5) / 1e6).toFixed(4)}
        </p>
      )}
    </section>
  );
}
