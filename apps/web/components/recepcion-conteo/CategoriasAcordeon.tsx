"use client";

import { ChevronDown, Plus } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { MarcaCampo } from "@/components/alta-producto/guia";
import { idCampoConteo, ID_CAMPO_AGREGAR, marcaDeLinea } from "@/lib/recepcion-conteo-reglas";
import { sinIdentificarDelGrupo, type GrupoDeLineas } from "@/lib/recepcion-grupos-reglas";
import { prendasDelAcordeon, resumenDeCategoria, type PrendaDelAcordeon } from "@/lib/recepcion-acordeon-reglas";
import { BaldosaCategoria } from "./piezas";

// Las categorías del envío como acordeón (rediseño «B», Felipe 2026-10-29): la que se cuenta está abierta y muestra las prendas que se
// anotaron al comprar, con sus puntos (uno por prenda esperada, lleno si ya se identificó) y su estado. Tocar otra la abre y la pone a
// contar, como hacía la píldora; abrirla no cuenta nada. Con la tarjeta ancha va en una columna a la izquierda; si no, encima del Dial
// (lo decide `rc-mesa` por el ancho de la tarjeta, no de la ventana: junto al papel de la compra la columna es angosta).

/** Más puntos que estos y la fila se parte: los que sobran los dice el chip («3 de 20»). */
const MAX_PUNTOS = 14;

function EstadoPrenda({ p }: { p: PrendaDelAcordeon }) {
  if (p.estado === "fuera") return <Chip tono="pizarra">{`${p.identificadas} · no estaba anotada`}</Chip>;
  if (p.estado === "lista") return <Chip tono="verde">Identificadas</Chip>;
  if (p.estado === "a-medias") return <Chip tono="ambar">{`${p.identificadas} de ${p.esperadas}`}</Chip>;
  return <Chip tono="neutro">Por identificar</Chip>;
}

export function CategoriasAcordeon({
  grupos,
  abierta,
  sinAviso,
  onElegir,
  onAgregar,
}: {
  grupos: readonly GrupoDeLineas[];
  /** La llave del grupo que se está contando (el que va abierto). */
  abierta: string | null;
  sinAviso: boolean;
  onElegir: (g: GrupoDeLineas) => void;
  onAgregar: () => void;
}) {
  return (
    <nav aria-label="Categorías del envío" className="rc-acord" data-guia="recepcion.categorias">
      <p className="label-cayla px-1 text-[11px] text-taupe">{sinAviso ? "Lo que llegó" : "Categorías del envío"}</p>
      {grupos.map((g, i) => {
        const p = g.principal;
        const hayConteo = g.lineas.some((l) => l.conteo !== null);
        const contada = p.linea ? g.contado : g.contadas > 0;
        const sinIdent = sinIdentificarDelGrupo(g);
        const esta = abierta === g.clave;
        // Hecha solo con su número Y sus prendas identificadas (Felipe 2026-10-27): contada sin identificar sigue «por hacer».
        const estado = contada && sinIdent === 0 ? "hecho" : esta ? "ahora" : "falta";
        const dif = g.dijeron != null && hayConteo ? g.contadas - g.dijeron : null;
        const prendas = prendasDelAcordeon(g);
        const nombre = p.categoria?.nombre ?? "Categoría";
        const marca = p.categoria ? marcaDeLinea(p).nombre : null;
        const idCuerpo = `rc-acord-${g.clave.replace(/[^a-zA-Z0-9]+/g, "-")}`;
        return (
          <div key={g.clave} className="rc-acord-grupo" data-abierta={esta ? "" : undefined} style={{ "--i": i } as React.CSSProperties}>
            <button
              type="button"
              className="rc-acord-cabeza"
              data-campo={p.linea ? idCampoConteo(p.clave) : undefined}
              aria-current={esta ? "true" : undefined}
              aria-expanded={esta}
              aria-controls={idCuerpo}
              onClick={() => onElegir(g)}
            >
              <BaldosaCategoria categoria={p.categoria} tamano="chico" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[15px] text-tinta">{nombre}</b>
                <span className="block truncate text-[13px] text-taupe">
                  {[marca, resumenDeCategoria(g, prendas.length), !p.linea && !sinAviso ? "no venía" : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {dif != null && dif !== 0 && <Chip tono="ambar">{dif > 0 ? `+${dif}` : dif}</Chip>}
              <MarcaCampo estado={estado} />
              <ChevronDown aria-hidden className="rc-acord-flecha h-4 w-4 shrink-0 text-taupe" />
            </button>
            <div id={idCuerpo} className="rc-acord-cuerpo" inert={!esta}>
              <div className="rc-acord-dentro">
                {prendas.length === 0 ? (
                  <p className="px-3 py-2 text-[13px] text-taupe">{sinAviso || !p.linea ? "Las prendas que identifiques salen aquí." : "La compra no anotó qué prendas eran."}</p>
                ) : (
                  <ul className="space-y-1.5 p-1.5">
                    {prendas.map((pr, k) => (
                      <li key={pr.clave} className="rc-acord-prenda" style={{ "--k": k } as React.CSSProperties}>
                        <span className="flex min-w-0 items-baseline gap-2">
                          <b className="min-w-0 truncate text-[14px] text-tinta">{pr.nombre}</b>
                          {pr.esperadas != null && <span className="shrink-0 text-[13px] text-taupe">× {pr.esperadas} en la compra</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {pr.esperadas != null && pr.esperadas <= MAX_PUNTOS && (
                            <span aria-hidden className="rc-acord-puntos">
                              {Array.from({ length: pr.esperadas }, (_, n) => (
                                <i key={n} data-lleno={n < pr.identificadas ? "" : undefined} />
                              ))}
                            </span>
                          )}
                          <EstadoPrenda p={pr} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="rc-cat-agregar rc-acord-agregar"
        onClick={onAgregar}
        data-guia="recepcion.agregar"
        data-campo={grupos.length === 0 ? ID_CAMPO_AGREGAR : undefined}
        title={sinAviso ? undefined : "Una categoría que no venía en el envío"}
      >
        <Plus aria-hidden className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap text-[14.5px]">{sinAviso ? "Agregar lo que llegó" : "Agregar categoría"}</span>
      </button>
    </nav>
  );
}
