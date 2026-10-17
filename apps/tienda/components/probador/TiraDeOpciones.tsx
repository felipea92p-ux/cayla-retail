"use client";

import { useEffect, useRef } from "react";
import { soles } from "@/lib/catalogo";
import { pctTexto } from "@/lib/portada";
import { agotada, colorPara, deLaZona, NOMBRE_ZONA, OPCIONAL, type Look, type PrendaDelProbador, type Zona } from "@/lib/probador";
import type { FiltroDeZona } from "@/lib/probador-buscar";
import { Icono } from "../Icono";
import { Recorte } from "./Recorte";

/** Lo que se puede poner va primero; lo agotado, al final (se ve, pero no se pone). */
const paraLaTira = (lista: readonly PrendaDelProbador[]) => [...lista.filter((p) => !agotada(p)), ...lista.filter(agotada)];

/**
 * La tira de opciones de la zona elegida (lienzo v3): «Sin encima» o «Sin bolso» cuando puede faltar, cada prenda de la zona en el
 * color que el cliente le eligió (o el que entra solo) con su precio, sus colores y su insignia (agotada, la única tienda que la tiene o
 * la campaña) y, en arriba, «o un vestido» (y al revés). Al cambiar de zona, la tira vuelve a mostrar la que está puesta.
 */
export function TiraDeOpciones({
  prendas,
  look,
  recordados,
  zona,
  numero,
  onPoner,
  onQuitar,
  onBuscar,
}: {
  prendas: readonly PrendaDelProbador[];
  look: Look;
  recordados: Readonly<Record<string, string>>;
  zona: Zona;
  numero: Readonly<Partial<Record<Zona, number>>>;
  onPoner: (p: PrendaDelProbador) => void;
  onQuitar: (zona: Zona) => void;
  /** Abre la búsqueda: «Ver todas» en esta zona, «Buscar otra» en toda la tienda. */
  onBuscar: (zona: FiltroDeZona) => void;
}) {
  const carril = useRef<HTMLDivElement>(null);
  const puesta = look[zona]?.id ?? null;
  const otra = zona === "arriba" ? ("vestido" as const) : zona === "vestido" ? ("arriba" as const) : null;
  const propias = paraLaTira(deLaZona(prendas, zona));
  const deLaOtra = otra ? paraLaTira(deLaZona(prendas, otra)) : [];
  const nombre = NOMBRE_ZONA[zona].toLocaleLowerCase("es");

  // Al cambiar de zona, la tira se pone donde está la prenda puesta (o al principio), sin mover la página.
  useEffect(() => {
    const el = carril.current;
    if (!el) return;
    const tarjeta = puesta ? el.querySelector<HTMLElement>(`[data-prenda="${puesta}"]`) : null;
    el.scrollTo({ left: tarjeta ? Math.max(0, tarjeta.offsetLeft - 16) : 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de zona: tocar una tarjeta no mueve la tira bajo el dedo
  }, [zona]);

  const opcion = (p: PrendaDelProbador) => {
    const c = colorPara(p, recordados);
    const sinStock = agotada(p);
    const esPuesta = look[p.zona]?.id === p.id;
    const chip = sinStock
      ? { texto: "Agotada", tipo: "pb-chip-agotada" }
      : c.solo
        ? { texto: c.solo, tipo: "pb-chip-tienda" }
        : c.pct
          ? { texto: `−${pctTexto(c.pct)} %`, tipo: "pb-chip-oferta" }
          : null;
    const precio = `${c.desde ? "Desde " : ""}${soles(c.precioFinal)}`;
    return (
      <button
        key={p.id}
        type="button"
        className="pb-opcion"
        data-prenda={p.id}
        aria-pressed={esPuesta}
        aria-disabled={sinStock || undefined}
        aria-label={`${p.nombre}, ${c.nombre}, ${precio}${p.colores.length > 1 ? `, ${p.colores.length} colores` : ""}${sinStock ? ", agotada" : esPuesta ? ", está en tu look" : ""}`}
        onClick={() => {
          if (!sinStock) onPoner(p);
        }}
      >
        <span className="pb-opcion-foto">
          <span className="pb-opcion-recorte">
            <Recorte foto={c.foto} tamanos="64px" />
          </span>
          {chip && <span className={`pb-chip ${chip.tipo}`}>{chip.texto}</span>}
          {esPuesta && (
            <span className="pb-visto" aria-hidden="true">
              <Icono nombre="check" />
            </span>
          )}
        </span>
        <span className="pb-opcion-nombre">{p.nombre}</span>
        <span className="pb-opcion-precio">
          <span className={c.pct ? "oferta" : undefined}>{precio}</span>
          {p.colores.length > 1 && (
            <span className="pb-puntitos" aria-hidden="true">
              {p.colores.slice(0, 4).map((x) => (
                <span key={x.codigo} data-color-dato style={x.hex ? { background: x.hex } : undefined} />
              ))}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <section className="pb-tira" aria-label={`Opciones para ${nombre}`}>
      <div className="pb-tira-cabeza">
        <p className="pb-tira-cab">
          <span className="pb-tira-num">{numero[zona] ?? <Icono nombre="mas" />}</span>
          {NOMBRE_ZONA[zona]}
          <span className="pb-tira-ayuda">· Desliza o elige</span>
        </p>
        <button type="button" className="pb-tira-todas" onClick={() => onBuscar(zona)} aria-label={`Ver todas las de ${nombre}`}>
          Ver todas
          <Icono nombre="flecha" />
        </button>
      </div>
      <div className="pb-tira-carril" ref={carril}>
        {OPCIONAL[zona] && (
          <button type="button" className="pb-opcion pb-ninguna" aria-pressed={!puesta} onClick={() => onQuitar(zona)}>
            <span className="pb-ninguna-caja">
              <Icono nombre="ninguna" />
            </span>
            <span className="pb-opcion-nombre">Sin {nombre}</span>
          </button>
        )}
        {propias.map(opcion)}
        {otra && deLaOtra.length > 0 && (
          <>
            <span className="pb-separador" aria-hidden="true">
              {otra === "vestido" ? "o un vestido" : "o arriba y abajo"}
            </span>
            {deLaOtra.map(opcion)}
          </>
        )}
        <button type="button" className="pb-buscar-otra" onClick={() => onBuscar("todo")}>
          <Icono nombre="lupa" />
          <span>
            Buscar
            <br />
            otra
          </span>
        </button>
      </div>
    </section>
  );
}
