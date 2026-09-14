"use client";

import { avisar } from "@/components/ui/Avisos";
import { useState } from "react";

/**
 * Pantalla de anclaje del vocabulario propio al estándar universal (0052).
 *
 * LA REGLA QUE GOBIERNA ESTA PANTALLA: la IA propone, una persona confirma.
 * Nada de lo que el modelo devuelve toca la base hasta que alguien lo mira. No
 * es desconfianza teórica — anclar mal es invisible: nada falla, "Palo rosa"
 * queda colgando de Beige y no se nota hasta que un reporte agrupa mal meses
 * después. Un error que no avisa hay que atajarlo antes, no después.
 */

type Termino = {
  clave: string;
  nombre: string;
  contexto?: string;
  ancladoA: { id: string; nombre: string } | null;
};

type Universal = { id: string; nombre: string; ruta?: string };

type Propuesta = {
  clave: string;
  universalId: string | null;
  confianza: "exacta" | "alta" | "media" | "baja";
  porque: string;
  nombrePropio: string;
  nombreUniversal: string | null;
};

const COLOR_CONFIANZA: Record<Propuesta["confianza"], string> = {
  exacta: "text-tinta/50",
  alta: "text-tinta/50",
  media: "text-tinta/65",
  // La baja se marca en rojo a propósito: es la que hay que mirar, y en una
  // tabla de 30 filas lo que no resalta no se revisa.
  baja: "text-rojo",
};

export function AnclarVocabulario({
  que,
  titulo,
  terminos,
  universales,
}: {
  que: "colores" | "categorias";
  titulo: string;
  terminos: Termino[];
  universales: Universal[];
}) {
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardadas, setGuardadas] = useState(0);

  const anclados = terminos.filter((t) => t.ancladoA !== null).length;
  const pendientes = terminos.length - anclados - guardadas;
  const etiquetaDe = (u: Universal) => u.ruta ?? u.nombre;

  async function proponer() {
    setCargando(true);
    try {
      const res = await fetch("/api/taxonomia/anclar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ que }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo consultar el anclaje.");
        return;
      }
      if ((datos.anclajes ?? []).length === 0) {
        avisar.aviso(datos.mensaje ?? "No quedó nada por anclar.");
        return;
      }
      setPropuestas(datos.anclajes);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  async function guardar() {
    if (!propuestas) return;
    setCargando(true);
    try {
      const res = await fetch("/api/taxonomia/anclar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          que,
          anclajes: propuestas.map((p) => ({ clave: p.clave, universalId: p.universalId })),
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudieron guardar los anclajes.");
        return;
      }
      setGuardadas(datos.guardados ?? 0);
      setPropuestas(null);
      avisar.exito(`Se anclaron ${datos.guardados} términos`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCargando(false);
    }
  }

  function corregir(clave: string, etiqueta: string) {
    const u = universales.find((x) => etiquetaDe(x) === etiqueta);
    setPropuestas((actual) =>
      (actual ?? []).map((p) =>
        p.clave === clave
          ? { ...p, universalId: u?.id ?? null, nombreUniversal: u ? etiquetaDe(u) : null, confianza: "alta", porque: "Corregido a mano." }
          : p
      )
    );
  }

  return (
    <section className="card-cayla space-y-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-tinta">{titulo}</h2>
          <p className="mt-0.5 text-xs text-tinta/65">
            {anclados + guardadas} de {terminos.length} anclados
            {pendientes > 0 ? ` · faltan ${pendientes}` : " · completo"}
          </p>
        </div>
        {pendientes > 0 && !propuestas && (
          <button
            onClick={proponer}
            disabled={cargando}
            className="label-cayla rounded border border-tinta/20 px-3 py-1.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40"
          >
            {cargando ? "Consultando…" : `Proponer los ${pendientes} que faltan`}
          </button>
        )}
      </div>


      {propuestas && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-cayla text-[10px] text-tinta/50">
                <tr>
                  <th className="pb-2 pr-3 font-normal">De la marca</th>
                  <th className="pb-2 pr-3 font-normal">Cuelga de</th>
                  <th className="pb-2 font-normal">Por qué</th>
                </tr>
              </thead>
              <tbody>
                {propuestas.map((p) => (
                  <tr key={p.clave} className="border-t border-tinta/10 align-top">
                    <td className="py-2 pr-3 text-tinta">{p.nombrePropio}</td>
                    <td className="py-2 pr-3">
                      <input
                        list={`universales-${que}`}
                        defaultValue={p.nombreUniversal ?? ""}
                        onBlur={(e) => corregir(p.clave, e.target.value)}
                        placeholder="sin anclar"
                        className={`w-full min-w-48 rounded border bg-transparent px-2 py-1 text-tinta ${
                          p.universalId ? "border-tinta/15" : "border-rojo/40"
                        }`}
                      />
                    </td>
                    <td className={`py-2 ${COLOR_CONFIANZA[p.confianza]}`}>
                      {p.universalId ? p.porque : "Ninguno calzó — elígelo tú o déjalo sin anclar."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Una sola lista para toda la tabla: repetirla por fila serían 1.849
              opciones × N filas en el DOM. */}
          <datalist id={`universales-${que}`}>
            {universales.map((u) => (
              <option key={u.id} value={etiquetaDe(u)} />
            ))}
          </datalist>

          <div className="flex items-center gap-3">
            <button
              onClick={guardar}
              disabled={cargando}
              className="label-cayla rounded bg-tinta px-4 py-2 text-[11px] text-hueso transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {cargando ? "Guardando…" : `Guardar ${propuestas.filter((p) => p.universalId).length} anclajes`}
            </button>
            <button
              onClick={() => setPropuestas(null)}
              className="label-cayla text-[11px] text-tinta/65 hover:text-rojo"
            >
              Descartar
            </button>
          </div>
        </>
      )}

      {!propuestas && (
        <ul className="space-y-1 text-xs">
          {terminos.map((t) => (
            <li key={t.clave} className="flex flex-wrap items-baseline gap-x-2 border-t border-tinta/10 py-1.5">
              <span className="text-tinta">{t.nombre}</span>
              {t.ancladoA ? (
                <span className="text-tinta/50">→ {t.ancladoA.nombre}</span>
              ) : (
                <span className="text-tinta/35">sin anclar</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
