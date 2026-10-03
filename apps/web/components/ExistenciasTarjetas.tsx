"use client";

import Image from "next/image";
import { useState } from "react";
import { Package, ShoppingBag, SquarePen, Warehouse } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { estadoTalla, queHacerPrenda, tallaParaReponer, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { AYUDA_HOY, textoHoyDePrenda, TONO_HOY } from "@/lib/existencias-hoy";

/* ====================================================================
   Existencias en tarjetas (maqueta `docs/maquetas/existencias-tarjetas-2026-09/`)

   Una tarjeta por MODELO: foto, nombre, «piso · almacén» por talla y lo que la prenda pide hoy, del color que se está viendo. Los
   puntos de color cambian ese color en la propia tarjeta (foto, cifras y pastilla cambian con él). Es la lista de entrada; «Ver
   detalle» (en `InventarioPanel`) cambia a la tabla de siempre, donde vive el cajón de la prenda: las tarjetas no lo abren.

   No decide nada nuevo: las cifras son las LIBRES de `PrendaAgrupada` (las mismas de la tabla) y la pastilla es el diagnóstico
   de `queHacerPrenda` (el «Qué hacer» de la tabla). Reponer y Ajustar abren las ventanas que ya existían, con el permiso que ya
   calcula `permisosDelDetalle`: un botón que terminaría en «Sin acceso» no se dibuja.
   ==================================================================== */

export type OrdenPrendas = "relevancia" | "nombre" | "mas-piso" | "menos-piso" | "mas-almacen" | "mas-disponible" | "menos-disponible";

/** Las opciones de «Ordenar por»: donde no se separa piso y almacén (Taller) no hay «más en el piso», solo lo disponible. */
export function opcionesOrden(separa: boolean): { valor: OrdenPrendas; texto: string }[] {
  return separa
    ? [
        { valor: "relevancia", texto: "Más relevantes" },
        { valor: "nombre", texto: "Nombre (A–Z)" },
        { valor: "mas-piso", texto: "Más en el piso" },
        { valor: "menos-piso", texto: "Menos en el piso" },
        { valor: "mas-almacen", texto: "Más en el almacén" },
      ]
    : [
        { valor: "relevancia", texto: "Más relevantes" },
        { valor: "nombre", texto: "Nombre (A–Z)" },
        { valor: "mas-disponible", texto: "Más disponibles" },
        { valor: "menos-disponible", texto: "Menos disponibles" },
      ];
}

/** Un modelo con sus colores (cada color es una prenda: modelo + color). En la lista de tarjetas es UNA tarjeta. */
export type ModeloPrendas<F extends FilaExistencias = FilaExistencias> = { productoId: string; colores: PrendaAgrupada<F>[] };

/** Junta las prendas por modelo respetando el orden en que llegan: el primer color que aparece decide dónde va la tarjeta. */
export function agruparPorModelo<F extends FilaExistencias>(prendas: readonly PrendaAgrupada<F>[]): ModeloPrendas<F>[] {
  const grupos = new Map<string, PrendaAgrupada<F>[]>();
  for (const p of prendas) {
    const g = grupos.get(p.productoId);
    if (g) g.push(p);
    else grupos.set(p.productoId, [p]);
  }
  return [...grupos.entries()].map(([productoId, colores]) => ({ productoId, colores }));
}

/** «Más relevantes» es el orden que ya traía la lista (lo que falta en el piso primero, o la relevancia de lo escrito): no se toca.
 *  Los demás suman los colores del modelo. */
export function ordenarModelos<F extends FilaExistencias>(modelos: readonly ModeloPrendas<F>[], orden: OrdenPrendas): ModeloPrendas<F>[] {
  const copia = [...modelos];
  const suma = (m: ModeloPrendas<F>, cifra: (p: PrendaAgrupada<F>) => number) => m.colores.reduce((n, p) => n + cifra(p), 0);
  const piso = (m: ModeloPrendas<F>) => suma(m, (p) => p.piso ?? 0);
  const almacen = (m: ModeloPrendas<F>) => suma(m, (p) => p.almacen ?? 0);
  const disponible = (m: ModeloPrendas<F>) => suma(m, (p) => p.disponible);
  switch (orden) {
    case "nombre":
      return copia.sort((a, b) => a.colores[0].referencia.localeCompare(b.colores[0].referencia, "es"));
    case "mas-piso":
      return copia.sort((a, b) => piso(b) - piso(a));
    case "menos-piso":
      return copia.sort((a, b) => piso(a) - piso(b));
    case "mas-almacen":
      return copia.sort((a, b) => almacen(b) - almacen(a));
    case "mas-disponible":
      return copia.sort((a, b) => disponible(b) - disponible(a));
    case "menos-disponible":
      return copia.sort((a, b) => disponible(a) - disponible(b));
    default:
      return copia;
  }
}

const TONO_PASTILLA = {
  verde: { caja: "bg-verde/10 text-verde-profundo", punto: "bg-verde ring-verde/25" },
  ambar: { caja: "bg-ambar/[0.13] text-ambar-profundo", punto: "bg-ambar ring-ambar/25" },
  rojo: { caja: "bg-rojo/10 text-rojo-profundo", punto: "bg-rojo ring-rojo/25" },
} as const;

/** El diagnóstico de la prenda (`queHacerPrenda`) como pastilla con punto: las MISMAS palabras del filtro «Hoy» (Felipe,
 *  2026-10-03): filtrar «Por colgar» muestra tarjetas que dicen «N tallas por colgar». Donde no se separa piso y almacén no hay
 *  diagnóstico. */
function Pastilla({ prenda }: { prenda: PrendaAgrupada<FilaExistencias> }) {
  const q = queHacerPrenda(prenda.tallas);
  const t = TONO_PASTILLA[TONO_HOY[q.tipo]];
  const texto = textoHoyDePrenda(q.tipo, q.n);
  return (
    <span title={AYUDA_HOY[q.tipo]} className={`flex min-h-[34px] items-center gap-2.5 rounded-[17px] px-3 py-1 text-[11px] font-medium leading-tight ${t.caja}`}>
      <i aria-hidden className={`h-3 w-3 shrink-0 rounded-full ring-4 ${t.punto}`} />
      <span className="min-w-0">{texto}</span>
    </span>
  );
}

/** Los rótulos «Piso» y «Almacén», UNA vez por prenda y a la izquierda de sus tallas (como el encabezado de fila de una tabla): así se
 *  leen en todas las tarjetas, sea cual sea el ancho y cuántas tallas tenga la prenda, y las cifras de cada talla tienen todo su ancho. */
function Rotulos({ separa }: { separa: boolean }) {
  const filas = separa
    ? [
        { Icono: ShoppingBag, texto: "Piso", tono: "text-rojo/60" },
        { Icono: Package, texto: "Almacén", tono: "text-tinta/45" },
      ]
    : [{ Icono: Package, texto: "Disponible", tono: "text-tinta/45" }];
  return (
    <div aria-hidden className="grid gap-[3px]">
      {/* El hueco bajo el que van los nombres de talla. */}
      <span className="h-5" />
      <span className="grid gap-px py-1">
        {filas.map(({ Icono, texto, tono }) => (
          <span key={texto} className="flex h-[19px] items-center gap-[3px] whitespace-nowrap text-[10px] leading-none text-tinta/60">
            <Icono className={`h-2.5 w-2.5 shrink-0 ${tono}`} strokeWidth={1.7} />
            {texto}
          </span>
        ))}
      </span>
    </div>
  );
}

/** La cifra de una fila de la celda de una talla. */
function Cifra({ valor }: { valor: number }) {
  return <b className="flex h-[19px] items-center justify-center font-display text-[15px] font-medium leading-none tabular-nums text-tinta">{valor}</b>;
}

export function ExistenciasTarjetas({
  modelos,
  separa,
  puedeReponer,
  puedeAjustar,
  mostrarMarca,
  onReponer,
  onSubir,
  onAjustar,
  onVerDetalle,
}: {
  modelos: ModeloPrendas<FilaExistencias>[];
  separa: boolean;
  puedeReponer: boolean;
  puedeAjustar: boolean;
  mostrarMarca: boolean;
  /** «Reponer prenda» abre la ventana del MODELO entero (todos sus colores y tallas, ADR-0317); `prenda` es el color que se ve. */
  onReponer: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  /** «Subir prenda» abre la ventana del MODELO entero (todos sus colores y tallas). Mismo permiso que «Reponer prenda». */
  onSubir: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  onAjustar: (fila: FilaExistencias) => void;
  /** «Ver detalle» de una tarjeta: llevar ese producto a la tabla, donde está el cajón de la prenda. */
  onVerDetalle: (prenda: PrendaAgrupada<FilaExistencias>) => void;
}) {
  // El color que se ve en cada tarjeta, por modelo. Sin elegir, el primero de la lista; si el elegido ya no está (un filtro, un guardado), también.
  const [elegida, setElegida] = useState<Record<string, string>>({});

  return (
    // Dos columnas donde caben (cada tarjeta pide ~32 rem para que la curva de tallas no se apriete), tres en pantallas muy anchas.
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,32rem),1fr))]">
        {modelos.map((m) => {
          const p = m.colores.find((c) => c.clave === elegida[m.productoId]) ?? m.colores[0];
          // «Reponer prenda» y «Subir prenda» abren el MODELO entero (todos sus colores, ADR-0317): se ofrecen si ALGÚN color tiene
          // algo que mover, no solo el que se está viendo.
          const hayQueBajar = puedeReponer && m.colores.some((c) => tallaParaReponer(c.tallas) !== null);
          // Subir: alguna talla de algún color con algo LIBRE en el piso (lo apartado para una clienta no se sube).
          const hayEnElPiso = m.colores.some((c) => c.tallas.some((t) => (t.pisoDisponible ?? 0) > 0));
          // Hasta 4 tallas por renglón; cada renglón lleva sus propios rótulos «Piso» y «Almacén».
          const renglones = Array.from({ length: Math.ceil(p.tallas.length / 4) }, (_, i) => p.tallas.slice(i * 4, i * 4 + 4));
          const etiqueta = `${p.referencia}${p.color ? ` ${p.color}` : ""}`;
          return (
            <article
              key={m.productoId}
              aria-label={etiqueta}
              className="card-cayla px-[15px] pb-[9px] pt-[11px] max-sm:px-3.5 max-sm:pb-3.5 max-sm:pt-3.5"
            >
              <div className="flex gap-2">
                <div className="h-32 w-24 shrink-0 overflow-hidden rounded-[9px] bg-sand/50 max-sm:h-[110px] max-sm:w-[82px]">
                  {p.fotoUrl ? <Image src={p.fotoUrl} alt="" width={192} height={256} unoptimized className="h-full w-full object-cover" /> : <SinFoto tamano="h-full w-full" />}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Fila 1: quién es (nombre, marca · color, los demás colores) y las dos cifras. */}
                  <div className="flex items-start justify-between gap-2 max-sm:flex-col">
                    <div className="min-w-0 pl-[9px] max-sm:pl-0 sm:h-[74px]">
                      <h3 className="truncate text-[13px] font-bold leading-[18px] text-tinta" title={p.referencia}>
                        {p.referencia}
                      </h3>
                      {/* El color que se está viendo, con su nombre en fuerte: la marca va tenue. */}
                      <p className="mt-[3px] truncate text-sm leading-[18px] text-tinta/50">
                        {mostrarMarca && p.marca && <>{p.marca} · </>}
                        <span className="font-semibold text-tinta">{p.color ?? "Sin color"}</span>
                      </p>
                      <div className="mt-[5px] flex flex-wrap gap-2" role="group" aria-label={`Colores de ${p.referencia}`}>
                        {m.colores.map((h) => {
                          const propia = h.clave === p.clave;
                          return (
                            <button
                              key={h.clave}
                              type="button"
                              onClick={() => setElegida((previa) => ({ ...previa, [m.productoId]: h.clave }))}
                              title={`${h.color ?? "Sin color"}${propia ? " (el que ves)" : " · ver este color"}`}
                              aria-label={h.color ?? "Sin color"}
                              aria-pressed={propia}
                              className={`h-[22px] w-[22px] cursor-pointer rounded-full border-[3px] border-papel outline transition-transform hover:scale-110 ${
                                propia ? "outline-2 outline-tinta" : "outline-[1.5px] outline-tinta/15"
                              }`}
                              style={{ background: h.colorHex ?? "conic-gradient(from 20deg, #C0272D, #F2C14E, #3E7A4E, #1B2A4A, #5B3A78, #C0272D)" }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-[79px_76px] gap-2 max-sm:w-full max-sm:grid-cols-2">
                      {separa ? (
                        <>
                          <div className="flex h-[74px] flex-col items-center justify-center rounded-[10px] bg-[color-mix(in_oklab,var(--color-rojo)_9%,var(--color-papel))] text-center leading-[1.1] text-rojo">
                            <span className="text-[11px]">Piso</span>
                            <b className="font-display text-[29px] font-medium leading-[1.1] tabular-nums text-rojo-profundo">{p.piso ?? 0}</b>
                            <span className="text-[11px]">uds</span>
                          </div>
                          <div className="flex h-[74px] flex-col items-center justify-center rounded-[10px] bg-hueso/60 text-center leading-[1.1] text-tinta">
                            <span className="text-[11px]">Almacén</span>
                            <b className="font-display text-[29px] font-medium leading-[1.1] tabular-nums">{p.almacen ?? 0}</b>
                            <span className="text-[11px]">uds</span>
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2 flex h-[74px] flex-col items-center justify-center rounded-[10px] bg-hueso/60 text-center leading-[1.1] text-tinta">
                          <span className="text-[11px]">Disponible</span>
                          <b className="font-display text-[29px] font-medium leading-[1.1] tabular-nums">{p.disponible}</b>
                          <span className="text-[11px]">uds</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fila 2: la curva de tallas y lo que la prenda pide hoy (con lo apartado y lo dañado, que son otros ejes). */}
                  <div className="mt-0.5 flex items-start gap-2 max-sm:mt-3 max-sm:flex-col">
                    <div className="grid min-w-0 flex-1 gap-y-1.5 max-sm:w-full">
                      {renglones.map((renglon, r) => (
                        <div key={r} className="grid gap-[5px]" style={{ gridTemplateColumns: `auto repeat(${renglon.length}, minmax(0, 4.5rem))` }}>
                          <Rotulos separa={separa} />
                          {renglon.map((f) => {
                            const sinStock = estadoTalla(f) === "sin_stock";
                            const nombre = f.talla ?? "Única";
                            return (
                              <div
                                key={f.varianteId}
                                title={`${nombre}: ${separa ? `${f.pisoDisponible ?? 0} en piso, ${f.almacenDisponible ?? 0} en almacén` : `${f.disponible} disponibles`}${sinStock ? " — sin nada libre en esta sede" : ""}`}
                                className="grid min-w-0 gap-[3px]"
                              >
                                <span className="block h-5 truncate rounded-lg bg-hueso px-0.5 text-center text-[11px] font-medium leading-5 text-tinta">{nombre}</span>
                                <span className={`grid gap-px rounded-lg border px-1 py-[3px] ${sinStock ? "border-rojo/35 bg-rojo/10" : "border-sand/70 bg-papel/80"}`}>
                                  {separa ? (
                                    <>
                                      <Cifra valor={f.pisoDisponible ?? 0} />
                                      <Cifra valor={f.almacenDisponible ?? 0} />
                                    </>
                                  ) : (
                                    <Cifra valor={f.disponible} />
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <div className="mt-[9px] flex w-[162px] shrink-0 flex-col gap-1.5 max-sm:mt-0 max-sm:w-full">
                      {separa && <Pastilla prenda={p} />}
                      {(p.apartado > 0 || p.danado > 0) && (
                        <span className="flex flex-wrap gap-1.5">
                          {p.danado > 0 && (
                            <Chip tono="rojo" versalitas={false} className="text-xs">
                              {p.danado} {p.danado === 1 ? "dañada" : "dañadas"}
                            </Chip>
                          )}
                          {p.apartado > 0 && <Chip tono="ambar">Apartado · {p.apartado}</Chip>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Acciones: las mismas del cajón de la tabla, con sus mismos permisos. Bajo la foto y la columna: en el celular, a todo el ancho.
                  Reponer prenda · Subir prenda · Ajustar, y «Ver detalle» solo con su icono (al pasar el mouse dice su nombre): así los tres
                  botones con texto caben en la columna, y donde no caben bajan a otro renglón en vez de cortarse. */}
              <div className="mt-3 flex flex-wrap gap-2 pl-[113px] max-sm:pl-0">
                {puedeReponer && (
                  <button
                    type="button"
                    disabled={!hayQueBajar}
                    title={hayQueBajar ? "Bajar prendas del almacén al piso, de todos los colores" : "No hay nada libre en el almacén para bajar al piso"}
                    onClick={(e) => hayQueBajar && onReponer(p, e.currentTarget)}
                    className="btn-cayla btn-primario min-h-[34px] min-w-[6.5rem] flex-1 px-3 py-1.5 text-[12.5px]"
                  >
                    <IconoPercha aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    Reponer prenda
                  </button>
                )}
                {puedeReponer && (
                  <button
                    type="button"
                    disabled={!hayEnElPiso}
                    title={hayEnElPiso ? "Subir prendas del piso al almacén, de todos los colores" : "No hay nada libre en el piso para subir al almacén"}
                    onClick={(e) => hayEnElPiso && onSubir(p, e.currentTarget)}
                    className="btn-cayla btn-secundario min-h-[34px] min-w-[9.5rem] flex-[1.5] px-3 py-1.5 text-[12.5px] text-taupe"
                  >
                    <Warehouse aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    Subir prenda
                  </button>
                )}
                {puedeAjustar && (
                  <button type="button" onClick={() => onAjustar(p.tallas[0])} className="btn-cayla btn-secundario min-h-[34px] min-w-[6.5rem] flex-1 px-3 py-1.5 text-[12.5px] text-taupe">
                    <SquarePen aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    Ajustar
                  </button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Ver detalle"
                      onClick={() => onVerDetalle(p)}
                      className="btn-cayla btn-secundario min-h-[34px] w-[34px] shrink-0 px-0 py-1.5 text-taupe"
                    >
                      <Package aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>Ver detalle</TooltipContent>
                </Tooltip>
              </div>
            </article>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
