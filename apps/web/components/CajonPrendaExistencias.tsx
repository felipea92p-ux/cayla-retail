"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Archive, ArrowLeftRight, Bandage, Barcode, Check, ChevronRight, FileText, Layers, Trash2, X, Warehouse } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { SinFoto, categoriaDe } from "@/components/ui/PrendaCelda";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";
import { desgloseDePrenda, estadoTalla, queHacerPrenda, tallaParaReponer, urlEtiquetas, urlTrasladar, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { DesgloseStockPrenda } from "@/components/DesgloseStockPrenda";
import { AYUDA_HOY, textoHoyDePrenda, TONO_HOY } from "@/lib/existencias-hoy";

/** El color del diagnóstico, del MISMO tono que la tarjeta y la tabla (`TONO_HOY`): ámbar lo que se hace aquí, pizarra lo que se pide afuera. */
const TEXTO_TONO_HOY = { ambar: "text-ambar-profundo", pizarra: "text-pizarra", verde: "text-tinta/70" } as const;
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

/** Un renglón de acción: ícono, qué hace y a dónde lleva. Enlace si va a otra pantalla, botón si abre algo aquí.
 *  `peligro` (trasplantado de `DetallePrendaExistencias.tsx`, ADR-0252): lo que no se deshace (Eliminar) se lee en rojo
 *  profundo, para que no se confunda con las acciones de al lado. */
function Accion({
  icono: Icono,
  texto,
  principal = false,
  peligro = false,
  href,
  onClick,
}: {
  icono: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  texto: string;
  principal?: boolean;
  peligro?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const clase = `group flex h-12 w-full items-center rounded-[10px] px-5 text-left text-[15px] transition-colors ${
    principal
      ? "bg-tinta text-crema hover:bg-tinta/90"
      : peligro
        ? "border border-rojo-profundo/40 bg-transparent text-rojo-profundo hover:bg-rojo/[0.06]"
        : "border border-tinta/55 bg-transparent text-tinta hover:bg-hueso/60"
  }`;
  const contenido = (
    <>
      <Icono aria-hidden className="h-[22px] w-6 shrink-0" strokeWidth={1.4} />
      <span className="ml-9 min-w-0 flex-1 truncate">{texto}</span>
      <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${principal ? "text-crema/85" : peligro ? "text-rojo-profundo/70" : "text-tinta/70"}`} />
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
  separa,
  puedeReponer,
  enSedeActiva,
  puedeAjustar,
  veTraslados,
  puedeEliminar = false,
  puedeReportarDanada = false,
  onReponer,
  onSubir,
  onAjustar,
  onEliminar,
  onReportarDanada,
  onVerApartadas,
  onVerDanadas,
  puedeResolverDanadas = false,
  onCerrar,
}: {
  prenda: PrendaAgrupada<FilaExistencias>;
  separa: boolean;
  /** ¿Puede reponer aquí? Su módulo Existencias y su sede activa (`permisosDelDetalle`). */
  puedeReponer: boolean;
  /** ¿Lo que se mira es la sede activa? Etiquetas e Historial trabajan SIEMPRE sobre la sede activa (sus pantallas no reciben otra). */
  enSedeActiva: boolean;
  /** En su sede, pero su rol no tiene «Bajada al piso» (ADR-0240): lo dice en vez de callar. */
  puedeAjustar: boolean;
  /** ¿Su rol ve Traslados? Sin él, «Mover mercadería» lo dejaría en «Sin acceso». */
  veTraslados: boolean;
  /** Quien edita el catálogo, en su sede (ADR-0252, `permisosDelDetalle`): «Eliminar el producto» abre la ventana que pregunta a la
   *  base (trasplantado de `DetallePrendaExistencias.tsx`, main PR #574, al cajón nuevo). */
  puedeEliminar?: boolean;
  /** «Reportar dañada» (ADR-0328 act. 10, `permisosDelDetalle`): quien ve Existencias, en su sede, con piso, almacén y cuarentena. */
  puedeReportarDanada?: boolean;
  /** «Reponer prenda» abre la ventana del MODELO entero, con todos sus colores y tallas (`ReponerPrendaModal`, ADR-0317). */
  onReponer: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  /** «Subir prenda» abre la ventana del MODELO entero, con todos sus colores y tallas (`SubirAAlmacenModal`, ADR-0317). */
  onSubir: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  onAjustar: (f: FilaExistencias) => void;
  /** Sin ella si `puedeEliminar` es false: nunca se ofrece un botón que la pantalla no sabría atender. */
  onEliminar?: () => void;
  /** Abre «Reportar dañada» con el color de esta prenda. */
  onReportarDanada?: (prenda: PrendaAgrupada<FilaExistencias>) => void;
  /** Abre los apartados de ESTA prenda. Sin ella (no hay ninguno, o la pantalla no sabe abrirlos) la cifra «Apartada» no es un botón. */
  onVerApartadas?: () => void;
  /** Abre las dañadas en cuarentena de ESTA prenda. Sin ella la cifra «Dañada» no es un botón. */
  onVerDanadas?: () => void;
  /** Solo un líder, en su sede, decide qué se hace con una dañada: a él la cifra le dice «Decidir»; a los demás, «Ver cuáles». */
  puedeResolverDanadas?: boolean;
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
  // Los cuatro lugares (piso, almacén, apartada, dañada) y su suma; `null` en el Taller, que no separa piso y almacén.
  const desglose = separa ? desgloseDePrenda(prenda) : null;
  // «Reponer a piso» se ofrece si alguna talla se puede bajar (`tallaParaReponer`); la ventana lista todas las tallas.
  const hayQueReponer = tallaParaReponer(prenda.tallas) !== null;
  // «Subir a almacén» se ofrece si alguna talla tiene algo LIBRE en el piso (lo apartado para una clienta no se sube).
  const hayQueSubir = prenda.tallas.some((f) => (f.pisoDisponible ?? 0) > 0);
  const hrefTrasladar = veTraslados ? urlTrasladar(prenda.tallas) : null;
  const hrefEtiquetas = enSedeActiva ? urlEtiquetas(prenda.tallas) : null;
  const hrefHistorial = enSedeActiva ? `/productos/${prenda.productoId}/historial` : null;
  const hayOperar = (puedeReponer && (hayQueReponer || hayQueSubir)) || hrefTrasladar !== null;
  // «Reportar dañada» se ofrece si alguna talla tiene algo LIBRE en el piso o en el almacén (lo apartado no se mueve).
  const hayQueReportar = puedeReportarDanada && Boolean(onReportarDanada) && prenda.tallas.some((f) => (f.pisoDisponible ?? 0) + (f.almacenDisponible ?? 0) > 0);
  // Cada cifra es un botón solo si hay algo que hacer con ella y la persona puede hacerlo (ADR-0161: nunca un botón que acabe en
  // «Sin acceso» o en una ventana vacía). Almacén abre la misma ventana de «Reponer prenda» y se llama igual (la ventana, el botón de abajo y la celda dicen lo mismo); Piso no lleva botón.
  const accionAlmacen = desglose && desglose.almacen > 0 && puedeReponer && hayQueReponer ? { texto: "Reponer prenda", onClick: () => onReponer(prenda) } : undefined;
  const accionApartada = desglose && desglose.apartada > 0 && onVerApartadas ? { texto: "Ver apartados", onClick: onVerApartadas } : undefined;
  const accionDanada = desglose && desglose.danada > 0 && onVerDanadas ? { texto: puedeResolverDanadas ? "Decidir" : "Ver cuáles", onClick: onVerDanadas } : undefined;
  const hayGestion = puedeAjustar || hayQueReportar || hrefEtiquetas !== null || (puedeEliminar && Boolean(onEliminar));

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
                  <SinFoto tamano="h-[99px] w-[85px]" colorHex={prenda.colorHex} {...categoriaDe(prenda)} conNombre />
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

              {/* Los cuatro lugares donde puede estar la prenda y la suma explicada (2026-10-04): antes solo «Piso · Almacén», y lo
                  apartado y lo dañado —que existían— no se veían, así que el total no coincidía con lo que se podía vender. */}
              {desglose && (
                <DesgloseStockPrenda desglose={desglose} accionAlmacen={accionAlmacen} accionApartada={accionApartada} accionDanada={accionDanada} />
              )}

              {/* Resumen: piso y almacén, cuántas tallas y el diagnóstico. Tres celdas en una fila con el
                  ancho del cajón en el diseño (≥ 30rem) — pero el cajón es `w-full` por debajo de eso
                  (celular), y las tres con `whitespace-nowrap` ya no entran: en vez de recortarlas en
                  silencio (`overflow-hidden` + una fila que no cabe), el diagnóstico baja a su propia fila
                  cuando el cajón está angosto (Responsive Quality Gate, primera corrida, 2026-09-28). */}
              <dl className={`${desglose ? "mt-5" : "mt-6"} mb-7 grid grid-cols-2 overflow-hidden rounded-xl border border-sand sm:flex sm:items-stretch sm:divide-x sm:divide-sand`}>
                {/* Con el desglose, «Piso · Almacén» ya no va aquí: lo dicen las cuatro cifras de arriba. Solo el Taller conserva «Disponible». */}
                {!desglose && (
                <div className="flex flex-col items-center justify-center gap-2.5 border-r border-sand px-3 py-4 text-[14px] text-tinta/80 sm:flex-auto sm:border-r-0 sm:px-4">
                  <Layers aria-hidden className="h-[22px] w-[22px] text-taupe" strokeWidth={1.4} />
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
                )}
                {/* Con el desglose la fila queda en dos celdas (tallas | diagnóstico) y caben lado a lado hasta en 375 px; con tres
                    (Taller, sin diagnóstico) o con la de «Disponible», el diagnóstico baja a su propia fila como antes. */}
                <div
                  className={`flex flex-col items-center justify-center gap-2.5 px-3 py-4 text-[14px] text-tinta/80 sm:flex-auto sm:px-4 ${
                    desglose ? "border-r border-sand sm:border-r-0" : diagnostico ? "border-b border-sand sm:border-b-0" : ""
                  }`}
                >
                  <IconoPercha aria-hidden className="h-[22px] w-[22px] text-taupe" strokeWidth={1.4} />
                  <dt className="sr-only">Tallas</dt>
                  <dd className="whitespace-nowrap">
                    {prenda.tallas.length} {prenda.tallas.length === 1 ? "talla" : "tallas"}
                  </dd>
                </div>
                {diagnostico && (
                  <div
                    className={`flex flex-col items-center justify-center gap-2.5 px-3 py-4 text-center text-[14px] leading-tight sm:col-span-1 sm:flex-auto sm:border-t-0 sm:px-4 ${
                      desglose ? "" : "col-span-2 border-t border-sand"
                    } ${TEXTO_TONO_HOY[TONO_HOY[diagnostico.tipo]]}`}
                  >
                    {diagnostico.tipo === "mantener" ? (
                      <Check aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.4} />
                    ) : (
                      <AlertTriangle aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.4} />
                    )}
                    <dt className="sr-only">Diagnóstico</dt>
                    {/* Las mismas palabras del filtro «Hoy» y de la tarjeta (antes: «Faltan tallas en piso», «Piso al día»). */}
                    <dd title={AYUDA_HOY[diagnostico.tipo]}>{textoHoyDePrenda(diagnostico.tipo, diagnostico.n)}</dd>
                  </div>
                )}
              </dl>

              <div>
                <Grupo titulo="Disponibilidad por talla" bajada={separa ? "Libres en piso · libres en almacén. Lo apartado se anota aparte." : "Unidades disponibles."}>
                  <div className="grid grid-cols-4 gap-2.5">
                    {prenda.tallas.map((f) => {
                      const sinStock = estadoTalla(f) === "sin_stock";
                      return (
                        <div
                          key={f.varianteId}
                          className={`rounded-lg border px-1 py-2.5 text-center tabular-nums ${
                            sinStock ? "border-dashed border-taupe/50 bg-transparent text-taupe" : "border-taupe/25 bg-hueso text-tinta"
                          }`}
                        >
                          <span className={`block text-[13px] leading-tight ${sinStock ? "" : "text-tinta/75"}`}>{f.talla ?? "Única"}</span>
                          <span className={`mt-1 block text-[17px] leading-tight ${sinStock ? "font-semibold" : ""}`}>
                            {separa ? `${f.pisoDisponible ?? 0} · ${f.almacenDisponible ?? 0}` : f.disponible}
                          </span>
                          {/* Lo apartado no está en esas dos cifras (son LIBRES): sin esta línea una talla con una apartada se leía «0 · 0»,
                              igual que una sin nada, y quien contaba a mano encontraba una prenda que la pantalla negaba. */}
                          {separa && f.apartado > 0 && <span className="mt-0.5 block text-[11.5px] leading-tight text-pizarra">+{f.apartado} apart.</span>}
                        </div>
                      );
                    })}
                  </div>
                </Grupo>

                {hayOperar && (
                  <Grupo titulo="Operar esta prenda" bajada="Acciones rápidas de reposición y movimiento.">
                    <div className="grid gap-2">
                      {puedeReponer && hayQueReponer && <Accion principal icono={IconoPercha} texto="Reponer prenda" onClick={() => onReponer(prenda)} />}
                      {puedeReponer && hayQueSubir && <Accion icono={Warehouse} texto="Subir prenda" onClick={() => onSubir(prenda)} />}
                      {hrefTrasladar && <Accion icono={ArrowLeftRight} texto="Trasladar" href={hrefTrasladar} />}
                    </div>
                  </Grupo>
                )}

                {hayGestion && (
                  <Grupo titulo="Gestión" bajada="Acciones de administración de stock.">
                    <div className="grid gap-2">
                      {puedeAjustar && <Accion icono={Archive} texto="Ajustar stock" onClick={() => onAjustar(prenda.tallas[0])} />}
                      {/* Una mancha o una rotura (ADR-0328 act. 10): pasa a Dañadas (deja de contar para la venta; separarla del perchero lo pide la ventana) y el líder decide. */}
                      {hayQueReportar && onReportarDanada && <Accion icono={Bandage} texto="Reportar dañada" onClick={() => onReportarDanada(prenda)} />}
                      {hrefEtiquetas && <Accion icono={Barcode} texto="Imprimir etiquetas" href={hrefEtiquetas} />}
                      {/* ADR-0252: al final y en rojo, como en `DetallePrendaExistencias.tsx` — es del PRODUCTO entero (todas sus
                          tallas y colores, en todas las sedes), no de esta talla ni de este color; la ventana que abre lo dice y la
                          base decide si de verdad se puede. */}
                      {puedeEliminar && onEliminar && <Accion icono={Trash2} texto="Eliminar el producto" onClick={onEliminar} peligro />}
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
