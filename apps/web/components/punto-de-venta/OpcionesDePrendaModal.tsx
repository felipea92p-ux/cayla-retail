"use client";

import { useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Modal, botonPrimario } from "@/components/ui/Modal";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { Chip } from "@/components/ui/Chip";
import { money, type ItemCarrito, type OrigenDeLinea, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { colorInicial, resumenDePrenda, type GrupoCatalogo, type PrendaCatalogo } from "@/lib/catalogo-grupos";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { motivoNoCobrable } from "@/lib/vender-stock-local";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";
import { ETIQUETA_COMBINA, FichaDelColor } from "@/components/ui/FichaDelColor";
import type { FichaDelColor as FichaDelColorTipo } from "@/lib/ficha-del-color";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import { chipDeTarjeta, type AnclaLook, type SugerenciaLook } from "@/lib/combinar-reglas";

type Color = GrupoCatalogo<VarianteBusqueda>;

/** Lo que «Combina bien con» dice de un color de la prenda: la frase (en reposo) y las prendas concretas (al fijar). */
export type CombinaDeColor = { frase: string | null; sugerencias: SugerenciaLook<Color>[] };

/** La prenda en un color, como ancla de la regla: su modelo, su categoría y su color. */
function anclaDe(prenda: PrendaCatalogo<VarianteBusqueda>, c: Color): AnclaLook {
  const v = c.tallas[0]?.variante;
  return { productoId: v?.productoId ?? prenda.referencia, categoriaPrefijo: v?.categoriaPrefijo ?? null, colorCodigo: v?.colorCodigo ?? null };
}

type Props = {
  prenda: PrendaCatalogo<VarianteBusqueda>;
  /** El color que se estaba viendo en la tarjeta: la ventana abre en él. */
  colorClave?: string;
  ubicacionEtiqueta: string;
  carrito: ItemCarrito[];
  /** `origen`: la línea nació de «Combina bien con» (queda marcada en la venta). */
  onAgregar: (v: VarianteBusqueda, opciones?: { origen?: OrigenDeLinea }) => void;
  /** Quitar del ticket una línea que entró desde aquí (Formidable 2026-10-10, cambio 1): el mismo quitar del ticket, sin
   *  confirmación (sumar al ticket es estado local, no dinero ni stock). Ausente = la hoja no ofrece quitar. */
  onQuitar?: (claveLinea: string) => void;
  onClose: () => void;
  alCerrarEnfocar: RefObject<HTMLElement | null>;
  /** Debajo de los colores, para el color que se está viendo: lo que el Punto de venta agrega (hoy, «Anotar que no había»). */
  pie?: (color: Color) => ReactNode;
  /** La ficha del color que se mira (ADR-0316; Felipe 2026-10-10): con qué se combina, con lo que cuelga aquí primero, y por qué.
   *  Ausente o `null` = la hoja no dice nada del color. */
  fichaDelColorDe?: (colorCodigo: string | null | undefined) => FichaDelColorTipo | null;
  /** «Combina bien con» (Felipe 2026-10-10): la frase para el color que se mira y, al fijarlo, hasta 3 prendas con stock aquí. */
  combinaDe?: (ancla: AnclaLook) => CombinaDeColor;
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
export function OpcionesDePrendaModal({ prenda, colorClave, ubicacionEtiqueta, carrito, onAgregar, onQuitar, onClose, alCerrarEnfocar, pie, fichaDelColorDe, combinaDe }: Props) {
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
  // La frase sigue al color que se MIRA (pasar por una fila la cambia); las prendas concretas, solo al FIJAR (Felipe 2026-10-10).
  const combinaMostrado = combinaDe?.(anclaDe(prenda, mostrado)) ?? null;
  const combinaFijo = mostrado.clave === elegido.clave ? combinaMostrado : (combinaDe?.(anclaDe(prenda, elegido)) ?? null);

  return (
    <Modal
      titulo={prenda.referencia}
      subtitulo={`${prenda.categoria ?? "Sin categoría"} · ${resumenDePrenda(prenda)} · ${ubicacionEtiqueta}`}
      variante="hoja"
      ancho="max-w-3xl"
      onClose={onClose}
      alCerrarEnfocar={alCerrarEnfocar}
      // El foco inicial en la hoja, no en el primer control (Formidable 2026-10-10): Radix enfocaba el primer círculo de «Combina bien
      // con» y lo encendía solo («Negro · hay en el piso» sin que nadie lo tocara).
      focoEnLaHoja
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
                  <span key={llevaMostrado} className="anim-pop mt-2 inline-flex items-center gap-1.5">
                    <Chip tono="verde" tachado={false}>
                      {llevaMostrado} en el ticket
                    </Chip>
                    {onQuitar && (
                      <QuitarDelTicket
                        nombre={`${varMostrada?.referencia ?? ""} ${mostrado.color}`.trim()}
                        onClick={() => mostrado.tallas.forEach((t) => enTicket(t.variante.varianteId) > 0 && onQuitar(t.variante.varianteId))}
                      />
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0">
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
            {(combinaDe || fichaDelColorDe) && (
              <CombinaBienCon
                key={elegido.clave}
                fraseMostrada={combinaMostrado?.frase ?? null}
                mirandoElFijo={mostrado.clave === elegido.clave}
                combinaFijo={combinaFijo}
                ficha={fichaDelColorDe?.(varMostrada?.colorCodigo) ?? null}
                claveColor={mostrado.clave}
                colorFijo={elegido.color}
                enTicket={enTicket}
                onTocar={(t, bajable) => {
                  onAgregar(t.variante, { origen: "combina_bien_con" });
                  if (bajable) cerrar();
                  else setRecien((r) => ({ id: t.variante.varianteId, pulso: (r?.pulso ?? 0) + 1 }));
                }}
                onQuitar={onQuitar && ((id) => { onQuitar(id); setRecien((r) => (r?.id === id ? null : r)); })}
                recien={recien}
              />
            )}
            </div>
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

/**
 * «Combina bien con», UN solo bloque bajo la lista de colores (Felipe 2026-10-10; Formidable 2026-10-10: antes había dos «Combina bien
 * con» en la hoja, uno de colores y otro de prendas, y el ciego no supo cuál era «la prenda que el sistema dice»). En reposo, la frase
 * del color que se mira («Combina bien con una blusa») y, debajo, «En estos colores:» con los círculos de la ficha (el nombre al pasar o
 * tocar; «hay en el piso» / «no hay aquí»); las dos líneas tienen alto fijo, así pasar por las filas no mueve nada. Con el color FIJADO,
 * hasta 3 prendas que cuelgan aquí, una por papel (`lib/combinar-reglas.ts`): miniatura, nombre, color y cuántas; tocar la fila despliega
 * sus tallas —las mismas casillas de la lista— y tocar la talla la suma al ticket. «¿Por qué?» a un toque dice el papel y el color en
 * español de tienda («Una blusa va arriba de la falda · El negro combina con el beige»). Sin frase ni colores ni prendas, nada: nunca
 * un cartel de «no hay». Si no hay frase pero sí ficha, los círculos llevan la etiqueta de siempre («Combina bien con»).
 *
 * La tarjeta SE QUEDA cuando su prenda entra al ticket (Formidable 2026-10-10, cambio 1, Felipe): antes desaparecía —lo que hace
 * Shopify, y lo que sus comerciantes reportan como problema—, y la vendedora veía «se fue», no «entró». La regla «lo que ya está en el
 * ticket no se sugiere» se evalúa al ABRIR la hoja y al FIJAR un color (este bloque va con `key` por color y congela `combinaFijo` al
 * montarse), no en cada toque. La señal vive donde se tocó: la casilla dibuja el visto mientras lleve unidades, el chip pasa de «2 aquí»
 * a «1 en el ticket · 1 aquí» (`chipDeTarjeta`) y un «Quitar» —la misma pieza que la fila de colores y la línea del ticket— deshace sin
 * preguntar. Otra talla se suma tocando otra casilla. Sin aviso en la esquina: la hoja la tapa y nada hay que esperar (no hay red).
 */
function CombinaBienCon({
  fraseMostrada,
  mirandoElFijo,
  combinaFijo,
  ficha,
  claveColor,
  colorFijo,
  enTicket,
  onTocar,
  onQuitar,
  recien,
}: {
  /** La frase del color que se MIRA (pasar por una fila la cambia): se usa cuando no es el fijado. */
  fraseMostrada: string | null;
  mirandoElFijo: boolean;
  /** La frase y las prendas del color FIJADO en el momento de montarse: se congelan aquí (ver arriba). */
  combinaFijo: CombinaDeColor | null;
  /** La ficha del color que se mira (sus compañeros); `null` sin ficha. */
  ficha: FichaDelColorTipo | null;
  /** La clave del color que se mira: remonta los círculos al cambiar de color (su nombre señalado no se arrastra). */
  claveColor: string;
  colorFijo: string | null;
  enTicket: (id: string) => number;
  onTocar: (t: Color["tallas"][number], bajable: boolean) => void;
  onQuitar?: (claveLinea: string) => void;
  recien: { id: string; pulso: number } | null;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [porQueDe, setPorQueDe] = useState<string | null>(null);
  // Congelado al montarse (el bloque lleva `key` por color fijado): lo que entra al ticket después no cambia la lista.
  const [fijo] = useState(combinaFijo);
  const frase = mirandoElFijo ? (fijo?.frase ?? null) : fraseMostrada;
  const sugerencias = fijo?.sugerencias ?? [];
  const hayCirculos = (ficha?.companeros.length ?? 0) > 0;
  if (!frase && !hayCirculos && sugerencias.length === 0) return null;
  return (
    <section className="mt-4" aria-label="Combina bien con">
      {frase && <p className="min-h-5 truncate text-[13px] text-tinta">{frase}</p>}
      {hayCirculos && <FichaDelColor key={`circulos-${claveColor}`} ficha={ficha} forma="circulos" etiqueta={frase ? "En estos colores:" : ETIQUETA_COMBINA} />}
      {sugerencias.length > 0 && (
        <ul className="@container mt-2 divide-y divide-sand rounded-xl border border-sand bg-papel" aria-label={`Prendas que combinan con ${colorFijo ?? "este color"}`}>
          {sugerencias.map((s, i) => {
            const t = s.tarjeta;
            const g = t.origen;
            const clave = `${t.productoId}|${t.colorCodigo ?? ""}`;
            const v = g?.tallas[0]?.variante;
            const lleva = g ? g.tallas.reduce((a, talla) => a + enTicket(talla.variante.varianteId), 0) : 0;
            const chip = chipDeTarjeta(s.unidadesAqui, lleva);
            return (
              <li key={clave} className="anim-entra px-3 py-2" style={{ "--i": i } as CSSProperties}>
                {/* `flex-wrap` + `basis-full`: en una lista angosta (el celular) el chip, el tacho y «¿Por qué?» bajan debajo del nombre,
                    alineados con el texto (`pl-14`), en vez de cortarlo a «B…» (visto a 375 px, Formidable 2026-10-10). */}
                <div className="flex flex-wrap items-stretch gap-x-3 gap-y-1">
                  {/* La fila entera despliega las tallas y lo dice («Ver tallas ›»): el ciego tocó el nombre «buscando cómo agregarla» y
                      nada avisaba que se abre. Mínimo 44 px de alto: la hoja es de celular (PL-105). */}
                  <button
                    type="button"
                    onClick={() => setAbierta((a) => (a === clave ? null : clave))}
                    aria-expanded={abierta === clave}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                  >
                    <MiniaturaPrenda fotoUrl={t.fotoUrl} colorHex={t.colorHex} tamano="md" {...categoriaDe(v)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-tinta">{t.referencia}</span>
                      <span className="block truncate text-[12px] text-tinta/70">
                        {t.colorNombre ?? "Sin color"}
                        <span className="text-taupe"> · {abierta === clave ? "Ocultar tallas" : "Ver tallas ›"}</span>
                      </span>
                    </span>
                  </button>
                  <span className="flex basis-full shrink-0 items-center gap-2 pl-14 @sm:basis-auto @sm:pl-0">
                    <span key={chip.texto} className={chip.enTicket ? "anim-pop inline-flex items-center gap-1.5" : "inline-flex items-center"}>
                      <Chip tono={chip.enTicket ? "verde" : "pizarra"} tachado={false}>
                        {chip.texto}
                      </Chip>
                      {chip.enTicket && onQuitar && g && (
                        <QuitarDelTicket
                          nombre={`${t.referencia} ${t.colorNombre ?? ""}`.trim()}
                          onClick={() => g.tallas.forEach((talla) => enTicket(talla.variante.varianteId) > 0 && onQuitar(talla.variante.varianteId))}
                        />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPorQueDe((p) => (p === clave ? null : clave))}
                      aria-expanded={porQueDe === clave}
                      className="btn-cayla btn-enlace inline-flex min-h-7 items-center !px-0 text-[12px] pointer-coarse:min-h-11"
                    >
                      {porQueDe === clave ? "Cerrar" : "¿Por qué?"}
                    </button>
                  </span>
                </div>
                {porQueDe === clave && <p className="anim-revelar mt-1.5 pl-14 text-[12px] text-tinta/70">{s.porQue.join(" · ")}</p>}
                {abierta === clave && g && (
                  <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5 pl-14 @sm:grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))]" role="group" aria-label={`Tallas de ${t.referencia} ${t.colorNombre ?? ""}`}>
                    {g.tallas.map((talla) => (
                      <Casilla
                        key={talla.variante.varianteId}
                        t={talla}
                        color={g}
                        precioBase={g.precioMin}
                        enTicket={enTicket(talla.variante.varianteId)}
                        recien={recien?.id === talla.variante.varianteId ? recien.pulso : null}
                        onTocar={(bajable) => onTocar(talla, bajable)}
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
      {/* El visto se dibuja al entrar (`recien` lo vuelve a dibujar) y SE QUEDA mientras la talla lleve unidades; al quitarla se va
          (Formidable 2026-10-10, cambio 1). */}
      {enTicket > 0 && (
        <svg key={recien ?? "lleva"} aria-hidden viewBox="0 0 24 24" className="vg-visto absolute top-1.5 right-1.5 h-4 w-4 fill-none stroke-verde [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.4]">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      )}
    </button>
  );
}

/** «Quitar» del ticket, la misma pieza que la línea del ticket (`LineaDelTicket`): el tacho en rojo profundo desde el principio
 *  (ADR-0358, lo peligroso), 28 px con mouse y 44 con dedo. Sin confirmación: deshacer lo sumado al ticket es estado local. */
function QuitarDelTicket({ nombre, onClick }: { nombre: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Quitar ${nombre} del ticket`}
      title="Quitar del ticket"
      onClick={onClick}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-rojo-profundo transition-colors hover:bg-rojo/10 hover:text-rojo pointer-coarse:h-11 pointer-coarse:w-11"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
