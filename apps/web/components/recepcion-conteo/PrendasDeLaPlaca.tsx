"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks, Plus, Sparkles } from "lucide-react";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { buscarPrendasParaRecibir } from "@/lib/recepcion-envio-acciones";
import type { PrendaRecepcion } from "@/lib/recepcion-envio-reglas";
import {
  cambiarNuevasSinDescribir,
  describirNuevas,
  marcaDeLinea,
  nuevasSinDescribir,
  textoPrendas,
  type PrendaSeparada,
  type Separado,
} from "@/lib/recepcion-conteo-reglas";
import { idCampoIdentificar, sinIdentificarDelGrupo } from "@/lib/recepcion-grupos-reglas";
import {
  conMiles,
  modelosDelGrupo,
  prendasParecidas,
  type ParadaDelConteo,
} from "@/lib/recepcion-modelos-reglas";
import { DescribirNuevas } from "./DescribirNuevas";
import { BuscarPrendaEnLinea, PasoDePrendas } from "./SepararPrendas";

// Bajo el Dial (Felipe 2026-11-02): lo que falta decir de lo que se está contando y las prendas del catálogo que se parecen a lo anotado, por si llegó
// otra cosa; tocar una la suma a la lista y queda en el Dial. Lo que anotó Compras se ve en las categorías, de donde se elige qué se cuenta. Lo que
// hacía «¿Qué … son?» (buscar, anotar una nueva, las tallas, «Crear ahora») sigue aquí.

export function PrendasDeLaPlaca({
  parada,
  onSeparado,
  onPrendaDelCatalogo,
  onTextoNuevo,
  onTallas,
  onCrearNueva,
  onQuitarSueltas,
}: {
  parada: ParadaDelConteo;
  onSeparado: (s: Separado) => void;
  /** Llegó esta prenda del catálogo: se suma al grupo y queda en el Dial. */
  onPrendaDelCatalogo: (p: PrendaRecepcion) => void;
  /** Llegó algo que no está en el catálogo: se anota con este nombre y queda en el Dial. */
  onTextoNuevo: (texto: string) => void;
  onTallas: (p: PrendaSeparada) => void;
  onCrearNueva: (nueva: { cantidad: number; descripcion: string }) => void;
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
    if (!catId) return;
    const mia = ++vuelta.current;
    void buscarPrendasParaRecibir(catId, marcaId, "").then(({ prendas, error }) => {
      if (mia === vuelta.current) setCatalogo(error ? [] : prendas);
    });
  }, [catId, marcaId]);

  const modelos = modelosDelGrupo(grupo);
  const yaEstan = new Set(modelos.map((m) => m.productoId).filter((x): x is string => !!x));
  const parecidas = prendasParecidas(catalogo, [...(modelo ? [modelo.nombre] : []), ...modelos.filter((m) => m !== modelo).map((m) => m.nombre)], yaEstan);

  const sueltas = sinIdentificarDelGrupo(grupo);
  const sinNombre = nuevasSinDescribir(separado);
  const prendaDelModelo = modelo?.productoId ? separado.prendas.find((p) => p.productoId === modelo.productoId) : undefined;
  const nuevaDelModelo = modelo && !modelo.productoId && modelo.contadas > 0 ? { cantidad: modelo.contadas, descripcion: modelo.nombre } : null;

  if (!cat) return null;
  return (
    <div className="rc-placa-prendas" data-guia="recepcion.separar" data-campo={idCampoIdentificar(grupo.clave)}>
      {/* Lo que falta decir de lo que está en el Dial: sus tallas y colores (pueden esperar) o, si es nueva, crearla en el catálogo. */}
      {prendaDelModelo && (
        <div className="rc-placa-accion">
          {prendaDelModelo.variantes ? (
            <>
              <Chip tono="verde">Entra al stock</Chip>
              <button type="button" className="btn-cayla btn-enlace" onClick={() => onTallas(prendaDelModelo)}>
                Cambiar tallas
              </button>
            </>
          ) : (
            <>
              <Boton type="button" peso="discreto" onClick={() => onTallas(prendaDelModelo)}>
                <span className="inline-flex items-center gap-1.5">
                  <ListChecks aria-hidden className="h-4 w-4" />
                  Tallas y colores ahora
                </span>
              </Boton>
              <span className="text-sm text-taupe">o queda pendiente</span>
            </>
          )}
        </div>
      )}
      {nuevaDelModelo && (
        <div className="rc-placa-accion">
          <Boton type="button" peso="discreto" onClick={() => onCrearNueva(nuevaDelModelo)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus aria-hidden className="h-4 w-4" />
              Crear ahora
            </span>
          </Boton>
          <Chip tono="pizarra">Por crear</Chip>
        </div>
      )}

      {parecidas.length > 0 && (
        <div className="space-y-1.5" data-guia="recepcion.parecidas">
          <p className="label-cayla text-[10.5px] text-taupe">Se parecen · toca si llegó esa</p>
          <ul className="flex flex-wrap gap-1.5">
            {parecidas.map((p) => (
              <li key={p.productoId} className="min-w-0 max-w-full">
                <button type="button" className="rc-anotada-chip" title={p.codigo ?? undefined} aria-label={`Llegó ${p.nombre}: agregarla y contarla`} onClick={() => onPrendaDelCatalogo(p)}>
                  <Plus aria-hidden className="h-4 w-4 shrink-0" />
                  <b>{p.nombre}</b>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BuscarPrendaEnLinea categoria={cat} marca={marca} corto onElegir={onPrendaDelCatalogo} onEsNueva={onTextoNuevo} />

      {sinNombre > 0 ? (
        <div className="rc-placa-accion">
          <span className="rc-cat-ic" data-tamano="chico" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-[8.5rem] flex-1 text-sm text-tinta">Sin nombre todavía</span>
          <BotonEditar onClick={() => setDescribiendo(true)}>Describir</BotonEditar>
          <PasoDePrendas valor={sinNombre} etiqueta="las que no tienen nombre" onValor={(n) => onSeparado(cambiarNuevasSinDescribir(separado, n))} />
        </div>
      ) : (
        <button type="button" className="btn-cayla btn-enlace self-start" onClick={() => onSeparado(cambiarNuevasSinDescribir(separado, 1))}>
          Llegaron otras y aún no sé cómo se llaman
        </button>
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

      {describiendo && (
        <DescribirNuevas
          categoria={cat}
          maximo={sinNombre}
          onDescribir={(texto, cantidad) => onSeparado(describirNuevas(separado, texto, cantidad))}
          onCerrar={() => setDescribiendo(false)}
        />
      )}
    </div>
  );
}
