"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { avisar } from "@/components/ui/Avisos";

/* ====================================================================
   Copiar — una sola pieza (ADR-0358, ronda 13, Felipe eligió P1 el 2026-10-15)

   · `forma="icono"`: junto a un dato que ya se ve (una cuenta, un CCI, el código de una talla), el ícono solo de 32 px, como el lápiz de
     Editar, con «Copiar <que>» al pasar el mouse y para el lector.
   · `forma="boton"` (la de fábrica): suelto, el secundario «Copiar mensaje», «Copiar CCI», «Copiar enlace» (con el eslabón, `icono="enlace"`).
   · Al copiar, el ícono se vuelve un ✓ verde que se dibuja y dice «Copiado» 1,8 s, sin que nada cambie de ancho.
   · Si el navegador no deja usar el portapapeles, prueba el camino viejo (un texto oculto que se copia con `execCommand`, como hacía
     la nota de crédito); si tampoco, avisa con un error y llama a `alFallar` (para dejar el texto marcado, como Traslados).
   Registro: docs/unificar/accion.copiar.md. Nunca un `navigator.clipboard` con su botón dibujado a mano.
   ==================================================================== */

const DURA = 1800;

/** Copia al portapapeles; sin permiso, por el camino viejo (un texto oculto y `execCommand`). Dice si lo logró. */
async function alPortapapeles(valor: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(valor);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = valor;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let listo = false;
    try {
      listo = document.execCommand("copy");
    } catch {
      listo = false;
    }
    ta.remove();
    return listo;
  }
}

type Props = {
  /** Lo que se copia (o una función que lo arma en el momento de copiar). */
  texto: string | (() => string);
  /** Qué se copia, en minúscula y con su artículo: «el CCI», «el enlace de esta lista». Lo usa el título y el lector. */
  que: string;
  forma?: "icono" | "boton";
  /** El dibujo: el de copiar (de fábrica) o el eslabón de un enlace. */
  icono?: "copiar" | "enlace";
  /** La palabra del botón suelto: «Copiar mensaje». De fábrica, «Copiar». */
  children?: ReactNode;
  /** Más bajo (el `btn-chico` del sistema). */
  chico?: boolean;
  /** En el celular, solo el ícono (una barra de filtros donde la palabra no cabe a 375 px, como «Copiar enlace» de Productos). */
  soloIconoEnCelular?: boolean;
  /** Además de copiar (dejar constancia, cerrar algo). */
  alCopiar?: () => void;
  /** El navegador no dejó copiar: después del aviso de error (por ejemplo, dejar el texto marcado). */
  alFallar?: () => void;
  disabled?: boolean;
  className?: string;
  /** Ancla de la guía interactiva (ADR-0389). */
  guia?: string;
};

export function BotonCopiar({ texto, que, forma = "boton", icono = "copiar", children, chico = false, soloIconoEnCelular = false, alCopiar, alFallar, disabled, className = "", guia }: Props) {
  const [copiado, setCopiado] = useState(false);
  const reloj = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reloj.current), []);

  async function copiar() {
    const valor = typeof texto === "function" ? texto() : texto;
    if (!(await alPortapapeles(valor))) {
      avisar.error("No se pudo copiar", { detalle: "Selecciónalo y cópialo con Ctrl+C (o mantén pulsado en el celular)." });
      alFallar?.();
      return;
    }
    setCopiado(true);
    alCopiar?.();
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setCopiado(false), DURA);
  }

  const Dibujo = icono === "enlace" ? Link2 : Copy;
  const nombre = `Copiar ${que}`;

  if (forma === "icono") {
    return (
      <button
        type="button"
        onClick={copiar}
        disabled={disabled}
        aria-label={nombre}
        title={nombre}
        data-guia={guia}
        data-copiado={copiado || undefined}
        className={`copiar-icono relative grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/60 transition-colors duration-200 ease-cayla hover:bg-hueso hover:text-tinta disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      >
        <span className="copiar-a">
          <Dibujo aria-hidden className="h-4 w-4" />
        </span>
        <span className="copiar-b">
          <Check aria-hidden className="copiar-tilde h-4 w-4" />
        </span>
        <span className="copiar-dicho" aria-live="polite">
          {copiado ? "Copiado" : ""}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copiar}
      disabled={disabled}
      title={nombre}
      aria-label={soloIconoEnCelular ? nombre : undefined}
      data-guia={guia}
      data-copiado={copiado || undefined}
      className={`btn-cayla btn-secundario copiar-boton ${chico ? "btn-chico" : ""} ${soloIconoEnCelular ? "max-sm:px-2.5" : ""} ${className}`}
    >
      <span className="copiar-pila">
        <span className="copiar-a">
          <Dibujo aria-hidden className="-my-1 h-4 w-4 shrink-0" />
          <span className={soloIconoEnCelular ? "max-sm:hidden" : undefined}>{children ?? "Copiar"}</span>
        </span>
        {/* En reposo «✓ Copiado» está transparente pero ocupa su lugar: el botón no cambia de ancho al copiar. Lo lee el aviso de abajo. */}
        <span className="copiar-b" aria-hidden>
          <Check className="copiar-tilde -my-1 h-4 w-4 shrink-0" />
          <span className={soloIconoEnCelular ? "max-sm:hidden" : undefined}>Copiado</span>
        </span>
      </span>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Copiado" : ""}
      </span>
    </button>
  );
}
