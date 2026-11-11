"use client";

import type { ReactNode } from "react";
import { Ayuda } from "@/components/Ayuda";
import { ComboResponsable } from "@/components/ComboResponsable";
import { PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import type { GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { BotonCerrarConteo } from "./BotonCerrarConteo";

// El pie de la lista (ADR-0645, Felipe 2026-11-11): lo del envío entero, siempre en el mismo lugar. A la izquierda, lo que falta (tocarlo lleva hasta ahí); a la
// derecha, quién cuenta, las fotos de las facturas y el ÚNICO «Revisar y cerrar» de la pantalla (había uno en cada mitad: «es redundante»). Lo que antes se leía en el resumen —cómo se guarda,
// qué pasa al cerrar— va detrás del «?»: una línea a la vista y lo que explica, a un toque.

export function PieDeLaLista({
  guia,
  responsable,
  papeles,
  explicacion,
  todoContado,
  puedeCerrar,
  motivosNoCierra,
  onCerrar,
  onIrALoQueFalta,
  onCancelarRecepcion,
  enHoja = false,
}: {
  guia: GuiaCampos;
  responsable: ControlResponsable;
  /** El botón de las fotos de las facturas, si la compra tiene papeles. */
  papeles?: ReactNode;
  /** Lo que dice el «?»: cómo se guarda y qué pasa al cerrar. */
  explicacion: ReactNode;
  /** Ya no queda nada por contar: «Revisar y cerrar» pasa a ser el botón principal. */
  todoContado: boolean;
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
      {/* Lo que falta, primero: con la lista angosta va en su propia línea, arriba de los controles. */}
      {onCancelarRecepcion ? (
        <p className="rc-pie-falta">
          ¿No llegó nada?{" "}
          <button type="button" className="btn-cayla btn-enlace" onClick={onCancelarRecepcion}>
            Cancelar la recepción
          </button>
        </p>
      ) : (
        <div className="rc-pie-falta">
          <PieGuia guia={guia} tope={1} listo="Todo contado." />
        </div>
      )}
      <div className="rc-pie-accion">
        <div className="rc-pie-quien" data-guia="recepcion.quien-cuenta">
          <ComboResponsable control={responsable} compacto className="min-w-0" />
          <Ayuda titulo="Quién cuenta">{explicacion}</Ayuda>
          {papeles}
        </div>
        <BotonCerrarConteo peso={todoContado ? "primario" : "fantasma"} puedeCerrar={puedeCerrar} motivos={motivosNoCierra} onCerrar={onCerrar} onIrALoQueFalta={onIrALoQueFalta} guia="recepcion.pasar-a-cerrar" />
      </div>
    </div>
  );
}
