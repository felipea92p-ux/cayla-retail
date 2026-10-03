"use client";

import { useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { Chip } from "@/components/ui/Chip";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { colorInicial, resumenDePrenda, type GrupoCatalogo, type PrendaCatalogo } from "@/lib/catalogo-grupos";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { motivoNoCobrable } from "@/lib/vender-stock-local";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";

type Color = GrupoCatalogo<VarianteBusqueda>;

type Props = {
  prenda: PrendaCatalogo<VarianteBusqueda>;
  /** El color que se estaba viendo en la tarjeta: la ventana abre en él. */
  colorClave?: string;
  ubicacionEtiqueta: string;
  carrito: ItemCarrito[];
  onAgregar: (v: VarianteBusqueda) => void;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLElement | null>;
  /** Debajo de los colores, para el color que se está viendo: lo que el Punto de venta agrega (hoy, «Anotar que no había»). */
  pie?: (color: Color) => ReactNode;
};

/** Primero lo que se cobra aquí, después lo del almacén, al final lo que no está: el orden en que se le ofrece al cliente. */
function rango(c: Color): number {
  return c.stockTotal > 0 ? 0 : c.almacenTotal > 0 ? 1 : 2;
}

/**
 * «Todo de la prenda» (ADR-0323): se abre al tocar una tarjeta de la grilla de Vender. A la izquierda, la prenda en el
 * color que se está mirando (pasar por una fila lo anticipa, tocarla lo fija); a la derecha, cada color con sus tallas:
 * lo que hay aquí, en el almacén de la sede, lo apartado y dónde más hay. Responde «¿lo tienes en otro color o talla?»
 * de un vistazo.
 *
 * Tocar una talla la AGREGA y la ventana se queda abierta (un cliente que lleva dos colores no la abre dos veces); la
 * casilla dibuja un visto y la fila cuenta cuántas lleva. Una talla del almacén cierra la ventana: el aviso de la caja
 * ofrece registrar la bajada (ADR-0321) y no debe quedar tapado. Reemplaza a `ElegirTallaModal` (un color a la vez).
 */
export function OpcionesDePrendaModal({ prenda, colorClave, ubicacionEtiqueta, carrito, onAgregar, onClose, alCerrarEnfocar, pie }: Props) {
  const inicial = prenda.colores.find((c) => c.clave === colorClave) ?? colorInicial(prenda);
  const [fijo, setFijo] = useState(inicial?.clave);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [recien, setRecien] = useState<{ id: string; pulso: number } | null>(null);
  const colores = [...prenda.colores].sort((a, b) => rango(a) - rango(b));
  const elegido = prenda.colores.find((c) => c.clave === fijo) ?? inicial;
  const mostrado = prenda.colores.find((c) => c.clave === vistaPrevia) ?? elegido;
  const enTicket = (id: string) => carrito.find((it) => it.claveLinea === id)?.cantidad ?? 0;
  if (!elegido || !mostrado) return null;
  const varMostrada = mostrado.tallas[0]?.variante;
  const llevaMostrado = mostrado.tallas.reduce((a, t) => a + enTicket(t.variante.varianteId), 0);

  return (
    <Modal
      titulo={prenda.referencia}
      subtitulo={`${prenda.categoria ?? "Sin categoría"} · ${resumenDePrenda(prenda)} · ${ubicacionEtiqueta}`}
      variante="hoja"
      ancho="max-w-3xl"
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
    >
      {(cerrar) => (
        <>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-7">
            {/* La prenda en el color que se mira. En el celular, una franja (foto chica + datos) para que los colores
                entren sin bajar; desde `sm`, la foto grande y fija mientras la lista se recorre. */}
            <div className="flex items-center gap-4 sm:sticky sm:top-0 sm:block sm:self-start">
              <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-sand/40 sm:w-full">
                <div key={mostrado.clave} className="vg-capa vg-capa-entra">
                  {mostrado.fotoUrl ? (
                    <Image src={mostrado.fotoUrl} alt={[prenda.referencia, mostrado.color].filter(Boolean).join(" ")} fill sizes="(min-width: 640px) 240px, 96px" className="object-cover" unoptimized />
                  ) : (
                    <MosaicoPrenda colorHex={varMostrada?.colorHex} prefijo={varMostrada?.categoriaPrefijo} familia={varMostrada?.categoriaFamilia ?? null} categoria={varMostrada?.categoria} forma="grilla" className="h-full w-full !rounded-none" />
                  )}
                </div>
              </div>
              <div className="min-w-0 sm:mt-3.5">
                <p className="label-cayla text-[10.5px] text-taupe">Color</p>
                <p key={mostrado.clave} className="anim-revelar truncate font-display text-xl leading-tight text-tinta">{mostrado.color ?? "Sin color"}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-tinta">
                  {mostrado.precioMin === mostrado.precioMax ? money(mostrado.precioMin) : `desde ${money(mostrado.precioMin)}`}
                </p>
                <p className="mt-0.5 text-xs text-tinta/60 tabular-nums">
                  {mostrado.stockTotal > 0
                    ? `${mostrado.stockTotal} ${mostrado.separaPiso ? "en el piso" : "en la sede"}${mostrado.almacenTotal ? ` · ${mostrado.almacenTotal} en el almacén` : ""}`
                    : mostrado.almacenTotal > 0
                      ? `${mostrado.almacenTotal} en el almacén`
                      : "Sin stock aquí"}
                </p>
                {llevaMostrado > 0 && (
                  <span key={llevaMostrado} className="anim-pop mt-2 inline-block">
                    <Chip tono="verde" tachado={false}>
                      {llevaMostrado} en el ticket
                    </Chip>
                  </span>
                )}
              </div>
            </div>

            {/* Un color por fila. Pasar el mouse por una fila anticipa su color a la izquierda; tocar su nombre lo fija. */}
            {/* `@container`: las casillas se acomodan al ancho de la LISTA (en el celular, tres por fila con el texto corto). */}
            <ul className="@container min-w-0 divide-y divide-sand border-y border-sand" aria-label="Colores y tallas" onPointerLeave={() => setVistaPrevia(null)}>
              {colores.map((c, i) => {
                const lleva = c.tallas.reduce((a, t) => a + enTicket(t.variante.varianteId), 0);
                const activo = c.clave === mostrado.clave;
                return (
                  <li
                    key={c.clave}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setVistaPrevia(c.clave)}
                    style={{ "--i": Math.min(i, 8) } as CSSProperties}
                    className={`anim-entra relative py-3 pl-3 transition-colors duration-200 ${activo ? "bg-hueso/45" : ""}`}
                  >
                    {/* El hilo del color que se mira: tinta, no rojo (un rojo por pantalla, y ya lo usa el foco). */}
                    <span aria-hidden className={`absolute top-3 bottom-3 left-0 w-[2px] rounded-full bg-tinta transition-opacity duration-200 ${activo ? "opacity-100" : "opacity-0"}`} />
                    <button
                      type="button"
                      onClick={() => setFijo(c.clave)}
                      aria-pressed={c.clave === elegido.clave}
                      className="flex w-full items-center gap-2.5 pr-1 text-left outline-none focus-visible:underline"
                    >
                      <span
                        aria-hidden
                        className="h-4 w-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-tinta)_16%,transparent)]"
                        style={{ backgroundColor: estiloMosaicoColor(c.tallas[0]?.variante.colorHex)?.fondo ?? "var(--color-hueso)" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-tinta">{c.color ?? "Sin color"}</span>
                      {lleva > 0 && (
                        <span key={lleva} className="anim-revelar shrink-0 text-[11px] font-semibold text-rojo tabular-nums">
                          {lleva} en el ticket
                        </span>
                      )}
                    </button>
                    <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5 pr-1 @sm:grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))]" role="group" aria-label={`Tallas en ${c.color ?? "este color"}`}>
                      {c.tallas.map((t) => (
                        <Casilla
                          key={t.variante.varianteId}
                          t={t}
                          color={c}
                          precioBase={prenda.precioMin}
                          enTicket={enTicket(t.variante.varianteId)}
                          recien={recien?.id === t.variante.varianteId ? recien.pulso : null}
                          onTocar={(bajable) => {
                            setFijo(c.clave);
                            onAgregar(t.variante);
                            if (bajable) cerrar();
                            else setRecien((r) => ({ id: t.variante.varianteId, pulso: (r?.pulso ?? 0) + 1 }));
                          }}
                        />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">{pie?.(elegido)}</div>
            <button type="button" onClick={cerrar} className={`${botonPrimario} flex-none px-6`}>
              Listo
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Una talla de un color: lo que dice y si se puede tocar sale de `motivoNoCobrable`, como en la tarjeta y el buscador. */
function Casilla({
  t,
  color,
  precioBase,
  enTicket,
  recien,
  onTocar,
}: {
  t: Color["tallas"][number];
  color: Color;
  precioBase: number;
  enTicket: number;
  recien: number | null;
  /** `bajable`: la talla está en el almacén y el aviso de la caja ofrecerá registrar la bajada. */
  onTocar: (bajable: boolean) => void;
}) {
  const motivo = motivoNoCobrable(t.variante);
  const agotada = motivo === "agotada";
  const enAlmacen = motivo === "en_almacen";
  // Lo único que queda en el piso es de un cliente: no se vende desde aquí, pero no es «no hay» (puede venir por ella).
  const apartada = motivo === "apartada";
  // Ya se llevó todo lo del piso: otra no haría nada; si hay en el almacén, tocarla ofrece la bajada.
  const tope = motivo === "cobrable" && enTicket >= t.stockAqui;
  const bajable = enAlmacen || (tope && t.almacenAqui > 0);
  const otras = textoOtrasSedes(t.variante.stockOtrasSedes ?? []);
  const nombre = [t.variante.referencia, color.color].filter(Boolean).join(" ");
  const texto = agotada
    ? otras ?? "Sin stock aquí"
    : apartada
      ? "Apartada para un cliente"
      : enAlmacen
        ? `${t.almacenAqui} en el almacén`
        : tope
          ? t.almacenAqui > 0
            ? `${t.almacenAqui} en el almacén`
            : "Ya tienes todas"
          : `${t.stockAqui - enTicket} aquí`;
  // En una lista angosta (el celular) la casilla mide ~5 rem: el mismo dato, en corto. El lector de pantalla lee el largo.
  const corto = agotada
    ? "Sin stock"
    : apartada
      ? "Apartada"
      : enAlmacen || (tope && t.almacenAqui > 0)
        ? `${t.almacenAqui} alm.`
        : tope
          ? "En el ticket"
          : `${t.stockAqui - enTicket} aquí`;
  return (
    <button
      type="button"
      disabled={!bajable && (motivo !== "cobrable" || tope)}
      onClick={() => onTocar(bajable)}
      aria-label={bajable ? `Agregar ${nombre} talla ${t.talla}: no figura en el piso` : `Agregar ${nombre} talla ${t.talla}: ${texto}`}
      className={`relative flex min-h-[3.25rem] flex-col justify-center rounded-lg border px-2.5 py-1.5 text-left transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-cayla)] ${
        bajable
          ? "border-dashed border-ambar/60 text-ambar-profundo hover:bg-ambar/10 active:translate-y-px"
          : agotada || apartada || tope
            ? "cursor-not-allowed border-dashed border-sand text-tinta/45"
            : "border-sand bg-crema text-tinta hover:border-tinta/50 hover:bg-hueso active:translate-y-px"
      }`}
    >
      <span className={`font-display text-[17px] leading-tight ${agotada ? "line-through" : ""} ${apartada ? "text-pizarra" : ""}`}>{t.talla}</span>
      <span aria-hidden className={`text-[11px] leading-snug ${apartada ? "text-pizarra" : ""}`}>
        <span className="@sm:hidden">{corto}</span>
        <span className="hidden @sm:inline">{texto}</span>
      </span>
      {t.variante.precio !== precioBase && <span className="text-[11px] font-semibold tabular-nums">{money(t.variante.precio)}</span>}
      {recien !== null && (
        <svg key={recien} aria-hidden viewBox="0 0 24 24" className="vg-visto absolute top-1.5 right-1.5 h-4 w-4 fill-none stroke-verde [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.4]">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      )}
    </button>
  );
}
