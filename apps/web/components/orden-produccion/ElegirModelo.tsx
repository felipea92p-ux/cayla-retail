"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { listaDeModelos, textoUrgencia, type Urgencia } from "@/lib/orden-modelo-reglas";
import type { ModeloProducible } from "@/lib/produccion";

// «El modelo primero» (ADR-0396, A1): la primera pregunta de «Nueva orden» es QUÉ se va a fabricar, y se contesta buscando. Una caja de búsqueda (la pieza única `Buscador`,
// ADR-0358: filtra mientras se escribe), la lista con la prenda de cada modelo (su categoría sobre su color, ADR-0333) y, al pie, «Crear un modelo nuevo». El líder ve arriba
// los que se están acabando (los mismos que le sugiere el Resumen); el resto, los de las últimas órdenes y el catálogo. Elegir uno lo deja como una tarjeta con «Cambiar».
//
// No tiene estado de negocio: quien lo usa es dueño del modelo elegido y de si se está creando uno nuevo. Teclado: ↓ baja de la caja a la lista y entre filas, ↑ sube, Enter en la
// caja elige el primero que coincide. Cada fila es un botón `type="button"` (dentro del <form> de la orden un botón sin type la enviaría).

const colorDe = (m: ModeloProducible) => m.variantes.find((v) => v.colorHex)?.colorHex ?? null;
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Prenda({ modelo, tamano }: { modelo: ModeloProducible; tamano: "md" | "lg" }) {
  return <MiniaturaPrenda fotoUrl={null} colorHex={colorDe(modelo)} tamano={tamano} prefijo={modelo.categoriaPrefijo} familia={modelo.categoriaFamilia} categoria={modelo.categoria} />;
}

/** Cuántos colores y tallas distintos tiene el modelo, en palabras de tienda («3 colores · 3 tallas»). */
export function resumenDeModelo(m: ModeloProducible): string {
  const colores = new Set(m.variantes.map((v) => v.color).filter(Boolean)).size;
  const tallas = new Set(m.variantes.map((v) => v.talla ?? "Única")).size;
  return [colores > 0 ? cuantos(colores, "color", "colores") : "sin color", cuantos(tallas, "talla", "tallas")].join(" · ");
}

export function ElegirModelo({
  modelos,
  urgentes,
  abiertas,
  recientes,
  onElegir,
  onCrear,
}: {
  modelos: ModeloProducible[];
  /** Solo el líder (lo que la red está vendiendo): vacío para quien no ve la red. */
  urgentes: ReadonlyMap<string, Urgencia>;
  /** Cuántas órdenes en proceso tiene cada modelo (para avisar «1 orden abierta» antes de abrir otra). */
  abiertas: ReadonlyMap<string, number>;
  /** Los modelos de las últimas órdenes, la más reciente primero. */
  recientes: readonly string[];
  onElegir: (productoId: string) => void;
  /** «Crear un modelo nuevo»: recibe lo que se había escrito para que pase a ser su nombre. */
  onCrear: (nombre: string) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLInputElement>(null);
  const { grupos, total, coinciden } = useMemo(() => listaDeModelos({ modelos, consulta, urgentes, recientes }), [modelos, consulta, urgentes, recientes]);
  const primero = grupos[0]?.modelos[0] ?? null;
  const escrito = consulta.trim();

  const filas = () => [...(lista.current?.querySelectorAll<HTMLButtonElement>("[data-fila-modelo]") ?? [])];
  function alTeclearEnLaCaja(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Enter dentro de un <form> lo enviaría; aquí solo elige. Sin nada escrito no elige a ciegas.
      e.preventDefault();
      if (escrito && primero) onElegir(primero.productoId);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      filas()[0]?.focus();
    }
  }
  function alTeclearEnUnaFila(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const todas = filas();
    const i = todas.findIndex((f) => f === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowDown") todas[Math.min(i + 1, todas.length - 1)]?.focus();
    else if (i === 0) caja.current?.focus();
    else todas[i - 1]?.focus();
  }

  return (
    <div className="space-y-2">
      {/* Sin `conteo`: pasar de «sin definir» a «definido» cambia la estructura del Buscador y React lo vuelve a crear (se perdía el cursor tras la primera letra);
          la cuenta de coincidencias ya la dice el título del grupo («Resultados · 2»). */}
      <Buscador
        ref={caja}
        valor={consulta}
        onCambio={setConsulta}
        placeholder={`Busca entre los ${total} modelos por nombre o categoría`}
        etiqueta="Buscar un modelo"
        onKeyDown={alTeclearEnLaCaja}
        autoComplete="off"
      />
      <div ref={lista} onKeyDown={alTeclearEnUnaFila} className="overflow-hidden rounded-xl border border-sand bg-papel">
        <div data-resultados className="max-h-[17.5rem] overflow-y-auto">
        {coinciden === 0 && (
          <p className="px-3.5 pb-1 pt-3 text-sm text-tinta/70" role="status">
            Ningún modelo se llama «{escrito}».
          </p>
        )}
        {grupos.map((g, gi) => (
          <div key={g.clave}>
            <TituloGrupo cuenta={g.cuenta} className={`px-3.5 pb-1 ${gi === 0 ? "pt-3" : "pt-3.5"}`}>
              {g.titulo}
            </TituloGrupo>
            <ul>
              {g.modelos.map((m) => {
                const urgencia = urgentes.get(m.productoId);
                const nAbiertas = abiertas.get(m.productoId) ?? 0;
                return (
                  <li key={m.productoId}>
                    <button
                      type="button"
                      data-fila-modelo
                      data-guia="prod-orden-nueva.modelo-fila"
                      onClick={() => onElegir(m.productoId)}
                      className="flex w-full items-center gap-3 px-3.5 py-2 text-left outline-none transition-colors hover:bg-sand/45 focus-visible:bg-sand/45"
                    >
                      <Prenda modelo={m} tamano="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[17px] leading-tight text-tinta">{m.referencia}</span>
                        <span className="block truncate text-[12.5px] text-tinta/65">
                          {m.categoria ? `${m.categoria} · ` : ""}
                          {resumenDeModelo(m)}
                        </span>
                      </span>
                      {urgencia && (
                        <Chip tono="ambar" versalitas={false}>
                          {textoUrgencia(urgencia)}
                        </Chip>
                      )}
                      {nAbiertas > 0 && (
                        <Chip tono="pizarra" versalitas={false}>
                          {cuantos(nAbiertas, "orden abierta", "órdenes abiertas")}
                        </Chip>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        </div>
        {/* «Crear» va FIJA bajo la lista, no dentro de lo que se desplaza: con más de cinco modelos quedaba escondida abajo. */}
        <button
          type="button"
          data-fila-modelo
          onClick={() => onCrear(escrito)}
          className="flex w-full items-center gap-3 border-t border-sand px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-sand/45 focus-visible:bg-sand/45"
        >
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-dashed border-taupe text-taupe">
            <Plus className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-tinta">{escrito ? `Crear «${escrito}» como modelo nuevo` : "Crear un modelo nuevo"}</span>
            <span className="block text-[12.5px] text-tinta/65">Se arma aquí mismo, junto con su orden.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** El modelo ya elegido: su prenda, su nombre, lo que tiene y «Cambiar» para volver a buscar. */
export function TarjetaModelo({ modelo, precio, onCambiar }: { modelo: ModeloProducible; precio: number; onCambiar: () => void }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-sand bg-hueso/40 px-3.5 py-2.5">
      <Prenda modelo={modelo} tamano="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[22px] leading-tight text-tinta">{modelo.referencia}</p>
        <p className="truncate text-[12.5px] text-tinta/65">
          {modelo.categoria ? `${modelo.categoria} · ` : ""}
          {resumenDeModelo(modelo)}
          {precio > 0 ? ` · se vende a S/ ${precio.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
        </p>
      </div>
      <button type="button" onClick={onCambiar} className="btn-cayla btn-enlace shrink-0 text-[13px]">
        Cambiar
      </button>
    </div>
  );
}
