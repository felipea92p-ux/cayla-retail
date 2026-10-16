import type { Promesa } from "@/lib/ficha";
import { Icono } from "../Icono";
import "@/app/estilos/bolsa.css";

/**
 * Lo que la tienda ya cumple, junto al botón de comprar (2026-10-16): separas sin pagar en la web, recoges en tu tienda y cambias en
 * cualquier tienda CAYLA, con los plazos de la ayuda (`promesasDeCompra`, `lib/ficha.ts`). Tres líneas cortas y quietas, sin caja: dan
 * confianza sin quitarle la vista a la prenda. Va en la ficha, en el look abierto y en la bolsa. `compacta`: sin el detalle de cada una
 * (la bolsa ya lo dice en su resumen).
 */
export function Promesas({ promesas, compacta = false }: { promesas: readonly Promesa[]; compacta?: boolean }) {
  return (
    <ul className={`cp-promesas${compacta ? " cp-promesas-compacta" : ""}`} aria-label="Cómo compras en CAYLA">
      {promesas.map((p) => (
        <li key={p.icono}>
          <Icono nombre={p.icono} />
          <p>
            <b>{p.titulo}.</b>
            {!compacta && <> {p.texto}</>}
          </p>
        </li>
      ))}
    </ul>
  );
}
