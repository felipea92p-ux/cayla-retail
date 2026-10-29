"use client";

import { Check, Shirt } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";
import type { CandidataAlta } from "@/lib/parecidas-alta-tipos";

// «¿Ya existe?» — lo primero del paso 2 de Nuevo producto (ADR-0556, Felipe 2026-10-28).
//
// EL PROBLEMA. Hasta hoy el alta preguntaba el nombre primero y, recién al escribirlo, avisaba si se parecía a otro. Pero la prenda que más se
// duplica es la misma con OTRO nombre (llega en otro color, o la carga otra sede), y esa no se parece por el nombre: se parece en la foto. Por eso,
// antes de bautizarla, la persona mira lo que ya hay en la categoría. Si es una de esas en otro color, no se crea: se abre y se le agrega el color.
//
// CONTRATO. PROMETE: mostrar hasta `MAX_A_LA_VISTA` prendas de la categoría (foto, o la miniatura de la categoría con el color de la prenda), cada una un
//   botón que abre la hoja «Ver y comparar» en ESA prenda (la hoja ya trae tallas, colores, stock y «Es el mismo diseño», que lleva a agregarle el color);
//   «Ver las N» si hay más; y la respuesta «Ninguna, es un diseño nuevo», que se puede deshacer. Sin prendas, sin red o con la lectura caída lo dice en una
//   línea y no pide nada. ASUME: que `lista` viene ya ordenada (lo más parecido primero) y solo trae lo activo de esta categoría. NO HACE: no decide si es
//   la misma (eso lo dice la persona mirando), no frena «Crear» (la respuesta es una guía, no un candado) y no navega: la hoja lo hace.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Cuántas se ven sin abrir la hoja: dos filas en escritorio, y en el celular caben sin que la pregunta se pierda bajo el pliegue. */
export const MAX_A_LA_VISTA = 6;

export function YaExiste({
  lista,
  cargando,
  disponible,
  fallo,
  categoria,
  respondido,
  onResponder,
  onVer,
}: {
  lista: readonly CandidataAlta[];
  cargando: boolean;
  /** Hay red y categoría: se pudo leer. */
  disponible: boolean;
  fallo: boolean;
  /** Cómo se dibuja una prenda sin foto: con el ícono de ESTA categoría. */
  categoria: CategoriaDePrenda & { nombre: string };
  respondido: boolean;
  onResponder: (nuevo: boolean) => void;
  onVer: (id?: string) => void;
}) {
  if (!disponible) {
    return <p className="text-[13px] text-taupe">No puedo mostrarte las prendas de {categoria.nombre} sin conexión. Puedes seguir.</p>;
  }
  if (cargando && lista.length === 0) {
    return <p className="text-[13px] text-taupe">Buscando las prendas de {categoria.nombre}…</p>;
  }
  if (lista.length === 0) {
    return fallo ? (
      <p className="text-[13px] text-taupe">No pude traer las prendas de {categoria.nombre}. Puedes seguir.</p>
    ) : (
      <Vacio tamano="chico" alinear="izquierda" icono={<Shirt />}>
        Todavía no hay prendas en {categoria.nombre}: esta es la primera.
      </Vacio>
    );
  }

  const aLaVista = lista.slice(0, MAX_A_LA_VISTA);
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {aLaVista.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onVer(c.id)}
              className="mov-boton group flex w-full flex-col items-center gap-1.5 rounded-xl border border-sand bg-papel p-2 text-center"
              title={`Ver ${c.referencia}: sus colores, tallas y stock`}
            >
              <MiniaturaPrenda fotoUrl={c.fotoUrl} colorHex={c.colores[0]?.hex ?? null} tamano="xl" {...categoria} />
              <span className="line-clamp-2 text-[12px] leading-tight text-tinta">{c.referencia}</span>
              <span className="text-[11px] text-taupe">{c.colores.length > 0 ? plural(c.colores.length, "color", "colores") : "Sin color"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {respondido ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-tinta">
            <Check aria-hidden className="h-3.5 w-3.5 text-verde" />
            Es un diseño nuevo.
            <button type="button" className="btn-cayla btn-enlace" onClick={() => onResponder(false)}>
              Cambiar
            </button>
          </span>
        ) : (
          <button type="button" className="btn-cayla btn-secundario" onClick={() => onResponder(true)}>
            Ninguna, es un diseño nuevo
          </button>
        )}
        {lista.length > aLaVista.length && <EnlaceVer onClick={() => onVer()}>Ver las {lista.length}</EnlaceVer>}
      </div>
    </div>
  );
}
