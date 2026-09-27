"use client";

import type { ReactNode } from "react";

/* ====================================================================
   Las imágenes de la Guía de impresión (2026-09-26).

   Dos clases de imagen, a propósito:
   - FOTO REAL (Windows): las pantallas de la computadora de la tienda donde la Brother YA imprimió bien, fotografiadas
     por Felipe el 2026-09-26 (`public/guia-impresion/`). Son la configuración exacta que funcionó, no una genérica
     sacada de internet: una captura de la web mostraría otro Windows, otro driver u otro idioma, y su uso no es nuestro.
   - MAQUETA (Mac, menú de Chrome, la pantalla del ERP): no hay foto de la tienda, así que se dibuja la ventana con los
     tokens de la paleta. Dice los mismos rótulos que la ventana real, pero no imita sus colores.

   En las dos, cada número sobre la imagen es un clic, y es el mismo número de la instrucción de al lado: al pasar el
   mouse por una, se enciende la otra (`activa`). El encendido es respuesta a una acción (200 ms, `--ease-cayla`), nunca
   un latido en bucle (ADR-0136).
   ==================================================================== */

export type Marca = { n: number; x: number; y: number };

type Resaltar = { activa: number | null; onActiva: (n: number | null) => void };

/** El número sobre la imagen. Las demás van en tinta; la que se está leyendo, en rojo y un poco más grande. */
export function Numero({ n, activa, onActiva, className = "" }: { n: number; className?: string } & Resaltar) {
  const encendida = activa === n;
  return (
    <button
      type="button"
      aria-label={`Clic ${n}`}
      onMouseEnter={() => onActiva(n)}
      onMouseLeave={() => onActiva(null)}
      onFocus={() => onActiva(n)}
      onBlur={() => onActiva(null)}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums text-crema ring-offset-0 transition-[transform,background-color,box-shadow] duration-200 ease-[var(--ease-cayla)] motion-reduce:transition-none ${
        encendida ? "scale-125 bg-rojo shadow-[0_0_0_5px_color-mix(in_oklab,var(--color-rojo)_28%,transparent)]" : "bg-tinta shadow-[0_0_0_2px_var(--color-crema)]"
      } ${className}`}
    >
      {n}
    </button>
  );
}

/** Foto real con sus números encima. `x`/`y` son porcentajes medidos sobre la foto recortada. */
export function FotoConMarcas({
  src,
  alt,
  ancho,
  alto,
  marcas,
  activa,
  onActiva,
  pie,
}: {
  src: string;
  alt: string;
  ancho: number;
  alto: number;
  marcas: Marca[];
  pie?: ReactNode;
} & Resaltar) {
  return (
    <figure className="space-y-1.5">
      <div className="relative overflow-hidden rounded-xl border border-sand bg-tinta">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto fija de /public, sin optimizador: así se ve igual sin red a Vercel */}
        <img src={src} alt={alt} width={ancho} height={alto} className="block h-auto w-full" />
        {marcas.map((m) => (
          <span key={m.n} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.x}%`, top: `${m.y}%` }}>
            <Numero n={m.n} activa={activa} onActiva={onActiva} />
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-taupe-profundo">
        <span>{pie ?? "Foto real de la computadora de la tienda."}</span>
        <a href={src} target="_blank" rel="noreferrer" className="underline decoration-taupe/40 underline-offset-2 hover:text-tinta">
          Ver foto grande
        </a>
      </figcaption>
    </figure>
  );
}

/* ---------- Maquetas ---------- */

/** El marco de una ventana dibujada. `mac` pone los tres puntos de la esquina; si no, la barra lleva solo el título. */
export function Ventana({ titulo, mac = false, children, pie }: { titulo: ReactNode; mac?: boolean; children: ReactNode; pie?: ReactNode }) {
  return (
    <figure className="space-y-1.5">
      <div className="overflow-hidden rounded-xl border border-sand bg-papel text-[13px] text-tinta">
        <div className="flex items-center gap-2 border-b border-sand bg-hueso/70 px-3 py-2">
          {mac && (
            <span aria-hidden className="flex gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-rojo/70" />
              <i className="h-2.5 w-2.5 rounded-full bg-ambar/60" />
              <i className="h-2.5 w-2.5 rounded-full bg-verde/60" />
            </span>
          )}
          <span className={`text-xs font-semibold text-tinta/80 ${mac ? "mx-auto pr-12" : ""}`}>{titulo}</span>
        </div>
        <div className="p-4">{children}</div>
      </div>
      <figcaption className="text-xs text-taupe-profundo">{pie ?? "Dibujo de referencia: los rótulos son los mismos que verás en tu pantalla."}</figcaption>
    </figure>
  );
}

/** Un renglón «Rótulo: [control]» de un diálogo, con su número a la izquierda si es un clic. */
export function Renglon({
  rotulo,
  children,
  marca,
  activa,
  onActiva,
}: { rotulo: ReactNode; children: ReactNode; marca?: number } & Resaltar) {
  const encendido = marca !== undefined && activa === marca;
  return (
    <div
      className={`grid grid-cols-[1.5rem_8.5rem_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-1 transition-colors duration-200 motion-reduce:transition-none ${
        encendido ? "bg-rojo/[0.07]" : ""
      }`}
    >
      <span>{marca !== undefined && <Numero n={marca} activa={activa} onActiva={onActiva} />}</span>
      <span className="text-right text-tinta/70">{rotulo}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Un control suelto (un botón, una opción de menú) con su número al lado. */
export function ConNumero({ n, children, activa, onActiva }: { n: number; children: ReactNode } & Resaltar) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-md p-0.5 transition-colors duration-200 motion-reduce:transition-none ${activa === n ? "bg-rojo/[0.07]" : ""}`}>
      <Numero n={n} activa={activa} onActiva={onActiva} />
      {children}
    </span>
  );
}

/** Un control dibujado: combo (con flecha), campo o botón. `valor` es lo que tiene que quedar escrito o elegido. */
export function Control({ children, tipo = "combo", resaltado = false }: { children: ReactNode; tipo?: "combo" | "campo" | "boton"; resaltado?: boolean }) {
  const base = "inline-flex min-h-7 items-center gap-2 rounded-md border px-2.5 py-1 text-[13px]";
  const borde = resaltado ? "border-rojo/60 bg-papel font-semibold text-tinta" : "border-sand bg-hueso/60 text-tinta";
  if (tipo === "boton") return <span className={`${base} ${resaltado ? "border-tinta bg-tinta font-semibold text-crema" : "border-sand bg-papel"}`}>{children}</span>;
  return (
    <span className={`${base} ${borde} ${tipo === "combo" ? "min-w-[9rem] justify-between" : "min-w-[4.5rem]"}`}>
      <span className="truncate">{children}</span>
      {tipo === "combo" && <span aria-hidden className="text-[10px] text-tinta/50">▾</span>}
    </span>
  );
}

/** La lista desplegada de un combo, con la opción que hay que elegir marcada. */
export function ListaAbierta({ opciones, elegida }: { opciones: (string | null)[]; elegida: string }) {
  return (
    <span className="mt-1 block w-full max-w-[17rem] overflow-hidden rounded-md border border-sand bg-papel py-1 text-[13px]">
      {opciones.map((o, i) =>
        o === null ? (
          <span key={i} className="my-1 block border-t border-sand" />
        ) : (
          <span key={o} className={`block px-3 py-1 ${o === elegida ? "bg-tinta font-semibold text-crema" : "text-tinta/75"}`}>
            {o}
          </span>
        ),
      )}
    </span>
  );
}

/** La ruta de clics que no tiene foto propia: «Inicio › Configuración › …», cada tramo con su número. */
export function RutaDeClics({ tramos, activa, onActiva }: { tramos: { n: number; texto: string }[] } & Resaltar) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-xl border border-sand bg-papel px-3 py-2.5 text-[13px]">
      {tramos.map((t, i) => (
        <li key={t.n} className="flex items-center gap-1.5">
          <Numero n={t.n} activa={activa} onActiva={onActiva} />
          <span className={activa === t.n ? "font-semibold text-tinta" : "text-tinta/80"}>{t.texto}</span>
          {i < tramos.length - 1 && <span aria-hidden className="px-0.5 text-taupe">›</span>}
        </li>
      ))}
    </ol>
  );
}
