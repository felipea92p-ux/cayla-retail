"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { cambiarNuevasSinDescribir, nuevasSinDescribir, describirNuevas, textoPrendas, type Separado } from "@/lib/recepcion-conteo-reglas";
import { idCampoIdentificar, sinIdentificarDelGrupo } from "@/lib/recepcion-grupos-reglas";
import { conMiles, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { DescribirNuevas } from "./DescribirNuevas";
import { PasoDePrendas } from "./SepararPrendas";

// Lo que falta decir de lo que se está contando, de un envío que venía contándose con un número suelto: lo contado sin modelo y las nuevas sin nombre. En un envío nuevo no aparece: todo modelo
// entra por el «+» de su categoría (Felipe 2026-11-03).

export function PrendasDeLaPlaca({ parada, onSeparado, onQuitarSueltas }: { parada: ParadaDelConteo; onSeparado: (s: Separado) => void; onQuitarSueltas: () => void }) {
  const { grupo } = parada;
  const cat = grupo.principal.categoria;
  const separado = grupo.separado;
  const [describiendo, setDescribiendo] = useState(false);
  const sueltas = sinIdentificarDelGrupo(grupo);
  const sinNombre = nuevasSinDescribir(separado);

  if (!cat || (sueltas === 0 && sinNombre === 0)) return null;
  return (
    <div className="rc-otra" data-guia="recepcion.separar" data-campo={idCampoIdentificar(grupo.clave)}>
      {sinNombre > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--pozo-fondo)] px-2.5 py-2 shadow-[var(--pozo-sombra)]">
          <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-[8.5rem] flex-1 text-sm text-tinta">Sin nombre todavía</span>
          <BotonEditar onClick={() => setDescribiendo(true)}>Describir</BotonEditar>
          <PasoDePrendas valor={sinNombre} etiqueta="las que no tienen nombre" onValor={(n) => onSeparado(cambiarNuevasSinDescribir(separado, n))} />
        </div>
      )}

      {sueltas > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm text-taupe">
            <Chip tono="ambar">{sueltas === 1 ? "Falta 1 por identificar" : `Faltan ${conMiles(sueltas)} por identificar`}</Chip>{" "}
            Hay {textoPrendas(sueltas)} contadas que no son de ningún modelo. Agrega su modelo con el «+» de la categoría y cuéntalas ahí. Hasta decir cuáles son no se puede pasar a «Cerrar».
          </p>
          <button type="button" className="btn-cayla btn-enlace" onClick={onQuitarSueltas}>
            Quitar {sueltas === 1 ? "esa" : `esas ${conMiles(sueltas)}`} del conteo
          </button>
        </div>
      )}

      {describiendo && <DescribirNuevas categoria={cat} maximo={sinNombre} onDescribir={(texto, cantidad) => onSeparado(describirNuevas(separado, texto, cantidad))} onCerrar={() => setDescribiendo(false)} />}
    </div>
  );
}
