"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, History, MapPin, ShoppingBag, SlidersHorizontal, Tag, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { MuestraColor } from "@/components/ui/MuestraColor";
import { estadoTalla, sePuedeBajar, urlEtiquetas, urlTrasladar, type EstadoTalla, type PrendaAgrupada } from "@/lib/existencias-prendas";
import { puedeRetirarPiso } from "@/lib/inventario-reglas";
import type { FilaExistencias } from "@/lib/inventario-v2";

/* ====================================================================
   Detalle de una prenda en Existencias (ADR-0237)

   Lo que antes estaba repartido en la fila de cada talla (Reponer, Apartar, Ajustar, «⋯») y lo que vivía en OTRAS
   pantallas sin camino desde aquí (trasladar, imprimir etiquetas), en un solo lugar: tocas una talla y ves qué se puede
   hacer con ella; debajo, lo que se hace con la prenda entera. En el celular es la hoja que sube desde abajo (`<Modal>`).
   Las acciones de talla no abren un modal dentro de otro: le piden al panel que cierre este y abra el suyo.
   ==================================================================== */

const CLASE_TALLA: Record<EstadoTalla, string> = {
  por_colgar: "bg-ambar/20 text-ambar-profundo ring-1 ring-inset ring-ambar/50",
  reponer: "bg-hueso ring-1 ring-inset ring-ambar/40",
  sin_stock: "bg-transparent text-tinta/40 ring-1 ring-inset ring-sand",
  normal: "bg-hueso",
};
const TEXTO_TALLA: Record<EstadoTalla, string> = {
  por_colgar: "por colgar",
  reponer: "poco en piso",
  sin_stock: "sin stock",
  normal: "en piso",
};

/** Un renglón de «Con esta prenda»: ícono, qué hace y a dónde lleva. Enlace si va a otra pantalla, botón si abre algo aquí.
 *  `peligro`: lo que no se deshace (Eliminar) se lee en rojo profundo, para que no se confunda con los de al lado. */
function Accion({
  icono: Icono,
  titulo,
  detalle,
  href,
  onClick,
  peligro = false,
}: {
  icono: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  titulo: string;
  detalle: string;
  href?: string;
  onClick?: () => void;
  peligro?: boolean;
}) {
  const contenido = (
    <>
      <Icono aria-hidden className={`h-[18px] w-[18px] shrink-0 ${peligro ? "text-rojo-profundo" : "text-taupe"}`} />
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${peligro ? "text-rojo-profundo" : "text-tinta"}`}>{titulo}</span>
        <span className="block text-xs text-taupe">{detalle}</span>
      </span>
    </>
  );
  const clase = "flex w-full items-center gap-3 rounded-xl border border-sand bg-papel px-3 py-2.5 text-left transition-colors hover:border-taupe/60";
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

export function DetallePrendaExistencias({
  prenda,
  varianteInicial,
  separa,
  mostrarMarca,
  puedeReponer,
  enSedeActiva = true,
  tiendasParaPedir = [],
  onPedir,
  sinModuloBajada = false,
  puedeApartar,
  puedeAjustar,
  veTraslados,
  puedeEliminar = false,
  onReponer,
  onRetirar,
  onApartar,
  onAjustar,
  onEliminar,
  onClose,
}: {
  prenda: PrendaAgrupada<FilaExistencias>;
  /** La talla con la que se abre (la escaneada, o la primera a reponer). */
  varianteInicial?: string;
  separa: boolean;
  mostrarMarca: boolean;
  puedeReponer: boolean;
  /** ¿Lo que se mira es la sede activa? Etiquetas e Historial trabajan SIEMPRE sobre la sede activa (sus pantallas no
   *  reciben otra): mirando otra sede, imprimirían o mostrarían la equivocada (tarea #7). */
  enSedeActiva?: boolean;
  /** Tiendas a las que se puede pedir la talla para una clienta (ADR-0233; tarea #9). Vacío = no se ofrece: su rol no ve
   *  «Apartados», no es su tienda, o no es una tienda. La reposición SIN clienta es la D-7 de ADR-0242 (Traslados). */
  tiendasParaPedir?: { id: string; nombre: string; corto: string }[];
  onPedir?: (f: FilaExistencias, tienda: { id: string; nombre: string }) => void;
  /** En su sede, pero su rol no tiene «Bajada al piso» (ADR-0240): la talla por colgar lo explica en vez de callar. */
  sinModuloBajada?: boolean;
  puedeApartar: boolean;
  puedeAjustar: boolean;
  /** ¿Su rol ve Traslados? Sin él, «Mover mercadería» lo dejaría en «Sin acceso». */
  veTraslados: boolean;
  /** Líder o Admin en su sede (ADR-0252, `permisosDelDetalle`): «Eliminar el producto» abre la ventana que pregunta a la base. */
  puedeEliminar?: boolean;
  onReponer: (f: FilaExistencias) => void;
  onRetirar: (f: FilaExistencias) => void;
  onApartar: (f: FilaExistencias) => void;
  onAjustar: (f: FilaExistencias) => void;
  onEliminar?: () => void;
  onClose: () => void;
}) {
  const [varianteId, setVarianteId] = useState<string | null>(
    varianteInicial && prenda.tallas.some((f) => f.varianteId === varianteInicial) ? varianteInicial : prenda.tallas.length === 1 ? prenda.tallas[0].varianteId : null
  );
  const talla = prenda.tallas.find((f) => f.varianteId === varianteId) ?? null;
  const red = talla ? talla.enRed : [];
  const hrefTrasladar = veTraslados ? urlTrasladar(talla ? [talla] : prenda.tallas) : null;
  const hrefEtiquetas = enSedeActiva ? urlEtiquetas(prenda.tallas) : null;

  return (
    <Modal
      variante="papel"
      ancho="sm:max-w-lg"
      onClose={onClose}
      titulo={
        <span className="flex items-center gap-3 pr-8">
          <MiniaturaPrenda fotoUrl={prenda.fotoUrl} colorHex={prenda.colorHex} tamano="lg" />
          <span className="min-w-0">
            <span className="block font-display text-2xl leading-tight">{prenda.referencia}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-sans text-xs font-normal text-taupe">
              {prenda.color && <MuestraColor nombre={prenda.color} hex={prenda.colorHex} />}
              {mostrarMarca && prenda.marca && <span>{prenda.marca}</span>}
            </span>
          </span>
        </span>
      }
      subtitulo={
        separa ? (
          <span className="tabular-nums">
            Libre en piso <b className="text-tinta">{prenda.piso ?? 0}</b> · almacén <b className="text-tinta">{prenda.almacen ?? 0}</b>
            {prenda.apartado > 0 && ` · ${prenda.apartado} apartada${prenda.apartado === 1 ? "" : "s"}`}
          </span>
        ) : (
          <span className="tabular-nums">
            Disponible <b className="text-tinta">{prenda.disponible}</b>
          </span>
        )
      }
    >
      <div className="mt-4 space-y-5">
        <section>
          <p className="label-cayla mb-2 text-[10px] text-taupe">{prenda.tallas.length === 1 ? "Talla" : "Toca una talla"}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(3.6rem,1fr))] gap-1.5">
            {prenda.tallas.map((f) => {
              const estado = estadoTalla(f);
              const elegida = f.varianteId === varianteId;
              return (
                <button
                  key={f.varianteId}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => setVarianteId(elegida ? null : f.varianteId)}
                  className={`rounded-xl px-1 py-2 text-center transition-[box-shadow] ${CLASE_TALLA[estado]} ${elegida ? "shadow-[inset_0_0_0_2px_var(--color-tinta)]" : ""}`}
                >
                  <span className="block text-xs font-semibold opacity-75">{f.talla ?? "Única"}</span>
                  <span className={`block text-[15px] tabular-nums ${estado === "sin_stock" ? "line-through" : ""}`}>
                    {separa ? `${f.pisoDisponible ?? 0}·${f.almacenDisponible ?? 0}` : f.disponible}
                  </span>
                  <span className="block text-[10px] opacity-70">{TEXTO_TALLA[estado]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {talla && (
          <section>
            <p className="label-cayla mb-2 text-[10px] text-taupe">
              Talla {talla.talla ?? "única"}
              {separa && (
                <span className="tabular-nums">
                  {" "}
                  · piso {talla.pisoDisponible ?? 0} · almacén {talla.almacenDisponible ?? 0}
                </span>
              )}
              {talla.enTransito > 0 && <span className="tabular-nums"> · +{talla.enTransito} en camino</span>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {puedeReponer && sePuedeBajar(talla) && (
                <button type="button" onClick={() => onReponer(talla)} className="btn-cayla btn-primario justify-center">
                  <ArrowDownToLine aria-hidden className="h-4 w-4" />
                  Reponer al piso
                </button>
              )}
              {puedeApartar && talla.disponible > 0 && (
                <button type="button" onClick={() => onApartar(talla)} className="btn-cayla btn-secundario justify-center">
                  <ShoppingBag aria-hidden className="h-4 w-4" />
                  Apartar
                </button>
              )}
              {/* El camino de vuelta (D-41) no es una orden del sistema: queda como botón sutil, no junto a «Reponer». */}
              {puedeReponer && puedeRetirarPiso(talla.pisoDisponible) && (
                <button type="button" onClick={() => onRetirar(talla)} className="btn-cayla btn-sutil justify-center">
                  <ArrowUpFromLine aria-hidden className="h-4 w-4" />
                  Retirar del piso
                </button>
              )}
            </div>
            {sinModuloBajada && sePuedeBajar(talla) && (
              <p className="mt-2 text-xs text-taupe">Para colgarla, pídesela a quien tenga el módulo «Bajada al piso».</p>
            )}
          </section>
        )}

        <section>
          <p className="label-cayla mb-2 text-[10px] text-taupe">Con esta prenda</p>
          <div className="grid gap-1.5">
            {hrefTrasladar && (
              <Accion
                icono={ArrowRight}
                titulo={talla ? `Trasladar la talla ${talla.talla ?? "única"}` : "Trasladar a otra sede"}
                detalle="Llega a «Mover mercadería» con la prenda ya cargada; ahí eliges destino y cantidad"
                href={hrefTrasladar}
              />
            )}
            {hrefEtiquetas && <Accion icono={Tag} titulo="Imprimir etiquetas de precio" detalle="Todas sus tallas en esta tienda, con el precio de hoy" href={hrefEtiquetas} />}
            {/* D-13: ajustar es del líder o de quien tenga el permiso; el candado real vive en `registrar_movimiento`. */}
            {puedeAjustar && <Accion icono={SlidersHorizontal} titulo="Ajustar" detalle="Corregir lo que hay en piso o almacén, con motivo" onClick={() => onAjustar(talla ?? prenda.tallas[0])} />}
            {enSedeActiva ? (
              <Accion icono={History} titulo="Ver historial" detalle="Cada entrada, venta, traslado y ajuste de esta prenda" href={`/productos/${prenda.productoId}/historial`} />
            ) : (
              <p className="text-xs text-taupe">Para imprimir sus etiquetas o ver su historial de esta sede, elígela arriba, en el selector de sede.</p>
            )}
            {/* ADR-0252: el mismo «Eliminar» de Catálogo ▸ Productos, al final y en rojo. Es del PRODUCTO, no de esta talla ni
                de este color: la ventana lo dice y la base decide si se puede (con ventas, nadie; con historia de stock, solo Admin). */}
            {puedeEliminar && onEliminar && (
              <Accion
                icono={Trash2}
                titulo="Eliminar el producto"
                detalle="Todas sus tallas y colores, en todas las sedes. Antes te dice si se puede"
                onClick={onEliminar}
                peligro
              />
            )}
          </div>
        </section>

        {talla && (
          <section>
            <p className="label-cayla mb-2 flex items-center gap-1.5 text-[10px] text-taupe">
              <MapPin aria-hidden className="h-3 w-3" />
              Dónde más hay la {talla.talla ?? "talla única"}
            </p>
            {red.length === 0 ? (
              <p className="text-xs text-taupe">En ninguna otra sede.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {red.map((s) => {
                  const tienda = tiendasParaPedir.find((t) => t.corto === s.sede);
                  return (
                    <li key={s.sede} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-hueso px-3 py-1.5">
                      <span>{s.sede}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">
                          {s.cantidad} {s.cantidad === 1 ? "ud" : "uds"}
                        </span>
                        {/* Para la clienta que está aquí y la quiere: la otra tienda la envía y, al llegar, queda apartada
                            sola (ADR-0233). Es el mismo pedido de Apartados, no uno nuevo. */}
                        {tienda && onPedir && (
                          <button type="button" onClick={() => onPedir(talla, tienda)} className="btn-cayla btn-enlace text-xs">
                            Pedir para una clienta
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
