import Link from "next/link";
import { formaDe, fotoOptimizable, soles } from "@/lib/catalogo";
import { fechaCorta, INSIGNIA, nombreTienda, vivas, type Pedido } from "@/lib/pedidos";
import type { LecturaMisPedidos } from "@/lib/pedidos-servidor";
import { Miniatura } from "../bolsa/Miniatura";
import { Icono } from "../Icono";
import { SeccionDelPerfil } from "./SeccionDelPerfil";
import "@/app/estilos/bolsa.css";

/** Cuántos pedidos se ven en «Mi perfil»; todos, en «Mis pedidos». */
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
 * «Mis pedidos» en «Mi perfil» (maqueta v4, `vCuenta`: el primer bloque, antes del Club): los últimos pedidos, cada uno con en qué está;
 * si hay más de los que caben, «Ver todos» lleva a `/cuenta/pedidos`. Sin pedidos, lo dice y lleva a la ropa; si la base no contestó, lo
 * dice y se puede volver a intentar. Solo los de esta cuenta: lo decide la base (`retail.tienda_mis_pedidos`). En la computadora va lado
 * a lado con «Mi Club CAYLA».
 */
export function MisPedidosEnLaCuenta({ lectura, origenFotos }: { lectura: LecturaMisPedidos; origenFotos: string | undefined }) {
  const pedidos = lectura.estado === "ok" ? lectura.pedidos : null;
  const verTodos =
    pedidos && pedidos.length > EN_LA_CUENTA ? (
      <Link className="t-ver" href="/cuenta/pedidos">
        Ver todos <Icono nombre="flecha" />
      </Link>
    ) : null;
  return (
    <SeccionDelPerfil id="pf-pedidos" titulo="Mis pedidos" cuenta={pedidos?.length ?? null} accion={verTodos} mitad>
      {pedidos === null ? (
        <>
          <p className="w-texto-sec">No pudimos cargar tus pedidos ahora. Vuelve a intentarlo en unos minutos.</p>
          <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/cuenta">
            Volver a intentar
          </Link>
        </>
      ) : pedidos.length === 0 ? (
        <>
          <p className="w-texto-sec">Todavía no separaste nada. Cuando separes, aquí ves en qué está cada pedido.</p>
          <Link className="t-btn t-btn-sec t-btn-chico c-reintentar" href="/catalogo">
            Ver toda la tienda
          </Link>
        </>
      ) : (
        <ul className="w-lista t-pedidos">
          {pedidos.slice(0, EN_LA_CUENTA).map((p) => (
            <li key={p.codigo}>
              <FilaDePedido pedido={p} origenFotos={origenFotos} />
            </li>
          ))}
        </ul>
      )}
    </SeccionDelPerfil>
  );
}
