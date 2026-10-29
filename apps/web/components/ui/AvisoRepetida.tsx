"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { acotarVarias, rangoDeVarias } from "@/lib/lectura-repetida";

/* ====================================================================
   AvisoRepetida · «Ya está en la lista · ¿Sumar otra?» (ADR-0562; texto y forma de la «franja chica», Felipe 2026-10-29).

   La misma prenda leída otra vez no suma sola: esta pieza pregunta con lo mínimo para decidir mirando — la prenda (su foto o su
   color), «ya está en la lista», lo que llevas y lo que llevarías («1 → 2») y dos respuestas con su palabra: Sumar y No.
   «Cambiar cantidad» es para quien tiene varias iguales en la mano.

   Dos caras, la misma pieza:
   · `franja` (de fábrica): una tarjeta bajo el campo de escaneo, una línea en pantalla ancha;
   · `camara`: la tarjeta grande sobre el velo que tapa el visor (EscanerConteo `pregunta`): botones de 54 px, para que nadie crea que
     se sumó solo porque la cámara sigue a la vista. Mientras está abierta, la cámara no lee.

   Lo que cuida y una pantalla no tiene que repetir:
   · se responde TOCANDO: ningún botón toma el foco al aparecer, así el Enter con que la pistola remata cada código no puede
     decir «Sumar» (la pistola, con `fuera: "atraer"`, devuelve sus teclas al campo de escaneo);
   · «Sumar» y «No» pesan igual (se contesta mirando la prenda, no la pantalla; si uno pesara más empujaría justo al error que
     esta pieza evita);
   · «Cambiar cantidad» pide la cantidad total, del siguiente número al tope; si en ese número cae una lectura de la pistola
     (más de 6 caracteres), se le pasa a `onCodigo` en vez de tomarla por cantidad.
   · escanear OTRA prenda con la pregunta abierta es «No» (con la pistola se mira el rack, no la pantalla): `avisarNoSumo` deja el rastro
     («No se sumó: …») con su «Deshacer», que vuelve a abrir la pregunta;
   · la tarjeta no se estira: en pantalla ancha topa en 48 rem y «Cambiar cantidad» va en la misma línea que Sumar y No; el nombre
     de la prenda pasa a dos líneas antes de cortarse (la talla y el color son lo que distingue una prenda de otra).
   La regla (cuándo preguntar, qué se ignora) vive en lib/lectura-repetida.ts; la pantalla decide qué hace cada respuesta.
   ==================================================================== */

/** El rastro de un «No» que nadie tocó: escanear otra prenda con la pregunta abierta la cierra, y quien mira el rack no lo ve. */
export function avisarNoSumo(nombre: string, reabrir: () => void) {
  avisar.aviso(`No se sumó: ${nombre}`, { accion: { texto: "Deshacer", onClick: reabrir }, duracion: 7000 });
}

export function AvisoRepetida({
  nombre,
  miniatura,
  lleva,
  tope,
  variante = "franja",
  onSi,
  onNo,
  onVarias,
  onCodigo,
  className = "",
}: {
  /** «Blusa Emma · M · Beige». */
  nombre: string;
  /** La foto de la prenda, o su color con el ícono de su categoría (`<MiniaturaPrenda tamano="lg" />`). */
  miniatura: ReactNode;
  /** Cuántas lleva de esta prenda ahora (antes de responder). */
  lleva: number;
  /** Hasta cuántas admite («Cambiar cantidad» no pasa de aquí); `null` sin tope. */
  tope: number | null;
  variante?: "franja" | "camara";
  onSi: () => void;
  onNo: () => void;
  /** «Cambiar cantidad» → «Guardar N»: el total de esa prenda. Sin él, no se ofrece. */
  onVarias?: (total: number) => void;
  /** Lo que la pistola escribió en «Cantidad total». */
  onCodigo?: (codigo: string) => void;
  className?: string;
}) {
  const rango = onVarias ? rangoDeVarias(lleva, tope) : null;
  const [varias, setVarias] = useState(false);
  const [texto, setTexto] = useState(String(rango?.min ?? lleva + 1));
  const valor = rango ? acotarVarias(Number(texto), rango) : lleva + 1;
  const camara = variante === "camara";

  function poner() {
    if (!rango || !onVarias) return;
    onVarias(valor);
  }

  const respuesta = `btn-cayla btn-secundario ${camara ? "h-[54px] flex-1 text-base" : "h-11"}`;
  const cambiar = rango ? (
    <button
      type="button"
      className="btn-cayla btn-enlace h-11"
      onClick={() => {
        setTexto(String(rango.min));
        setVarias(true);
      }}
    >
      Cambiar cantidad
    </button>
  ) : null;

  return (
    <div
      role="group"
      aria-label="Prenda repetida"
      className={`anim-revelar w-full rounded-2xl border border-sand bg-papel text-tinta ${camara ? "p-3.5" : "max-w-3xl px-4 py-3"} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
          <span className="shrink-0">{miniatura}</span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 break-words text-[15px] font-semibold leading-snug">{nombre}</p>
            <p className="text-xs text-taupe">Ya está en la lista · ¿Sumar otra?</p>
          </div>
          <p aria-label={`Llevas ${lleva}; si la sumas, ${lleva + 1}`} className="flex shrink-0 items-center gap-1.5 font-display text-2xl leading-none tabular-nums">
            <span className="text-tinta/70">{lleva}</span>
            <ArrowRight aria-hidden className="h-3.5 w-3.5 text-tinta/50" />
            <span className="font-semibold text-ambar">{lleva + 1}</span>
          </p>
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${camara ? "w-full" : ""}`}>
          <button type="button" className={respuesta} onClick={onSi}>
            <Check aria-hidden className="h-4 w-4" />
            Sumar
          </button>
          <button type="button" className={respuesta} onClick={onNo}>
            <X aria-hidden className="h-4 w-4" />
            No
          </button>
          {rango && !varias && !camara && cambiar}
        </div>
      </div>
      {rango && !varias && camara && <div className="mt-1 text-center">{cambiar}</div>}
      {rango && varias && (
        <div className="anim-revelar mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-borde-control bg-papel px-3 py-2.5">
          <span className="min-w-0 flex-1 basis-40 text-sm text-tinta">
            Cantidad total
            {tope !== null && <span className="text-taupe"> · máx. {tope}</span>}
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
            Guardar {valor}
          </button>
        </div>
      )}
    </div>
  );
}
