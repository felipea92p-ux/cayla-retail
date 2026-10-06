"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { AccionesTarjeta } from "@/components/existencias/AccionesTarjeta";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { estadoTalla, queHacerPrenda, tallaParaReponer, textoTallasRecortadas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { textoHoyDePrenda } from "@/lib/existencias-hoy";
import { filasDeAcciones, type ClaveAccion } from "@/lib/existencias-acciones";
import { mejorOrigen } from "@/lib/existencias-flujos";
import { tallasQueFaltan } from "@/lib/reponer-prenda-reglas";
import type { MarcaDelFiltro } from "@/components/existencias/PanelTalla";
import type { ModeloPrendas } from "@/lib/existencias-tarjetas";

/* ====================================================================
   Existencias en tarjetas (maqueta `docs/maquetas/existencias-tarjetas-2026-09/`)

   Una tarjeta por MODELO: foto, nombre, el riel de tallas y lo que la prenda pide hoy, del color que se está viendo. Los puntos de
   color cambian ese color en la propia tarjeta (foto, cifras y pastilla cambian con él). Es la lista de entrada; «Ver detalle»
   (en `InventarioPanel`) cambia a la tabla de siempre, donde vive el cajón de la prenda: las tarjetas no lo abren.
   Con un caso de «Hoy» elegido, la tarjeta es de una PRENDA (modelo + color, un solo punto): la lista es la de trabajo y la suma de
   sus pastillas tiene que dar la cifra de «Para hoy» (`lib/existencias-tarjetas.ts`, ADR-0331 act. c). Qué junta cada tarjeta y en
   qué orden van lo decide esa lógica, no este componente.

   LAS TALLAS (2026-10-05, maqueta `existencias-tactil-2026-10`): cada talla es un BOTÓN con su nombre y «N piso» (lo que la caja cobra). Toma el
   tono de su estado: normal (crema), por colgar (ámbar: hay atrás y ninguna afuera) y sin nada en la sede (borde punteado: un lugar vacío, no un
   error). Tocarla abre el detalle de esa talla (el cajón de la prenda). Reemplaza el riel de etiquetas colgadas de ADR-0331 (2026-10-04), que
   Felipe pidió dejar «como en la maqueta»; los guardados se dicen en la línea de arriba y al pasar el mouse por la talla.

   UN icono por tarjeta (2026-10-05, maqueta `existencias-tactil-2026-10`): la acción que le toca a la prenda (Colgar en el piso) y, al pasar el
   mouse, una ventana hacia arriba con TODAS las acciones y su nombre (`AccionesTarjeta`, `lib/existencias-acciones.ts`). Reemplaza el
   botón con texto y el menú «⋯» de la esquina: eran dos controles para lo mismo. Antes (2026-10-04) eran cuatro botones y
   uno negro en cada tarjeta: quince negros por página.

   SIN indicador de estado: la pastilla «3 tallas por colgar» repetía lo que ya dicen las etiquetas ámbar del riel y se quitó (Felipe,
   2026-10-05: «está de más»). Sigue dicha para quien usa lector de pantalla (`EstadoParaLector`), y la cifra que trae a la persona
   desde «Para hoy» sigue arriba, en la línea del conteo («6 prendas · 15 tallas por colgar»).

   CON UN FILTRO («Hoy» o «Condición», 2026-10-06, maqueta): la tarjeta muestra TODAS las tallas del color; las que cumplen llevan un
   punto del tono del filtro, la que más se vende además un aro, y las demás se atenúan. Los colores que cumplen también llevan su punto.
   El icono pasa a «Ver» la talla que más importa (salvo «Por colgar», que sigue siendo colgar). Sin filtro y sin nada por colgar, si el
   color está agotado y otra tienda lo tiene, el icono es «Pedir». La cabecera entera abre el panel de la talla.

   No decide nada nuevo: las cifras son las LIBRES de `PrendaAgrupada` (las mismas de la tabla), el estado de cada talla es
   `estadoTalla` y las acciones las arma `filasDeAcciones`. Cada acción abre el panel de la talla ya en su paso (`PanelTalla`).
   ==================================================================== */

/** El diagnóstico de la prenda (`queHacerPrenda`), dicho solo para el lector de pantalla: las MISMAS palabras del filtro «Hoy»
 *  («3 tallas por colgar»). A la vista ya no se pinta: lo dicen las etiquetas del riel. Donde no se separa piso y almacén no hay
 *  diagnóstico. */
function EstadoParaLector({ prenda }: { prenda: PrendaAgrupada<FilaExistencias> }) {
  const q = queHacerPrenda(prenda.tallas);
  if (!q) return null;
  return <span className="sr-only">{textoHoyDePrenda(q.tipo, q.n)}</span>;
}

/** Cómo se ve cada botón de talla, según su estado (`estadoTalla`, que sale de «Hoy»). */
const BOTON_TALLA = {
  normal: "border-tinta/15 bg-crema text-tinta",
  sin_atras: "border-tinta/15 bg-crema text-tinta",
  por_colgar: "border-ambar/45 bg-ambar/[0.12] text-tinta",
  // El borde punteado ya dice «lugar vacío»; la cifra no se apaga del todo (taupe da 5,6:1 sobre papel).
  sin_stock: "border-dashed border-taupe/45 bg-transparent text-taupe",
} as const;

/** Una talla: su nombre y «N piso» (o «—» si no hay nada libre en la sede). Es un botón: abre el detalle de esa talla. */
/** Con un filtro: la talla que lo cumple lleva su punto; la que más se vende, además un aro; las demás se atenúan (como la maqueta). */
type MarcaTalla = "cumple" | "principal" | "tenue" | null;

const TONO_PUNTO = { ambar: "bg-ambar", pizarra: "bg-pizarra", tinta: "bg-tinta" } as const;
/** La insignia de la talla (maqueta): un círculo de papel con el símbolo del filtro, del tono del filtro. Se entiende sin depender del color. */
const TONO_INSIGNIA = { ambar: "text-ambar", pizarra: "text-pizarra", tinta: "text-tinta" } as const;
type SimboloFiltro = NonNullable<MarcaDelFiltro["simbolo"]>;

function TallaBoton({ f, separa, onAbrir, marca = null, tono = "ambar", etiquetaFiltro, simbolo: Simbolo }: { f: FilaExistencias; separa: boolean; onAbrir: () => void; marca?: MarcaTalla; tono?: keyof typeof TONO_PUNTO; etiquetaFiltro?: string; simbolo?: SimboloFiltro }) {
  const estado = estadoTalla(f);
  const nombre = f.talla ?? "Única";
  const colgadas = separa ? (f.pisoDisponible ?? 0) : f.disponible;
  const guardadas = f.almacenDisponible ?? 0;
  const lectura = separa
    ? `Talla ${nombre}: ${colgadas} ${colgadas === 1 ? "colgada" : "colgadas"} y ${guardadas} ${guardadas === 1 ? "guardada" : "guardadas"}${estado === "sin_stock" ? ", sin nada libre en esta sede" : estado === "por_colgar" ? ", por colgar" : ""}`
    : `Talla ${nombre}: ${colgadas} ${colgadas === 1 ? "disponible" : "disponibles"}`;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={lectura}
      aria-label={`${lectura}${marca === "cumple" || marca === "principal" ? `. ${etiquetaFiltro ?? ""}` : ""}${marca === "principal" ? ", la que más se vende" : ""}. Ver detalle`}
      className={`relative flex min-h-[46px] min-w-[44px] cursor-pointer flex-col items-center justify-center rounded-[10px] border px-1.5 py-1 leading-none transition-[border-color,opacity] hover:border-taupe ${BOTON_TALLA[estado]} ${
        marca === "tenue" ? "opacity-40 hover:opacity-100" : marca === "principal" ? "shadow-[0_0_0_2px_var(--color-tinta)]" : ""
      }`}
    >
      {(marca === "cumple" || marca === "principal") &&
        (Simbolo ? (
          <span aria-hidden className={`absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-papel shadow-[0_0_0_1.5px_currentColor] ${TONO_INSIGNIA[tono]}`}>
            <Simbolo aria-hidden className="h-3 w-3" strokeWidth={2.6} />
          </span>
        ) : (
          <i aria-hidden className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-papel ${TONO_PUNTO[tono]}`} />
        ))}
      <b className="text-[15px] font-semibold">{nombre}</b>
      <small className={`mt-1 text-[10.5px] tabular-nums ${estado === "por_colgar" ? "font-semibold text-ambar-profundo" : "text-taupe"}`}>
        {estado === "sin_stock" ? "—" : separa ? `${colgadas} piso` : colgadas}
      </small>
    </button>
  );
}

export function ExistenciasTarjetas({
  modelos,
  separa,
  puedeReponer,
  mostrarMarca,
  tallasDePrenda,
  onReponer,
  onSubir,
  puedeEnviar = false,
  onEnviar,
  puedePedir = false,
  sedesParaPedir = [],
  onPedir,
  marcaDelFiltro = null,
  tallasCompletas,
  onAbrirTalla,
}: {
  modelos: ModeloPrendas<FilaExistencias>[];
  separa: boolean;
  puedeReponer: boolean;
  mostrarMarca: boolean;
  /** Cuántas tallas tiene cada prenda (modelo + color) en la sede sin filtros (`tallasPorPrenda`): si la tarjeta muestra menos,
   *  lo dice («Solo M · L (de 4 tallas)»), porque sus cifras suman solo las que se ven. */
  tallasDePrenda?: ReadonlyMap<string, number>;
  /** «Colgar en el piso»: abre el panel de la talla ya en su paso (`prenda` es el color que se ve). */
  onReponer: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  /** «Subir a almacén»: igual, del lado contrario. */
  onSubir: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  /** «Enviar a otra sede», solo para quien ve Traslados. */
  puedeEnviar?: boolean;
  /** Recibe las tallas del modelo con algo que enviar y el color que se mira (el panel abre en ese color). */
  onEnviar?: (tallas: readonly FilaExistencias[], prenda?: PrendaAgrupada<FilaExistencias>) => void;
  /** «Pedir a otra sede» como icono principal: el color está agotado aquí y una tienda lo tiene. */
  puedePedir?: boolean;
  sedesParaPedir?: readonly { id: string; nombre: string }[];
  onPedir?: (prenda: PrendaAgrupada<FilaExistencias>, fila: FilaExistencias) => void;
  /** El filtro «Hoy» o «Condición» de la lista: marca sus tallas y el icono pasa a «Ver» (salvo «Por colgar», que es colgar). */
  marcaDelFiltro?: MarcaDelFiltro | null;
  /** Con solo «Hoy» o «Condición» puestos, TODAS las tallas del color (las que no cumplen se atenúan, como la maqueta) en vez de
   *  solo las que cumplen. Sin ella, la tarjeta muestra las tallas que dejan los filtros. */
  tallasCompletas?: (prenda: PrendaAgrupada<FilaExistencias>) => FilaExistencias[];
  /** Tocar una talla (o la cabecera): abre el panel de ESA talla. */
  onAbrirTalla: (prenda: PrendaAgrupada<FilaExistencias>, fila: FilaExistencias) => void;
}) {
  // El color que se ve en cada tarjeta. Sin elegir, el primero de la lista; si el elegido ya no está (un filtro, un guardado), también.
  const [elegida, setElegida] = useState<Record<string, string>>({});
  // La tarjeta, para devolverle el foco al cerrar una ventana abierta desde el menú «⋯» (el menú no deja un botón al que volver).
  const tarjetas = useRef(new Map<string, HTMLElement>());
  const ventas = (f: FilaExistencias) => (f.ritmoReciente?.tipo === "medida" ? f.ritmoReciente.unidadesDia : 0);

  return (
    // Tantas columnas como caben (cada tarjeta pide ~19 rem), como en la maqueta: tres o cuatro en una computadora, una en el celular.
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
      {modelos.map((m) => {
        const p = m.colores.find((c) => c.clave === elegida[m.clave]) ?? m.colores[0];
        const tallasVista = tallasCompletas?.(p) ?? p.tallas;
        // Lo que el filtro marca en este color, la que más se vende primero (la «principal» lleva el aro).
        const cumplen = marcaDelFiltro ? [...tallasVista.filter(marcaDelFiltro.coincide)].sort((a, b) => ventas(b) - ventas(a)) : [];
        const marcaDe = (f: FilaExistencias): MarcaTalla =>
          !marcaDelFiltro ? null : f.varianteId === cumplen[0]?.varianteId ? "principal" : cumplen.some((c) => c.varianteId === f.varianteId) ? "cumple" : "tenue";
        // Colgar abre el MODELO entero: se ofrece si ALGÚN color tiene algo que mover, no solo el que se está viendo.
        const hayQueBajar = puedeReponer && m.colores.some((c) => tallaParaReponer(c.tallas) !== null);
        const hayPorColgar = tallasQueFaltan(m.colores).size > 0;
        // Subir: alguna talla de algún color con algo LIBRE en el piso (lo apartado para una clienta no se sube).
        const hayEnElPiso = m.colores.some((c) => c.tallas.some((t) => (t.pisoDisponible ?? 0) > 0));
        const etiqueta = `${p.referencia}${p.color ? ` ${p.color}` : ""}`;
        const recortada = tallasCompletas
          ? null
          : textoTallasRecortadas(
              p.tallas.map((f) => f.talla),
              tallasDePrenda?.get(p.clave) ?? p.tallas.length
            );
        const origen = () => tarjetas.current.get(m.clave) ?? document.body;
        // Algo libre en el almacén de algún color para mandar a otra sede (el traslado sale del almacén; `lineasParaTrasladar`).
        const tallasDelModelo = m.colores.flatMap((c) => c.tallas);
        const hayEnAlmacen = tallasDelModelo.some((t) => (t.almacenDisponible ?? t.disponible) > 0);
        // La principal (maqueta): con un filtro que no es «Por colgar», «Ver» la talla que más importa; sin filtro y sin nada por colgar,
        // «Pedir» la primera talla agotada de este color que otra tienda tiene.
        const agotadaPedible = puedePedir && onPedir ? tallasVista.find((t) => t.disponible <= 0 && mejorOrigen(t.enRed, sedesParaPedir) !== null) : undefined;
        const principal =
          marcaDelFiltro && !marcaDelFiltro.esColgar && cumplen.length > 0
            ? { clave: "ver" as const, etiqueta: `Ver talla ${cumplen[0].talla ?? "Única"}` }
            : !marcaDelFiltro && !hayPorColgar && agotadaPedible
              ? { clave: "pedir" as const, etiqueta: `Pedir talla ${agotadaPedible.talla ?? "Única"}` }
              : null;
        const filas = filasDeAcciones({ puedeReponer, puedeEnviar: puedeEnviar && !!onEnviar, hayQueBajar, hayPorColgar, hayEnElPiso, hayEnAlmacen, principal });
        const alElegir = (clave: ClaveAccion) => {
          switch (clave) {
            case "colgar":
              return onReponer(p, origen());
            case "subir":
              return onSubir(p, origen());
            case "enviar":
              return onEnviar?.(tallasDelModelo, p);
            case "pedir":
              return agotadaPedible && onPedir?.(p, agotadaPedible);
            case "ver":
              return cumplen[0] && onAbrirTalla(p, cumplen[0]);
          }
        };
        // La cabecera abre el panel en la talla que más importa: la del filtro, o la primera por colgar o sin nada, o la primera.
        const tallaDeEntrada = cumplen[0] ?? tallasVista.find((t) => estadoTalla(t) === "por_colgar" || estadoTalla(t) === "sin_stock") ?? tallasVista[0];
        return (
          <article
            key={m.clave}
            ref={(el) => {
              if (el) tarjetas.current.set(m.clave, el);
              else tarjetas.current.delete(m.clave);
            }}
            tabIndex={-1}
            aria-label={etiqueta}
            // `@container`: la acción dice su nombre en una tablet solo si la tarjeta tiene ancho (`AccionesTarjeta`).
            className="card-cayla @container flex min-w-0 flex-col gap-2.5 p-3.5 transition-colors hover:border-tinta/20"
          >
            {/* Foto (o su categoría sobre su color), nombre, marca y categoría, y el precio. Toda la cabecera abre el panel (maqueta). */}
            <button
              type="button"
              onClick={() => tallaDeEntrada && onAbrirTalla(p, tallaDeEntrada)}
              aria-label={`Abrir ${etiqueta}`}
              className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl text-left"
            >
              <span className="block h-14 w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-sand/50">
                {p.fotoUrl ? <Image src={p.fotoUrl} alt="" width={92} height={112} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={p.colorHex} {...categoriaDe(p)} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[17.5px] leading-tight text-tinta" title={p.referencia}>
                  {p.referencia}
                </span>
                <span className="block truncate text-[12.5px] leading-[18px] text-taupe">{[mostrarMarca ? p.marca : null, p.categoria].filter(Boolean).join(" · ") || "\u00a0"}</span>
              </span>
              {p.precio != null && <span className="font-display text-base tabular-nums text-tinta">S/ {p.precio.toFixed(2)}</span>}
            </button>

            {/* Los colores del modelo con el nombre del que se ve (con un filtro, un punto en los que lo cumplen) y, a la derecha, la acción
                (2026-10-06): antes tenía una fila propia abajo, vacía salvo por el icono. Así las acciones de una fila de tarjetas quedan a
                la misma altura. Si no caben (muchos colores en una tarjeta angosta), la acción baja sola a la derecha. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <div className="flex items-center gap-2" role="radiogroup" aria-label={`Color de ${p.referencia}`}>
                {m.colores.map((h) => {
                  const propia = h.clave === p.clave;
                  const n = marcaDelFiltro ? (tallasCompletas?.(h) ?? h.tallas).filter(marcaDelFiltro.coincide).length : 0;
                  return (
                    <button
                      key={h.clave}
                      type="button"
                      role="radio"
                      onClick={() => setElegida((previa) => ({ ...previa, [m.clave]: h.clave }))}
                      title={`${h.color ?? "Sin color"}${propia ? " (el que ves)" : " · ver este color"}`}
                      aria-label={`${h.color ?? "Sin color"}${n ? `: ${n} ${n === 1 ? "talla" : "tallas"} ${marcaDelFiltro?.etiqueta.toLocaleLowerCase("es") ?? ""}` : ""}`}
                      aria-checked={propia}
                      // El área para tocar crece sin que el círculo: 28 px con mouse y 36 con el dedo (`pointer-coarse`).
                      className={`relative h-[22px] w-[22px] cursor-pointer rounded-full border-2 border-papel outline transition-transform after:absolute after:-inset-1 after:content-[''] pointer-coarse:after:-inset-2 hover:scale-110 focus-visible:outline-2 focus-visible:outline-tinta focus-visible:outline-offset-[3px] ${
                        propia ? "outline-2 outline-tinta" : "outline-[1.5px] outline-tinta/15"
                      }`}
                      style={{ background: h.colorHex ?? "conic-gradient(from 20deg, #C0272D, #F2C14E, #3E7A4E, #1B2A4A, #5B3A78, #C0272D)" }}
                    >
                      {n > 0 && marcaDelFiltro && <i aria-hidden className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-[1.5px] border-papel ${TONO_PUNTO[marcaDelFiltro.tono]}`} />}
                    </button>
                  );
                })}
              </div>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-taupe">{p.color ?? "Sin color"}</span>
              {/* Lo que la prenda tiene aparte se dice para el lector de pantalla; a la vista, en el panel de la talla y en los atajos. */}
              <span className="sr-only">
                {separa && <EstadoParaLector prenda={p} />}
                {p.danado > 0 && ` ${p.danado} ${p.danado === 1 ? "dañada" : "dañadas"}.`}
                {p.apartado > 0 && ` ${p.apartado} ${p.apartado === 1 ? "apartada" : "apartadas"}.`}
              </span>
              {filas.length > 0 && (
                <div className="ml-auto">
                  <AccionesTarjeta etiqueta={etiqueta} filas={filas} alElegir={alElegir} />
                </div>
              )}
            </div>

            {/* Las tallas como botones; con muchas, bajan a otra fila. */}
            <ul aria-label={`Tallas de ${etiqueta}`} className="flex flex-wrap gap-1.5">
              {tallasVista.map((f) => (
                <li key={f.varianteId}>
                  <TallaBoton f={f} separa={separa} onAbrir={() => onAbrirTalla(p, f)} marca={marcaDe(f)} tono={marcaDelFiltro?.tono} etiquetaFiltro={marcaDelFiltro?.etiqueta} simbolo={marcaDelFiltro?.simbolo} />
                </li>
              ))}
            </ul>

            {/* Un filtro dejó solo algunas tallas y las cifras suman solo esas. */}
            {recortada && (
              <p className="text-[11px] leading-snug text-taupe" title="Las cifras de esta tarjeta suman solo estas tallas: las que dejan los filtros. Quita Talla o el texto buscado para ver todas.">
                {recortada}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
