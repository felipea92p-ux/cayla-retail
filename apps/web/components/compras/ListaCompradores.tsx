"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, SearchX } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import {
  PERSONAS_PARA_BUSCAR,
  etiquetasDePersona,
  filtrarCompradores,
  fraseDePersona,
  repartoDeLista,
  type FilaComprador,
  type FiltroCompradores,
} from "@/lib/compradores-reglas";
import { soles } from "@/lib/compras-reglas";
import { primerNombre } from "@/lib/fondos-reglas";

// La lista de Compradores (ADR-0704, act. 2026-11-26 d): una línea por persona —su nombre, UNA frase, las etiquetas de lo que toca hacer aquí
// y lo que le queda, con la barra de cuánto gastó—. Pensada para crecer (Felipe 2026-11-26: «siempre piensa en la escalabilidad»): filtros
// por lo pendiente, buscador desde 9 personas, y quien no tiene plata ni pendientes plegado tras «Ver N más» cuando son más de tres.

const FILTROS: { clave: FiltroCompradores; nombre: string }[] = [
  { clave: "", nombre: "Todos" },
  { clave: "revisar", nombre: "Por revisar" },
  { clave: "pagar", nombre: "Falta pagar" },
];

export function ListaCompradores({ filas }: { filas: FilaComprador[] }) {
  const [filtro, setFiltro] = useState<FiltroCompradores>("");
  const [busqueda, setBusqueda] = useState("");
  const [verTodos, setVerTodos] = useState(false);
  const cuantos = (f: FiltroCompradores) => filtrarCompradores(filas, f, "").length;
  const visibles = filtrarCompradores(filas, filtro, busqueda);
  const { arriba, plegadas } = repartoDeLista(visibles, filtro !== "" || busqueda.trim() !== "");
  // Sin nada pendiente, los filtros sobran: solo se dibujan los que tienen a alguien.
  const filtros = FILTROS.filter((f) => f.clave === "" || cuantos(f.clave) > 0);

  return (
    <section className="space-y-3">
      {(filtros.length > 1 || filas.length > PERSONAS_PARA_BUSCAR) && (
        <div className="flex flex-wrap items-center gap-2" data-guia="compradores.filtros">
          {filtros.length > 1 &&
            filtros.map((f) => (
              <button key={f.clave} type="button" className="pildora-cayla" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
                {f.nombre}
                <span className="pildora-cayla__n">{cuantos(f.clave)}</span>
              </button>
            ))}
          {filas.length > PERSONAS_PARA_BUSCAR && (
            <Buscador valor={busqueda} onCambio={setBusqueda} etiqueta="Buscar persona" placeholder="Buscar persona" className="w-full sm:ml-auto sm:w-64" />
          )}
        </div>
      )}

      <div className="card-cayla p-0" data-guia="compradores.personas">
        {visibles.length === 0 ? (
          <Vacio tamano="chico" icono={<SearchX />} titulo={busqueda.trim() ? `Nadie se llama «${busqueda.trim()}»` : "Nadie con eso pendiente"} />
        ) : (
          <>
            <ul className="divide-y divide-sand">
              {arriba.map((f) => (
                <FilaPersona key={f.personaId} f={f} />
              ))}
            </ul>
            {plegadas.length > 0 && (
              <>
                <FilasDeMas abierto={verTodos} id="compradores-sin-nada" alEncontrar={() => setVerTodos(true)}>
                  <ul className="divide-y divide-sand border-t border-sand">
                    {plegadas.map((f) => (
                      <FilaPersona key={f.personaId} f={f} />
                    ))}
                  </ul>
                </FilasDeMas>
                <BotonVerMas abierto={verTodos} onCambiar={setVerTodos} controla="compradores-sin-nada" texto={`Ver ${plegadas.length} más, sin plata ni pendientes`} />
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function FilaPersona({ f }: { f: FilaComprador }) {
  const cero = Math.abs(f.queda) <= 0.005;
  const deMas = f.queda < -0.005;
  const frase = fraseDePersona(f);
  const etiquetas = [...(deMas ? ["Pagó de más"] : []), ...etiquetasDePersona(f, soles)];
  const chips = etiquetas.map((e) => (
    <Chip key={e} tono="ambar">
      {e}
    </Chip>
  ));
  return (
    <li>
      <Link href={`/compras/compradores/${f.personaId}`} className="group flex min-h-[4.75rem] items-center gap-4 px-5 py-4 sm:px-6 vd-pasa">
        <AvatarPersona personaId={f.personaId} nombre={f.persona} tamano={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-tinta">{primerNombre(f.persona)}</span>
          <span className={`block text-detalle sm:truncate ${frase.avisa ? "text-ambar" : "text-secundario"}`}>{frase.texto}</span>
          {chips.length > 0 && <span className="mt-2 flex flex-wrap gap-2 sm:hidden">{chips}</span>}
        </span>
        {chips.length > 0 && <span className="hidden shrink-0 flex-wrap justify-end gap-2 sm:flex">{chips}</span>}
        <span className="shrink-0 text-right sm:w-44">
          <span className={`font-display block text-xl leading-tight tabular-nums sm:text-2xl ${deMas ? "text-ambar" : cero ? "text-tenue" : "text-tinta"}`}>{soles(Math.abs(f.queda))}</span>
          {f.dieron > 0.005 && (
            <>
              <BarraAvance pct={f.usado ?? 0} alto="fina" tono="tinta" decorativa className="mt-2 w-full" />
              <span className="sr-only">
                , gastó {soles(f.gasto)} de {soles(f.dieron)}
              </span>
            </>
          )}
        </span>
        <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-tenue transition-transform duration-300 sm:block [@media(hover:hover)]:group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
