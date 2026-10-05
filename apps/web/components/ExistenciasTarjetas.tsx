"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { AccionesTarjeta } from "@/components/existencias/AccionesTarjeta";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { estadoTalla, queHacerPrenda, tallaParaReponer, textoTallasRecortadas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { textoHoyDePrenda } from "@/lib/existencias-hoy";
import { filasDeAcciones, type ClaveAccion } from "@/lib/existencias-acciones";
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

   No decide nada nuevo: las cifras son las LIBRES de `PrendaAgrupada` (las mismas de la tabla) y la pastilla es el diagnóstico
   de `queHacerPrenda` (el «Qué hacer» de la tabla). Reponer y Ajustar abren las ventanas que ya existían, con el permiso que ya
   calcula `permisosDelDetalle`: un botón que terminaría en «Sin acceso» no se dibuja.
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
function TallaBoton({ f, separa, onAbrir }: { f: FilaExistencias; separa: boolean; onAbrir: () => void }) {
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
      aria-label={`${lectura}. Ver detalle`}
      className={`flex min-h-[46px] min-w-[44px] cursor-pointer flex-col items-center justify-center rounded-[10px] border px-1.5 py-1 leading-none transition-colors hover:border-taupe ${BOTON_TALLA[estado]}`}
    >
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
  puedeAjustar,
  puedeReportarDanada = false,
  mostrarMarca,
  tallasDePrenda,
  onReponer,
  onSubir,
  onAjustar,
  onReportarDanada,
  puedeEnviar = false,
  onEnviar,
  onVerDetalle,
  onAbrirTalla,
}: {
  modelos: ModeloPrendas<FilaExistencias>[];
  separa: boolean;
  puedeReponer: boolean;
  puedeAjustar: boolean;
  /** «Reportar dañada» (ADR-0328 act. 10, `permisosDelDetalle`): quien ve Existencias, en su sede, con piso, almacén y cuarentena. */
  puedeReportarDanada?: boolean;
  mostrarMarca: boolean;
  /** Cuántas tallas tiene cada prenda (modelo + color) en la sede sin filtros (`tallasPorPrenda`): si la tarjeta muestra menos,
   *  lo dice («Solo M · L (de 4 tallas)»), porque sus cifras suman solo las que se ven. */
  tallasDePrenda?: ReadonlyMap<string, number>;
  /** «Reponer prenda» abre la ventana del MODELO entero (todos sus colores y tallas, ADR-0317); `prenda` es el color que se ve. */
  onReponer: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  /** «Subir prenda» abre la ventana del MODELO entero (todos sus colores y tallas). Mismo permiso que «Reponer prenda». */
  onSubir: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  onAjustar: (fila: FilaExistencias, origen: HTMLElement) => void;
  /** «Reportar dañada» abre su ventana con el color que se está viendo (`prenda`), y deja elegir otro color del modelo. */
  onReportarDanada?: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  /** «Enviar a otra sede»: abre Traslados con esta prenda cargada (`urlTrasladar`), solo para quien ve Traslados. `tallas` son las de TODOS
   *  los colores del modelo, como «Reponer prenda». */
  puedeEnviar?: boolean;
  onEnviar?: (tallas: readonly FilaExistencias[]) => void;
  /** «Ver detalle» de una tarjeta: llevar ese producto a la tabla, donde está el cajón de la prenda. */
  onVerDetalle: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  /** Tocar una talla: abre el cajón de ESA talla (la tabla de detalle con la prenda abierta). */
  onAbrirTalla: (prenda: PrendaAgrupada<FilaExistencias>, fila: FilaExistencias) => void;
}) {
  // El color que se ve en cada tarjeta. Sin elegir, el primero de la lista; si el elegido ya no está (un filtro, un guardado), también.
  const [elegida, setElegida] = useState<Record<string, string>>({});
  // La tarjeta, para devolverle el foco al cerrar una ventana abierta desde el menú «⋯» (el menú no deja un botón al que volver).
  const tarjetas = useRef(new Map<string, HTMLElement>());

  return (
    // Tantas columnas como caben (cada tarjeta pide ~19 rem), como en la maqueta: tres o cuatro en una computadora, una en el celular.
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
      {modelos.map((m) => {
        const p = m.colores.find((c) => c.clave === elegida[m.clave]) ?? m.colores[0];
        // «Reponer prenda» y «Subir prenda» abren el MODELO entero (todos sus colores, ADR-0317): se ofrecen si ALGÚN color tiene
        // algo que mover, no solo el que se está viendo.
        const hayQueBajar = puedeReponer && m.colores.some((c) => tallaParaReponer(c.tallas) !== null);
        // Subir: alguna talla de algún color con algo LIBRE en el piso (lo apartado para una clienta no se sube).
        const hayEnElPiso = m.colores.some((c) => c.tallas.some((t) => (t.pisoDisponible ?? 0) > 0));
        // Reportar dañada: algo LIBRE en el piso o en el almacén de algún color (lo apartado para un cliente no se mueve).
        const hayAlgoLibre = m.colores.some((c) => c.tallas.some((t) => (t.pisoDisponible ?? 0) + (t.almacenDisponible ?? 0) > 0));
        const etiqueta = `${p.referencia}${p.color ? ` ${p.color}` : ""}`;
        const recortada = textoTallasRecortadas(
          p.tallas.map((f) => f.talla),
          tallasDePrenda?.get(p.clave) ?? p.tallas.length
        );
        const colgadas = separa ? (p.piso ?? 0) : p.disponible;
        const guardadas = p.almacen ?? 0;
        const origen = () => tarjetas.current.get(m.clave) ?? document.body;
        // Algo libre en el almacén de algún color para mandar a otra sede (el traslado sale del almacén; `lineasParaTrasladar`).
        const tallasDelModelo = m.colores.flatMap((c) => c.tallas);
        const hayEnAlmacen = tallasDelModelo.some((t) => (t.almacenDisponible ?? t.disponible) > 0);
        const filas = filasDeAcciones({
          puedeReponer,
          puedeEnviar: puedeEnviar && !!onEnviar,
          puedeAjustar,
          // Una mancha o una rotura que aparece en el perchero (ADR-0328 act. 10): pasa a Dañadas y deja de contar para la venta.
          puedeReportarDanada: puedeReportarDanada && !!onReportarDanada,
          hayQueBajar,
          hayEnElPiso,
          hayEnAlmacen,
          hayAlgoLibre,
        });
        const alElegir = (clave: ClaveAccion) => {
          switch (clave) {
            case "colgar":
              return onReponer(p, origen());
            case "subir":
              return onSubir(p, origen());
            case "enviar":
              return onEnviar?.(tallasDelModelo);
            case "ajustar":
              return onAjustar(p.tallas[0], origen());
            case "danada":
              return onReportarDanada?.(p, origen());
            case "detalle":
              return onVerDetalle(p);
          }
        };
        return (
          <article
            key={m.clave}
            ref={(el) => {
              if (el) tarjetas.current.set(m.clave, el);
              else tarjetas.current.delete(m.clave);
            }}
            tabIndex={-1}
            aria-label={etiqueta}
            className="card-cayla flex min-w-0 flex-col gap-2.5 p-3.5 transition-colors hover:border-tinta/20"
          >
            {/* Foto (o su categoría sobre su color), nombre, marca y categoría, y el precio. */}
            <div className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2.5">
              <div className="h-14 w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-sand/50">
                {p.fotoUrl ? <Image src={p.fotoUrl} alt="" width={92} height={112} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={p.colorHex} {...categoriaDe(p)} />}
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-display text-[17.5px] leading-tight text-tinta" title={p.referencia}>
                  {p.referencia}
                </h3>
                <p className="truncate text-[12.5px] leading-[18px] text-taupe">{[mostrarMarca ? p.marca : null, p.categoria].filter(Boolean).join(" · ") || "\u00a0"}</p>
              </div>
              {p.precio != null && <span className="font-display text-base tabular-nums text-tinta">S/ {p.precio.toFixed(2)}</span>}
            </div>

            {/* Los colores del modelo (20 px) con el nombre del que se ve, y lo que hay de ese color: lo que cobra la caja primero. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="flex items-center gap-2" role="group" aria-label={`Colores de ${p.referencia}`}>
                {m.colores.map((h) => {
                  const propia = h.clave === p.clave;
                  return (
                    <button
                      key={h.clave}
                      type="button"
                      onClick={() => setElegida((previa) => ({ ...previa, [m.clave]: h.clave }))}
                      title={`${h.color ?? "Sin color"}${propia ? " (el que ves)" : " · ver este color"}`}
                      aria-label={h.color ?? "Sin color"}
                      aria-pressed={propia}
                      // El área para tocar crece sin que el círculo: 28 px con mouse y 36 con el dedo (`pointer-coarse`).
                      className={`relative h-[20px] w-[20px] cursor-pointer rounded-full border-2 border-papel outline transition-transform after:absolute after:-inset-1 after:content-[''] pointer-coarse:after:-inset-2 hover:scale-110 focus-visible:outline-2 focus-visible:outline-tinta focus-visible:outline-offset-[3px] ${
                        propia ? "outline-2 outline-tinta" : "outline-[1.5px] outline-tinta/15"
                      }`}
                      style={{ background: h.colorHex ?? "conic-gradient(from 20deg, #C0272D, #F2C14E, #3E7A4E, #1B2A4A, #5B3A78, #C0272D)" }}
                    />
                  );
                })}
              </div>
              <span className="text-[12.5px] text-taupe">{p.color ?? "Sin color"}</span>
              <span className="ml-auto text-[12px] tabular-nums text-taupe">
                {separa ? (
                  <>
                    <b className="font-semibold text-tinta">{colgadas}</b> {colgadas === 1 ? "colgada" : "colgadas"}
                    <span aria-hidden> · </span>
                    <b className="font-semibold text-tinta">{guardadas}</b> {guardadas === 1 ? "guardada" : "guardadas"}
                  </>
                ) : (
                  <>
                    <b className="font-semibold text-tinta">{colgadas}</b> {colgadas === 1 ? "disponible" : "disponibles"}
                  </>
                )}
              </span>
            </div>

            {/* Las tallas como botones; con muchas, bajan a otra fila. */}
            <ul aria-label={`Tallas de ${etiqueta}`} className="flex flex-wrap gap-1.5">
              {p.tallas.map((f) => (
                <li key={f.varianteId}>
                  <TallaBoton f={f} separa={separa} onAbrir={() => onAbrirTalla(p, f)} />
                </li>
              ))}
            </ul>

            {/* Abajo: lo que la prenda tiene aparte (dañadas, apartadas) y UN icono con sus acciones. */}
            <div className="mt-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {separa && <EstadoParaLector prenda={p} />}
                {p.danado > 0 && (
                  <Chip tono="rojo" versalitas={false} className="text-xs">
                    {p.danado} {p.danado === 1 ? "dañada" : "dañadas"}
                  </Chip>
                )}
                {p.apartado > 0 && <Chip tono="ambar">Apartado · {p.apartado}</Chip>}
              </div>
              <AccionesTarjeta etiqueta={etiqueta} filas={filas} alElegir={alElegir} />
            </div>
            {/* Un filtro dejó solo algunas tallas y las cifras suman solo esas. */}
            {recortada && (
              <p className="text-[11px] leading-snug text-taupe" title="Las cifras de esta tarjeta suman solo estas tallas: las que dejan los filtros. Quita Talla, Hoy o Condición para ver todas.">
                {recortada}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
