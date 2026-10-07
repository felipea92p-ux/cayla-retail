"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { PieTarjeta } from "@/components/existencias/PieTarjeta";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { queHacerPrenda, tallaParaReponer, textoTallasRecortadas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { celdaTarjeta, destinoDeTalla, tallaDeEntrada as tallaDeEntradaDe, tallasAgotadas, tallasSinColgar, type CeldaTarjeta } from "@/lib/existencias-tarjeta-compacta";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { textoHoyDePrenda } from "@/lib/existencias-hoy";
import { botonDeTarjeta, opcionesDeMas, type ClaveAccion } from "@/lib/existencias-acciones";
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

   LA TARJETA COMPACTA (2026-10-07, maqueta `existencias-tarjeta-cajon-2026-10`, contrato en su `LOGICA.md`): una tabla con una
   columna por talla y dos filas, «En el piso» y «Almacén» (lo LIBRE). La columna que falta colgar lleva el piso en ámbar; la AGOTADA
   (nada libre en la sede) va entera en rojo suave. Lo dañado y lo apartado van en dos insignias junto al color. TODA la tarjeta abre
   el cajón en la talla de entrada; tocar una talla con algo en almacén lo abre listo para colgar esa talla (`lib/existencias-tarjeta-compacta.ts`).
   Reemplaza los botones de talla con «N piso» (ADR-0344, 2026-10-05), que no decían cuánto quedaba atrás.

   EL PIE (2026-10-07): lo que toca con su NOMBRE a la vista («Colgar en el piso», que abre siempre «Colgar varias»; «Se acabó: L»;
   «✓ Todo en el piso») y «Más ⌄», un menú que se abre con un clic (`PieTarjeta`, `lib/existencias-acciones.ts`). Reemplaza la percha
   sola con su ventana al pasar el mouse (2026-10-05), que no decía qué hacía y con el dedo no se abría.

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

/** Con un filtro («Hoy» o «Condición»): la talla que lo cumple lleva la insignia del filtro en su cabecera; la que más se vende,
 *  además, el nombre subrayado; las demás se atenúan. */
type MarcaTalla = "cumple" | "principal" | "tenue" | null;

const TONO_PUNTO = { ambar: "bg-ambar", pizarra: "bg-pizarra", tinta: "bg-tinta" } as const;
/** La insignia de la talla (maqueta): un círculo de papel con el símbolo del filtro, del tono del filtro. Se entiende sin depender del color. */
const TONO_INSIGNIA = { ambar: "text-ambar", pizarra: "text-pizarra", tinta: "text-tinta" } as const;
type SimboloFiltro = NonNullable<MarcaDelFiltro["simbolo"]>;

/** El fondo de cada celda según el estado de su columna (`celdaTarjeta`): la agotada entera en rojo suave, la que falta solo en la
 *  fila del piso en ámbar. Un 0 que no es problema se ve tenue. */
function claseCelda(c: CeldaTarjeta, fila: "piso" | "almacen"): string {
  if (c.estado === "agotada") return "bg-rojo/[0.11] font-semibold text-rojo-profundo";
  if (fila === "piso" && c.estado === "falta") return "rounded-md bg-ambar/[0.14] font-semibold text-ambar-profundo";
  return (fila === "piso" ? c.piso : c.almacen) === 0 ? "font-normal text-taupe/55" : "font-semibold text-tinta";
}

/** La tabla de la tarjeta: una columna por talla y dos filas, «En el piso» y «Almacén» (lo LIBRE). Cada columna es tocable: su
 *  cabecera es el botón (teclado y lector de pantalla); las celdas responden al mismo toque. */
function TablaTallas({
  tallas,
  separa,
  marcaDe,
  marcaDelFiltro,
  onTalla,
}: {
  tallas: readonly FilaExistencias[];
  separa: boolean;
  marcaDe: (f: FilaExistencias) => MarcaTalla;
  marcaDelFiltro: MarcaDelFiltro | null;
  onTalla: (f: FilaExistencias) => void;
}) {
  const celdas = tallas.map((f) => celdaTarjeta(f, separa));
  const Simbolo: SimboloFiltro | undefined = marcaDelFiltro?.simbolo;
  const tono = marcaDelFiltro?.tono ?? "ambar";
  const atenua = (f: FilaExistencias) => (marcaDe(f) === "tenue" ? "opacity-40" : "");
  const filas: { clave: "piso" | "almacen"; texto: string }[] = separa ? [{ clave: "piso", texto: "En el piso" }, { clave: "almacen", texto: "Almacén" }] : [{ clave: "piso", texto: "Disponibles" }];
  return (
    <table className="w-full table-fixed border-collapse text-center text-[13px] tabular-nums">
      <thead>
        <tr>
          <th className="w-[54px]" aria-hidden />
          {tallas.map((f, i) => {
            const c = celdas[i];
            const nombre = f.talla ?? "Única";
            const marca = marcaDe(f);
            const lectura = separa
              ? `Talla ${nombre}: ${c.piso} en el piso y ${c.almacen} en almacén${c.estado === "agotada" ? ", se acabó en esta sede" : c.estado === "falta" ? ", falta colgar" : ""}`
              : `Talla ${nombre}: ${c.piso} disponibles`;
            return (
              <th key={f.varianteId} scope="col" className={`h-5 border-b border-sand p-0 ${c.estado === "agotada" ? "rounded-t-[7px] bg-rojo/[0.11]" : ""} ${atenua(f)}`}>
                <button
                  type="button"
                  onClick={() => onTalla(f)}
                  title={lectura}
                  aria-label={`${lectura}${marca === "cumple" || marca === "principal" ? `. ${marcaDelFiltro?.etiqueta ?? ""}` : ""}${marca === "principal" ? ", la que más se vende" : ""}`}
                  className={`relative inline-flex h-5 w-full cursor-pointer items-center justify-center text-[11px] font-semibold hover:text-tinta ${c.estado === "agotada" ? "text-rojo-profundo" : "text-taupe"} ${marca === "principal" ? "underline decoration-2 underline-offset-2" : ""}`}
                >
                  {nombre}
                  {(marca === "cumple" || marca === "principal") &&
                    (Simbolo ? (
                      <span aria-hidden className={`ml-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-papel shadow-[0_0_0_1.25px_currentColor] ${TONO_INSIGNIA[tono]}`}>
                        <Simbolo aria-hidden className="h-2.5 w-2.5" strokeWidth={2.6} />
                      </span>
                    ) : (
                      <i aria-hidden className={`ml-1 h-1.5 w-1.5 rounded-full ${TONO_PUNTO[tono]}`} />
                    ))}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, r) => (
          <tr key={fila.clave} className={r > 0 ? "border-t border-sand/60" : ""}>
            <th scope="row" className="h-[22px] whitespace-nowrap text-left text-[10.5px] font-medium text-taupe">
              {fila.texto}
            </th>
            {tallas.map((f, i) => {
              const c = celdas[i];
              const ultima = r === filas.length - 1;
              return (
                <td
                  key={f.varianteId}
                  onClick={() => onTalla(f)}
                  className={`h-[22px] cursor-pointer px-0.5 ${claseCelda(c, fila.clave)} ${c.estado === "agotada" && ultima ? "rounded-b-[7px]" : ""} ${atenua(f)}`}
                >
                  {c.estado === "agotada" && fila.clave === "piso" ? "—" : fila.clave === "piso" ? c.piso : c.almacen}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ExistenciasTarjetas({
  modelos,
  separa,
  puedeReponer,
  mostrarMarca,
  tallasDePrenda,
  onColgarVarias,
  onSubir,
  puedeAjustar = false,
  onAjustar,
  onFicha,
  puedeEnviar = false,
  onEnviar,
  puedePedir = false,
  sedesParaPedir = [],
  onPedir,
  marcaDelFiltro = null,
  tallasCompletas,
  onAbrirTalla,
  onColgarTalla,
}: {
  modelos: ModeloPrendas<FilaExistencias>[];
  separa: boolean;
  puedeReponer: boolean;
  mostrarMarca: boolean;
  /** Cuántas tallas tiene cada prenda (modelo + color) en la sede sin filtros (`tallasPorPrenda`): si la tarjeta muestra menos,
   *  lo dice («Solo M · L (de 4 tallas)»), porque sus cifras suman solo las que se ven. */
  tallasDePrenda?: ReadonlyMap<string, number>;
  /** «Colgar en el piso» del pie: abre el panel ya en «Colgar varias» (la tabla del modelo). */
  onColgarVarias: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  /** «Ajustar stock» del menú «Más», solo si el rol puede: abre el panel de la talla de entrada ya en su paso. */
  puedeAjustar?: boolean;
  onAjustar?: (prenda: PrendaAgrupada<FilaExistencias>, fila: FilaExistencias) => void;
  /** «Ver ficha» del menú «Más»: el panel en su ficha. */
  onFicha?: (prenda: PrendaAgrupada<FilaExistencias>) => void;
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
  /** Tocar la tarjeta (o una talla sin nada en almacén): abre el panel de ESA talla. */
  onAbrirTalla: (prenda: PrendaAgrupada<FilaExistencias>, fila: FilaExistencias) => void;
  /** Tocar una talla con algo en almacén: abre el panel de ESA talla ya en el paso «Colgar en el piso». */
  onColgarTalla?: (prenda: PrendaAgrupada<FilaExistencias>, fila: FilaExistencias) => void;
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
        const entrada = tallaDeEntradaDe(tallasVista, cumplen[0]);
        // El pie (`lib/existencias-acciones.ts`): lo que toca con su nombre a la vista y «Más ⌄». Pedir: la primera talla agotada de
        // este color que otra tienda tiene.
        const agotadaPedible = puedePedir && onPedir ? tallasVista.find((t) => t.disponible <= 0 && mejorOrigen(t.enRed, sedesParaPedir) !== null) : undefined;
        const boton = botonDeTarjeta({
          puedeReponer,
          tallasPorColgar: tallasQueFaltan(m.colores).size,
          tallasSinColgar: tallasSinColgar(m.colores),
          hayQueBajar,
          verTalla: marcaDelFiltro && !marcaDelFiltro.esColgar && cumplen.length > 0 ? (cumplen[0].talla ?? "Única") : null,
          agotadas: tallasAgotadas(tallasVista),
        });
        const opciones = opcionesDeMas({
          puedeReponer,
          puedeEnviar: puedeEnviar && !!onEnviar,
          puedePedir: puedePedir && !!onPedir,
          puedeAjustar: puedeAjustar && !!onAjustar,
          hayEnElPiso,
          hayEnAlmacen,
          pedible: agotadaPedible ? (agotadaPedible.talla ?? "Única") : null,
        });
        const alBoton = () => (boton.tipo === "colgar" ? onColgarVarias(p) : cumplen[0] && onAbrirTalla(p, cumplen[0]));
        const alElegir = (clave: ClaveAccion) => {
          switch (clave) {
            case "subir":
              return onSubir(p, origen());
            case "enviar":
              return onEnviar?.(tallasDelModelo, p);
            case "pedir":
              return agotadaPedible && onPedir?.(p, agotadaPedible);
            case "ajustar":
              return entrada && onAjustar?.(p, entrada);
            case "ficha":
              return onFicha?.(p);
          }
        };
        // Un toque en cualquier parte de la tarjeta abre el cajón en la talla que más importa (la del filtro, o la primera que falta
        // en el piso, o la primera agotada, o la primera). Tocar una TALLA abre el cajón listo para colgar esa talla (`destinoDeTalla`).
        const abrirEntrada = () => entrada && onAbrirTalla(p, entrada);
        const alTocarTalla = (f: FilaExistencias) =>
          destinoDeTalla(f, { separa, puedeReponer }) === "colgar" && onColgarTalla ? onColgarTalla(p, f) : onAbrirTalla(p, f);
        return (
          <article
            key={m.clave}
            ref={(el) => {
              if (el) tarjetas.current.set(m.clave, el);
              else tarjetas.current.delete(m.clave);
            }}
            tabIndex={0}
            aria-label={`${etiqueta}. Enter abre el detalle`}
            // Toda la tarjeta abre el cajón (Felipe, 2026-10-07). Los controles de adentro (colores, tallas, acciones) hacen lo suyo;
            // un clic que no nació en el DOM de la tarjeta (un modal abierto desde ella sube por React) se ignora (CLAUDE.md, ADR-0128).
            onClick={(e) => {
              const t = e.target as HTMLElement;
              if (!e.currentTarget.contains(t) || t.closest("button, a, input, [role='menu']")) return;
              abrirEntrada();
            }}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                abrirEntrada();
              }
            }}
            className="card-cayla relative flex min-w-0 cursor-pointer flex-col gap-2 p-3 transition-colors hover:border-tinta/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            {/* Foto (o su categoría sobre su color), nombre, los colores con el nombre del que se ve (y lo dañado o apartado) y el precio. */}
            <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5">
              <span className="block h-[46px] w-10 shrink-0 overflow-hidden rounded-[9px] bg-sand/50">
                {p.fotoUrl ? <Image src={p.fotoUrl} alt="" width={80} height={92} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={p.colorHex} {...categoriaDe(p)} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[16.5px] leading-tight text-tinta" title={[p.referencia, mostrarMarca ? p.marca : null, p.categoria].filter(Boolean).join(" · ")}>
                  {p.referencia}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5">
              <div className="flex items-center gap-1.5 shrink-0" role="radiogroup" aria-label={`Color de ${p.referencia}`}>
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
                      className={`relative h-4 w-4 cursor-pointer rounded-full border-2 border-papel outline transition-transform after:absolute after:-inset-1 after:content-[''] pointer-coarse:after:-inset-2 hover:scale-110 focus-visible:outline-2 focus-visible:outline-tinta focus-visible:outline-offset-[3px] ${
                        propia ? "outline-2 outline-tinta" : "outline-[1.5px] outline-tinta/15"
                      }`}
                      style={{ background: h.colorHex ?? "conic-gradient(from 20deg, #C0272D, #F2C14E, #3E7A4E, #1B2A4A, #5B3A78, #C0272D)" }}
                    >
                      {n > 0 && marcaDelFiltro && <i aria-hidden className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-[1.5px] border-papel ${TONO_PUNTO[marcaDelFiltro.tono]}`} />}
                    </button>
                  );
                })}
              </div>
                  <span className="min-w-0 truncate text-xs text-taupe">{p.color ?? "Sin color"}</span>
                  {p.danado > 0 && <span className="shrink-0 rounded-full bg-rojo/[0.11] px-1.5 text-[11px] font-semibold text-rojo-profundo">{p.danado} {p.danado === 1 ? "dañada" : "dañadas"}</span>}
                  {p.apartado > 0 && <span className="shrink-0 rounded-full bg-pizarra/[0.12] px-1.5 text-[11px] font-semibold text-pizarra">{p.apartado} {p.apartado === 1 ? "apartada" : "apartadas"}</span>}
                </span>
              </span>
              {p.precio != null && <span className="self-start font-display text-[15px] tabular-nums text-tinta">S/ {p.precio.toFixed(2)}</span>}
            </div>
            <span className="sr-only">{separa && <EstadoParaLector prenda={p} />}</span>

            {/* La tabla: una columna por talla, «En el piso» y «Almacén». Ámbar = falta colgar; rojo = se acabó. */}
            <TablaTallas tallas={tallasVista} separa={separa} marcaDe={marcaDe} marcaDelFiltro={marcaDelFiltro} onTalla={alTocarTalla} />

            {/* Un filtro dejó solo algunas tallas y las cifras suman solo esas. */}
            {recortada && (
              <p className="text-[11px] leading-snug text-taupe" title="Las cifras de esta tarjeta suman solo estas tallas: las que dejan los filtros. Quita Talla o el texto buscado para ver todas.">
                {recortada}
              </p>
            )}

            <PieTarjeta etiqueta={etiqueta} boton={boton} opciones={opciones} onBoton={alBoton} onOpcion={alElegir} />
          </article>
        );
      })}
    </div>
  );
}
