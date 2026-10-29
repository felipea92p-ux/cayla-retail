"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { acotarVarias, rangoDeVarias, textoIgnoradas } from "@/lib/lectura-repetida";

/* ====================================================================
   AvisoRepetida · «¿Quieres volver a agregar esta prenda?» (ADR-0562, Felipe 2026-10-28, dirección A de
   docs/maquetas/escaneo-repetido-2026-10/).

   La misma prenda leída otra vez no suma sola: esta pieza pregunta, bajo el campo de escaneo (o en la bandeja de la cámara),
   con lo que lleva de ESA prenda (1 → 2). Es un `<Aviso tono="atencion">`, la misma forma de «La tengo en la mano».

   Lo que cuida y una pantalla no tiene que repetir:
   · se responde TOCANDO: ningún botón toma el foco al aparecer, así el Enter con que la pistola remata cada código no puede
     decir «Sí» (la pistola, con `fuera: "atraer"`, devuelve sus teclas al campo de escaneo);
   · «Sí» y «No» pesan igual (se contesta mirando la prenda, no la pantalla);
   · «Son varias iguales» abre «¿Cuántas tienes en total?», del siguiente número al tope; si en ese número cae una lectura de la
     pistola (más de 6 caracteres), se le pasa a `onCodigo` en vez de tomarla por cantidad.
   La regla (cuándo preguntar, qué se ignora) vive en lib/lectura-repetida.ts; la pantalla decide qué hace cada respuesta.
   ==================================================================== */

export function AvisoRepetida({
  nombre,
  lleva,
  ignoradas,
  tope,
  onSi,
  onNo,
  onVarias,
  onCodigo,
  className = "",
}: {
  /** «Blusa Emma · M · Beige». */
  nombre: string;
  /** Cuántas lleva de esta prenda ahora (antes de responder). */
  lleva: number;
  /** Lecturas de la misma etiqueta que se ignoraron mientras se pregunta. */
  ignoradas: number;
  /** Hasta cuántas admite («Son varias iguales» no pasa de aquí); `null` sin tope. */
  tope: number | null;
  onSi: () => void;
  onNo: () => void;
  /** «Son varias iguales» → «Poner N»: el total de esa prenda. Sin él, no se ofrece. */
  onVarias?: (total: number) => void;
  /** Lo que la pistola escribió en «¿Cuántas tienes en total?». */
  onCodigo?: (codigo: string) => void;
  className?: string;
}) {
  const rango = onVarias ? rangoDeVarias(lleva, tope) : null;
  const [varias, setVarias] = useState(false);
  const [texto, setTexto] = useState(String(rango?.min ?? lleva + 1));
  const valor = rango ? acotarVarias(Number(texto), rango) : lleva + 1;

  function poner() {
    if (!rango || !onVarias) return;
    onVarias(valor);
  }

  return (
    <Aviso tono="atencion" className={className} titulo="¿Quieres volver a agregar esta prenda?">
      <p>
        <span className="font-semibold">{nombre}</span> ya está en la lista.
      </p>
      <div className="mt-2.5 inline-flex flex-col rounded-xl border border-sand bg-papel px-4 py-2">
        <span className="label-cayla text-[10px] text-taupe">Llevas de esta prenda</span>
        <span className="mt-0.5 flex items-center gap-2 font-display text-3xl leading-none tabular-nums">
          <span className="text-tinta/70">{lleva}</span>
          <ArrowRight aria-hidden className="h-3.5 w-3.5 text-tinta/50" />
          <span className="font-semibold text-ambar">{lleva + 1}</span>
          <span className="font-sans text-xs text-taupe">si la agregas</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-cayla btn-secundario h-11" onClick={onSi}>
          Sí, agregar otra
        </button>
        <button type="button" className="btn-cayla btn-secundario h-11" onClick={onNo}>
          No, fue la misma
        </button>
        {rango && !varias && (
          <button
            type="button"
            className="btn-cayla btn-sutil btn-chico h-11"
            onClick={() => {
              setTexto(String(rango.min));
              setVarias(true);
            }}
          >
            Son varias iguales
          </button>
        )}
      </div>
      {rango && varias && (
        <div className="anim-revelar mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-borde-control bg-papel px-3 py-2.5">
          <span className="min-w-0 flex-1 basis-44 text-sm text-tinta">
            ¿Cuántas tienes <span className="font-semibold">en total</span>?
            {tope !== null && <span className="text-taupe"> (hay {tope} en el almacén)</span>}
          </span>
          <PasoCantidad
            menos={{ onClick: () => setTexto(String(valor - 1)), deshabilitado: valor <= rango.min, etiqueta: "Una menos" }}
            mas={{ onClick: () => setTexto(String(valor + 1)), deshabilitado: valor >= rango.max, etiqueta: "Una más" }}
            campo={{
              type: "text",
              inputMode: "numeric",
              "aria-label": `Cuántas ${nombre} tienes en total`,
              value: texto,
              onFocus: (e) => e.currentTarget.select(),
              onChange: (e) => setTexto(e.target.value),
              onBlur: () => setTexto(String(valor)),
              onKeyDown: (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const escrito = e.currentTarget.value.trim();
                // Más de 6 caracteres no es una cantidad: es la pistola, que escribió aquí.
                if (escrito.length > 6) {
                  setTexto(String(rango.min));
                  onCodigo?.(escrito);
                  return;
                }
                poner();
              },
            }}
          />
          <button type="button" className="btn-cayla btn-primario btn-chico h-11" onClick={poner}>
            Poner {valor}
          </button>
        </div>
      )}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-taupe">
        {ignoradas > 0 && <Chip tono="ambar">{textoIgnoradas(ignoradas)}</Chip>}
        <span>
          {/* El Esc solo existe con teclado: en el celular no se promete. */}
          <span className="hidden pointer-fine:inline">Esc = No · </span>
          Escanear otra prenda también es «No»
        </span>
      </p>
    </Aviso>
  );
}
