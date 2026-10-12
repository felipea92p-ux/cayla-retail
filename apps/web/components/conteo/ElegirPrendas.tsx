"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import {
  RESULTADOS_POR_PAGINA,
  MAX_PRENDAS_POR_CONTEO,
  buscarPrendas,
  indiceDePrendas,
  nombreDePrenda,
  prendasDelLugar,
  sumarElegidas,
  textoPrendas,
  type LugarDeConteo,
  type PrendaDelLugar,
} from "@/lib/conteo-por-prenda";
import type { EstadoDePrendas } from "@/lib/usePrendasParaContar";
import { Aviso } from "@/components/ui/Aviso";

/* ====================================================================
   ElegirPrendas · «Por prenda» dentro de «¿Qué vas a contar?» (Abrir un conteo, 2026-10-01)

   Un buscador con el MISMO filtro que Existencias (`lib/filtro-busqueda-especial.ts`: varias palabras en cualquier orden, sin
   tildes, color y talla reconocidos, código con o sin guiones) sobre las prendas que tienen stock en el lugar elegido. Cada prenda
   que se toca queda elegida (ficha con «×» abajo); la lista de contar mostrará solo esas.

   Escribir un código —o escanearlo— y pulsar Enter agrega la prenda si es la única que coincide: elegir por escáner es el camino
   más corto para «esta prenda exacta». Con varias coincidencias Enter no adivina.

   No dice cuántas unidades espera CAYLA de cada prenda: el inicio de Conteo solo habla de variantes.

   Todo lo que se puede contar se decide en `lib/conteo-por-prenda.ts` (con su prueba); aquí solo se dibuja.
   ==================================================================== */

export function ElegirPrendas({
  estado,
  reintentar,
  activo,
  lugarTexto,
  lugar,
  prendas,
  elegidas,
  onElegidas,
  quitadasPorLugar,
}: {
  estado: EstadoDePrendas;
  reintentar: () => void;
  /** «Por prenda» está a la vista: solo entonces se pone el cursor en el buscador. */
  activo: boolean;
  /** «el Piso de venta» / «el Almacén de tienda» / `null` si todavía no se eligió dónde (en una sede que los separa). */
  lugarTexto: string | null;
  /** El lugar a contar (piso, almacén o toda la ubicación); `null` = todavía sin elegir. */
  lugar: LugarDeConteo | null;
  /** TODAS las prendas de la sede tal como llegaron (`null` = aún sin leer): este componente se queda con las del lugar. */
  prendas: readonly PrendaDelLugar[] | null;
  elegidas: readonly string[];
  onElegidas: (ids: string[]) => void;
  /** Cuántas prendas se quitaron solas al cambiar de lugar (0 = ninguna). */
  quitadasPorLugar: number;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const idAyuda = useId();
  const [consulta, setConsulta] = useState("");
  const [visibles, setVisibles] = useState(RESULTADOS_POR_PAGINA);
  const [sobraron, setSobraron] = useState(0);
  const [anuncio, setAnuncio] = useState("");

  const hayLugar = lugar !== null && lugarTexto !== null;
  const listo = estado === "listo" && hayLugar;

  // Al pedir «Por prenda» el cursor va al buscador, salvo en un celular (abriría el teclado sin que la persona lo pida).
  useEffect(() => {
    if (activo && listo && !window.matchMedia("(pointer: coarse)").matches) campo.current?.focus({ preventScroll: true });
  }, [activo, listo]);

  // Las del lugar elegido, indexadas UNA vez por lista (no en cada tecla): cambia solo si llegan prendas o se cambia de lugar.
  const disponibles = useMemo(() => (prendas && lugar ? prendasDelLugar(prendas, lugar) : []), [prendas, lugar]);
  const indice = useMemo(() => indiceDePrendas(disponibles), [disponibles]);
  const porId = useMemo(() => new Map(disponibles.map((p) => [p.varianteId, p])), [disponibles]);
  // El texto se aplaza un cuadro: con ~1.000 prendas por lugar, cada tecla no debe esperar al filtro.
  const consultaDiferida = useDeferredValue(consulta);
  const resultados = useMemo(() => buscarPrendas(indice, consultaDiferida), [indice, consultaDiferida]);
  const elegidasSet = useMemo(() => new Set(elegidas), [elegidas]);
  const sinElegir = resultados.filter((p) => !elegidasSet.has(p.varianteId));

  function cambiar(ids: string[], dicho?: string) {
    setSobraron(0);
    if (dicho) setAnuncio(dicho);
    onElegidas(ids);
  }

  function agregar(prendas: readonly PrendaDelLugar[]) {
    const { elegidas: nuevas, sobraron: noEntraron } = sumarElegidas(elegidas, prendas.map((p) => p.varianteId));
    onElegidas(nuevas);
    setSobraron(noEntraron);
    const entraron = nuevas.length - elegidas.length;
    if (entraron > 0) setAnuncio(entraron === 1 ? `Agregada: ${nombreDePrenda(prendas[0])}` : `Agregadas ${entraron} prendas`);
  }

  function alternar(p: PrendaDelLugar) {
    if (elegidasSet.has(p.varianteId)) cambiar(elegidas.filter((id) => id !== p.varianteId), `Quitada: ${nombreDePrenda(p)}`);
    else agregar([p]);
  }

  return (
    <div className="space-y-3 pt-3">
      {!hayLugar && (
        <p className="text-[13px] text-taupe">Primero elige dónde vas a contar: así solo se buscan las prendas de ese lugar.</p>
      )}

      {hayLugar && estado === "cargando" && (
        <p role="status" className="text-[13px] text-taupe">
          Cargando las prendas de la sede…
        </p>
      )}

      {hayLugar && estado === "fallo" && (
        <div role="alert" className="flex flex-col items-start gap-1.5 rounded-xl border border-ambar/35 bg-ambar/[0.07] px-3.5 py-3 text-sm @[36rem]:flex-row @[36rem]:items-center @[36rem]:gap-3">
          <span className="min-w-0 flex-1 text-tinta">No pudimos cargar las prendas. Puedes reintentar, o contar «Todo» o «Una categoría», que no las necesitan.</span>
          <button type="button" onClick={reintentar} className="btn-cayla btn-secundario text-sm">
            Reintentar
          </button>
        </div>
      )}

      {listo && (
        <>
          <label className="caja-cayla relative flex items-center gap-2 px-3 @[30rem]:max-w-md">
            <Search className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
            <span className="sr-only">Buscar prenda para contar</span>
            <input
              ref={campo}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={consulta}
              aria-describedby={idAyuda}
              onChange={(e) => {
                setConsulta(e.target.value);
                setVisibles(RESULTADOS_POR_PAGINA);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && consulta) {
                  // Un control que usa el Escape (aquí, borra su búsqueda) no lo deja pasar (ADR-0136).
                  e.stopPropagation();
                  setConsulta("");
                  return;
                }
                // Un código escrito o escaneado + Enter: si es UNA sola prenda, queda elegida y el campo se vacía para la siguiente.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (consulta === consultaDiferida && resultados.length === 1 && !elegidasSet.has(resultados[0].varianteId)) {
                    agregar([resultados[0]]);
                    setConsulta("");
                  }
                }
              }}
              placeholder="Buscar prenda, código, color o talla..."
              className="h-10 w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/55"
            />
          </label>

          <p id={idAyuda} className="text-[13px] text-taupe">
            {consultaDiferida.trim() === ""
              ? `Escribe el nombre, el color, la talla o el código, en el orden que quieras. Solo salen las prendas registradas en ${lugarTexto}.`
              : resultados.length === 0
                ? `Ninguna prenda registrada en ${lugarTexto} coincide con «${consultaDiferida.trim()}».`
                : `${textoCoinciden(resultados.length)}${sinElegir.length < resultados.length ? ` · ${resultados.length - sinElegir.length} ya elegida${resultados.length - sinElegir.length === 1 ? "" : "s"}` : ""}`}
          </p>

          {resultados.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-sand bg-papel">
              {sinElegir.length > 1 && (
                <div className="flex items-center justify-between gap-3 border-b border-sand bg-hueso/60 px-3 py-2">
                  <span className="text-xs text-taupe">¿Todas las tallas y colores de lo que buscaste?</span>
                  <button type="button" onClick={() => agregar(sinElegir)} className="btn-cayla btn-enlace text-[13px]">
                    Agregar las {sinElegir.length}
                  </button>
                </div>
              )}
              <ul role="list" aria-label="Prendas que coinciden" className="max-h-72 divide-y divide-sand overflow-y-auto">
                {resultados.slice(0, visibles).map((p) => {
                  const elegida = elegidasSet.has(p.varianteId);
                  return (
                    <li key={p.varianteId}>
                      <button
                        type="button"
                        aria-pressed={elegida}
                        onClick={() => alternar(p)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-150 ease-cayla hover:bg-sand/30 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tinta/60 ${elegida ? "bg-sand/40" : ""}`}
                      >
                        {/* Dos líneas a propósito: lo que distingue una fila de la de al lado es el color y la talla, y en una sola
                            línea angosta (375 px) «Blusa Valentina · Blanc…» las dejaba todas iguales. */}
                        <span className="flex min-w-0 items-center gap-2.5">
                          <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} {...categoriaDe(p)} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-tinta">{p.referencia}</span>
                            <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-tinta/65">
                              <span className="shrink-0 font-medium text-tinta/80">{[p.color, p.talla].filter(Boolean).join(" · ") || "—"}</span>
                              <span className="min-w-0 truncate font-mono">{p.sku}</span>
                            </span>
                          </span>
                        </span>
                        <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${elegida ? "font-medium text-tinta" : "text-taupe"}`}>
                          {elegida ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                          {elegida ? "Elegida" : "Elegir"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {resultados.length > visibles && (
                <div className="border-t border-sand px-3 py-2 text-center">
                  <button type="button" onClick={() => setVisibles((n) => n + RESULTADOS_POR_PAGINA)} className="btn-cayla btn-enlace text-[13px]">
                    Ver más ({resultados.length - visibles} sin mostrar)
                  </button>
                </div>
              )}
            </div>
          )}

          {sobraron > 0 && (
            <Aviso tono="error" chico>
              Un conteo por prenda admite hasta {MAX_PRENDAS_POR_CONTEO} prendas: {sobraron === 1 ? "1 no entró" : `${sobraron} no entraron`}. Para más, cuenta una categoría o todo el lugar.
            </Aviso>
          )}

          {quitadasPorLugar > 0 && (
            <p role="status" className="text-[13px] text-taupe">
              Se quitaron {textoPrendas(quitadasPorLugar)} que no están registradas en {lugarTexto}: cada lugar tiene las suyas.
            </p>
          )}
        </>
      )}

      {elegidas.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-tinta">Para contar · {textoPrendas(elegidas.length)}</p>
            <button type="button" onClick={() => cambiar([], "Se quitaron todas las prendas")} className="btn-cayla btn-enlace text-xs">
              Quitar todas
            </button>
          </div>
          <ul role="list" aria-label="Prendas elegidas" className="-mx-0.5 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto p-0.5">
            {elegidas.map((id) => {
              const p = porId.get(id);
              const nombre = p ? nombreDePrenda(p) : "Prenda";
              return (
                <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-tinta bg-tinta py-1 pl-3 pr-1.5 text-[13px] text-crema">
                  <span className="truncate">{nombre}</span>
                  <button
                    type="button"
                    aria-label={`Quitar ${nombre}`}
                    onClick={() => cambiar(elegidas.filter((x) => x !== id), `Quitada: ${nombre}`)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-crema/80 transition-colors hover:bg-crema/15 hover:text-crema focus-visible:outline focus-visible:outline-2 focus-visible:outline-crema/70"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}

function textoCoinciden(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "prenda coincide" : "prendas coinciden"}`;
}
