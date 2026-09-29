"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ComboResponsable } from "@/components/ComboResponsable";
import { firmaDeMitad, type FirmaDeMitad, type IdentidadDelAlta } from "@/lib/identidad-alta-reglas";
import type { ClaveSinResponsable } from "@/lib/responsable-omitido";
import type { ControlResponsable } from "@/lib/useResponsable";

// Quien abre «Nueva prenda» se identifica UNA vez, arriba, y esa identidad firma la prenda y todo lo que crea a mitad de camino
// (un tejido, un color, una marca, una talla…). La regla y su porqué: `lib/identidad-alta-reglas.ts` (Felipe, 2026-09-29).
//
// El estado vive en `useResponsable` dentro de `NuevoProductoForm`, así que salir de la pantalla lo acaba; este archivo solo lo
// reparte por contexto a los componentes del alta, para que ninguno pinte su propio combo ni reciba la identidad de mano en mano.

const Contexto = createContext<IdentidadDelAlta | null>(null);

/** Envuelve el formulario del alta. Los componentes de adentro piden su firma con `useFirmaDeMitad`. */
export function IdentidadAltaProveedor({ control, children }: { control: ControlResponsable; children: ReactNode }) {
  return <Contexto.Provider value={control}>{children}</Contexto.Provider>;
}

/**
 * La firma de un guardado de mitad de formulario. Dentro del alta es la persona que la inició (y `listo` es falso hasta que
 * haya una); fuera del alta —la marca nueva desde Marcas, el color desde la ficha de un producto— sigue como el ADR-0280: sin
 * combo y con la clave de la acción. Un componente nuevo que guarde a mitad del alta pide su firma acá, no pinta otro combo.
 */
export function useFirmaDeMitad(clave: ClaveSinResponsable): FirmaDeMitad {
  return firmaDeMitad(useContext(Contexto), clave);
}

/** Anclaje al que apunta «Elegir / Cambiar» del paso 4 y el aviso de los guardados de mitad. */
export const ID_QUIEN_REGISTRA = "quien-registra";

/** Lleva la vista al recuadro de «Quién registra» (el único combo del alta). */
export function irAQuienRegistra() {
  document.getElementById(ID_QUIEN_REGISTRA)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * El único combo «Responsable» de «Nueva prenda», arriba de los pasos: donde la persona empieza, antes de crear nada a mitad
 * de camino. Con la cuenta de una persona de turno viene ya elegida ella; con una terminal, vacío hasta que se elige.
 */
export function QuienRegistra({ control, deshabilitado = false }: { control: ControlResponsable; deshabilitado?: boolean }) {
  return (
    <section id={ID_QUIEN_REGISTRA} aria-labelledby="quien-registra-titulo" className="rounded-xl border border-sand bg-papel px-4 py-3.5 sm:px-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 id="quien-registra-titulo" className="text-[13px] font-semibold text-tinta">
          Quién registra
        </h2>
        <span className="text-[12px] leading-snug text-taupe">
          La prenda y lo que crees mientras la llenas (tejidos, colores, marcas…) quedan a su nombre. Se pide una sola vez.
        </span>
      </div>
      <ComboResponsable control={control} deshabilitado={deshabilitado} className="max-w-sm" />
    </section>
  );
}

/**
 * Una línea que explica por qué un botón de guardar a mitad del alta está apagado, con la salida: subir al recuadro. Solo
 * aparece dentro del alta y solo mientras falta la identidad; en cualquier otro lugar no pinta nada.
 */
export function AvisoSinIdentidad({ firma, enHoja = false, className = "" }: { firma: FirmaDeMitad; /** Dentro de una hoja (`Modal`) el recuadro queda detrás del velo: se dice qué falta, sin enlace. */ enHoja?: boolean; className?: string }) {
  if (firma.listo) return null;
  return (
    <p role="status" className={`text-[12.5px] text-ambar-profundo ${className}`}>
      {firma.motivo}
      {!enHoja && (
        <>
          {" "}
          <button type="button" onClick={irAQuienRegistra} className="btn-cayla btn-enlace text-[12.5px]">
            Ir a elegir
          </button>
        </>
      )}
    </p>
  );
}
