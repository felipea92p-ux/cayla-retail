import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Miniatura } from "@/components/bolsa/Miniatura";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { formaDe, fotoOptimizable, soles } from "@/lib/catalogo";
import { fechaCorta, INSIGNIA, nombreTienda, vivas } from "@/lib/pedidos";
import { leerMisPedidos } from "@/lib/pedidos-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import "../../estilos/catalogo.css";
import "../../estilos/bolsa.css";

export const metadata: Metadata = { title: "Mis pedidos · CAYLA", robots: { index: false, follow: false } };

/**
 * «Mis pedidos» (maqueta v4, `vCuenta` ▸ «Mis pedidos»): cada pedido con su número, su total, su tienda, cuándo se separó y en qué
 * está. Solo los de esta cuenta (lo decide la base: `retail.tienda_mis_pedidos`). Cada uno abre su estado.
 */
export default async function MisPedidos() {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const lectura = sesion.estado === "con_sesion" ? await leerMisPedidos(sesion.usuarioId) : { estado: "sin_respuesta" as const };
  if (lectura.estado === "sin_cuenta") redirect("/cuenta");
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <div className="t-ancho t-angosto">
        <div className="t-cuenta-pag">
          <nav className="t-ruta" aria-label="Estás en">
            <Link href="/cuenta">Mi cuenta</Link>
            <span aria-hidden="true">/</span>
            <span>Mis pedidos</span>
          </nav>
          <div className="t-cuenta-cab">
            <span className="t-ceja">Mi cuenta</span>
            <h1>
              Mis <em>pedidos</em>
            </h1>
          </div>
          {lectura.estado === "sin_respuesta" ? (
            <div className="t-vacio" role="status">
              <Icono nombre="pedido" />
              <h3>No pudimos cargar tus pedidos</h3>
              <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
              <Link className="t-btn" href="/cuenta/pedidos">
                Volver a intentar
              </Link>
            </div>
          ) : lectura.pedidos.length === 0 ? (
            <div className="w-bloque">
              <p className="w-texto-sec">Todavía no separaste nada.</p>
              <Link className="t-btn t-btn-sec" href="/catalogo">
                Ver toda la ropa
              </Link>
            </div>
          ) : (
            <ul className="w-lista t-pedidos">
              {lectura.pedidos.map((p) => {
                const primera = vivas(p)[0] ?? p.lineas[0];
                const insignia = INSIGNIA[p.estado];
                return (
                  <li key={p.codigo}>
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </MarcoCuenta>
  );
}
