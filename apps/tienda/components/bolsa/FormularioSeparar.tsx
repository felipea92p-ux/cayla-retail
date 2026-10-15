"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { separar, type EstadoSeparar } from "@/app/acciones/bolsa";
import { Icono } from "../Icono";

/**
 * Lo de abajo de la bolsa (maqueta, `pieTxt`): qué falta o qué pasa al separar, y «Separar en Trujillo». Viaja lo que el cliente
 * ve (prendas, cuántas y precio) y la tienda elegida; la base vuelve a calcular todo. Mientras responde, el botón dice
 * «Separando…» y no se puede volver a tocar (y aunque se tocara, la marca de la bolsa devuelve el mismo pedido).
 */
export function FormularioSeparar({
  lineas,
  sedeId,
  marca,
  listo,
  boton,
  nota,
}: {
  lineas: { variante_id: string; cantidad: number; precio: number }[];
  sedeId: string | null;
  /** La marca de la bolsa que se ve: el aviso de un intento anterior solo se muestra si la bolsa sigue siendo esa. */
  marca: string | null;
  listo: boolean;
  boton: string;
  nota: ReactNode;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoSeparar, FormData>(separar, null);
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
      <button className="t-btn t-btn-ancho" type="submit" disabled={!listo || pendiente} aria-busy={pendiente}>
        <Icono nombre="pedido" />
        {pendiente ? "Separando…" : boton}
      </button>
    </form>
  );
}
