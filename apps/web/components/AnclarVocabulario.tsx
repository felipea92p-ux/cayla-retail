"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/campos";

/**
 * Pantalla de anclaje del vocabulario propio al estándar universal (0052).
 *
 * LA REGLA QUE GOBIERNA ESTA PANTALLA: la IA propone, una persona confirma.
 * Nada de lo que el modelo devuelve toca la base hasta que alguien lo mira. No
 * es desconfianza teórica — anclar mal es invisible: nada falla, "Palo rosa"
 * queda colgando de Beige y no se nota hasta que un reporte agrupa mal meses
 * después. Un error que no avisa hay que atajarlo antes, no después.
 *
 * EL COLOR DICE CUÁNTO FIARSE, con los tonos del sistema y no con rojo: ámbar
 * para lo dudoso, verde para lo hecho. Rojo es el acento sagrado y ya lo gasta
 * el error.
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

/** La ruta universal entera es larga; en pantalla alcanza con la hoja. */
function hoja(ruta: string) {
  return ruta.split(" > ").pop() ?? ruta;
}

export function AnclarVocabulario({
  que,
  titulo,
  terminos,
  universales,
  puedeEditar,
}: {
  que: "colores" | "categorias";
  titulo: string;
  terminos: Termino[];
  universales: Universal[];
  puedeEditar: boolean;
}) {
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [guardadas, setGuardadas] = useState(0);

  const anclados = terminos.filter((t) => t.ancladoA !== null).length + guardadas;
  const pendientes = terminos.length - anclados;
  const etiquetaDe = (u: Universal) => u.ruta ?? u.nombre;

  async function proponer() {
    setProponiendo(true);
    setAviso(null);
    try {
      const res = await fetch("/api/taxonomia/anclar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ que }),
      });
      const datos = await res.json();
      if (!res.ok) {
        setAviso({ tono: "error", texto: datos.error ?? "No se pudo consultar el anclaje." });
        return;
      }
      if ((datos.anclajes ?? []).length === 0) {
        setAviso({ tono: "ok", texto: datos.mensaje ?? "No quedó nada por anclar." });
        return;
      }
      setPropuestas(datos.anclajes);
    } catch {
      setAviso({ tono: "error", texto: "No se pudo hablar con el servidor. Reintenta en un momento." });
    } finally {
      setProponiendo(false);
    }
  }

  async function guardar() {
    if (!propuestas) return;
    setGuardando(true);
    setAviso(null);
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
        setAviso({ tono: "error", texto: datos.error ?? "No se pudieron guardar los anclajes." });
        return;
      }
      setGuardadas(datos.guardados ?? 0);
      setPropuestas(null);
      setAviso({ tono: "ok", texto: `Se anclaron ${datos.guardados} términos.` });
    } catch {
      setAviso({ tono: "error", texto: "No se pudo hablar con el servidor. Reintenta en un momento." });
    } finally {
      setGuardando(false);
    }
  }

  function corregir(clave: string, etiqueta: string) {
    const u = universales.find((x) => etiquetaDe(x) === etiqueta);
    setPropuestas((actual) =>
      (actual ?? []).map((p) =>
        p.clave === clave
          ? {
              ...p,
              universalId: u?.id ?? null,
              nombreUniversal: u ? etiquetaDe(u) : null,
              confianza: "alta",
              porque: "Corregido a mano.",
            }
          : p
      )
    );
  }

  const listaId = `universales-${que}`;

  return (
    <section className="card-cayla p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-tinta">{titulo}</h2>
          <p key={anclados} className="anim-asentar mt-1 text-xs text-tinta/75">
            <span className="font-display text-base text-tinta">{anclados}</span> de {terminos.length} anclados
            {pendientes > 0 ? (
              <>
                {" "}
                · faltan <span className="font-display text-base text-tinta">{pendientes}</span>
              </>
            ) : (
              <>
                {" "}
                ·{" "}
                <span className="label-cayla inline-flex items-center rounded-full border border-verde/45 bg-verde/10 px-2.5 py-0.5 text-[10px] text-verde-profundo">
                  completo
                </span>
              </>
            )}
          </p>
        </div>
        {puedeEditar && pendientes > 0 && !propuestas && (
          <Boton type="button" peso="primario" cargando={proponiendo} onClick={() => void proponer()}>
            Proponer los {pendientes} que faltan
          </Boton>
        )}
      </div>

      {aviso && (
        <p
          className={`anim-revelar mt-4 rounded-md border px-4 py-3 text-xs ${
            aviso.tono === "error"
              ? "border-rojo/30 bg-rojo/10 text-rojo-profundo"
              : "border-verde/45 bg-verde/10 text-verde-profundo"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {propuestas ? (
        <div className="anim-entrada mt-5 space-y-5">
          <div className="scroll-cayla overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="label-cayla text-[10px] text-tinta/65">
                  <th className="pb-2 pr-4 font-semibold">De la marca</th>
                  <th className="pb-2 pr-4 font-semibold">Cuelga de</th>
                  <th className="pb-2 font-semibold">Por qué</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {propuestas.map((p) => {
                  const dudosa = p.confianza === "baja" || !p.universalId;
                  return (
                    <tr key={p.clave} className="align-top transition-colors duration-150 hover:bg-tinta/[0.025]">
                      <td className="py-2.5 pr-4 text-sm text-tinta">{p.nombrePropio}</td>
                      <td className="py-2.5 pr-4">
                        {/* Un input con datalist y no el Desplegable propio: son
                            1.804 categorías, y un menú de 1.804 filas no es un
                            menú. Escribir para filtrar es lo correcto acá. */}
                        <div className="relative min-w-52">
                          <input
                            list={listaId}
                            defaultValue={p.nombreUniversal ? hoja(p.nombreUniversal) : ""}
                            onBlur={(e) => {
                              const u = universales.find((x) => hoja(etiquetaDe(x)) === e.target.value || etiquetaDe(x) === e.target.value);
                              corregir(p.clave, u ? etiquetaDe(u) : "");
                            }}
                            placeholder="sin anclar"
                            className="w-full bg-transparent px-0.5 py-1.5 text-sm text-tinta outline-none placeholder:text-tinta/55"
                          />
                          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px rounded-full bg-tinta/25" />
                          <span
                            aria-hidden
                            className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full transition-transform duration-300 ease-cayla ${
                              dudosa ? "scale-x-100 bg-ambar" : "scale-x-0 bg-rojo"
                            }`}
                          />
                        </div>
                      </td>
                      <td className={`py-2.5 text-xs ${dudosa ? "text-ambar-profundo" : "text-tinta/65"}`}>
                        {p.universalId ? p.porque : "Ninguno calzó — elígelo tú o déjalo sin anclar."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Una sola lista para toda la tabla: repetirla por fila serían 1.804
              opciones × N filas en el DOM. Se ofrece la hoja, que es lo que la
              persona reconoce; el onBlur la vuelve a resolver a la ruta. */}
          <datalist id={listaId}>
            {universales.map((u) => (
              <option key={u.id} value={hoja(etiquetaDe(u))} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center gap-3">
            <Boton type="button" peso="primario" cargando={guardando} onClick={() => void guardar()}>
              Guardar {propuestas.filter((p) => p.universalId).length} anclajes
            </Boton>
            <Boton type="button" peso="discreto" disabled={guardando} onClick={() => setPropuestas(null)}>
              Descartar
            </Boton>
          </div>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-tinta/5">
          {terminos.map((t) => (
            <li key={t.clave} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
              <span className="text-tinta">{t.nombre}</span>
              {t.ancladoA ? (
                <span className="text-xs text-tinta/65">→ {hoja(t.ancladoA.nombre)}</span>
              ) : (
                <span className="text-xs text-tinta/35">sin anclar</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
