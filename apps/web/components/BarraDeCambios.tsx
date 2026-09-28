"use client";

import { useState } from "react";
import { BarraFija } from "@/components/ui/BarraFija";
import { Boton } from "@/components/ui/campos";

/**
 * La barra «Tienes N cambios sin guardar» de Editar producto (ADR-0257; Felipe eligió la opción A el 2026-09-28).
 *
 * Sube pegada al borde de abajo en cuanto se toca algo y se va cuando no queda nada por guardar (`BarraFija` con `visible`).
 * Está ahí, a la vista, en la pantalla ancha y en la tablet: el panel «Guardar cambios» que tenía la ficha caía al final de la
 * página fuera de un escritorio, justo donde una colaboradora no lo veía. Es también el ÚNICO camino para guardar, así que lo
 * que la hace aparecer (`resumenDeCambios(...).total > 0`) tiene que cubrir todo lo editable.
 *
 * Lo pendiente va en ámbar («en proceso» en la paleta), no en rojo: el rojo ya lo pintan los interruptores encendidos.
 *
 * «Revisar y guardar» es un botón de envío del formulario: abre la hoja con lo que va a cambiar (`ConfirmarCambios`) y ahí se
 * elige quién hace la operación. Con «otra persona cambió esta prenda» (ADR-0193) guardar de nuevo chocaría igual: en su lugar
 * se ofrece recargar.
 */
export function BarraDeCambios({
  cantidad,
  versionCambiada,
  bloqueada,
  onDescartar,
  onRecargar,
}: {
  cantidad: number;
  /** Otra persona guardó la prenda mientras se editaba: lo escrito sigue aquí, pero guardar ya no es posible sin recargar. */
  versionCambiada: boolean;
  /** Se está guardando: nada se toca. */
  bloqueada: boolean;
  onDescartar: () => void;
  onRecargar: () => void;
}) {
  // Mientras la barra baja (240 ms) conserva la última cifra: «Tienes 0 cambios sin guardar» no debe verse al irse.
  const [ultima, setUltima] = useState(cantidad);
  if (cantidad > 0 && cantidad !== ultima) setUltima(cantidad);
  const cifra = cantidad > 0 ? cantidad : ultima;
  return (
    <BarraFija
      visible={cantidad > 0}
      // En una tablet con el lateral abierto la barra mide ~550 px: con este piso el mensaje no se aplasta y los botones bajan a su línea.
      resumenMinimo="min-w-[17rem]"
      aviso={
        versionCambiada ? (
          <p role="alert" className="font-medium text-ambar-profundo">
            Otra persona cambió esta prenda mientras la editabas. Recarga para ver sus cambios; lo que escribiste sigue aquí hasta entonces, por si quieres anotarlo.
          </p>
        ) : undefined
      }
      resumen={
        <div role="status" className="flex items-start gap-3">
          <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-ambar" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-tinta">Tienes {cifra === 1 ? "1 cambio" : `${cifra} cambios`} sin guardar</p>
            <p className="text-[13px] text-tinta/65">
              Aún no se guardó nada.
              <span className="hidden sm:inline"> Cuando termines, pulsa «Revisar y guardar».</span>
            </p>
          </div>
        </div>
      }
      acciones={
        <>
          {/* En el celular «Descartar» ocupa lo justo y el botón que guarda el resto: así «Revisar y guardar» cabe en una línea. */}
          <Boton type="button" peso="discreto" className="max-sm:shrink-0" disabled={bloqueada} onClick={onDescartar}>
            Descartar
          </Boton>
          {versionCambiada ? (
            <Boton type="button" peso="primario" className="max-sm:flex-1" onClick={onRecargar}>
              Recargar la prenda
            </Boton>
          ) : (
            <Boton type="submit" peso="primario" className="max-sm:flex-1" cargando={bloqueada}>
              Revisar y guardar
            </Boton>
          )}
        </>
      }
    />
  );
}
