"use client";

import { useRef, useState } from "react";
import { Boton, CampoTexto, Desplegable } from "@/components/ui/campos";
import { MapearColumnas } from "./MapearColumnas";
import { RevisarValores } from "./RevisarValores";
import type { PlanDeMapeo } from "@/lib/importacion/mapeo";

/**
 * Importar un catálogo: tres pasos que aparecen uno debajo del otro.
 *
 * POR QUÉ NO UN WIZARD CON "SIGUIENTE". Cada paso queda a la vista cuando el
 * siguiente aparece, porque corregir la fila de cabecera cambia las columnas, y
 * cambiar una columna cambia los colores: la persona tiene que poder volver
 * arriba y ver el efecto abajo sin perder nada. Un wizard esconde justo lo que
 * hay que poder tocar.
 *
 * EL MOVIMIENTO SIGUE LA GRAMÁTICA DE LA APP (globals.css, "capa de
 * movimiento"): cada paso ENTRA cuando la persona hizo algo —subió el archivo,
 * leyó las columnas— nunca solo al abrir la pantalla. Una cifra que cambió se
 * re-asienta. Nada rebota.
 */

type Tabla = { filas: string[][]; filaCabecera: number; origen: string };

const MAX_FILAS_VISIBLES = 30;

export function SubirCatalogo() {
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  // La cabecera detectada es una SUGERENCIA: acá se corrige, porque ninguna
  // heurística acierta con todos los Excel del mundo.
  const [filaCabecera, setFilaCabecera] = useState(0);
  const [plan, setPlan] = useState<PlanDeMapeo | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  async function enviar(cuerpo: FormData | string) {
    setCargando(true);
    setError(null);
    setPlan(null);
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
    // Se limpia para que volver a elegir el MISMO archivo dispare onChange.
    e.target.value = "";
  }

  const cabeceras = tabla?.filas[filaCabecera] ?? [];
  const datos = tabla?.filas.slice(filaCabecera + 1) ?? [];

  // Opciones del desplegable de cabecera: número de fila + un vistazo a lo que trae.
  const opcionesCabecera = (tabla?.filas ?? []).slice(0, 15).map((f, i) => ({
    valor: String(i),
    texto: `Fila ${i + 1} · ${f.filter((c) => c.trim()).slice(0, 3).join(", ").slice(0, 36) || "(vacía)"}`,
  }));

  return (
    <div className="space-y-6">
      {/* ---------- 1. el archivo ---------- */}
      <section className="card-cayla p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputArchivo}
            type="file"
            accept=".xlsx,.xlsm,.csv,.txt"
            onChange={subir}
            className="hidden"
            disabled={cargando}
          />
          <Boton type="button" peso="primario" cargando={cargando} onClick={() => inputArchivo.current?.click()}>
            Elegir archivo
          </Boton>
          <span className="text-xs text-tinta/65">Excel (.xlsx) o CSV, hasta 10 MB</span>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-sand pt-4">
          <div className="min-w-64 flex-1">
            <CampoTexto
              etiqueta="O un enlace de Google Sheets"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              pie="Compartida como «Cualquier persona con el enlace»."
            />
          </div>
          <div className="pb-[0.9rem]">
            <Boton
              type="button"
              peso="fantasma"
              disabled={!url.trim()}
              cargando={cargando && url.trim() !== ""}
              onClick={() => url.trim() && void enviar(JSON.stringify({ url: url.trim() }))}
            >
              Leer hoja
            </Boton>
          </div>
        </div>
      </section>

      {error && (
        <p className="anim-revelar rounded-md border border-rojo/30 bg-rojo/10 px-4 py-3 text-xs text-rojo-profundo">
          {error}
        </p>
      )}

      {/* ---------- 2. la tabla cruda ---------- */}
      {tabla && (
        <section key={tabla.origen} className="anim-entrada card-cayla p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-cayla text-[11px] text-tinta/65">Lo que trae el archivo</p>
              <h2 className="font-display mt-1 text-xl text-tinta">{tabla.origen}</h2>
              <p key={`${datos.length}-${cabeceras.length}`} className="anim-asentar mt-1 text-xs text-tinta/75">
                <span className="font-display text-base text-tinta">{datos.length}</span>{" "}
                {datos.length === 1 ? "fila" : "filas"} ·{" "}
                <span className="font-display text-base text-tinta">{cabeceras.length}</span> columnas
              </p>
            </div>
            <div className="w-72">
              <p className="label-cayla mb-1.5 text-[11px] text-tinta/65">La cabecera está en</p>
              <Desplegable
                valor={String(filaCabecera)}
                onValor={(v) => setFilaCabecera(Number(v))}
                opciones={opcionesCabecera}
                forma="pastilla"
              />
            </div>
          </div>

          {/* Scrollea dentro de su caja: un catálogo de 12 columnas no debe
              empujar la pantalla entera hacia los lados. */}
          <div className="scroll-cayla mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="label-cayla text-[10px] text-tinta/65">
                  <th className="pb-2 pr-2 font-semibold">#</th>
                  {cabeceras.map((c, i) => (
                    <th key={i} className="whitespace-nowrap pb-2 pr-4 font-semibold">
                      {c.trim() || <span className="normal-case italic tracking-normal text-tinta/35">sin título</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {datos.slice(0, MAX_FILAS_VISIBLES).map((f, i) => (
                  <tr key={i} className="transition-colors duration-150 hover:bg-tinta/[0.025]">
                    <td className="py-2 pr-2 tabular-nums text-tinta/35">{i + 1}</td>
                    {f.map((c, j) => (
                      <td key={j} className="whitespace-nowrap py-2 pr-4 text-tinta">
                        {c || <span className="text-tinta/25">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {datos.length > MAX_FILAS_VISIBLES && (
            <p className="mt-3 text-xs text-tinta/65">
              Se muestran las primeras {MAX_FILAS_VISIBLES}. Las {datos.length - MAX_FILAS_VISIBLES} restantes
              también se importan.
            </p>
          )}
        </section>
      )}

      {/* ---------- 3. qué es cada columna ---------- */}
      {/* La `key` fuerza a rehacer el mapeo si cambia el archivo o la fila de
          cabecera: sin ella, corregir la cabecera dejaría en pantalla un plan
          calculado sobre las columnas viejas. */}
      {tabla && (
        <MapearColumnas
          key={`${tabla.origen}:${filaCabecera}`}
          filas={tabla.filas}
          filaCabecera={filaCabecera}
          onListo={setPlan}
        />
      )}

      {/* ---------- 4. colores, categorías, e importar ---------- */}
      {tabla && plan && (
        <RevisarValores
          key={JSON.stringify(plan.columnas.map((c) => c.campo))}
          filas={tabla.filas}
          filaCabecera={filaCabecera}
          plan={plan}
          origen={tabla.origen}
        />
      )}
    </div>
  );
}
