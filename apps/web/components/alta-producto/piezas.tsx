"use client";

import type { ReactNode } from "react";
import { EtiquetaAhora, MarcaCampo, VozDelEstado } from "@/components/alta-producto/guia";
import type { CampoAlta, EstadoCampo } from "@/lib/alta-producto-guia";

// Piezas compartidas del formulario "Nuevo producto" (ADR-0109).
//
// Regla de marca (globals.css): el rojo es acento, máx. 2 por pantalla. El
// formulario anterior pintaba de rojo cada chip elegido; acá "elegido" se
// dice con tinta (borde y fondo oscuros suaves + marca ✓), el rojo queda para
// lo que bloquea, y el ámbar para lo que avisa pero deja seguir.

/** Un paso del recorrido. Cerrado = se ve atenuado y no se puede tocar, pero NO se oculta: la persona ve el camino completo. */
export function Bloque({
  numero,
  titulo,
  ayuda,
  bloqueado = false,
  bloqueadoTexto,
  listo = false,
  derecha,
  children,
}: {
  numero: number;
  titulo: string;
  ayuda?: ReactNode;
  bloqueado?: boolean;
  /** Qué falta para abrir este paso, en la voz de la persona ("Elige primero la categoría"). */
  bloqueadoTexto?: string;
  listo?: boolean;
  derecha?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`bloque-${numero}`}
      className={`card-cayla p-5 transition-opacity ${bloqueado ? "opacity-55" : ""}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums ${
              listo ? "border-verde bg-verde text-crema" : "border-tinta/30 text-tinta/70"
            }`}
          >
            {listo ? "✓" : numero}
          </span>
          <div>
            <h2 id={`bloque-${numero}`} className="label-cayla text-[11px] text-tinta/80">
              {titulo}
            </h2>
            {ayuda && !bloqueado && <p className="mt-1 text-xs text-tinta/60">{ayuda}</p>}
            {bloqueado && bloqueadoTexto && <p className="mt-1 text-xs text-tinta/60">{bloqueadoTexto}</p>}
          </div>
        </div>
        {derecha && !bloqueado && <div className="shrink-0">{derecha}</div>}
      </header>
      {/* `inert`: un bloque cerrado no recibe foco ni clics, ni con teclado. */}
      <div className={bloqueado ? "hidden" : "mt-4"} {...(bloqueado ? { inert: true } : {})}>
        {children}
      </div>
    </section>
  );
}

/** El chip de elegir/desmarcar. `aria-pressed` para que un lector de pantalla diga "activado". */
export function ChipOpcion({
  elegido,
  onClick,
  children,
  className = "",
  disabled = false,
}: {
  elegido: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={elegido}
      disabled={disabled}
      className={`flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${
        elegido ? "border-tinta bg-tinta/[0.07] text-tinta" : "border-tinta/15 text-tinta/75 hover:border-tinta/40"
      } ${className}`}
    >
      {elegido && (
        <span aria-hidden className="text-[11px] leading-none">
          ✓
        </span>
      )}
      {children}
    </button>
  );
}

type TonoAvisoInline = "rojo" | "ambar" | "neutro";

const TONOS: Record<TonoAvisoInline, string> = {
  rojo: "border-rojo/40 bg-rojo/[0.05] text-rojo-profundo",
  ambar: "border-ambar/40 bg-ambar/[0.06] text-ambar-profundo",
  neutro: "border-tinta/15 bg-tinta/[0.03] text-tinta/75",
};

/** Franja de aviso dentro de un bloque. `role=alert` solo cuando bloquea. */
export function AvisoInline({ tono, children, alerta = false }: { tono: TonoAvisoInline; children: ReactNode; alerta?: boolean }) {
  return (
    <div role={alerta ? "alert" : "status"} className={`rounded-md border px-3 py-2.5 text-sm ${TONOS[tono]}`}>
      {children}
    </div>
  );
}

/**
 * Un paso del alta en acordeón (spike 2026-09-24; 4 preguntas desde el spike v2 del 2026-09-28): reemplaza a `Bloque` en
 * Nuevo producto. Solo uno está abierto; el hecho se pliega en UNA línea con su resumen y «Cambiar»; el que viene es una
 * línea punteada, sin texto que leer. El paso abierto lleva abajo su `pie`: qué le falta (o «Listo…», en verde) y la
 * acción que lo cierra —«Seguir →» en los pasos 2 y 3, «Crear producto» en el 4—. El 1 no lleva pie: avanza solo al
 * elegir la categoría.
 */
export function PasoAlta({
  numero,
  titulo,
  estado,
  resumen,
  onAbrir,
  pie,
  children,
}: {
  numero: number;
  titulo: string;
  estado: "abierto" | "hecho" | "pendiente";
  /** La línea del paso plegado («Blusa Lirio · CAYLA · Popelina · Liso»). */
  resumen?: ReactNode;
  onAbrir: () => void;
  /** `texto`: lo primero que falta, o la frase de «listo» (`listo` la pinta en verde). `accion`: el botón que cierra el paso.
   *  `faltan`: «Falta: Marca · Tejido…» tocable (ADR-0284); si viene y el paso no está listo, reemplaza a `texto` a la vista y
   *  `texto` queda solo para el lector de pantalla. */
  pie?: { texto: string; listo: boolean; accion: ReactNode; faltan?: ReactNode };
  children: ReactNode;
}) {
  const id = `paso-${numero}`;
  if (estado === "hecho") {
    return (
      <section aria-labelledby={id} className="scroll-mt-24 rounded-xl border border-sand bg-papel">
        <button type="button" onClick={onAbrir} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-3.5 text-left sm:flex-nowrap sm:px-5">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde text-[11px] text-crema">
            ✓
          </span>
          <h2 id={id} className="flex-1 text-[14.5px] font-semibold text-tinta sm:flex-none">
            {titulo}
          </h2>
          <span className="order-3 w-full min-w-0 truncate pl-9 text-[13px] text-taupe sm:order-none sm:w-auto sm:flex-1 sm:pl-0 sm:text-[13.5px]">{resumen}</span>
          <span className="btn-cayla btn-enlace shrink-0 text-[12.5px]">Cambiar</span>
        </button>
      </section>
    );
  }
  if (estado === "pendiente") {
    return (
      <section aria-labelledby={id} className="scroll-mt-24 rounded-xl border border-dashed border-sand">
        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-tinta/25 text-[11px] tabular-nums text-tinta/60">
            {numero}
          </span>
          <h2 id={id} className="text-[14.5px] font-medium text-tinta/45">
            {titulo}
          </h2>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby={id} className="scroll-mt-24 rounded-xl border border-sand bg-papel">
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tinta text-[11px] tabular-nums text-crema">
          {numero}
        </span>
        <h2 id={id} className="text-[14.5px] font-semibold text-tinta">
          {titulo}
        </h2>
      </div>
      {/* La entrada SIN `fill-mode: both` (a diferencia de `anim-revelar`): terminada, no le deja un `transform` puesto al
          contenedor. Si se lo dejara, las listas en `position: fixed` de adentro (ComboBuscable, el combo Responsable) se
          medirían contra este cuadro y no contra la ventana, y abrirían corridas lejos de su campo. */}
      <div className="px-4 pb-5 pt-3 [animation:cayla-revelar_240ms_var(--ease-cayla)] sm:pl-14 sm:pr-5">
        {children}
        {pie && (
          // Pegado al borde de abajo de la ventana mientras el paso siga más abajo (ADR-0284): el paso 3 mide varias pantallas, y
          // el «qué falta» y el «Seguir →» no pueden quedar enterrados al fondo. Sale de los márgenes del contenido (`-mx`) y
          // se pega al fondo de la tarjeta (`-mb-5`) para que, en su lugar natural, no deje un hueco. Solo desde `lg`: en celular
          // la barra de la ficha ya va pegada abajo con su «Siguiente: …» tocable, y las dos juntas taparían un cuarto de la pantalla.
          <div data-pie-alta className="z-10 lg:sticky lg:bottom-0 -mx-4 -mb-5 mt-5 flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-sand bg-papel px-4 py-3.5 sm:-ml-14 sm:-mr-5 sm:pl-14 sm:pr-5">
            {pie.faltan && !pie.listo ? (
              <>
                <p role="status" className="sr-only">
                  {pie.texto}
                </p>
                {pie.faltan}
              </>
            ) : (
              <p role="status" className={`mr-auto text-[12.5px] ${pie.listo ? "text-verde" : "text-taupe"}`}>
                {pie.texto}
              </p>
            )}
            {pie.accion}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Un campo dentro de un paso (spike v2, 2026-09-28): el título ARRIBA y su ayuda al lado, en la misma línea; los controles
 * debajo, a todo el ancho. Antes el título iba en una columna de 8rem a la izquierda y le robaba ancho a las muestras de
 * tejido y a la tabla. Sin «obligatorio» en rojo: casi todo lo es, así que la ayuda marca lo opcional («Opcional · …») y
 * el rojo queda para los errores.
 *
 * «El hilo» (ADR-0284): con `campo` y `estado`, el título lleva a su izquierda una marca (hecho, sigue aquí, falta, opcional) y
 * el campo que sigue se tiñe y dice «Sigue aquí». Sin ellos, la fila se dibuja como siempre.
 */
export function FilaAlta({
  etiqueta,
  ayuda,
  accion,
  campo,
  estado,
  children,
}: {
  etiqueta: string;
  ayuda?: ReactNode;
  /** A la derecha del título (atajos). */
  accion?: ReactNode;
  campo?: CampoAlta;
  estado?: EstadoCampo;
  children: ReactNode;
}) {
  const titulo = (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {campo && estado && (
        <span className="self-center">
          <MarcaCampo estado={estado} />
        </span>
      )}
      <span className="text-[13px] font-semibold text-tinta">
        {estado && <VozDelEstado estado={estado} />}
        {etiqueta}
      </span>
      {estado === "ahora" && <EtiquetaAhora />}
      {ayuda && <span className="text-[12px] leading-snug text-taupe">{ayuda}</span>}
      {accion && <span className="ml-auto">{accion}</span>}
    </div>
  );
  if (!campo || !estado) {
    return (
      <div className="border-t border-sand py-3.5 first:border-t-0 first:pt-0.5">
        {titulo}
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div data-campo={campo} data-estado={estado} className="hilo-fila scroll-mt-24">
      <div className="hilo-fila-in">
        {titulo}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/**
 * Un grupo opcional y plegable («Temporada y etiquetas · opcional»); quien lo usa decide si arranca abierto. Plegado,
 * la línea dice qué se eligió («— Verano, 2 etiquetas»): nadie tiene que abrirlo para saber si ya lo llenó. Lo de
 * adentro se desmonta al plegar, así que su estado tiene que vivir en el formulario (las etiquetas propuestas ya viven
 * ahí por eso).
 */
export function PlegableAlta({
  titulo,
  resumen,
  abierto,
  onAlternar,
  children,
}: {
  titulo: string;
  /** Lo elegido adentro, o null si nada. */
  resumen: string | null;
  abierto: boolean;
  onAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-sand pt-3">
      <button type="button" onClick={onAlternar} aria-expanded={abierto} className="flex w-full items-baseline gap-2 text-left text-[13px] font-semibold text-tinta">
        <span
          aria-hidden
          className={`inline-block transition-transform duration-200 [transition-timing-function:var(--ease-cayla)] motion-reduce:transition-none ${abierto ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {titulo}
        <span className="font-normal text-taupe">
          · opcional
          {resumen && (
            <>
              {" — "}
              <b className="font-semibold text-tinta">{resumen}</b>
            </>
          )}
        </span>
      </button>
      {abierto && <div className="mt-1.5 [animation:cayla-revelar_240ms_var(--ease-cayla)]">{children}</div>}
    </div>
  );
}
