"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Boton, BotonEnlace } from "@/components/ui/campos";

/* ====================================================================
   Editar algo — una sola pieza (ADR-0358, ronda 12, Felipe eligió P1 el 2026-10-14)

   · `<BotonEditar>`: abrir la edición de algo entero (un proveedor, una orden, una categoría, un cliente). El botón SECUNDARIO con el
     lápiz a la izquierda y «Editar» (o «Editar» + qué); nunca negro: editar no es el paso principal de una ficha. En la cabecera de
     una pantalla habla en versalitas (lo pone el lugar, ronda 3). Con `href` navega; con `onClick` abre la hoja.
   · `<LapizEditar>`: en una fila o una tarjeta de una lista (muchas iguales: las marcas, los colores, las prendas de una tabla), donde
     no cabe la palabra: el lápiz solo, de 32 px, con «Editar …» al pasar el mouse y para el lector.
   · Dentro de una frase o de una hoja, corregir UNA cosa sigue siendo el enlace (`btn-enlace`, ronda 9).
   ==================================================================== */

type Comun = {
  children?: ReactNode;
  /** Más bajo (el `btn-chico` del sistema), para una tarjeta o una fila de acciones. */
  chico?: boolean;
  className?: string;
  title?: string;
  disabled?: boolean;
  /** Ancla de la guía interactiva (ADR-0389). */
  guia?: string;
  /** Mientras abre o carga lo que se va a editar (como «Corregir conteo»). */
  cargando?: boolean;
  textoCargando?: string;
};

function Contenido({ children }: { children?: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Pencil aria-hidden className="-my-1 h-4 w-4 shrink-0" />
      {children ?? "Editar"}
    </span>
  );
}

export function BotonEditar(props: Comun & ({ href: string; onClick?: never } | { onClick: () => void; href?: never })) {
  const { children, chico = false, className = "", title, disabled, guia, cargando, textoCargando } = props;
  const clase = `${chico ? "btn-chico" : ""} ${className}`;
  if (props.href !== undefined) {
    return (
      <BotonEnlace href={props.href} className={clase} title={title} data-guia={guia}>
        <Contenido>{children}</Contenido>
      </BotonEnlace>
    );
  }
  return (
    <Boton type="button" onClick={props.onClick} className={clase} title={title} disabled={disabled} cargando={cargando} textoCargando={textoCargando} data-guia={guia}>
      <Contenido>{children}</Contenido>
    </Boton>
  );
}

const CLASE_LAPIZ =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/60 transition-colors duration-200 ease-cayla hover:bg-hueso hover:text-tinta disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:opacity-45";

export function LapizEditar(
  props: {
    /** Qué se edita, para el lector y para el título al pasar el mouse: «Editar <que>» («Blusa Emma», «la meta de Ana»). */
    que: string;
    className?: string;
    /** Otro título al pasar el mouse (por qué está apagado). */
    title?: string;
    disabled?: boolean;
    guia?: string;
  } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never }),
) {
  const nombre = `Editar ${props.que}`;
  const clase = `${CLASE_LAPIZ} ${props.className ?? ""}`;
  const lapiz = <Pencil aria-hidden className="h-4 w-4" />;
  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={nombre} title={props.title ?? nombre} data-guia={props.guia} className={clase}>
        {lapiz}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} aria-label={nombre} title={props.title ?? nombre} data-guia={props.guia} className={clase}>
      {lapiz}
    </button>
  );
}
