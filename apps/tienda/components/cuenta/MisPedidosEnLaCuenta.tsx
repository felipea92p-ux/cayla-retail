import Link from "next/link";
import { formaDe, fotoOptimizable, soles } from "@/lib/catalogo";
import { fechaCorta, INSIGNIA, nombreTienda, vivas, type Pedido } from "@/lib/pedidos";
import type { LecturaMisPedidos } from "@/lib/pedidos-servidor";
import { Miniatura } from "../bolsa/Miniatura";
import { Icono } from "../Icono";
import "@/app/estilos/bolsa.css";

/** Cuántos pedidos se ven en «Mi cuenta»; todos, en «Mis pedidos». */
const EN_LA_CUENTA = 3;

/** Un pedido en la lista (maqueta, `w-ped`): su primera prenda, el número y el total, la tienda y el día, y en qué está. */
export function FilaDePedido({ pedido: p, origenFotos }: { pedido: Pedido; origenFotos: string | undefined }) {
  const primera = vivas(p)[0] ?? p.lineas[0];
  const insignia = INSIGNIA[p.estado];
  return (
    <Link className="w-ped" href={`/cuenta/pedidos/${p.codigo}`}>
      {primera && (
        <Miniatura
          foto={primera.foto}
          optimizar={primera.foto ? fotoOptimizable(primera.foto, origenFotos) : false}
          forma={formaDe(primera.categoria?.prefijo)}
          color={primera.color.hex}
        />
      )}
      <span>
        <b>
          <span className="t-codigo">{p.codigo}</span> · {soles(p.total)}
        </b>
        <small>
          {nombreTienda(p.tienda.nombre)} · {fechaCorta(p.creadoEn)}
        </small>
        <span className={`w-estado-chip t-${insignia.tono}`}>
          {p.estado === "pagado" && p.listoParaRecoger ? "Pagado · listo para recoger" : insignia.texto}
        </span>
      </span>
      <Icono nombre="flecha" />
    </Link>
  );
}

/**
 * «Mis pedidos» en «Mi cuenta» (maqueta v4, `vCuenta`: el primer bloque, antes de los beneficios del Club): los últimos pedidos, cada uno
 * con en qué está, y el camino a todos (`/cuenta/pedidos`). Sin pedidos, lo dice y lleva a la ropa; si la base no contestó, lo dice y
 * se puede volver a intentar. Solo los de esta cuenta: lo decide la base (`retail.tienda_mis_pedidos`).
 */
export function MisPedidosEnLaCuenta({ lectura, origenFotos }: { lectura: LecturaMisPedidos; origenFotos: string | undefined }) {
  return (
    <section className="c-bloque" aria-labelledby="cuenta-pedidos" data-club="pedidos">
      <h2 className="c-bloque-t" id="cuenta-pedidos">
        Mis pedidos
      </h2>
      {lectura.estado !== "ok" ? (
        <>
          <p className="w-texto-sec">No pudimos cargar tus pedidos ahora. Vuelve a intentarlo en unos minutos.</p>
          <Link className="t-enlace c-ver" href="/cuenta/pedidos">
            Ver mis pedidos
          </Link>
        </>
      ) : lectura.pedidos.length === 0 ? (
        <>
          <p className="w-texto-sec">Todavía no separaste nada. Cuando separes, aquí ves en qué está cada pedido.</p>
          <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/catalogo">
            Ver toda la tienda
          </Link>
        </>
      ) : (
        <>
          <ul className="w-lista t-pedidos">
            {lectura.pedidos.slice(0, EN_LA_CUENTA).map((p) => (
              <li key={p.codigo}>
                <FilaDePedido pedido={p} origenFotos={origenFotos} />
              </li>
            ))}
          </ul>
          <Link className="t-enlace c-ver" href="/cuenta/pedidos">
            {lectura.pedidos.length > EN_LA_CUENTA ? `Ver todos mis pedidos (${lectura.pedidos.length})` : "Ver mis pedidos"}
          </Link>
        </>
      )}
    </section>
  );
}
