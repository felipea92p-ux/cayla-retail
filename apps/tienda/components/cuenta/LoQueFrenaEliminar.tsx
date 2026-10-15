import Link from "next/link";
import { queHacerConElApartado, queHacerConElPedido, TEXTOS_CUENTA, type LoQueFrena } from "@/lib/mi-cuenta";
import { Icono } from "../Icono";

// Lo que frena «Eliminar mi cuenta» (Felipe 2026-10-15): un pedido web en curso (por confirmar, confirmado o pagado sin entregar) o un
// apartado abierto en tienda. Se dicen cuáles y qué hacer con cada uno (recogerlo, o escribirle a la tienda para que lo anule): si no,
// el pedido o el apartado se quedarían sin dueño. La base lo vuelve a mirar al eliminar (`tienda_eliminar_mi_cuenta`).
export function LoQueFrenaEliminar({ frena }: { frena: LoQueFrena }) {
  const cosas = [...frena.pedidos.map(queHacerConElPedido), ...frena.apartados.map(queHacerConElApartado)];
  return (
    <section className="w-frena" aria-labelledby="eliminar-frena-t">
      <h2 id="eliminar-frena-t" className="w-frena-t">
        {TEXTOS_CUENTA.eliminarFrenaTitulo}
      </h2>
      <p className="w-texto-sec">{TEXTOS_CUENTA.eliminarFrenaTexto}</p>
      <ul className="w-frena-lista">
        {cosas.map((c) => (
          <li key={c.titulo} className="w-frena-item">
            <b>{c.titulo}</b>
            <span>{c.texto}</span>
            {c.enlace &&
              (c.enlace.externo ? (
                <a className="w-enlace w-enlace-izq" href={c.enlace.href} target="_blank" rel="noopener noreferrer">
                  {c.enlace.texto}
                  <Icono nombre="flecha" />
                </a>
              ) : (
                <Link className="w-enlace w-enlace-izq" href={c.enlace.href}>
                  {c.enlace.texto}
                </Link>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
