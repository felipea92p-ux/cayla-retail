"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Archive, ArrowLeftRight, Barcode, Check, ChevronRight, FileText, Layers, X } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { estadoTalla, queHacerPrenda, sePuedeBajar, tallaParaReponer, urlEtiquetas, urlTrasladar, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

/* ====================================================================
   Cajón de la prenda en Existencias (diseño aprobado por Felipe, 2026-09-28)

   UN solo cajón, el mismo desde «Por prenda» y «Por talla»: tocar cualquier fila lo abre (o le cambia el contenido si ya
   está abierto) con LA PRENDA de esa fila. Sale desde el borde derecho y deja la página a la vista —sin velo, sin
   desenfoque, sin trampa de foco— para que se sienta como una extensión de la tabla: la tabla dice qué pasa, el cajón
   deja decidir qué hacer. Se cierra con la ✕ o con Escape.

   Tres grupos, no se mezclan: OPERAR (reponer y mover, el día a día), GESTIÓN (administrar el stock) y CONSULTAR (solo
   mirar). Cada acción va a la lógica que ya existía —el modal de Reponer, «Mover mercadería», Ajustar, Etiquetas,
   Historial— y solo aparece si su rol la tiene (ADR-0161, ADR-0240): un botón que terminaría en «Sin acceso» no se dibuja.
   ==================================================================== */

/** Un renglón de acción: ícono, qué hace y a dónde lleva. Enlace si va a otra pantalla, botón si abre algo aquí. */
function Accion({
  icono: Icono,
  texto,
  principal = false,
  href,
  onClick,
}: {
  icono: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  texto: string;
  principal?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const clase = `group flex h-12 w-full items-center rounded-[10px] px-5 text-left text-[15px] transition-colors ${
    principal ? "bg-tinta text-crema hover:bg-tinta/90" : "border border-tinta/55 bg-transparent text-tinta hover:bg-hueso/60"
  }`;
  const contenido = (
    <>
      <Icono aria-hidden className="h-[22px] w-6 shrink-0" strokeWidth={1.4} />
      <span className="ml-9 min-w-0 flex-1 truncate">{texto}</span>
      <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${principal ? "text-crema/85" : "text-tinta/70"}`} />
    </>
  );
  return href ? (
    <Link href={href} className={clase}>
      {contenido}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={clase}>
      {contenido}
    </button>
  );
}

/** Un grupo del cajón: título en serif, su bajada, y lo que contiene. Los grupos se separan con una línea fina. */
function Grupo({ titulo, bajada, children }: { titulo: string; bajada: string; children: ReactNode }) {
  return (
    <section className="border-t border-sand pb-6 pt-5">
      <h3 className="font-display text-[20px] leading-tight text-tinta">{titulo}</h3>
      <p className="mt-1 text-[13.5px] leading-snug text-taupe">{bajada}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CajonPrendaExistencias({
  prenda,
  varianteInicial,
  separa,
  puedeReponer,
  enSedeActiva,
  sinModuloBajada,
  puedeAjustar,
  veTraslados,
  onReponer,
  onAjustar,
  onCerrar,
}: {
  prenda: PrendaAgrupada<FilaExistencias>;
  /** La talla de la fila que se tocó (en «Por talla»): «Reponer a piso» empieza por ella si se puede bajar. */
  varianteInicial?: string;
  separa: boolean;
  /** ¿Puede reponer aquí? Su módulo «Bajada al piso» y su sede activa (`permisosDelDetalle`). */
  puedeReponer: boolean;
  /** ¿Lo que se mira es la sede activa? Etiquetas e Historial trabajan SIEMPRE sobre la sede activa (sus pantallas no reciben otra). */
  enSedeActiva: boolean;
  /** En su sede, pero su rol no tiene «Bajada al piso» (ADR-0240): lo dice en vez de callar. */
  sinModuloBajada: boolean;
  puedeAjustar: boolean;
  /** ¿Su rol ve Traslados? Sin él, «Mover mercadería» lo dejaría en «Sin acceso». */
  veTraslados: boolean;
  onReponer: (f: FilaExistencias) => void;
  onAjustar: (f: FilaExistencias) => void;
  onCerrar: () => void;
}) {
  // Cierre en dos tiempos, como `Modal`: primero sale, luego se desmonta.
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  // Escape cierra el cajón solo si ningún control de adentro lo usó (useEscapeLibre.ts).
  const alEscape = useEscapeLibre(pedirCierre);

  const fotoOk = Boolean(prenda.fotoUrl);
  const diagnostico = separa ? queHacerPrenda(prenda.tallas) : null;
  // «Reponer a piso» empieza por la talla tocada si se puede bajar; si no, por la primera que sí (`tallaParaReponer`).
  const tocada = varianteInicial ? prenda.tallas.find((f) => f.varianteId === varianteInicial) : undefined;
  const tallaAReponer = tocada && sePuedeBajar(tocada) ? tocada : tallaParaReponer(prenda.tallas);
  const hrefTrasladar = veTraslados ? urlTrasladar(prenda.tallas) : null;
  const hrefEtiquetas = enSedeActiva ? urlEtiquetas(prenda.tallas) : null;
  const hrefHistorial = enSedeActiva ? `/productos/${prenda.productoId}/historial` : null;
  const hayOperar = (puedeReponer && tallaAReponer !== null) || hrefTrasladar !== null;
  const hayGestion = puedeAjustar || hrefEtiquetas !== null;

  return (
    <Dialog.Root open modal={false} onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          // Sin velo y sin cerrar al tocar afuera: las filas de la tabla siguen vivas y tocar otra le cambia la prenda al cajón.
          onInteractOutside={(e) => e.preventDefault()}
          // El foco no se roba: quien estaba en la tabla sigue ahí, y se sale con la ✕ o con Escape.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[29.5rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* `key`: al pasar de una prenda a otra el contenido se re-asienta; el cajón no se cierra ni se vuelve a abrir. */}
          <div key={prenda.clave} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-tinta transition-colors hover:bg-tinta/[0.05] hover:text-rojo"
            >
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-[30px] pb-8 pt-8">
              {/* Encabezado: foto, nombre y color. */}
              <div className="flex items-center gap-5 pr-9">
                {fotoOk ? (
                  <Image
                    src={prenda.fotoUrl as string}
                    alt=""
                    width={85}
                    height={99}
                    unoptimized
                    className="h-[99px] w-[85px] shrink-0 rounded-[10px] border border-tinta/10 bg-hueso object-cover"
                  />
                ) : (
                  <SinFoto tamano="h-[99px] w-[85px]" />
                )}
                <div className="min-w-0">
                  <Dialog.Title asChild>
                    <h2 className="font-display text-[26px] leading-tight text-tinta">{prenda.referencia}</h2>
                  </Dialog.Title>
                  <Dialog.Description asChild>
                    <p className="mt-2 flex items-center gap-2.5 text-[15px] text-taupe">
                      {prenda.color ? (
                        <>
                          <span
                            aria-hidden
                            className="h-5 w-[26px] shrink-0 rounded-full border border-tinta/15"
                            style={{ background: prenda.colorHex ?? "var(--color-hueso)" }}
                          />
                          {prenda.color}
                        </>
                      ) : (
                        "Sin color"
                      )}
                    </p>
                  </Dialog.Description>
                </div>
              </div>

              {/* Resumen: piso y almacén, cuántas tallas y el diagnóstico. Tres celdas en una fila con el
                  ancho del cajón en el diseño (≥ 30rem) — pero el cajón es `w-full` por debajo de eso
                  (celular), y las tres con `whitespace-nowrap` ya no entran: en vez de recortarlas en
                  silencio (`overflow-hidden` + una fila que no cabe), el diagnóstico baja a su propia fila
                  cuando el cajón está angosto (Responsive Quality Gate, primera corrida, 2026-09-28). */}
              <dl className="mt-6 mb-7 grid grid-cols-2 overflow-hidden rounded-xl border border-sand sm:flex sm:items-stretch sm:divide-x sm:divide-sand">
                <div className="flex flex-col items-center justify-center gap-2.5 border-r border-sand px-3 py-4 text-[14px] text-tinta/80 sm:flex-auto sm:border-r-0 sm:px-4">
                  <Layers aria-hidden className="h-[22px] w-[22px] text-rojo-profundo/80" strokeWidth={1.4} />
                  <dt className="sr-only">Stock de la prenda</dt>
                  <dd className="whitespace-nowrap tabular-nums">
                    {separa ? (
                      <>
                        Piso {prenda.piso ?? 0} · Almacén <b className="font-semibold text-tinta">{prenda.almacen ?? 0}</b>
                      </>
                    ) : (
                      <>
                        Disponible <b className="font-semibold text-tinta">{prenda.disponible}</b>
                      </>
                    )}
                  </dd>
                </div>
                <div className={`flex flex-col items-center justify-center gap-2.5 px-3 py-4 text-[14px] text-tinta/80 sm:flex-auto sm:px-4 ${diagnostico ? "border-b border-sand sm:border-b-0" : ""}`}>
                  <IconoPercha aria-hidden className="h-[22px] w-[22px] text-rojo-profundo/80" strokeWidth={1.4} />
                  <dt className="sr-only">Tallas</dt>
                  <dd className="whitespace-nowrap">
                    {prenda.tallas.length} {prenda.tallas.length === 1 ? "talla" : "tallas"}
                  </dd>
                </div>
                {diagnostico && (
                  <div
                    className={`col-span-2 flex flex-col items-center justify-center gap-2.5 border-t border-sand px-3 py-4 text-center text-[14px] leading-tight sm:col-span-1 sm:flex-auto sm:border-t-0 sm:px-4 ${
                      diagnostico.tipo === "sin_stock_piso" ? "text-rojo" : diagnostico.tipo === "por_reponer" ? "text-ambar-profundo" : "text-tinta/70"
                    }`}
                  >
                    {diagnostico.tipo === "mantener" ? (
                      <Check aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.4} />
                    ) : (
                      <AlertTriangle aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.4} />
                    )}
                    <dt className="sr-only">Diagnóstico</dt>
                    <dd>{diagnostico.tipo === "sin_stock_piso" ? "Faltan tallas en piso" : diagnostico.tipo === "por_reponer" ? "Piso por reponer" : "Piso al día"}</dd>
                  </div>
                )}
              </dl>

              <div>
                <Grupo titulo="Disponibilidad por talla" bajada={separa ? "Unidades en piso · unidades en almacén." : "Unidades disponibles."}>
                  <div className="grid grid-cols-4 gap-2.5">
                    {prenda.tallas.map((f) => {
                      const sinStock = estadoTalla(f) === "sin_stock";
                      return (
                        <div
                          key={f.varianteId}
                          className={`rounded-lg border px-1 py-2.5 text-center tabular-nums ${
                            sinStock ? "border-rojo/35 bg-rojo/10 text-rojo-profundo" : "border-taupe/25 bg-hueso text-tinta"
                          }`}
                        >
                          <span className={`block text-[13px] leading-tight ${sinStock ? "" : "text-tinta/75"}`}>{f.talla ?? "Única"}</span>
                          <span className={`mt-1 block text-[17px] leading-tight ${sinStock ? "font-semibold" : ""}`}>
                            {separa ? `${f.pisoDisponible ?? 0} · ${f.almacenDisponible ?? 0}` : f.disponible}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Grupo>

                {hayOperar && (
                  <Grupo titulo="Operar esta prenda" bajada="Acciones rápidas de reposición y movimiento.">
                    <div className="grid gap-2">
                      {puedeReponer && tallaAReponer && <Accion principal icono={IconoPercha} texto="Reponer a piso" onClick={() => onReponer(tallaAReponer)} />}
                      {hrefTrasladar && <Accion icono={ArrowLeftRight} texto="Trasladar" href={hrefTrasladar} />}
                    </div>
                    {sinModuloBajada && tallaAReponer && <p className="mt-2 text-xs text-taupe">Para colgarla, pídesela a quien tenga el módulo «Bajada al piso».</p>}
                  </Grupo>
                )}

                {hayGestion && (
                  <Grupo titulo="Gestión" bajada="Acciones de administración de stock.">
                    <div className="grid gap-2">
                      {puedeAjustar && <Accion icono={Archive} texto="Ajustar stock" onClick={() => onAjustar(prenda.tallas[0])} />}
                      {hrefEtiquetas && <Accion icono={Barcode} texto="Imprimir etiquetas" href={hrefEtiquetas} />}
                    </div>
                  </Grupo>
                )}

                {hrefHistorial ? (
                  <Grupo titulo="Consultar" bajada="Información y trazabilidad de esta prenda.">
                    <Accion icono={FileText} texto="Ver historial" href={hrefHistorial} />
                  </Grupo>
                ) : (
                  <p className="border-t border-sand pt-4 text-xs text-taupe">Para imprimir sus etiquetas o ver su historial de esta sede, elígela arriba, en el selector de sede.</p>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
