"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Boton } from "@/components/ui/campos";
import { soles } from "@/lib/compras-reglas";
import { useContar } from "@/lib/useContar";
import type { AyudaCosto, Requisito } from "@/lib/compra-form-progreso";

// Las piezas que le dan vida al formulario «Registrar comprobante» (CompraFormV2). Todas son PRESENTACIÓN: la lógica
// (qué falta, cuánto avanzó, cómo se compara un costo) vive en `lib/compra-form-progreso.ts` y se decide allá; estas
// piezas solo la dibujan. Los estilos y keyframes están en `app/estilos/comprobantes-registro.css`.

const RUTA_VISTO = "m5 12.5 4.5 4.5L19 7.5";

/** El tilde. `pathLength=1` deja que el CSS lo dibuje sin medir nada (ver `.cr-visto`). */
function Visto({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={2.6} className={`cr-visto ${className}`} aria-hidden>
      <path pathLength={1} d={RUTA_VISTO} />
    </svg>
  );
}

/**
 * El número del tramo (1 Documento · 2 Líneas · 3 Pago). Cuando el tramo queda completo el número cede su lugar a un
 * visto verde que se dibuja. El svg solo existe mientras el tramo está listo, así el trazo corre justo al cumplirse
 * y no cada vez que se vuelve a pintar el formulario.
 */
export function NumeroTramo({ n, listo }: { n: number; listo: boolean }) {
  return (
    <>
      <span aria-hidden className="cr-num" data-listo={listo}>
        {listo ? <Visto className="h-3 w-3" /> : n}
      </span>
      {listo && <span className="sr-only">(completo)</span>}
    </>
  );
}

/** «Listo N de 4» y la barra fina que se llena. */
export function BarraProgreso({ listos, total }: { listos: number; total: number }) {
  return (
    <div className="col-span-full">
      <p className="label-cayla text-right text-[11px] text-tinta/65">
        Listo {listos} de {total}
      </p>
      <div className="cr-progreso mt-2" role="progressbar" aria-label="Avance del comprobante" aria-valuemin={0} aria-valuemax={total} aria-valuenow={listos}>
        <i style={{ "--p": total > 0 ? listos / total : 0 } as CSSProperties} />
      </div>
    </div>
  );
}

/**
 * Lo que falta para poder registrar, junto al botón. Es una VISTA de `requisitosDeCompra`: no valida nada por su
 * cuenta. El punto de cada requisito se vuelve a montar (`key`) solo cuando ese requisito cambia de estado, por eso
 * el pop suave le toca únicamente al que acaba de cumplirse y no a los cuatro en cada tecla.
 */
export function ListaPendientes({ id, requisitos }: { id: string; requisitos: readonly Requisito[] }) {
  return (
    <ul id={id} aria-label="Lo que falta para registrar" className="space-y-1.5 border-t border-sand pt-3">
      {requisitos.map((r) => (
        <li key={r.clave} className={`flex items-start gap-2 text-xs leading-snug transition-colors duration-300 ${r.ok ? "text-tinta" : "text-tinta/65"}`}>
          <span key={r.ok ? "ok" : "pendiente"} aria-hidden className="cr-pt" data-ok={r.ok}>
            {r.ok && <Visto className="" />}
          </span>
          <span className="min-w-0">
            <span className="sr-only">{r.ok ? "Listo: " : "Falta: "}</span>
            {r.texto}
            {!r.ok && r.falta && <span className="anim-revelar block text-[11px] text-ambar-profundo">{r.falta}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const FORMATO_CIFRA = {
  soles: (v: number) => soles(v),
  porcentaje: (v: number) => `${Math.round(v)} %`,
} as const;

/**
 * Una cifra del resumen que CUENTA hasta su valor nuevo. Duración corta (400 ms): el total se recalcula con cada
 * tecla en el costo, y un conteo largo se quedaría siempre atrasado respecto de lo que la persona escribe.
 * `useContar` cancela el conteo anterior y arranca desde lo que se ve en pantalla, así que dos cambios seguidos no
 * compiten. El lector de pantalla oye siempre el valor final, nunca los números intermedios.
 */
export function CifraCompra({ valor, formato = "soles" }: { valor: number; formato?: keyof typeof FORMATO_CIFRA }) {
  const mostrado = useContar(valor, 400);
  return (
    <>
      <span aria-hidden>{FORMATO_CIFRA[formato](mostrado)}</span>
      <span className="sr-only">{FORMATO_CIFRA[formato](valor)}</span>
    </>
  );
}

/**
 * Un texto del resumen que «se asienta» cuando cambia (el gesto `anim-asentar` de globals.css). No anima al
 * montarse: solo responde a un cambio posterior. Cambiar el `key` es lo que reinicia la animación.
 */
export function TextoQueSeAsienta({ valor }: { valor: string }) {
  const [previo, setPrevio] = useState(valor);
  const [cambios, setCambios] = useState(0);
  // Estado derivado ajustado en el render (mismo patrón que `totalPrevio` en CompraFormV2), no en un efecto.
  if (valor !== previo) {
    setPrevio(valor);
    setCambios(cambios + 1);
  }
  return (
    <span key={cambios} className={cambios > 0 ? "anim-asentar inline-block" : undefined}>
      {valor}
    </span>
  );
}

/**
 * La ayuda bajo el costo unitario de una línea: el costo que el catálogo ya conoce de esa prenda («Costo actual
 * S/ 40 · Usar») o cuánto se aparta de él («↑ 12 % vs costo actual»). Reserva su alto en pantallas anchas para que
 * la fila no salte al aparecer. Aparece con un revelado corto solo la primera vez; mientras se tipea el costo el
 * texto cambia sin animarse (el campo que la persona está usando no se anima en cada tecla).
 */
export function AyudaCostoLinea({ ayuda, onUsar }: { ayuda: AyudaCosto | null; onUsar: () => void }) {
  if (!ayuda) return <span key="vacio" className="block sm:min-h-[14px]" />;
  const tono = ayuda.tipo === "sube" ? "text-ambar-profundo" : ayuda.tipo === "baja" ? "text-verde-profundo" : "text-tinta/60";
  let contenido: ReactNode;
  if (ayuda.tipo === "usar") {
    contenido = (
      <>
        Costo actual {soles(ayuda.ultimo)} ·{" "}
        <button type="button" onClick={onUsar} className="text-rojo underline-offset-2 hover:underline">
          Usar
        </button>
      </>
    );
  } else if (ayuda.tipo === "igual") {
    contenido = <>Igual al costo actual ({soles(ayuda.ultimo)})</>;
  } else {
    contenido = (
      <>
        {ayuda.tipo === "sube" ? "↑" : "↓"} {ayuda.pct} % vs costo actual {soles(ayuda.ultimo)}
      </>
    );
  }
  return (
    <span key="ayuda" className={`anim-revelar block text-right text-[11px] leading-tight transition-colors duration-200 sm:min-h-[14px] ${tono}`}>
      {contenido}
    </span>
  );
}

export type EstadoRegistro = "reposo" | "cargando" | "hecho";

/**
 * «Registrar»: texto → giro mientras la base trabaja → visto que se dibuja al quedar registrado. Está deshabilitado
 * hasta que se cumplen los cuatro requisitos; la lista de pendientes (`describe`) dice qué falta. Reusa `Boton`,
 * así que conserva su foco, su tamaño y su barrido; los estados de color se fuerzan con `!` porque el `disabled:` de
 * `Boton` (gris) ganaría al color mientras está cargando o ya hecho.
 */
export function BotonRegistrar({ estado, habilitado, describe, children }: { estado: EstadoRegistro; habilitado: boolean; describe: string; children: ReactNode }) {
  const colorForzado = estado === "hecho" ? "bg-verde!" : estado === "cargando" ? "bg-tinta!" : "";
  return (
    <Boton type="submit" peso="primario" disabled={!habilitado || estado !== "reposo"} aria-describedby={describe} aria-busy={estado === "cargando"} className={`w-full ${colorForzado}`}>
      <span className="cr-boton" data-estado={estado}>
        <span className="cr-boton-txt">{children}</span>
        <span aria-hidden className="cr-boton-capa cr-boton-giro">
          <i className="cr-giro" />
        </span>
        <span aria-hidden className="cr-boton-capa cr-boton-hecho">
          <Visto className="" />
        </span>
      </span>
    </Boton>
  );
}
