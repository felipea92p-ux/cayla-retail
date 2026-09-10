"use client";

import { useState } from "react";

/**
 * Paso 1 de la importación: mirar el archivo del cliente antes de tocar nada.
 *
 * POR QUÉ ESTA PANTALLA EXISTE SOLA, SIN IA. Es el paso que confirma que el
 * sistema entendió el archivo — qué hoja, dónde empieza la tabla, qué columnas
 * hay. Si acá ya se ve mal, no tiene sentido gastar una llamada al modelo para
 * mapear columnas que están corridas. Y como no llama a la IA ni escribe en la
 * base, se puede probar con el archivo de cualquier cliente sin consecuencias.
 */

type Tabla = { filas: string[][]; filaCabecera: number; origen: string };

const MAX_FILAS_VISIBLES = 30;

export function SubirCatalogo() {
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  // La cabecera detectada es una SUGERENCIA: acá se puede corregir, porque
  // ninguna heurística acierta con todos los Excel del mundo.
  const [filaCabecera, setFilaCabecera] = useState(0);

  async function enviar(cuerpo: FormData | string) {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/importacion/leer", {
        method: "POST",
        ...(typeof cuerpo === "string"
          ? { headers: { "Content-Type": "application/json" }, body: cuerpo }
          : { body: cuerpo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setError(datos.error ?? "No se pudo leer el archivo.");
        setTabla(null);
        return;
      }
      setTabla(datos);
      setFilaCabecera(datos.filaCabecera);
    } catch {
      setError("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("archivo", f);
    void enviar(fd);
  }

  const cabeceras = tabla?.filas[filaCabecera] ?? [];
  const datos = tabla?.filas.slice(filaCabecera + 1) ?? [];

  return (
    <div className="space-y-4">
      <section className="card-cayla space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="label-cayla cursor-pointer rounded border border-tinta/20 px-3 py-1.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo">
            <input type="file" accept=".xlsx,.xlsm,.csv,.txt" onChange={subir} className="hidden" disabled={cargando} />
            {cargando ? "Leyendo…" : "Elegir archivo"}
          </label>
          <span className="text-[11px] text-tinta/50">Excel (.xlsx) o CSV, hasta 10 MB</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-tinta/10 pt-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="…o pega un enlace de Google Sheets"
            className="min-w-64 flex-1 rounded border border-tinta/15 bg-transparent px-2 py-1.5 text-xs text-tinta"
          />
          <button
            onClick={() => url.trim() && void enviar(JSON.stringify({ url: url.trim() }))}
            disabled={cargando || !url.trim()}
            className="label-cayla rounded border border-tinta/20 px-3 py-1.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40"
          >
            Leer hoja
          </button>
        </div>
        <p className="text-[11px] text-tinta/50">
          La hoja tiene que estar compartida como «Cualquier persona con el enlace».
        </p>
      </section>

      {error && <p className="card-cayla p-4 text-xs text-rojo">{error}</p>}

      {tabla && (
        <section className="card-cayla space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-lg text-tinta">{tabla.origen}</h2>
              <p className="mt-0.5 text-xs text-tinta/65">
                {datos.length} {datos.length === 1 ? "fila" : "filas"} · {cabeceras.length} columnas
              </p>
            </div>
            <label className="text-[11px] text-tinta/65">
              La cabecera está en la fila{" "}
              <select
                value={filaCabecera}
                onChange={(e) => setFilaCabecera(Number(e.target.value))}
                className="rounded border border-tinta/15 bg-transparent px-1 py-0.5 text-tinta"
              >
                {tabla.filas.slice(0, 15).map((f, i) => (
                  <option key={i} value={i}>
                    {i + 1} — {f.filter((c) => c.trim()).slice(0, 3).join(", ").slice(0, 40) || "(vacía)"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* La tabla scrollea dentro de su propia caja: un catálogo de 12 columnas
              no debe empujar la pantalla entera hacia los lados. */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-cayla text-[10px] text-tinta/50">
                <tr>
                  <th className="pb-2 pr-2 font-normal">#</th>
                  {cabeceras.map((c, i) => (
                    <th key={i} className="whitespace-nowrap pb-2 pr-3 font-normal">
                      {c.trim() || <span className="italic text-tinta/30">sin título</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.slice(0, MAX_FILAS_VISIBLES).map((f, i) => (
                  <tr key={i} className="border-t border-tinta/10">
                    <td className="py-1.5 pr-2 text-tinta/35">{i + 1}</td>
                    {f.map((c, j) => (
                      <td key={j} className="whitespace-nowrap py-1.5 pr-3 text-tinta">
                        {c || <span className="text-tinta/20">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {datos.length > MAX_FILAS_VISIBLES && (
            <p className="text-[11px] text-tinta/50">
              Se muestran las primeras {MAX_FILAS_VISIBLES}. Las {datos.length - MAX_FILAS_VISIBLES} restantes
              también se importarán.
            </p>
          )}

          <p className="border-t border-tinta/10 pt-3 text-xs text-tinta/65">
            Si las columnas se ven en su sitio, el siguiente paso es decirle al sistema qué es cada una.
            Todavía no se guardó nada.
          </p>
        </section>
      )}
    </div>
  );
}
