"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  cambiarNuevasSinDescribir,
  describirNuevas,
  marcaDeLinea,
  nuevasSinDescribir,
  textoPrendas,
  type Separado,
} from "@/lib/recepcion-conteo-reglas";
import { idCampoIdentificar, sinIdentificarDelGrupo } from "@/lib/recepcion-grupos-reglas";
import { conMiles, modelosDelGrupo, prendasParecidas, type ParadaDelConteo } from "@/lib/recepcion-modelos-reglas";
import { DescribirNuevas } from "./DescribirNuevas";
import { BuscarPrendaEnLinea, PasoDePrendas } from "./SepararPrendas";

// «¿Llegó otra cosa?» (Felipe 2026-11-02): lo que anotó Compras se ve en las categorías, de donde se elige qué se cuenta. Aquí, plegado, lo que no estaba: las prendas del catálogo que se parecen a
// lo anotado, buscar otra, anotar una que no está y las que todavía no tienen nombre. Lo que falta decir (las sin nombre, lo contado sin saber qué es) se ve aunque esté plegado.

export function PrendasDeLaPlaca({
  parada,
  abierta,
  onSeparado,
  onPrendaDelCatalogo,
  onIrAModelo,
  onTextoNuevo,
  onQuitarSueltas,
}: {
  parada: ParadaDelConteo;
  abierta: boolean;
  onSeparado: (s: Separado) => void;
  /** Llegó esta prenda del catálogo: se suma al grupo y queda en el contador. */
  onPrendaDelCatalogo: (p: PrendaRecepcion) => void;
  /** Esa prenda ya está en la lista, con otro proveedor o marca: se va a contarla allá. */
  onIrAModelo: (productoId: string) => boolean;
  /** Llegó algo que no está en el catálogo: se anota con este nombre y queda en el contador. */
  onTextoNuevo: (texto: string) => void;
  /** Quitar lo contado que no es de ningún modelo (un número suelto de antes). */
  onQuitarSueltas: () => void;
}) {
  const { grupo, modelo } = parada;
  const cat = grupo.principal.categoria;
  const marca = marcaDeLinea(grupo.principal);
  const separado = grupo.separado;
  const [describiendo, setDescribiendo] = useState(false);

  // Lo que hay en el catálogo de esta categoría y marca, para ofrecer lo que se parece. Si no responde, la placa sigue sin eso.
  const [catalogo, setCatalogo] = useState<readonly PrendaRecepcion[]>([]);
  const vuelta = useRef(0);
  const catId = cat?.id ?? null;
  const marcaId = marca.id;
  useEffect(() => {
    if (!catId || !abierta) return;
    const mia = ++vuelta.current;
    void buscarPrendasParaRecibir(catId, marcaId, "").then(({ prendas, error }) => {
      if (mia === vuelta.current) setCatalogo(error ? [] : prendas);
    });
  }, [catId, marcaId, abierta]);

  const modelos = modelosDelGrupo(grupo);
  const yaEstan = new Set(modelos.map((m) => m.productoId).filter((x): x is string => !!x));
  const parecidas = prendasParecidas(catalogo, [...(modelo ? [modelo.nombre] : []), ...modelos.filter((m) => m !== modelo).map((m) => m.nombre)], yaEstan);

  const sueltas = sinIdentificarDelGrupo(grupo);
  const sinNombre = nuevasSinDescribir(separado);

  if (!cat || (!abierta && sueltas === 0 && sinNombre === 0)) return null;
  return (
    <div className="rc-otra" data-guia="recepcion.separar" data-campo={idCampoIdentificar(grupo.clave)}>
      {abierta && parecidas.length > 0 && (
        <div className="grid gap-1.5" data-guia="recepcion.parecidas">
          <p className="rc-etiqueta-chica">Se parecen · toca si llegó esa</p>
          <ul className="rc-chipitos">
            {parecidas.map((p) => (
              <li key={p.productoId} className="min-w-0 max-w-full">
                <button
                  type="button"
                  className="rc-anotada-chip"
                  title={p.codigo ?? undefined}
                  aria-label={`Llegó ${p.nombre}: agregarla y contarla`}
                  onClick={() => {
                    if (!onIrAModelo(p.productoId)) onPrendaDelCatalogo(p);
                  }}
                >
                  <Plus aria-hidden className="h-4 w-4 shrink-0" />
                  <b>{p.nombre}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {abierta && <BuscarPrendaEnLinea categoria={cat} marca={marca} corto onElegir={onPrendaDelCatalogo} onEsNueva={onTextoNuevo} />}

      {sinNombre > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--pozo-fondo)] px-2.5 py-2 shadow-[var(--pozo-sombra)]">
          <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-[8.5rem] flex-1 text-sm text-tinta">Sin nombre todavía</span>
          <BotonEditar onClick={() => setDescribiendo(true)}>Describir</BotonEditar>
          <PasoDePrendas valor={sinNombre} etiqueta="las que no tienen nombre" onValor={(n) => onSeparado(cambiarNuevasSinDescribir(separado, n))} />
        </div>
      ) : (
        abierta && (
          <button type="button" className="btn-cayla btn-enlace justify-self-start" onClick={() => onSeparado(cambiarNuevasSinDescribir(separado, 1))}>
            Llegaron otras y aún no sé cómo se llaman
          </button>
        )
      )}

      {sueltas > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm text-taupe">
            <Chip tono="ambar">{sueltas === 1 ? "Falta 1 por identificar" : `Faltan ${conMiles(sueltas)} por identificar`}</Chip>{" "}
            {modelo ? `Hay ${textoPrendas(sueltas)} contadas que no son de ningún modelo.` : "Elige la prenda o anótala."} Hasta decir cuáles son no se puede pasar a «Cerrar».
          </p>
          {modelo && (
            <button type="button" className="btn-cayla btn-enlace" onClick={onQuitarSueltas}>
              Quitar {sueltas === 1 ? "esa" : `esas ${conMiles(sueltas)}`} del conteo
            </button>
          )}
        </div>
      )}

      {describiendo && <DescribirNuevas categoria={cat} maximo={sinNombre} onDescribir={(texto, cantidad) => onSeparado(describirNuevas(separado, texto, cantidad))} onCerrar={() => setDescribiendo(false)} />}
    </div>
  );
}
