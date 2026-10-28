"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";

// La ficha viva de «Nueva orden de producción» (ADR-0396, A3): a la derecha de la hoja y siempre a la vista, dice QUÉ se está abriendo mientras el pedido se arma a la izquierda
// —la prenda, cuántas son, a cuánto se vende, para cuándo— y guarda debajo lo que cierra la orden (lo que falta, quién la abre y los botones). Antes la hoja era una columna de ~2.000 px
// y la prenda no aparecía nunca; el botón vivía en un pie pegado que tapaba al responsable.
//
// Es PRESENTACIONAL: no calcula nada de negocio (el formulario le pasa los números y los textos ya resueltos) y no tiene controles propios. Lo que cierra la orden (`children`: el «Falta: …», el
// combo del responsable, el aviso de nombre repetido, Cancelar y Abrir orden) lo escribe el formulario, que es quien tiene el estado, el `<form>` y el envío: así el botón sigue siendo un hijo del
// formulario y nada de lo que se manda a la base cambia.
//
// Dos formas (CSS, un solo árbol; las decide el ancho del MARCO donde vive —`@container`, ADR-0509—, no el de la pantalla): desde 880 px, una tarjeta fija a la derecha (`sticky`, con su propio desplazamiento si la pantalla es baja y lo que cierra siempre abajo, sin recortarse); bajo 880 px,
// una barra pegada al borde de abajo de la ventana con el nombre, el total y lo que cierra (el responsable NO se esconde: sin él no se puede abrir la orden). Sigue el contrato de la barra de
// Nuevo producto: publica su alto en `--alto-barra-ficha` para que lo que se pega sobre ella no quede detrás.

export type FilaMargen = { porcentaje: number; chip: { tono: TonoChip; texto: string } };

export function FichaOrden({
  prenda,
  colorHex,
  nombre,
  nombreVacio,
  esMuestra,
  esNuevo,
  hayModelo,
  total,
  coloresYTallas,
  seVendeA,
  precioMasBajo,
  costo,
  margen,
  entrega,
  afuera = [],
  notaSinPrecio,
  children,
}: {
  prenda: CategoriaDePrenda;
  colorHex: string | null;
  nombre: string;
  /** Todavía no hay modelo o no tiene nombre: el nombre sale tenue. */
  nombreVacio: boolean;
  esMuestra: boolean;
  esNuevo: boolean;
  /** Hay un modelo (elegido o en construcción): sin él no se dibujan los chips. */
  hayModelo: boolean;
  total: number;
  /** «3 colores · 2 tallas», o `null` si no se fabrica nada todavía. */
  coloresYTallas: string | null;
  /** «S/ 79.90» / «al aprobarla» / «—», o `null` (un modelo que existe sin precio: la nota de abajo lo explica). */
  seVendeA: string | null;
  /** Solo líder: «S/ 69.90 en Tienda Lima», el precio propio más bajo con el que se mide el margen (ADR-0370). */
  precioMasBajo: string | null;
  /** `partes`: de qué se forma el costo de cada prenda (la tela y cada servicio de afuera), ya escritas; suman lo que dice `porPrenda`. */
  costo: { total: string; porPrenda: string | null; partes?: { clave: string; nombre: string; detalle: string | null; valor: string }[] } | null;
  margen: FilaMargen | null;
  /** «23 oct», o `null` («sin fecha»). */
  entrega: string | null;
  /** Las fases que salen a un servicio y todavía no tienen un costo que repartir en `costo.partes` (una tarifa sin leer), ya escritas («Costura: Confecciones del Norte», ADR-0400); vacío = ninguna. */
  afuera?: string[];
  /** Solo líder, modelo que existe sin precio: el aviso con su enlace a Editar producto. */
  notaSinPrecio?: ReactNode;
  /** Lo que cierra la orden. */
  children: ReactNode;
}) {
  const raiz = useRef<HTMLElement>(null);

  // El alto de la barra de abajo, publicado en `--alto-barra-ficha` SOLO mientras es una barra: en escritorio ancho la ficha es una tarjeta y su alto no le dice nada a nadie. Es barra cuando
  // va pegada al borde de abajo (`bottom` definido); como tarjeta, `bottom` es `auto`. Quien decide es el ancho del marco (`@container`), no el de la pantalla. Mientras es barra, la página
  // se desplaza dejando ese alto libre (`scroll-padding-bottom`): el campo al que lleva la guía de foco no queda detrás de ella.
  useEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const documento = document.documentElement;
    const soltar = () => {
      documento.style.removeProperty("--alto-barra-ficha");
      documento.style.removeProperty("scroll-padding-bottom");
    };
    const publicar = () => {
      if (getComputedStyle(el).bottom === "auto") return soltar();
      documento.style.setProperty("--alto-barra-ficha", `${el.offsetHeight}px`);
      documento.style.setProperty("scroll-padding-bottom", `${el.offsetHeight + 16}px`);
    };
    publicar();
    const obs = new ResizeObserver(publicar);
    obs.observe(el);
    return () => {
      obs.disconnect();
      soltar();
    };
  }, []);

  return (
    <aside
      ref={raiz}
      aria-label="La orden, tal como va a quedar"
      className="sticky bottom-0 z-[2] -mx-6 -mb-6 border-t border-sand bg-papel px-6 pb-6 pt-3 @min-[880px]:top-[5.5rem] @min-[880px]:bottom-auto @min-[880px]:z-auto @min-[880px]:mx-0 @min-[880px]:mb-0 @min-[880px]:flex @min-[880px]:max-h-[calc(100dvh-7rem)] @min-[880px]:flex-col @min-[880px]:rounded-2xl @min-[880px]:border @min-[880px]:bg-hueso/40 @min-[880px]:p-4"
    >
      <div className="scroll-cayla @min-[880px]:-mx-1.5 @min-[880px]:min-h-0 @min-[880px]:flex-1 @min-[880px]:overflow-y-auto @min-[880px]:px-1.5">
        <div data-guia="prod-orden-nueva.resumen" className="space-y-3">
          {/* La prenda y su nombre. En la barra de abajo solo queda el nombre y el total. */}
          <div className="flex items-center gap-3">
            <span className="@max-[879px]:hidden">
              <MiniaturaPrenda fotoUrl={null} colorHex={colorHex} tamano="xl" prefijo={prenda.prefijo} familia={prenda.familia} categoria={prenda.categoria} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate font-display leading-tight @max-[879px]:text-lg @min-[880px]:text-[22px] ${nombreVacio ? "text-tinta/60" : "text-tinta"}`}>{nombre}</p>
              {hayModelo && (
                <div className="mt-1 flex flex-wrap gap-1.5 @max-[879px]:hidden">
                  <Chip tono={esMuestra ? "ambar" : "pizarra"} versalitas={false}>
                    {esMuestra ? "Muestra · no entra al stock" : "Lote de producción"}
                  </Chip>
                  {esNuevo && (
                    <Chip tono="neutro" versalitas={false}>
                      Modelo nuevo
                    </Chip>
                  )}
                </div>
              )}
            </div>
            {/* Solo en la barra: el total al lado del nombre. */}
            <p className="shrink-0 text-right tabular-nums @min-[880px]:hidden">
              <b className="font-display text-2xl text-tinta">{total}</b> <span className="text-[12.5px] text-taupe">prendas</span>
            </p>
          </div>

          {/* Cuántas son, en grande. */}
          <div className="@max-[879px]:hidden">
            <p className="flex items-baseline gap-2 tabular-nums">
              <span className="font-display text-5xl leading-none text-tinta">{total}</span>
              <span className="text-sm text-taupe">prendas</span>
            </p>
            {coloresYTallas && <p className="mt-1 text-[12.5px] text-taupe">{coloresYTallas}</p>}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-sand pt-3 text-[13.5px] @max-[879px]:hidden">
            {seVendeA !== null && (
              <>
                <dt className="text-taupe">Se vende a</dt>
                <dd className="text-right tabular-nums text-tinta">
                  {seVendeA}
                  {precioMasBajo && <span className="block text-[12px] text-taupe">el más bajo: {precioMasBajo}</span>}
                </dd>
              </>
            )}
            {/* El costo se lee POR PRENDA, que es con lo que se mide el margen y se pone el precio; lo de toda la orden va debajo. Con dos o más partes (tela y servicios de afuera) se dice cuánto de cada prenda es de qué. */}
            {costo && (
              <>
                <dt className="text-taupe">{costo.porPrenda ? "Costo por prenda" : "Costo estimado"}</dt>
                <dd className="text-right tabular-nums text-tinta">{costo.porPrenda ?? costo.total}</dd>
                {costo.partes && costo.partes.length > 1 && (
                  <dd className="col-span-2">
                    <ul aria-label="De qué se forma el costo de cada prenda" className="space-y-1 border-l border-sand pl-3">
                      {costo.partes.map((parte) => (
                        <li key={parte.clave} className="flex items-baseline justify-between gap-3 text-[12.5px] leading-snug">
                          <span className="min-w-0 text-taupe">
                            {parte.nombre}
                            {parte.detalle && <small className="block truncate text-[12px] text-taupe">{parte.detalle}</small>}
                          </span>
                          <span className="shrink-0 tabular-nums text-tinta">{parte.valor}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                )}
                {costo.porPrenda && (
                  <>
                    <dt className="text-taupe">Toda la orden</dt>
                    <dd className="text-right tabular-nums text-tinta">{costo.total}</dd>
                  </>
                )}
              </>
            )}
            {margen && (
              <>
                <dt className="text-taupe">Margen</dt>
                <dd className="flex items-center justify-end gap-2 tabular-nums text-tinta">
                  {margen.porcentaje} %
                  <Chip tono={margen.chip.tono}>{margen.chip.texto}</Chip>
                </dd>
              </>
            )}
            <dt className="text-taupe">Entrega</dt>
            <dd className="text-right tabular-nums text-tinta">{entrega ?? <span className="text-taupe">sin fecha</span>}</dd>
            {afuera.length > 0 && (
              <>
                <dt className="text-taupe">Afuera</dt>
                <dd className="text-right text-tinta">
                  {afuera.map((linea) => (
                    <span key={linea} className="block text-[12.5px] leading-snug">
                      {linea}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
          {notaSinPrecio && <div className="@max-[879px]:hidden">{notaSinPrecio}</div>}
        </div>
      </div>

      {/* Lo que cierra la orden: siempre a la vista, fuera del desplazamiento de arriba. */}
      <div className="shrink-0 @max-[879px]:mt-2 @min-[880px]:mt-3 @min-[880px]:border-t @min-[880px]:border-sand @min-[880px]:pt-3">{children}</div>
    </aside>
  );
}
