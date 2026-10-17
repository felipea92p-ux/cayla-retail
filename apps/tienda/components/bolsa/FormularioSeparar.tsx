"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { separar, type EstadoSeparar } from "@/app/acciones/bolsa";
import { hrefConVolver } from "@/lib/entrada";
import { visible } from "@/lib/visible";
import { Icono } from "../Icono";

/**
 * Lo de abajo de la bolsa (maqueta, `pieTxt`): qué falta o qué pasa al separar, y «Separar en Trujillo». Viaja lo que el cliente
 * ve (prendas, cuántas y precio) y la tienda elegida; la base vuelve a calcular todo. Mientras responde, el botón dice
 * «Separando…» y no se puede volver a tocar (y aunque se tocara, la marca de la bolsa devuelve el mismo pedido).
 *
 * Si lo único que falta es la tienda (`faltaTienda`), el botón no queda apagado: «Elegir la tienda» lleva a la pregunta (`#bloque-tienda`,
 * su bloque) y pone el foco en la primera tienda. En el celular esa pregunta queda abajo de las prendas, fuera de la vista.
 */
export function FormularioSeparar({
  lineas,
  sedeId,
  marca,
  listo,
  sinCuenta = false,
  sinClub = false,
  faltaTienda = false,
  boton,
  nota,
}: {
  lineas: { variante_id: string; cantidad: number; precio: number }[];
  sedeId: string | null;
  /** La marca de la bolsa que se ve: el aviso de un intento anterior solo se muestra si la bolsa sigue siendo esa. */
  marca: string | null;
  listo: boolean;
  /** Sin sesión: la bolsa se armó igual y la cuenta se pide AQUÍ (Felipe 2026-10-17). «Separar» pasa a «Entra para separar» y vuelve a la bolsa. */
  sinCuenta?: boolean;
  /** Con cuenta pero sin Club (ADR-0438): antes de separar, la tienda necesita su documento y su celular (una sola vez). */
  sinClub?: boolean;
  faltaTienda?: boolean;
  boton: string;
  nota: ReactNode;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoSeparar, FormData>(separar, null);

  function irALaTienda() {
    const bloque = visible(document.querySelectorAll<HTMLElement>("#bloque-tienda"));
    if (!bloque) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bloque.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "center" });
    bloque.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }

  return (
    <form action={accion} className="t-bolsa-accion">
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
      <input type="hidden" name="sede" value={sedeId ?? ""} />
      {estado && estado.marca === marca ? (
        <p className="w-error-general" role="alert">
          {estado.mensaje}
          {estado.enlace && (
            <>
              {" "}
              <Link className="w-enlace" href={estado.enlace.href}>
                {estado.enlace.texto}
              </Link>
            </>
          )}
        </p>
      ) : (
        <p className="w-faltan">{nota}</p>
      )}
      {faltaTienda ? (
        <button className="t-btn t-btn-ancho t-btn-sec" type="button" onClick={irALaTienda}>
          <Icono nombre="tienda" />
          Elegir la tienda
        </button>
      ) : sinCuenta && listo ? (
        <>
          <Link className="t-btn t-btn-ancho" href={hrefConVolver("/entrar", "/bolsa")}>
            <Icono nombre="pedido" />
            Entra para separar
          </Link>
          <Link className="t-enlace" href={hrefConVolver("/crear-cuenta", "/bolsa")}>
            ¿No tienes cuenta? Créala en un minuto <Icono nombre="flecha" />
          </Link>
        </>
      ) : sinClub && listo ? (
        <Link className="t-btn t-btn-ancho" href={hrefConVolver("/cuenta/club", "/bolsa")}>
          <Icono nombre="pedido" />
          Completa tus datos para separar
        </Link>
      ) : (
        <button className="t-btn t-btn-ancho" type="submit" disabled={!listo || pendiente} aria-busy={pendiente}>
          <Icono nombre="pedido" />
          {pendiente ? "Separando…" : boton}
        </button>
      )}
    </form>
  );
}
