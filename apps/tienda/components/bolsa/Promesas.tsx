import type { Promesa } from "@/lib/ficha";
import { Icono } from "../Icono";
import "@/app/estilos/bolsa.css";

/**
 * Lo que la tienda ya cumple, junto al botón de comprar (2026-10-16): separas sin pagar en la web, recoges en tu tienda y cambias en
 * cualquier tienda CAYLA, con los plazos de la ayuda (`promesasDeCompra`, `lib/ficha.ts`). Tres líneas cortas y quietas, sin caja: dan
 * confianza sin quitarle la vista a la prenda. Va en la ficha y en el look abierto (la bolsa dice lo que sigue con sus plazos: `pasosDelPedido`).
 */
export function Promesas({ promesas }: { promesas: readonly Promesa[] }) {
  return (
    <ul className="cp-promesas" aria-label="Cómo compras en CAYLA">
      {promesas.map((p) => (
        <li key={p.icono}>
          <Icono nombre={p.icono} />
          <p>
            <b>{p.titulo}.</b> {p.texto}
          </p>
        </li>
      ))}
    </ul>
  );
}
