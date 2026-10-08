"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { TextoConPartes } from "@/components/alta-producto/AlertaParecidas";
import { TarjetaParecida } from "@/components/alta-producto/TarjetaParecida";
import { Modal } from "@/components/ui/Modal";
import type { ResultadoParecidas } from "@/lib/parecidas-alta-tipos";
import { armarHoja, TEXTO, tituloHoja, type AlcanceHoja, type BuscarEnHoja, type RotuloTiempo } from "@/lib/parecidas-alta-vista";

// La hoja «Ver y comparar» de «Nuevo producto» (Fase 1; maqueta docs/maquetas/producto-buscar-primero-2026-09/).
//
// EL PROBLEMA. La alerta del resumen solo cabe dos filas, pero para decidir «¿es el mismo diseño?» hace falta ver la foto, los colores, las tallas, el
// stock por sede y cuándo se cargó, prenda por prenda, y poder buscar la que se tiene en la mano por nombre o por el código de la etiqueta. Eso vive
// aquí, bajo demanda: la alerta avisa, la hoja deja comparar.
//
// CONTRATO. PROMETE: un <Modal variante="hoja"> del sistema (velo, entrada, cascada y Escape del sistema; nada de overlay propio); un buscador (que
//   se ve SIEMPRE: el código de la etiqueta discrimina aun con 2 prendas); el contador; las tarjetas; «Ninguna es mi prenda» al pie; pantalla
//   completa bajo 1024 px; la línea gris de otras marcas SIN acción; el aviso cuando la lectura falló; Escape en dos tiempos (el primero borra la
//   búsqueda, el segundo cierra la hoja); el foco no salta a un teclado en el celular; que el foco vuelva a un lugar REAL al cerrar (si la fila que la abrió
//   ya no existe —«Ninguna es mi prenda» baja la alerta y la quita—, va a la alerta o, sin ella, al campo Nombre); el buscador a 16 px en el celular (a menos,
//   Safari hace zoom al enfocarlo) con un texto corto que sí cabe; ni un texto propio (todos vienen de `TEXTO`). ASUME: que se monta solo cuando la hoja está abierta (la hoja
//   abierta y lo revisado viven en quien integra) y que `buscar` es el filtro de las reglas (sin tildes ni mayúsculas, todas las palabras). NO HACE:
//   comparar nombres ni filtrar por su cuenta, ni guardar qué está revisado: avisa por callbacks (onRevisada, onDeshacer, onNinguna, onCerrar). Sus tarjetas
//   traen un enlace que SALE de la pantalla: el formulario tiene que usar `useSalidaSinGuardar` (ver `TarjetaParecida`).

type Props = {
  resultado: ResultadoParecidas;
  /** El nombre de la marca elegida (`null` = sin marca o comodín) y de la categoría: dan el título y separan lo que es de la lista de lo que solo informa. */
  marca: string | null;
  categoria: string | null;
  /** «lista»: marca + categoría. «marca»: «Ver las de Krisstell», toda la marca en todas sus categorías. */
  alcance?: AlcanceHoja;
  /** Ids de las prendas a las que la persona dijo «No, es otro diseño». */
  revisadas: ReadonlySet<string> | readonly string[];
  /** La lectura falló o venció: la hoja lo dice y la base vuelve a comprobar el nombre al guardar. */
  fallo?: boolean;
  rotuloTiempo: RotuloTiempo;
  buscar: BuscarEnHoja;
  /** Abrir parada en esta prenda (una mini fila del resumen): baja hasta ella y la destella una vez. */
  idEnfocado?: string | null;
  /** Lo que ya está escrito en el buscador al abrir (solo para pruebas y capturas: en uso normal arranca vacío). */
  busquedaInicial?: string;
  /** A qué elemento devolver el foco al cerrar (el botón que abrió la hoja). Si ya no está en la pantalla, la hoja busca sola un lugar real (ver `destinoDeFoco`). */
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onCerrar: () => void;
  onRevisada: (id: string) => void;
  onDeshacer: (id: string) => void;
  /** «Ninguna es mi prenda»: los ids que hay que marcar como otro diseño (nunca la idéntica). La hoja se cierra sola después. */
  onNinguna: (ids: string[]) => void;
  /** «Ver las de Jirish», en la línea de «también está en otra categoría». Sin esto, el botón no se dibuja (un botón que no hace nada no se ofrece). */
  onVerMarca?: () => void;
  onEsElMismo?: (id: string) => void;
};

/** ¿Es un teléfono o una pantalla táctil? Ahí el foco va a la hoja y no al buscador: el teclado taparía las tarjetas. */
function esTactil(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth <= 660);
}

/** ¿Se ve en la pantalla? (un elemento de una rama oculta con `lg:hidden` o `hidden lg:block` está conectado pero no ocupa lugar). */
const seVe = (el: HTMLElement | null): el is HTMLElement => !!el && el.isConnected && el.getClientRects().length > 0;

/**
 * A dónde vuelve el foco al cerrar la hoja. Lo pedido (el botón que la abrió) si sigue en pantalla; si no —«Ninguna es mi prenda» baja la alerta a
 * «Revisaste N ✓» y quita las filas y la tira que la abrieron—, la alerta o la tira que SÍ se ven (`data-parecidas-ancla`); y si tampoco hay, el campo
 * Nombre (que en el celular pide teclado: por eso va de último). Sin esto el foco caía al `body` y quien navega con teclado o lector volvía al inicio.
 */
function destinoDeFoco(pedido: HTMLElement | null): HTMLElement | null {
  if (seVe(pedido)) return pedido;
  const ancla = Array.from(document.querySelectorAll<HTMLElement>("[data-parecidas-ancla]")).find(seVe);
  if (ancla) return ancla;
  const nombre = document.querySelector<HTMLElement>('[data-campo="nombre"] input, [data-campo="nombre"] textarea');
  return seVe(nombre) ? nombre : null;
}

/** El ancestro que de verdad se desplaza (la hoja o la pantalla completa del celular), o `null` si nada se desplaza. */
function contenedorDeScroll(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Lleva la tarjeta a la vista SOLO si hace falta y sin tapar su título: si ya se ve entera entre el buscador fijo y el pie fijo, no se mueve nada (antes
 * se centraba siempre y la primera fila abría la hoja ya corrida, con el título cortado); si queda arriba o abajo, se mueve lo justo para que se vea
 * entera, y una más alta que el espacio libre se alinea por arriba. Solo mide y desplaza el contenedor; no toca el foco.
 */
function mostrarTarjeta(tarjeta: HTMLElement, fija: HTMLElement | null): void {
  const cont = contenedorDeScroll(tarjeta);
  if (!cont) return;
  const caja = cont.getBoundingClientRect();
  const t = tarjeta.getBoundingClientRect();
  // Lo que queda a la vista es lo que no tapan el buscador fijo de arriba ni el pie fijo de abajo («Ninguna es mi prenda»).
  const pie = cont.querySelector<HTMLElement>(".parecidas-hoja-pie");
  const arriba = Math.max(caja.top, fija ? fija.getBoundingClientRect().bottom : caja.top) + 8;
  const abajo = Math.min(caja.bottom, pie ? pie.getBoundingClientRect().top : caja.bottom) - 8;
  if (t.top >= arriba && t.bottom <= abajo) return;
  cont.scrollTop += t.height >= abajo - arriba || t.top < arriba ? t.top - arriba : t.bottom - abajo;
}

export function HojaParecidas(p: Props) {
  const alcance = p.alcance ?? "lista";
  // `useState` con inicializador: se mide una vez, al abrir. El `Modal` se monta solo con la hoja abierta.
  const [tactil] = useState(esTactil);
  // El `Modal` lee `.current` recién al cerrarse, cuando la pantalla ya cambió: un `getter` resuelve el destino en ese momento y no al abrir.
  const alCerrarEnfocar = useMemo<RefObject<HTMLElement | null>>(() => ({ get current() { return destinoDeFoco(p.alCerrarEnfocar?.current ?? null); } }) as RefObject<HTMLElement | null>, [p.alCerrarEnfocar]);
  return (
    <Modal
      variante="hoja"
      titulo={tituloHoja(p.resultado.ambito, alcance, p.marca, p.categoria)}
      subtitulo={TEXTO.bajadaHoja}
      // `parecidas-hoja` (app/estilos/alta-parecidas.css): el contenedor de consulta de las tarjetas y la pantalla completa bajo 1024 px.
      ancho="max-w-[680px] parecidas-hoja"
      onClose={p.onCerrar}
      alCerrarEnfocar={alCerrarEnfocar}
      focoEnLaHoja={tactil}
    >
      {(cerrar) => <CuerpoHoja {...p} alcance={alcance} cerrar={cerrar} tactil={tactil} />}
    </Modal>
  );
}

function CuerpoHoja({ tactil, resultado, marca, categoria, alcance, revisadas, fallo = false, rotuloTiempo, buscar, idEnfocado = null, busquedaInicial = "", cerrar, onRevisada, onDeshacer, onNinguna, onVerMarca, onEsElMismo }: Props & { alcance: AlcanceHoja; cerrar: () => void; tactil: boolean }) {
  // Lo tecleado vive aquí (un borrador que se descarta al cerrar), no en quien integra.
  const [q, setQ] = useState(busquedaInicial);
  const [llamada, setLlamada] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const conjunto = useMemo(() => (revisadas instanceof Set ? revisadas : new Set(revisadas as readonly string[])), [revisadas]);

  const vista = useMemo(
    () => armarHoja({ resultado, marca, categoria, alcance, revisadas: conjunto, busqueda: q, buscar, rotuloTiempo, fallo }),
    [resultado, marca, categoria, alcance, conjunto, q, buscar, rotuloTiempo, fallo],
  );

  // Abrir parada en una prenda: la deja a la vista (sin moverla si ya se ve) y la destella una vez. Solo al abrir.
  useEffect(() => {
    if (!idEnfocado) return;
    // La hoja es la madre del buscador: la tarjeta vive en el mismo panel.
    const tarjeta = raiz.current?.parentElement?.querySelector<HTMLElement>(`.parecidas-tarjeta[data-id="${CSS.escape(idEnfocado)}"]`);
    if (!tarjeta) return;
    mostrarTarjeta(tarjeta, raiz.current);
    setLlamada(idEnfocado);
    const t = window.setTimeout(() => setLlamada(null), 1150);
    return () => window.clearTimeout(t);
  }, [idEnfocado]);

  return (
    <>
      {/* El buscador y el contador se quedan arriba mientras se baja por la lista. */}
      <div className="parecidas-busqueda" ref={raiz}>
        <div className="caja-cayla parecidas-caja">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // En el celular el campo va a 16 px (Safari hace zoom con menos) y el texto largo no cabe: se usa el corto. El nombre accesible es siempre el mismo.
            placeholder={tactil ? vista.placeholderCorto : vista.placeholder}
            aria-label={TEXTO.buscadorAria}
            autoComplete="off"
            // Escape en dos tiempos: con algo escrito, el primero lo borra (y se queda con el Escape: `stopPropagation`, ver useEscapeLibre); el segundo cierra la hoja.
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.stopPropagation();
                setQ("");
              }
            }}
          />
        </div>
        <p role="status" aria-live="polite" className="parecidas-cuenta">
          {vista.cuenta}
        </p>
      </div>

      {vista.avisos.length > 0 && (
        <div className="parecidas-avisos">
          {vista.avisos.map((a, i) =>
            a.forma === "neutro" ? (
              <Aviso key={i} tono="info">
                <TextoConPartes texto={a.texto} partes={a.partes} />
              </Aviso>
            ) : (
              <p key={i} className="parecidas-gris">
                <TextoConPartes texto={a.texto} partes={a.partes} />
                {a.accion && onVerMarca && (
                  <>
                    {" "}
                    <button type="button" className="btn-enlace parecidas-enlace" onClick={onVerMarca}>
                      {a.accion.etiqueta}
                    </button>
                  </>
                )}
              </p>
            ),
          )}
        </div>
      )}

      <div className="parecidas-lista">
        {vista.tarjetas.length > 0 ? (
          vista.tarjetas.map((t) => (
            <TarjetaParecida
              key={t.id}
              tarjeta={t}
              revisada={conjunto.has(t.id)}
              resaltar={vista.resaltar}
              llamada={llamada === t.id}
              onRevisada={onRevisada}
              onDeshacer={onDeshacer}
              onEsElMismo={onEsElMismo}
            />
          ))
        ) : vista.vacio ? (
          <p className="parecidas-nada">{vista.vacio}</p>
        ) : null}
      </div>

      <div className="parecidas-hoja-pie">
        <p>{vista.pie.nota}</p>
        <button
          type="button"
          className="btn-cayla btn-secundario"
          onClick={() => {
            // Primero se marca y luego se cierra, con la salida animada del sistema.
            onNinguna(vista.idsNinguna);
            cerrar();
          }}
        >
          {vista.pie.boton}
        </button>
      </div>
    </>
  );
}
