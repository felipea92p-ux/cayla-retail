"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { soles } from "@/lib/catalogo";
import { paginaDe, POR_PAGINA_PROBADOR } from "@/lib/paginas";
import { pctTexto } from "@/lib/portada";
import { agotada, colorPara, deLaZona, NOMBRE_ZONA, OPCIONAL, type Look, type PrendaDelProbador, type Zona } from "@/lib/probador";
import type { FiltroDeZona } from "@/lib/probador-buscar";
import { Icono } from "../Icono";
import { Recorte } from "./Recorte";

/** Un lugar de la tira: «Sin …» o una prenda (de la zona o de la otra, «o un vestido»). */
type Celda = { ninguna: true } | { p: PrendaDelProbador; deLaOtra: boolean };

/** Lo que se puede poner va primero; lo agotado, al final (se ve, pero no se pone). */
const paraLaTira = (lista: readonly PrendaDelProbador[]) => [...lista.filter((p) => !agotada(p)), ...lista.filter(agotada)];

/**
 * La tira de opciones de la zona elegida (lienzo v3): «Sin encima» o «Sin bolso» cuando puede faltar, cada prenda de la zona en el
 * color que el cliente le eligió (o el que entra solo) con su precio, sus colores y su insignia (agotada, la única tienda que la tiene o
 * la campaña) y, en arriba, «o un vestido» (y al revés). Va en páginas de 8 (`POR_PAGINA_PROBADOR`, Felipe 2026-10-19): en la computadora,
 * dos filas de cuatro que entran en una sola vista sin bajar; en el celular, el mismo carril de siempre con 8 por página. «Sin …» ocupa un
 * lugar de la primera página; «o un vestido» rotula las de la otra zona en la página donde caigan. Al cambiar de zona, la tira vuelve a
 * la página de la que está puesta.
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

  // Todo lo que se ofrece, en su orden: «Sin …» (si puede faltar), las de la zona y las de la otra. Cada celda es un lugar de la página.
  const celdas: Celda[] = [
    ...(OPCIONAL[zona] ? [{ ninguna: true as const }] : []),
    ...propias.map((p) => ({ p, deLaOtra: false })),
    ...deLaOtra.map((p) => ({ p, deLaOtra: true })),
  ];
  // La página donde está la prenda puesta (la primera si no hay o no está en la lista).
  const lugarDeLaPuesta = Math.max(0, celdas.findIndex((c) => "p" in c && c.p.id === puesta));
  const paginaDeLaPuesta = Math.floor(lugarDeLaPuesta / POR_PAGINA_PROBADOR) + 1;
  // Al cambiar de zona la tira abre en la página de la prenda puesta; tocar una tarjeta no la mueve (se ajusta al dibujar, sin un cuadro con
  // la página equivocada).
  const [vista, setVista] = useState({ zona, pagina: paginaDeLaPuesta });
  if (vista.zona !== zona) setVista({ zona, pagina: paginaDeLaPuesta });
  const pag = paginaDe(celdas.length, vista.zona === zona ? vista.pagina : paginaDeLaPuesta, POR_PAGINA_PROBADOR);
  const irA = (pagina: number) => setVista({ zona, pagina: paginaDe(celdas.length, pagina, POR_PAGINA_PROBADOR).pagina });
  const deEstaPagina = celdas.slice(pag.desde, pag.hasta);
  const primeraDeLaOtra = deEstaPagina.findIndex((c) => "p" in c && c.deLaOtra);

  // Al cambiar de zona o de página, el carril del celular se pone donde está la prenda puesta (o al principio), sin mover la página.
  useEffect(() => {
    const el = carril.current;
    if (!el) return;
    const tarjeta = puesta ? el.querySelector<HTMLElement>(`[data-prenda="${puesta}"]`) : null;
    el.scrollTo({ left: tarjeta ? Math.max(0, tarjeta.offsetLeft - 16) : 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de zona o de página: tocar una tarjeta no mueve la tira bajo el dedo
  }, [zona, pag.pagina]);

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
          <span className="pb-tira-ayuda">
            · <span className="pb-solo-celular">Desliza o </span>elige
          </span>
        </p>
        <button type="button" className="pb-tira-todas" onClick={() => onBuscar(zona)} aria-label={`Ver todas las de ${nombre}`}>
          Ver todas
          <Icono nombre="flecha" />
        </button>
      </div>
      <div className="pb-tira-carril" ref={carril}>
        {deEstaPagina.map((c, i) => {
          if ("ninguna" in c)
            return (
              <button key="ninguna" type="button" className="pb-opcion pb-ninguna" aria-pressed={!puesta} onClick={() => onQuitar(zona)}>
                <span className="pb-ninguna-caja">
                  <Icono nombre="ninguna" />
                </span>
                <span className="pb-opcion-nombre">Sin {nombre}</span>
              </button>
            );
          return (
            <Fragment key={c.p.id}>
              {otra && i === primeraDeLaOtra && (
                <span className="pb-separador" aria-hidden="true">
                  {otra === "vestido" ? "o un vestido" : "o arriba y abajo"}
                </span>
              )}
              {opcion(c.p)}
            </Fragment>
          );
        })}
      </div>
      <div className="pb-tira-pie">
        {pag.paginas > 1 ? (
          <nav className="pb-pag" aria-label={`Páginas de ${nombre}`}>
            <button type="button" className="pb-pag-flecha pb-pag-anterior" onClick={() => irA(pag.pagina - 1)} disabled={pag.pagina <= 1} aria-label="Página anterior">
              <Icono nombre="flecha" />
            </button>
            <span className="pb-pag-dato" aria-live="polite">
              <b className="num">{pag.pagina}</b> de <span className="num">{pag.paginas}</span>
            </span>
            <button type="button" className="pb-pag-flecha" onClick={() => irA(pag.pagina + 1)} disabled={pag.pagina >= pag.paginas} aria-label="Página siguiente">
              <Icono nombre="flecha" />
            </button>
          </nav>
        ) : (
          <span />
        )}
        <button type="button" className="pb-buscar-otra" onClick={() => onBuscar("todo")}>
          <Icono nombre="lupa" />
          Buscar otra
        </button>
      </div>
    </section>
  );
}
