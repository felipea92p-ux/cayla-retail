"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { ParDato, Pares, type TonoPar } from "@/components/ui/ParDato";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import type { CategoriaDePrenda } from "@/lib/categoria-de-prenda";

// La ficha viva de «Nueva orden de producción» (ADR-0396, A3): a la derecha de la hoja y siempre a la vista, dice QUÉ se está abriendo mientras el pedido se arma a la izquierda
// —la prenda, cuántas son, cuánto cuesta hacerla, a cuánto se vende y cuánto deja— y guarda debajo lo que cierra la orden (quién la abre, lo que falta y los botones). Antes la hoja
// era una columna de ~2.000 px y la prenda no aparecía nunca; el botón vivía en un pie pegado que tapaba al responsable.
//
// Producción más clara (Felipe 2026-11-26): cada dato es su pieza (los pares «Colores» y «Tallas», «Entrega», cada fase de afuera) y la plata se dice con palabras de tienda:
// «Cuesta hacerla» (el costo por prenda; de qué se forma se abre con «Ver de qué se forma»), «Se vende a» y «Ganancia por prenda» en soles, que reemplaza a la insignia del margen
// en porcentaje (había que saber leerla) y conserva su color: verde, ámbar o rojo según el mismo semáforo.
//
// Es PRESENTACIONAL: no calcula nada de negocio (el formulario le pasa los números y los textos ya resueltos) y no tiene controles del formulario: lo único que se toca aquí es
// «Ver de qué se forma», que pliega el desglose del costo. Lo que cierra la orden (`children`: el combo del responsable, el «Falta: …», el aviso de nombre repetido, Cancelar y
// Abrir orden) lo escribe el formulario, que es quien tiene el estado, el `<form>` y el envío: así el botón sigue siendo un hijo del formulario y nada de lo que se manda a la base cambia.
//
// Dos formas (CSS, un solo árbol; las decide el ancho del MARCO donde vive —`@container`, ADR-0509—, no el de la pantalla): desde 880 px, una tarjeta fija a la derecha (`sticky`, con su propio desplazamiento si la pantalla es baja y lo que cierra siempre abajo, sin recortarse); bajo 880 px,
// una barra pegada al borde de abajo de la ventana con el nombre, el total y lo que cierra (el responsable NO se esconde: sin él no se puede abrir la orden). Sigue el contrato de la barra de
// Nuevo producto: publica su alto en `--alto-barra-ficha` para que lo que se pega sobre ella no quede detrás.

/** La ganancia de cada prenda, ya escrita, con el tono de su semáforo y la palabra que lo dice a quien no ve el color. */
export type FilaGanancia = { valor: string; tono: TonoPar; dice: string };

const TONO_GANANCIA: Record<TonoPar, string> = { tinta: "text-tinta", verde: "text-verde", ambar: "text-ambar", rojo: "text-rojo-profundo" };

export function FichaOrden({
  prenda,
  colorHex,
  nombre,
  nombreVacio,
  esMuestra,
  esNuevo,
  hayModelo,
  total,
  seFabrica,
  seVendeA,
  precioMasBajo,
  costo,
  ganancia,
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
  /** `null`: un modelo nuevo al que todavía no se le eligió el tipo (ADR-0396, act. 2026-10-30). */
  esMuestra: boolean | null;
  esNuevo: boolean;
  /** Hay un modelo (elegido o en construcción): sin él no se dibujan los chips. */
  hayModelo: boolean;
  total: number;
  /** Cuántos colores y cuántas tallas llevan prendas (un eje en cero no se dibuja). */
  seFabrica: { colores: number; tallas: number };
  /** «S/ 79.90» / «Al aprobarla» / «Sin precio todavía», o `null` (un modelo que existe sin precio: la nota de abajo lo explica). */
  seVendeA: string | null;
  /** Solo líder: «S/ 69.90 en Tienda Lima», el precio propio más bajo, que es con el que se mide la ganancia (ADR-0370). */
  precioMasBajo: string | null;
  /** `partes`: de qué se forma el costo de cada prenda (la tela y cada servicio de afuera), ya escritas; suman lo que dice `porPrenda`. */
  costo: { total: string; porPrenda: string | null; partes?: { clave: string; nombre: string; detalle: string | null; valor: string }[] } | null;
  /** Solo líder (quien ve el margen): lo que deja cada prenda, en soles. `null` sin precio o sin costo. */
  ganancia: FilaGanancia | null;
  /** «23 oct», o `null` («Sin fecha»). */
  entrega: string | null;
  /** Las fases que salen a un servicio y todavía no tienen un costo que repartir en `costo.partes` (una tarifa sin leer): cuál y quién la hace (ADR-0400); vacío = ninguna. */
  afuera?: { fase: string; quien: string }[];
  /** Solo líder, modelo que existe sin precio: el aviso con su enlace a Editar producto. */
  notaSinPrecio?: ReactNode;
  /** Lo que cierra la orden. */
  children: ReactNode;
}) {
  const [conDesglose, setConDesglose] = useState(false);
  const idDesglose = useId();
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
      className="sticky bottom-0 z-[2] -mx-6 -mb-6 border-t border-sand bg-papel px-6 pb-6 pt-3 @min-[880px]:top-[5.5rem] @min-[880px]:bottom-auto @min-[880px]:z-auto @min-[880px]:mx-0 @min-[880px]:mb-0 @min-[880px]:flex @min-[880px]:max-h-[calc(100dvh-7rem)] @min-[880px]:flex-col @min-[880px]:rounded-2xl @min-[880px]:border @min-[880px]:[background:var(--placa-fondo)] @min-[880px]:[box-shadow:var(--placa-luz)] @min-[880px]:p-5"
    >
      <div className="scroll-cayla @min-[880px]:-mx-1.5 @min-[880px]:min-h-0 @min-[880px]:flex-1 @min-[880px]:overflow-y-auto @min-[880px]:px-1.5">
        <div data-guia="prod-orden-nueva.resumen" className="space-y-4">
          {/* La prenda y su nombre. En la barra de abajo solo queda el nombre y el total. */}
          <div className="flex items-center gap-3.5">
            <span className="@max-[879px]:hidden">
              <MiniaturaPrenda fotoUrl={null} colorHex={colorHex} tamano="xl" prefijo={prenda.prefijo} familia={prenda.familia} categoria={prenda.categoria} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-lg font-semibold leading-tight ${nombreVacio ? "text-tenue" : "text-tinta"}`}>{nombre}</p>
              {hayModelo && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 @max-[879px]:hidden">
                  {esMuestra === null ? (
                    <Chip tono="neutro">Falta elegir el tipo</Chip>
                  ) : esMuestra ? (
                    <Chip tono="ambar" title="Una muestra no entra al stock">
                      Muestra
                    </Chip>
                  ) : (
                    <Chip tono="pizarra">Para vender</Chip>
                  )}
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
              <b className="font-display text-2xl text-tinta">{total}</b> <span className="text-sm text-secundario">prendas</span>
            </p>
          </div>

          {/* Cuántas son, en grande, y en cuántos colores y tallas: cada dato en su pieza. */}
          <div className="@max-[879px]:hidden">
            <p className="flex items-baseline gap-2 tabular-nums">
              <span className="font-display text-5xl leading-none text-tinta">{total}</span>
              <span className="text-sm text-secundario">prendas</span>
            </p>
            {(seFabrica.colores > 0 || seFabrica.tallas > 0) && (
              <Pares className="mt-2">
                {seFabrica.colores > 0 && <ParDato rotulo="Colores">{seFabrica.colores}</ParDato>}
                {seFabrica.tallas > 0 && <ParDato rotulo="Tallas">{seFabrica.tallas}</ParDato>}
              </Pares>
            )}
          </div>

          {/* La plata, con palabras de tienda: cuánto cuesta hacer cada prenda, a cuánto se vende y cuánto deja. */}
          {(costo || seVendeA !== null || ganancia) && (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2.5 border-y border-sand py-3.5 text-sm @max-[879px]:hidden">
              {/* El costo se lee POR PRENDA, que es con lo que se mide la ganancia y se pone el precio. De qué se forma (la tela y cada servicio de afuera) y lo de toda la orden se abren debajo. */}
              {costo && (
                <>
                  <dt className="text-secundario">{costo.porPrenda ? "Cuesta hacerla" : "Cuesta toda la orden"}</dt>
                  <dd className="text-right font-semibold tabular-nums text-tinta">{costo.porPrenda ?? costo.total}</dd>
                  {costo.porPrenda && (
                    <dd className="col-span-2 -mt-1.5">
                      <BotonVerMas abierto={conDesglose} onCambiar={setConDesglose} texto="Ver de qué se forma" forma="enlace" controla={idDesglose} data-guia="prod-orden-nueva.costo-abrir" />
                      <FilasDeMas abierto={conDesglose} id={idDesglose}>
                        <ul aria-label="De qué se forma el costo de cada prenda" className="mt-1.5 space-y-1.5 border-l border-sand pl-3">
                          {costo.partes &&
                            costo.partes.length > 1 &&
                            costo.partes.map((parte) => (
                              <li key={parte.clave} className="flex items-baseline justify-between gap-3 text-detalle leading-snug">
                                <span className="min-w-0 text-secundario">
                                  {parte.nombre}
                                  {parte.detalle && <small className="block truncate text-xs text-tenue">{parte.detalle}</small>}
                                </span>
                                <span className="shrink-0 tabular-nums text-tinta">{parte.valor}</span>
                              </li>
                            ))}
                          <li className="flex items-baseline justify-between gap-3 text-detalle leading-snug">
                            <span className="text-secundario">Toda la orden</span>
                            <span className="shrink-0 tabular-nums text-tinta">{costo.total}</span>
                          </li>
                        </ul>
                      </FilasDeMas>
                    </dd>
                  )}
                </>
              )}
              {seVendeA !== null && (
                <>
                  <dt className="text-secundario">Se vende a</dt>
                  <dd className="text-right font-semibold tabular-nums text-tinta">{seVendeA}</dd>
                </>
              )}
              {precioMasBajo && (
                <>
                  <dt className="text-secundario">El precio más bajo</dt>
                  <dd className="text-right tabular-nums text-tinta">{precioMasBajo}</dd>
                </>
              )}
              {ganancia && (
                <>
                  <dt className="text-secundario">Ganancia por prenda</dt>
                  <dd title={ganancia.dice} className={`text-right font-semibold tabular-nums ${TONO_GANANCIA[ganancia.tono]}`}>
                    {ganancia.valor}
                    <span className="sr-only"> ({ganancia.dice})</span>
                  </dd>
                </>
              )}
            </dl>
          )}

          {/* Para cuándo y qué sale afuera: cada cosa, su par. El nombre de un servicio puede ser largo: aquí sí baja de línea. */}
          <Pares className="@max-[879px]:hidden [&>span>span]:whitespace-normal">
            <ParDato rotulo="Entrega" className="max-w-full">
              {entrega ?? "Sin fecha"}
            </ParDato>
            {afuera.map((a) => (
              <ParDato key={a.fase} rotulo={`${a.fase}, afuera`} className="max-w-full">
                {a.quien}
              </ParDato>
            ))}
          </Pares>
          {notaSinPrecio && <div className="@max-[879px]:hidden">{notaSinPrecio}</div>}
        </div>
      </div>

      {/* Lo que cierra la orden: siempre a la vista, fuera del desplazamiento de arriba. */}
      <div className="shrink-0 @max-[879px]:mt-2 @min-[880px]:mt-4 @min-[880px]:border-t @min-[880px]:border-sand @min-[880px]:pt-4">{children}</div>
    </aside>
  );
}
