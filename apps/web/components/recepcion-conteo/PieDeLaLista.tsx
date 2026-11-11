"use client";

import type { ReactNode } from "react";
import { Ayuda } from "@/components/Ayuda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { Chip } from "@/components/ui/Chip";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { EstadoCombo } from "@/lib/responsable-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import { BotonCerrarConteo } from "./BotonCerrarConteo";

// El pie de la lista (ADR-0645, Felipe 2026-11-11): lo del envío entero, siempre en el mismo lugar. A la izquierda, lo que impide cerrar y no es contar (tocarlo lleva
// hasta ahí; cuántos faltan por contar lo dice la línea de avance, arriba: cambio 3 de /formidable); a la
// derecha, quién cuenta, las fotos de las facturas y el ÚNICO «Revisar y cerrar» de la pantalla (había uno en cada mitad: «es redundante»). Lo que antes se leía en el resumen —cómo se guarda,
// qué pasa al cerrar— va detrás del «?»: una línea a la vista y lo que explica, a un toque.

/** Nadie marcó entrada hoy, o no se pudo leer quién está de turno: no hay a quién elegir y nada se guarda. El aviso completo, con sus pasos, va arriba de las dos mitades. */
export const sinTurno = (estado: EstadoCombo): boolean => estado === "nadie" || estado === "sin_lectura";

export function PieDeLaLista({
  guia,
  faltaAparte,
  responsable,
  papeles,
  explicacion,
  cierrePrincipal,
  puedeCerrar,
  motivosNoCierra,
  onCerrar,
  onIrALoQueFalta,
  onCancelarRecepcion,
  enHoja = false,
}: {
  guia: GuiaCampos;
  /** Lo que falta y no es contar un modelo (`faltaAparteDeContar`): quién cuenta, qué son unas prendas, una categoría sin modelos, un nombre que conviene poner. Vacío: el pie no dice nada. */
  faltaAparte: GuiaCampos["faltan"];
  responsable: ControlResponsable;
  /** El botón de las fotos de las facturas, si la compra tiene papeles. */
  papeles?: ReactNode;
  /** Lo que dice el «?»: cómo se guarda y qué pasa al cerrar. */
  explicacion: ReactNode;
  /** Ya no queda nada por contar y al modelo en foco no le toca nada: «Revisar y cerrar» es el botón negro. Si a ese modelo le toca repartir o llevar al stock, el negro es el de su tarjeta (un solo negro a la vez). */
  cierrePrincipal: boolean;
  puedeCerrar: boolean;
  motivosNoCierra: readonly string[];
  onCerrar: () => void;
  onIrALoQueFalta: () => void;
  /** Sin aviso y sin nada contado: la salida es cancelar, no cerrar. */
  onCancelarRecepcion?: () => void;
  /** Dentro de la hoja del celular: se pega al borde de abajo de la hoja. */
  enHoja?: boolean;
}) {
  return (
    <div className={enHoja ? "rc-lista-pie pie-hoja-fijo" : "rc-lista-pie"}>
      {/* Lo que falta aparte de contar, primero: con la lista angosta va en su propia línea, arriba de los controles. Sin nada de eso, el pie es una sola fila. */}
      {onCancelarRecepcion ? (
        <p className="rc-pie-falta">
          ¿No llegó nada?{" "}
          <button type="button" className="btn-cayla btn-enlace" onClick={onCancelarRecepcion}>
            Cancelar la recepción
          </button>
        </p>
      ) : faltaAparte.length > 0 ? (
        <div className="rc-pie-falta">
          <PieGuia guia={{ ...guia, faltan: faltaAparte }} tope={1} />
        </div>
      ) : null}
      <div className="rc-pie-accion">
        <div className="rc-pie-quien" data-guia="recepcion.quien-cuenta">
          {sinTurno(responsable.estado) ? (
            <Chip tono="ambar" title="Arriba dice cómo resolverlo">
              {responsable.estado === "nadie" ? "Nadie marcó entrada" : "Sin lista de turno"}
            </Chip>
          ) : (
            <ComboResponsable control={responsable} compacto className="min-w-0" />
          )}
          <Ayuda titulo="Quién cuenta">{explicacion}</Ayuda>
          {papeles}
        </div>
        <BotonCerrarConteo peso={cierrePrincipal ? "primario" : "fantasma"} puedeCerrar={puedeCerrar} motivos={motivosNoCierra} onCerrar={onCerrar} onIrALoQueFalta={onIrALoQueFalta} guia="recepcion.pasar-a-cerrar" />
      </div>
    </div>
  );
}
