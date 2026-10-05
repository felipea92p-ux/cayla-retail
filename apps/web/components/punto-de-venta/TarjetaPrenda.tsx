"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import { colorInicial, puntosAVista, resumenDePrenda, type GrupoCatalogo, type PrendaCatalogo } from "@/lib/catalogo-grupos";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { motivoNoCobrable, tooltipTallaSinPiso } from "@/lib/vender-stock-local";
import { estiloMosaicoColor } from "@/lib/color-prenda-reglas";
import { Badge } from "@/components/ui/badge";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Cuántos puntos de color entran en la tarjeta más angosta (un celular de 320 px, dos columnas): con más, «+N». */
const PUNTOS_A_LA_VISTA = 5;

type Color = GrupoCatalogo<VarianteBusqueda>;

type Props = {
  prenda: PrendaCatalogo<VarianteBusqueda>;
  bloqueado: boolean;
  carrito: ItemCarrito[];
  /** Turno de la tarjeta en la cascada de entrada. */
  indice: number;
  /** El pulso del tope si esta prenda es la que se pidió de más (ver `topeTarjeta` en `PuntoDeVenta`). */
  pulsoTope: number | null;
  onAgregar: (v: VarianteBusqueda) => void;
  /** Tocar la prenda (o «+N»): el padre abre «Todo de la prenda» en el color que se está viendo. */
  onAbrir: (clave: string, colorClave: string | undefined) => void;
};

/**
 * La tarjeta de una prenda en la grilla de Vender (ADR-0323). Los puntos ELIGEN el color (en escritorio, pasar el mouse
 * lo anticipa) y la tarjeta cambia a ese color; debajo va lo que falta elegir: las tallas de ese color, o «Agregar» si
 * la prenda es de talla única. Con color y talla conocidos son dos toques y ninguna ventana.
 *
 * El color elegido es estado local de PRESENTACIÓN (como `catalogoAbierto` del panel, ADR-0043): no cambia nada de
 * negocio y vivir en el padre haría redibujar el ticket con cada punto.
 */
export function TarjetaPrenda({ prenda, bloqueado, carrito, indice, pulsoTope, onAgregar, onAbrir }: Props) {
  const [fijo, setFijo] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const buscar = (clave: string | null) => (clave ? prenda.colores.find((c) => c.clave === clave) : undefined);
  // Si el color fijado desaparece (se vendió y «Solo con stock» lo escondió), vuelve al inicial sin quedar colgado.
  const elegido = buscar(fijo) ?? colorInicial(prenda);
  const mostrado = buscar(vistaPrevia) ?? elegido;

  // Fundido entre colores: la capa del color anterior queda debajo hasta que la nueva termina de aparecer. Ajuste EN EL
  // RENDER (mismo idioma que `filtroPrevio` del panel), sin un efecto aparte.
  const [enPantalla, setEnPantalla] = useState(mostrado?.clave);
  const [saliente, setSaliente] = useState<string | null>(null);
  if (mostrado && enPantalla !== mostrado.clave) {
    setSaliente(enPantalla ?? null);
    setEnPantalla(mostrado.clave);
  }
  if (!elegido || !mostrado) return null;

  const sinStock = prenda.stockTotal === 0;
  const soloEnAlmacen = sinStock && prenda.almacenTotal > 0;
  const enCarrito = prenda.colores.reduce(
    (acc, c) => acc + c.tallas.reduce((a, t) => a + (carrito.find((it) => it.claveLinea === t.variante.varianteId)?.cantidad ?? 0), 0),
    0,
  );
  const { aVista, resto } = puntosAVista(prenda.colores, elegido.clave, PUNTOS_A_LA_VISTA);
  const nombre = prenda.referencia;
  const nombreColor = [nombre, elegido.color].filter(Boolean).join(" ");

  function elegir(c: Color) {
    setFijo(c.clave);
    setVistaPrevia(null);
  }
  // Flechas dentro del grupo de colores (radio): se mueve la elección, como cualquier grupo de opciones.
  function alTecladoPuntos(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    e.stopPropagation();
    const i = aVista.findIndex((c) => c.clave === elegido!.clave);
    const siguiente = aVista[(i + (e.key === "ArrowRight" ? 1 : -1) + aVista.length) % aVista.length];
    if (!siguiente) return;
    elegir(siguiente);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-color="${CSS.escape(siguiente.clave)}"]`)?.focus();
  }

  const piso = elegido.stockTotal;
  const almacen = elegido.almacenTotal;
  const capa = (c: Color, entra: boolean) => {
    const v = c.tallas[0]?.variante;
    return (
      <div
        key={c.clave}
        className={`vg-capa ${entra && saliente ? "vg-capa-entra" : ""}`}
        onAnimationEnd={entra ? (e) => e.target === e.currentTarget && setSaliente(null) : undefined}
      >
        {c.fotoUrl ? (
          <Image src={c.fotoUrl} alt={[nombre, c.color].filter(Boolean).join(" ")} fill sizes="(min-width: 1280px) 20vw, 45vw" className="object-cover transition-transform duration-500 ease-[var(--ease-cayla)] group-hover:scale-[1.04]" unoptimized />
        ) : (
          // Sin foto: el ícono de su categoría sobre el COLOR de la prenda (`MosaicoPrenda`, el mismo del buscador).
          <MosaicoPrenda colorHex={v?.colorHex} prefijo={v?.categoriaPrefijo} familia={v?.categoriaFamilia ?? null} categoria={v?.categoria} forma="grilla" className="h-full w-full !rounded-none" />
        )}
        {c.color && (
          <span className="vg-capa-nombre absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-papel/90 px-2 py-0.5 text-[11px] font-semibold text-tinta">
            {c.color}
          </span>
        )}
      </div>
    );
  };

  return (
    <article
      aria-label={nombre}
      style={{ "--i": Math.min(indice, 11) } as CSSProperties}
      // Toda la prenda sin nada en el piso: «solo en el almacén» se distingue de «agotada» (D-40). Al 55 % el ámbar ya
      // no se leía, así que en ese caso se apaga solo la foto.
      className={`anim-entra group relative flex h-full flex-col gap-2 rounded-xl border p-2.5 ${
        soloEnAlmacen ? "border-ambar/60 bg-crema" : sinStock ? "border-rojo-profundo/40 bg-crema opacity-55" : "alza-cayla border-sand bg-papel"
      }`}
    >
      {/* Toda la tarjeta abre «Todo de la prenda». Botón superpuesto (no `<article onClick>`) para teclado y lectores de
          pantalla; los puntos, las tallas y «Agregar» van por encima (`z-10`). */}
      <button
        type="button"
        onClick={() => onAbrir(prenda.clave, elegido.clave)}
        disabled={bloqueado}
        aria-label={`Ver todos los colores y tallas de ${nombre}`}
        className="absolute inset-0 cursor-pointer rounded-xl disabled:cursor-default"
      />
      <div className={`pointer-events-none relative aspect-square overflow-hidden rounded-lg bg-sand/40 ${soloEnAlmacen ? "opacity-55" : ""}`}>
        {saliente && buscar(saliente) && capa(buscar(saliente)!, false)}
        {capa(mostrado, true)}
      </div>

      <div className="pointer-events-none">
        {/* Dos líneas: en un celular de 320 la tarjeta mide ~140 px y una sola dejaba «Pantalón…» sin decir cuál. */}
        <p className="line-clamp-2 text-sm leading-snug font-semibold text-tinta">{nombre}</p>
        <p className="mt-0.5 text-[11.5px] text-tinta/55">{resumenDePrenda(prenda)}</p>
      </div>

      {prenda.colores.length > 1 && (
        <div role="radiogroup" aria-label={`Color de ${nombre}`} onKeyDown={alTecladoPuntos} className="relative z-10 flex flex-wrap items-center gap-1" onPointerLeave={() => setVistaPrevia(null)}>
          {aVista.map((c) => {
            const estado = c.stockTotal > 0 ? "piso" : c.almacenTotal > 0 ? "almacen" : "agotado";
            const activo = c.clave === elegido.clave;
            const detalle = estado === "almacen" ? ", solo en el almacén" : estado === "agotado" ? ", sin stock aquí" : "";
            return (
              <button
                key={c.clave}
                type="button"
                role="radio"
                aria-checked={activo}
                tabIndex={activo ? 0 : -1}
                data-color={c.clave}
                data-estado={estado}
                disabled={bloqueado}
                onClick={() => elegir(c)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setVistaPrevia(c.clave)}
                title={`${c.color ?? "Sin color"}${detalle}`}
                aria-label={`${c.color ?? "Sin color"}${detalle}`}
                className="vg-punto"
              >
                <i style={{ backgroundColor: estiloMosaicoColor(c.tallas[0]?.variante.colorHex)?.fondo ?? "var(--color-hueso)" }} />
              </button>
            );
          })}
          {resto > 0 && (
            <button
              type="button"
              onClick={() => onAbrir(prenda.clave, elegido.clave)}
              disabled={bloqueado}
              aria-label={`Ver los ${prenda.colores.length} colores de ${nombre}`}
              className="h-[1.625rem] min-w-[1.875rem] rounded-full border border-sand bg-crema px-1.5 text-[11px] font-semibold tabular-nums text-tinta/70 transition-colors duration-200 hover:bg-hueso"
            >
              +{resto}
            </button>
          )}
        </div>
      )}

      {/* Lo que falta elegir. `key` por color: al cambiar de color, las tallas entran en cascada corta. */}
      <div key={elegido.clave} className="relative z-10 flex min-h-8 flex-wrap gap-1" aria-label={prenda.tallaUnica ? undefined : "Tallas"}>
        {prenda.tallaUnica ? (
          <BotonAgregar color={elegido} bloqueado={bloqueado} onAgregar={onAgregar} />
        ) : (
          elegido.tallas.map((t, i) => (
            <CasillaTalla key={t.variante.varianteId} t={t} i={i} nombre={nombreColor} precioBase={elegido.precioMin} bloqueado={bloqueado} onAgregar={onAgregar} />
          ))
        )}
      </div>

      {/* `flex-wrap` + `whitespace-nowrap`: a 375 px la tarjeta mide ~140 px; si precio y stock no caben en una fila, el
          stock baja entero a la siguiente en vez de partirse encima del precio. */}
      <div className="pointer-events-none mt-auto flex flex-wrap items-end justify-between gap-x-2 pt-1">
        <span className="text-sm font-bold tabular-nums text-tinta">
          {elegido.precioMin === elegido.precioMax ? money(elegido.precioMin) : `desde ${money(elegido.precioMin)}`}
        </span>
        {/* En una tienda es solo el PISO del color elegido; en el Taller (sin almacén) es todo lo de la sede. */}
        <span className={`whitespace-nowrap text-[11px] tabular-nums ${piso === 0 && almacen > 0 ? "text-ambar-profundo" : piso === 0 ? "text-rojo-profundo" : "text-tinta/60"}`}>
          {piso > 0
            ? `${piso} ${elegido.separaPiso ? "en piso" : "en sede"}${almacen > 0 ? ` · ${almacen} alm.` : ""}`
            : almacen > 0
              ? `${almacen} en almacén`
              : "Sin stock"}
        </span>
      </div>

      {/* Tope de stock: velo rojo suave que respira dos veces y se apaga solo (`anim-tope`). El aviso de arriba es el que
          se lee con lector de pantalla. */}
      {pulsoTope !== null && (
        <span
          key={`tope-${pulsoTope}`}
          aria-hidden
          className="anim-tope pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl bg-rojo/[0.06] shadow-lg shadow-rojo/25 ring-1 ring-inset ring-rojo/50"
        >
          <span className="anim-tope-barrido absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-rojo/15 to-transparent" />
          <span className="label-cayla absolute top-3 left-3 rounded-full bg-papel/90 px-2 py-0.5 text-[10px] text-rojo-profundo">Máximo alcanzado</span>
        </span>
      )}

      {/* El globito se re-asienta cada vez que cambia la cantidad (`key`). */}
      {enCarrito > 0 && (
        <Badge key={`globo-${enCarrito}`} className="anim-pop pointer-events-none absolute top-2 right-2 z-20 h-6 min-w-6 rounded-full px-1.5 text-xs">
          {enCarrito}
        </Badge>
      )}
    </article>
  );
}

/** Prenda de talla única: el último toque es «Agregar» con el color a la vista (se ve lo que va a entrar al ticket). */
function BotonAgregar({ color, bloqueado, onAgregar }: { color: Color; bloqueado: boolean; onAgregar: (v: VarianteBusqueda) => void }) {
  const t = color.tallas[0];
  if (!t) return null;
  const motivo = motivoNoCobrable(t.variante);
  const base =
    "vg-entra label-cayla flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-[10.5px] transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-cayla)] active:translate-y-px";
  if (motivo === "cobrable")
    return (
      <button
        type="button"
        onClick={() => onAgregar(t.variante)}
        disabled={bloqueado}
        aria-label={`Agregar ${t.variante.referencia} ${color.color ?? ""}`.trim()}
        className={`${base} border-sand bg-crema text-tinta hover:border-tinta hover:bg-tinta hover:text-crema`}
      >
        <Plus aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{color.color ? `Agregar · ${color.color}` : "Agregar"}</span>
      </button>
    );
  // En el almacén de esta sede: tocarlo deja que `agregar()` ofrezca registrar la bajada (ADR-0321).
  if (motivo === "en_almacen")
    return (
      <button
        type="button"
        onClick={() => onAgregar(t.variante)}
        disabled={bloqueado}
        aria-label={`${t.variante.referencia} ${color.color ?? ""}: ${t.almacenAqui} en el almacén`.trim()}
        className={`${base} border-dashed border-ambar/60 text-ambar-profundo hover:bg-ambar/10`}
      >
        <span className="truncate">{t.almacenAqui} en el almacén</span>
      </button>
    );
  return (
    <span className={`${base} cursor-default border-dashed ${motivo === "apartada" ? "border-pizarra/50 text-pizarra" : "border-sand text-tinta/40"}`}>
      <span className="truncate">{motivo === "apartada" ? "Apartada" : "Sin stock aquí"}</span>
    </span>
  );
}

/**
 * Una talla del color elegido: tocarla AGREGA esa variante. Agotada se queda a la vista, tachada (no es lo mismo «no hay
 * M» que «no existe M»); con el piso en 0 y prendas en el almacén de esta sede no se tacha (D-40): punteada en ámbar y,
 * al tocarla, el aviso ofrece agregarla registrando la bajada (ADR-0321).
 */
function CasillaTalla({
  t,
  i,
  nombre,
  precioBase,
  bloqueado,
  onAgregar,
}: {
  t: Color["tallas"][number];
  i: number;
  nombre: string;
  precioBase: number;
  bloqueado: boolean;
  onAgregar: (v: VarianteBusqueda) => void;
}) {
  const estilo = { "--i": i } as CSSProperties;
  const base = "vg-entra label-cayla flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[11px]";
  if (t.stockAqui <= 0 && t.almacenAqui > 0)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            style={estilo}
            onClick={() => onAgregar(t.variante)}
            disabled={bloqueado}
            aria-label={`Talla ${t.talla} de ${nombre}: ${t.almacenAqui} en el almacén`}
            className={`${base} border-dashed border-ambar/60 text-ambar-profundo transition-[background-color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-ambar/10 active:translate-y-px`}
          >
            {t.talla}
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={4}>{`${t.almacenAqui} en el almacén · si la tienes en la mano, tócala: se registra la bajada`}</TooltipContent>
      </Tooltip>
    );
  if (t.stockAqui > 0)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            style={estilo}
            onClick={() => onAgregar(t.variante)}
            disabled={bloqueado}
            aria-label={`Agregar ${nombre} talla ${t.talla}`}
            className={`${base} border-sand bg-crema text-tinta transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-cayla)] hover:border-tinta hover:bg-tinta hover:text-crema active:translate-y-px`}
          >
            {t.talla}
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={4}>
          {[`${t.stockAqui} aquí`, textoOtrasSedes(t.variante.stockOtrasSedes ?? []), t.variante.precio !== precioBase ? money(t.variante.precio) : null].filter(Boolean).join(" · ")}
        </TooltipContent>
      </Tooltip>
    );
  // Sin piso: el tooltip dice dónde sí hay. `tabIndex` para leerlo con teclado; no es botón porque no agrega nada.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          style={estilo}
          aria-label={`Talla ${t.talla} ${motivoNoCobrable(t.variante) === "apartada" ? "apartada para un cliente" : "sin stock aquí"}`}
          className={`${base} border-dashed outline-none focus-visible:border-rojo/60 ${
            // Agotada: tachada. Apartada para un cliente: SIN tachar y en el token informativo.
            motivoNoCobrable(t.variante) === "apartada" ? "border-pizarra/50 text-pizarra" : "border-sand text-tinta/35 line-through"
          }`}
        >
          {t.talla}
        </span>
      </TooltipTrigger>
      <TooltipContent sideOffset={4}>{tooltipTallaSinPiso(t.variante, textoOtrasSedes(t.variante.stockOtrasSedes ?? []))}</TooltipContent>
    </Tooltip>
  );
}
