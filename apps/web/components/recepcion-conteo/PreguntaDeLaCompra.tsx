"use client";

import { Check } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Boton } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { idCampoConteo, type LineaParaContar } from "@/lib/recepcion-conteo-reglas";
import { avanceAnotado, lineasAnotadas, nombreAnotado, siguienteAnotada } from "@/lib/recibir-papel-reglas";
import type { Borrador } from "./RecibirContando";

// «La compradora anotó Blusa manga globo × 12. ¿Son estas?» (rediseño de Compras simple, maqueta docs/maquetas/compras-formidable-2026-10/,
// Felipe 2026-10-23): la pregunta principal de Recibir cuando el envío viene de una compra anotada desde el celular. Arriba, cuánto se lleva
// contado de lo anotado. «Son estas (12)» pone ese número en la línea, igual que escribirlo en el contador (se guarda solo, línea por
// línea); «Es otra prenda» la deja para después y la abre en el contador para contarla a mano. Qué prendas son (las tallas y los colores)
// se sigue diciendo en el contador de siempre.

export function PreguntaDeLaCompra({
  lineas,
  saltadas,
  onEscribir,
  onSaltar,
}: {
  lineas: readonly LineaParaContar[];
  saltadas: ReadonlySet<string>;
  onEscribir: (l: LineaParaContar, cambio: Partial<Borrador>) => void;
  onSaltar: (clave: string) => void;
}) {
  if (lineasAnotadas(lineas).length === 0) return null;
  const { contadas, total } = avanceAnotado(lineas);
  const l = siguienteAnotada(lineas, saltadas);

  // Abre la línea en el contador de siempre (su botón de la lista de la izquierda) y la deja a la vista.
  const abrirEnElContador = (clave: string) => {
    const boton = document.querySelector<HTMLElement>(`[data-campo="${idCampoConteo(clave as LineaParaContar["clave"])}"]`);
    boton?.click();
    boton?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <section className="card-cayla flex flex-col gap-4 p-4 sm:p-5" aria-label="Lo que anotó la compradora" data-guia="recepcion.pregunta">
      <div className="flex flex-col gap-2">
        <p className="campo-etiqueta flex justify-between gap-2">
          <span>Llevas contadas</span>
          <span className="normal-case tabular-nums tracking-normal text-tinta">
            {contadas} de {total}
          </span>
        </p>
        <BarraAvance pct={(contadas / Math.max(1, total)) * 100} etiqueta="Lo contado de lo que anotó la compradora" texto={`${contadas} de ${total}`} />
      </div>
      {l ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-sand bg-crema p-4">
          <MiniaturaPrenda fotoUrl={null} tamano="xl" prefijo={l.categoria?.prefijo} familia={l.categoria?.familia} categoria={l.categoria?.nombre} />
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-taupe">La compradora anotó</span>
            <span className="block font-serif text-2xl leading-tight text-tinta">
              {nombreAnotado(l)} × {l.dijeron}
            </span>
            <span className="block text-xs text-taupe">¿Son estas las que tienes en la mano?</span>
          </div>
          <div className="flex flex-col gap-2 max-sm:w-full">
            <Boton peso="primario" onClick={() => onEscribir(l, { contadas: l.dijeron ?? 0 })} data-guia="recepcion.son-estas">
              Son estas ({l.dijeron})
            </Boton>
            <Boton
              peso="fantasma"
              onClick={() => {
                onSaltar(l.clave);
                abrirEnElContador(l.clave);
              }}
              data-guia="recepcion.es-otra"
            >
              Es otra prenda
            </Boton>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-verde">
          <Check className="h-4 w-4" aria-hidden />
          Ya contestaste todo lo que anotó. Revisa abajo qué prendas son y, al terminar, cierra.
        </p>
      )}
    </section>
  );
}
