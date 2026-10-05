"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { estadoTalla, queHacerPrenda, tallaParaReponer, textoTallasRecortadas, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { AYUDA_HOY, textoHoyDePrenda, TONO_HOY } from "@/lib/existencias-hoy";
import type { ModeloPrendas } from "@/lib/existencias-tarjetas";

/* ====================================================================
   Existencias en tarjetas (maqueta `docs/maquetas/existencias-tarjetas-2026-09/`)

   Una tarjeta por MODELO: foto, nombre, el riel de tallas y lo que la prenda pide hoy, del color que se está viendo. Los puntos de
   color cambian ese color en la propia tarjeta (foto, cifras y pastilla cambian con él). Es la lista de entrada; «Ver detalle»
   (en `InventarioPanel`) cambia a la tabla de siempre, donde vive el cajón de la prenda: las tarjetas no lo abren.
   Con un caso de «Hoy» elegido, la tarjeta es de una PRENDA (modelo + color, un solo punto): la lista es la de trabajo y la suma de
   sus pastillas tiene que dar la cifra de «Para hoy» (`lib/existencias-tarjetas.ts`, ADR-0331 act. c). Qué junta cada tarjeta y en
   qué orden van lo decide esa lógica, no este componente.

   EL RIEL (rediseño 2026-10-04): cada talla es una ETIQUETA colgada de un riel, como en el perchero de la tienda. En grande, las
   colgadas (lo que la caja cobra); debajo, «+N» las guardadas. La etiqueta toma el tono de su estado: colgada (papel), por colgar
   (ámbar: hay atrás y ninguna afuera) y sin nada en la sede (borde punteado: un lugar vacío, no un error). Reemplaza las cajas
   «Piso / Almacén» (la de Piso iba siempre en rojo) y la cuadrícula con los rótulos repetidos en cada renglón.

   UN botón por tarjeta (rediseño 2026-10-04): «Reponer» solo si algún color tiene algo que bajar; Subir, Ajustar, Reportar dañada
   (ADR-0328 act. 10) y Ver detalle viven en el menú «⋯». Antes eran cuatro botones y uno negro en cada tarjeta: quince negros por página.

   No decide nada nuevo: las cifras son las LIBRES de `PrendaAgrupada` (las mismas de la tabla) y la pastilla es el diagnóstico
   de `queHacerPrenda` (el «Qué hacer» de la tabla). Reponer y Ajustar abren las ventanas que ya existían, con el permiso que ya
   calcula `permisosDelDetalle`: un botón que terminaría en «Sin acceso» no se dibuja.
   ==================================================================== */

const TONO_PASTILLA = {
  verde: { caja: "bg-verde/10 text-verde-profundo", punto: "bg-verde ring-verde/25" },
  ambar: { caja: "bg-ambar/[0.13] text-ambar-profundo", punto: "bg-ambar ring-ambar/25" },
  pizarra: { caja: "bg-pizarra/10 text-pizarra", punto: "bg-pizarra ring-pizarra/25" },
} as const;

/** El diagnóstico de la prenda (`queHacerPrenda`) como pastilla con punto: las MISMAS palabras del filtro «Hoy» (Felipe,
 *  2026-10-03): filtrar «Por colgar» muestra tarjetas que dicen «N tallas por colgar». Donde no se separa piso y almacén no hay
 *  diagnóstico. */
function Pastilla({ prenda }: { prenda: PrendaAgrupada<FilaExistencias> }) {
  const q = queHacerPrenda(prenda.tallas);
  const t = TONO_PASTILLA[TONO_HOY[q.tipo]];
  const texto = textoHoyDePrenda(q.tipo, q.n);
  return (
    <span title={AYUDA_HOY[q.tipo]} className={`inline-flex min-h-[28px] items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-medium leading-tight ${t.caja}`}>
      <i aria-hidden className={`h-2 w-2 shrink-0 rounded-full ring-[3px] ${t.punto}`} />
      {texto}
    </span>
  );
}

/** Cómo se ve cada etiqueta del riel, según el estado de la talla (`estadoTalla`, que sale de «Hoy»). */
const ETIQUETA = {
  normal: { caja: "border-tinta/15 bg-papel", cifra: "text-tinta", atras: "text-taupe" },
  reponer: { caja: "border-tinta/15 bg-papel", cifra: "text-tinta", atras: "text-taupe" },
  por_colgar: { caja: "border-ambar/45 bg-ambar/[0.08]", cifra: "text-ambar-profundo", atras: "font-semibold text-ambar-profundo" },
  // El borde punteado ya dice «lugar vacío»: la cifra no se apaga (al 55 % quedaba en 2,3:1 sobre papel; taupe da 5,6:1).
  sin_stock: { caja: "border-dashed border-taupe/45 bg-transparent", cifra: "text-taupe", atras: "text-taupe" },
} as const;

/** Una talla colgada del riel: el gancho, la etiqueta con su ojal, el nombre de la talla, las colgadas y «+N» guardadas. */
function EtiquetaTalla({ f, separa }: { f: FilaExistencias; separa: boolean }) {
  const estado = estadoTalla(f);
  const e = ETIQUETA[estado];
  const nombre = f.talla ?? "Única";
  const colgadas = separa ? (f.pisoDisponible ?? 0) : f.disponible;
  const guardadas = f.almacenDisponible ?? 0;
  const lectura = separa
    ? `Talla ${nombre}: ${colgadas} ${colgadas === 1 ? "colgada" : "colgadas"} y ${guardadas} ${guardadas === 1 ? "guardada" : "guardadas"}${estado === "sin_stock" ? ", sin nada libre en esta sede" : estado === "por_colgar" ? ", por colgar" : ""}`
    : `Talla ${nombre}: ${colgadas} ${colgadas === 1 ? "disponible" : "disponibles"}`;
  return (
    <li className="flex shrink-0 flex-col items-center" title={lectura} aria-label={lectura}>
      {/* El gancho que la cuelga del riel. */}
      <span aria-hidden className="h-2.5 w-px bg-tinta/30" />
      <span className={`relative flex min-w-[3.25rem] flex-col items-center rounded-[10px] border px-2 pb-1.5 pt-3 ${e.caja}`}>
        {/* El ojal de la etiqueta. */}
        <span aria-hidden className="absolute left-1/2 top-1 h-1 w-1 -translate-x-1/2 rounded-full bg-crema ring-1 ring-tinta/25" />
        <span className="text-[11px] font-semibold leading-none tracking-wide text-taupe">{nombre}</span>
        <b className={`mt-1 font-display text-[22px] font-medium leading-none tabular-nums ${e.cifra}`}>{colgadas}</b>
        {separa && <span className={`mt-1 text-[10.5px] leading-none tabular-nums ${e.atras}`}>{guardadas > 0 ? `+${guardadas}` : "—"}</span>}
      </span>
    </li>
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
  onVerDetalle,
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
  /** «Ver detalle» de una tarjeta: llevar ese producto a la tabla, donde está el cajón de la prenda. */
  onVerDetalle: (prenda: PrendaAgrupada<FilaExistencias>) => void;
}) {
  // El color que se ve en cada tarjeta. Sin elegir, el primero de la lista; si el elegido ya no está (un filtro, un guardado), también.
  const [elegida, setElegida] = useState<Record<string, string>>({});
  // La tarjeta, para devolverle el foco al cerrar una ventana abierta desde el menú «⋯» (el menú no deja un botón al que volver).
  const tarjetas = useRef(new Map<string, HTMLElement>());

  return (
    // Dos columnas donde caben (cada tarjeta pide ~30 rem para que el riel muestre sus tallas), tres en pantallas muy anchas.
    <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,30rem),1fr))]">
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
        const menu = [
          ...(puedeReponer
            ? [{ clave: "subir", etiqueta: "Subir al almacén", onSelect: () => onSubir(p, origen()), motivo: hayEnElPiso ? undefined : "No hay nada colgado para subir" }]
            : []),
          ...(puedeAjustar ? [{ clave: "ajustar", etiqueta: "Ajustar stock", onSelect: () => onAjustar(p.tallas[0], origen()) }] : []),
          // Una mancha o una rotura que aparece en el perchero (ADR-0328 act. 10): pasa a Dañadas y deja de contar para la venta.
          ...(puedeReportarDanada && onReportarDanada
            ? [{ clave: "danada", etiqueta: "Reportar dañada", onSelect: () => onReportarDanada(p, origen()), motivo: hayAlgoLibre ? undefined : "No hay prendas libres para reportar" }]
            : []),
          { clave: "detalle", etiqueta: "Ver detalle", onSelect: () => onVerDetalle(p) },
        ];
        return (
          <article
            key={m.clave}
            ref={(el) => {
              if (el) tarjetas.current.set(m.clave, el);
              else tarjetas.current.delete(m.clave);
            }}
            tabIndex={-1}
            aria-label={etiqueta}
            className="card-cayla @container flex min-w-0 flex-col p-4 outline-none transition-colors hover:border-tinta/20 focus-visible:ring-2 focus-visible:ring-tinta/30 max-sm:p-3.5"
          >
            <div className="flex gap-3.5">
              <div className="h-[100px] w-[75px] shrink-0 overflow-hidden rounded-[9px] bg-sand/50 max-sm:h-[88px] max-sm:w-[66px]">
                {p.fotoUrl ? <Image src={p.fotoUrl} alt="" width={150} height={200} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" colorHex={p.colorHex} {...categoriaDe(p)} conNombre />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-[19px] leading-tight text-tinta" title={p.referencia}>
                      {p.referencia}
                    </h3>
                    {/* El color que se está viendo, con su nombre en fuerte: la marca va tenue. */}
                    <p className="mt-0.5 truncate text-[13px] leading-[18px] text-taupe">
                      {mostrarMarca && p.marca && <>{p.marca} · </>}
                      <span className="font-medium text-tinta">{p.color ?? "Sin color"}</span>
                    </p>
                  </div>
                  <MenuAcciones etiqueta={`Más acciones de ${etiqueta}`} items={menu} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Colores de ${p.referencia}`}>
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
                        className={`h-[20px] w-[20px] cursor-pointer rounded-full border-[3px] border-papel outline transition-transform hover:scale-110 ${
                          propia ? "outline-2 outline-tinta" : "outline-[1.5px] outline-tinta/15"
                        }`}
                        style={{ background: h.colorHex ?? "conic-gradient(from 20deg, #C0272D, #F2C14E, #3E7A4E, #1B2A4A, #5B3A78, #C0272D)" }}
                      />
                    );
                  })}
                </div>
                {/* Las cifras del color que se ve, en una línea: lo que cobra la caja primero. */}
                <p className="mt-2 text-[12.5px] leading-none text-taupe tabular-nums">
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
                </p>
              </div>
            </div>

            {/* El riel y, a su lado cuando la tarjeta tiene ancho (`@container`, no la ventana), lo que la prenda pide y su botón; en una
                tarjeta angosta (celular) van debajo. Con muchas tallas el riel se desliza de lado dentro de la tarjeta. */}
            <div className="mt-3.5 flex flex-col gap-3 @min-[30rem]:flex-row @min-[30rem]:items-end">
              <div className="relative min-w-0 flex-1">
                <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] rounded-full bg-tinta/20" />
                {/* Con más tallas que ancho, el borde derecho se desvanece (solo sobre el aire de `pr-6`): se nota que hay más y, al
                    llegar al final, la última se ve entera. Antes, a 375 px la sexta talla quedaba afuera sin ningún aviso. */}
                <ul
                  aria-label={`Tallas de ${etiqueta}`}
                  className="scroll-cayla relative flex gap-2 overflow-x-auto pb-1 pl-1 pr-6 [mask-image:linear-gradient(90deg,#000_calc(100%-1.5rem),transparent)]"
                >
                  {p.tallas.map((f) => (
                    <EtiquetaTalla key={f.varianteId} f={f} separa={separa} />
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 @min-[30rem]:shrink-0 @min-[30rem]:flex-col @min-[30rem]:items-end @min-[30rem]:justify-end @min-[30rem]:pb-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 @min-[30rem]:justify-end">
                  {separa && <Pastilla prenda={p} />}
                  {p.danado > 0 && (
                    <Chip tono="rojo" versalitas={false} className="text-xs">
                      {p.danado} {p.danado === 1 ? "dañada" : "dañadas"}
                    </Chip>
                  )}
                  {p.apartado > 0 && <Chip tono="ambar">Apartado · {p.apartado}</Chip>}
                </div>
                {hayQueBajar && (
                  <button
                    type="button"
                    onClick={(e) => onReponer(p, e.currentTarget)}
                    title="Bajar prendas del almacén al piso, de todos los colores"
                    className="btn-cayla btn-secundario btn-chico shrink-0 gap-1.5"
                  >
                    <IconoPercha aria-hidden className="h-4 w-4" strokeWidth={1.6} />
                    Reponer
                  </button>
                )}
              </div>
            </div>
            {/* Un filtro dejó solo algunas tallas y las cifras suman solo esas. */}
            {recortada && (
              <p className="mt-2 text-[11px] leading-snug text-taupe" title="Las cifras de esta tarjeta suman solo estas tallas: las que dejan los filtros. Quita Talla, Hoy o Condición para ver todas.">
                {recortada}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
