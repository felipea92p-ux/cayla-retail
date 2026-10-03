"use client";

import { useMemo, useState } from "react";
import { Punto } from "@/components/alta-producto/ElegirColores";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { Campo } from "@/components/ui/campos";
import { alternarCombinaCon, MAX_COMBINA_CON, MAX_DESCRIPCION } from "@/lib/color-referencias";

// «Combina con»: los colores con los que un color se lleva bien (ADR-0316). Se ven como chips con su muestra y su nombre (los mismos de
// la carta de Nuevo producto) y se suman buscando por nombre o sinónimo; nunca pasan de 8 (el tope de la base) ni incluyen al propio
// color. Lo que se guarda son los CÓDIGOS: si un color se renombra, la recomendación lo sigue.
//
// PROMETE: `onValor` recibe siempre una lista válida (sin repetidos, sin el propio, hasta 8). No valida que el código exista: el
//   disparador `colores_valida_combina_con` lo hace en la base; aquí solo se ofrecen colores que existen.

export type Companero = {
  codigo: string;
  nombre: string;
  hex: string | null;
  familiaColor: string | null;
  tipo?: string | null;
  sinonimos?: readonly string[];
  activo?: boolean;
};

export function CombinaConCampo({
  colores,
  valor,
  onValor,
  propio,
  etiqueta = "Combina con",
}: {
  /** El vocabulario de colores: de aquí salen las opciones y el nombre de cada chip. */
  colores: readonly Companero[];
  /** Códigos elegidos, en el orden en que se eligieron. */
  valor: readonly string[];
  onValor: (codigos: string[]) => void;
  /** El color que se está editando: no se ofrece como compañero de sí mismo. */
  propio?: string;
  etiqueta?: string;
}) {
  // El buscador vuelve a vacío después de cada elección: se remonta con otra `key` (igual que la carta de colores).
  const [vuelta, setVuelta] = useState(0);
  const porCodigo = useMemo(() => new Map(colores.map((c) => [c.codigo, c])), [colores]);
  const lleno = valor.length >= MAX_COMBINA_CON;

  const opciones = useMemo(
    () =>
      colores
        .filter((c) => c.activo !== false && c.codigo !== propio && !valor.includes(c.codigo))
        .map((c) => ({
          valor: c.codigo,
          texto: c.nombre,
          claves: c.sinonimos,
          icono: <Punto hex={c.hex} familia={c.familiaColor} tipo={c.tipo} />,
        })),
    [colores, propio, valor],
  );

  return (
    <Campo
      etiqueta={etiqueta}
      pie={lleno ? `Ya son ${MAX_COMBINA_CON}: quita uno para sumar otro.` : `Opcional · hasta ${MAX_COMBINA_CON} colores con los que se lleva bien.`}
    >
      <div className="space-y-2">
        {valor.length > 0 && (
          <ul aria-label="Colores con los que combina" className="flex flex-wrap gap-1.5">
            {valor.map((cod) => {
              const c = porCodigo.get(cod);
              const nombre = c?.nombre ?? cod;
              return (
                <li
                  key={cod}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-tinta/25 bg-tinta/[0.05] py-0.5 pl-2.5 pr-1 text-[13px] text-tinta"
                >
                  <Punto hex={c?.hex ?? null} familia={c?.familiaColor} tipo={c?.tipo} />
                  {nombre}
                  <button
                    type="button"
                    onClick={() => onValor(alternarCombinaCon(valor, cod))}
                    aria-label={`Quitar ${nombre}`}
                    className="grid h-6 w-6 place-items-center rounded-full text-[15px] leading-none text-tinta/60 hover:bg-tinta/[0.07] hover:text-tinta"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!lleno && (
          <ComboBuscable
            key={vuelta}
            caja
            etiquetaAccesible="Agregar un color con el que combina"
            marcador="Busca un color…"
            valor=""
            onValor={(cod) => {
              onValor(alternarCombinaCon(valor, cod));
              setVuelta((v) => v + 1);
            }}
            opciones={opciones}
          />
        )}
      </div>
    </Campo>
  );
}

/**
 * La descripción del color: qué transmite y dónde funciona, en una o dos frases (hasta 300 caracteres, el tope de la base). Es lo que
 * una asesora le dice a una cliente. Caja hundida como el resto de los campos; el contador sale solo cerca del tope.
 */
export function DescripcionColorCampo({ valor, onValor }: { valor: string; onValor: (texto: string) => void }) {
  const restantes = MAX_DESCRIPCION - valor.length;
  const cerca = restantes <= 40;
  return (
    <Campo
      etiqueta="Descripción"
      tono={restantes < 0 ? "error" : "neutro"}
      pie={
        restantes < 0
          ? `Sobran ${-restantes} caracteres.`
          : cerca
            ? `Quedan ${restantes} caracteres.`
            : "Opcional · qué transmite y dónde funciona. Lo lee la asesora para recomendar."
      }
    >
      <div className="caja-cayla">
        <textarea
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          rows={3}
          aria-label="Descripción del color"
          // sugerir-fijo: no depende de nada elegido antes; dice qué escribir, no da un ejemplo de otro color
          placeholder="Qué transmite y dónde funciona"
          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45"
        />
      </div>
    </Campo>
  );
}
