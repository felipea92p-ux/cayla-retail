import Link from "next/link";
import { queHacerConElApartado, queHacerConElPedido, TEXTOS_CUENTA, type LoQueFrena, type QueHacer } from "@/lib/mi-cuenta";
import { Icono, type NombreIcono } from "../Icono";

// Lo que frena «Eliminar mi cuenta» (Felipe 2026-10-15): un pedido web en curso (por confirmar, confirmado o pagado sin entregar) o un
// apartado abierto en tienda. Se dicen cuáles y qué hacer con cada uno (recogerlo, o escribirle a la tienda para que lo anule): si no,
// el pedido o el apartado se quedarían sin dueño. La base lo vuelve a mirar al eliminar (`tienda_eliminar_mi_cuenta`). Cada uno lleva
// su ícono (2026-10-16): el pedido de la web, o lo separado en una tienda, se reconoce antes de leerlo.
export function LoQueFrenaEliminar({ frena }: { frena: LoQueFrena }) {
  const cosas: { icono: NombreIcono; que: QueHacer }[] = [
    ...frena.pedidos.map((p) => ({ icono: "pedido" as const, que: queHacerConElPedido(p) })),
    ...frena.apartados.map((a) => ({ icono: "tienda" as const, que: queHacerConElApartado(a) })),
  ];
  return (
    <section className="w-frena" aria-labelledby="eliminar-frena-t">
      <h2 id="eliminar-frena-t" className="w-frena-t">
        {TEXTOS_CUENTA.eliminarFrenaTitulo}
      </h2>
      <p className="w-texto-sec">{TEXTOS_CUENTA.eliminarFrenaTexto}</p>
      <ul className="w-frena-lista">
        {cosas.map(({ icono, que: c }) => (
          <li key={c.titulo} className="w-frena-item">
            <span className="en-frena-ic" aria-hidden="true">
              <Icono nombre={icono} />
            </span>
            <span className="en-frena-t">
              <b>{c.titulo}</b>
              <span>{c.texto}</span>
              {c.enlace &&
                (c.enlace.externo ? (
                  <a className="w-enlace w-enlace-izq" href={c.enlace.href} target="_blank" rel="noopener noreferrer">
                    <Icono nombre="chat" />
                    {c.enlace.texto}
                  </a>
                ) : (
                  <Link className="w-enlace w-enlace-izq" href={c.enlace.href}>
                    {c.enlace.texto}
                    <Icono nombre="flecha" />
                  </Link>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
