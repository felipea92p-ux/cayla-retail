"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Boton } from "@/components/ui/campos";
import { ElegirColores } from "@/components/alta-producto/ElegirColores";
import type { ColorAlta } from "@/lib/alta-producto";
import { agruparPorFamilia } from "@/lib/colores-familias";

// Los colores de un MODELO NUEVO dentro de «Nueva orden de producción» (ADR-0396, A2). Antes los colores se elegían arriba, en el bloque de «Modelo nuevo», y las cantidades se
// escribían mucho más abajo: quien cambiaba de idea tenía que subir, quitar y volver a bajar. Ahora cada color elegido es una FILA de la tabla de cantidades (con su «×» para
// quitarlo) y aquí solo queda el botón que suma una fila: «+ Agregar color» abre el mismo buscador y la misma carta de Nuevo producto (`ElegirColores`), sin la fila de elegidos
// (ya están en la tabla) y con el cursor en el buscador, para sumar varios tecleando.
//
// No tiene estado de negocio: quien lo usa es dueño de los colores elegidos. Un color elegido de nuevo (el mismo código) lo quita, igual que en la carta de Nuevo producto.
// Va ARRIBA de la tabla, no debajo: cada color elegido suma una fila a la tabla, y con el panel debajo la carta de círculos se corría 52 px hacia abajo bajo el mouse en cada elección.

/** El «×» de una fila de color: la misma píldora de Nuevo producto, sola. Quitar un color de entre varios no borra lo escrito en él: si vuelve a agregarse, sus números reaparecen.
 *  `onQuitar(conTeclado)`: con Enter o Espacio el clic llega con `detail === 0`; quien quita lo usa para dejar el cursor en la tabla (la fila donde estaba desaparece). */
export function QuitarColor({ nombre, onQuitar }: { nombre: string; onQuitar: (conTeclado: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onQuitar(e.detail === 0)}
      aria-label={`Quitar ${nombre}`}
      className="grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-tinta/60 hover:bg-tinta/[0.07] hover:text-tinta"
    >
      ×
    </button>
  );
}

export function AgregarColor({
  colores,
  elegidos,
  onAlternar,
  onCreado,
}: {
  colores: ColorAlta[];
  /** Los códigos elegidos, en el orden de los clics. */
  elegidos: string[];
  onAlternar: (codigo: string) => void;
  /** Un color recién creado desde el buscador: quien lo recibe lo suma a su lista y lo elige. */
  onCreado: (color: ColorAlta) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  // ¿La persona recorrió la lista con las flechas desde la última vez que eligió? Con eso, Enter sobre un campo vacío elige lo resaltado a propósito.
  const recorrio = useRef(false);
  // Elegir un color (con el mouse, con Tab o con Enter) cierra esa «recorrida»: la siguiente vez, Enter sobre un campo vacío vuelve a no elegir a ciegas.
  useEffect(() => {
    recorrio.current = false;
  }, [elegidos]);
  const grupos = useMemo(() => agruparPorFamilia(colores, (c) => c.familiaColor), [colores]);

  /** Antes que el buscador (captura): con la lista abierta, la primera fila ya viene resaltada aunque no se haya escrito nada, y un Enter «de costumbre» agregaba el primer color
   *  (Blanco) sin que nadie lo pidiera. Sin escribir ni recorrer la lista, Enter no elige a ciegas (como el buscador de modelos de A1). */
  function antesDelBuscador(e: KeyboardEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.target as Node)) return;
    const campo = e.target as HTMLInputElement;
    if (campo.getAttribute("role") !== "combobox") return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") recorrio.current = true;
    else if (e.key === "Enter") {
      const aCiegas = !recorrio.current && campo.value.trim() === "";
      recorrio.current = false;
      if (aCiegas) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    // Un evento que sube desde un modal (el de «+ Nuevo color») por el árbol de React no es de este panel: no se toca (ADR-0128).
    if (!e.currentTarget.contains(e.target as Node)) return;
    // Enter en el buscador de colores, con su lista cerrada, enviaría la orden entera: aquí solo sirve para elegir.
    if (e.key === "Enter" && (e.target as HTMLElement).getAttribute("role") === "combobox") e.preventDefault();
    // Con la lista cerrada, Escape cierra el panel (con la lista abierta ya lo usó el buscador y no llega aquí) y NO la hoja entera.
    if (e.key === "Escape" && abierto) {
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
      raiz.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
    }
  }

  return (
    <div ref={raiz} className="space-y-2" onKeyDownCapture={antesDelBuscador} onKeyDown={alTeclear}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Boton type="button" peso="fantasma" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Listo con los colores" : "+ Agregar color"}
        </Boton>
        {elegidos.length === 0 && <span className="text-[12.5px] text-tinta/70">Opcional: si no tiene color, déjalo así.</span>}
      </div>
      {/* Sin marco propio: la carta de colores ya trae el suyo, y dos marcos iguales uno dentro del otro se veían como un error. */}
      {abierto && <ElegirColores colores={colores} grupos={grupos} elegidos={elegidos} onAlternar={onAlternar} onCreado={onCreado} cartaAbierta={false} sinElegidos enfocarBuscador />}
    </div>
  );
}
