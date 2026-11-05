import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CuentaAtras } from "@/components/bolsa/CuentaAtras";
import { CodigoQueCuenta, TotalQueCuenta } from "@/components/bolsa/NumeroQueCuenta";
import { PrendaDelPedido } from "@/components/bolsa/PrendaDelPedido";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { TarjetaInstalar } from "@/components/instalar/TarjetaInstalar";
import { Icono } from "@/components/Icono";
import { soles } from "@/lib/catalogo";
import { codigoDeLaUrl, enlaceDelPedido, nombreTienda, vivas } from "@/lib/pedidos";
import { leerPedido } from "@/lib/pedidos-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import "../../../estilos/catalogo.css";
import "../../../estilos/bolsa.css";

export const metadata: Metadata = { title: "¡Listo, lo separaste! · CAYLA", robots: { index: false, follow: false } };

/**
 * «¡Listo, lo separaste!» (maqueta v4, `vSeparado`): el número del pedido, cuánto falta para que se cierre solo si nadie lo confirma,
 * los tres pasos y el botón que abre WhatsApp con el mensaje ya escrito al número de la tienda elegida. Solo mientras está por
 * confirmar: después, el estado del pedido (`/cuenta/pedidos/W-…`).
 */
export default async function Separado({ params }: { params: Promise<{ numero: string }> }) {
  const codigo = codigoDeLaUrl((await params).numero);
  if (!codigo) notFound();
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta") redirect(`/cuenta/pedidos/${codigo}`);
  const lectura = await leerPedido(sesion.usuarioId, codigo);
  if (lectura.estado === "no_esta" || lectura.estado === "sin_cuenta") notFound();
  if (lectura.estado !== "ok" || lectura.pedido.estado !== "por_confirmar") redirect(`/cuenta/pedidos/${codigo}`);

  const p = lectura.pedido;
  const tienda = nombreTienda(p.tienda.nombre);
  const enlace = enlaceDelPedido(p);
  return (
    <MarcoCuenta conCuenta conPie>
      <div className="t-ancho t-angosto">
        <div className="w-ficha t-separado">
          {/* G · Pasarela (ADR-0524): la confirmación es una invitación blanca con su filo adentro que llega de espaldas y se da vuelta. */}
          <div className="t-separado-cab t-papel-fijo">
            <span className="t-sello">
              <Icono nombre="check" />
            </span>
            <span className="t-ceja">
              Pedido{" "}
              <span className="t-codigo">
                <CodigoQueCuenta codigo={p.codigo} />
              </span>{" "}
              · por confirmar
            </span>
            <h1 className="w-titulo">
              ¡Listo, <em>lo separaste!</em>
            </h1>
            <p className="w-texto-sec">Ahora mándalo por WhatsApp a {tienda} para que te confirmen la separación.</p>
          </div>
          {p.venceEn && (
            <div className="w-reloj">
              <Icono nombre="reloj" />
              <span>Sin confirmar, se cierra en</span>
              <CuentaAtras hasta={p.venceEn} />
            </div>
          )}
          <ol className="w-pasos">
            <li>
              <span>
                Envía el mensaje por WhatsApp
                <small>
                  Ya va escrito, con tu número de pedido <span className="t-codigo">{p.codigo}</span>.
                </small>
              </span>
            </li>
            <li>
              <span>
                {tienda} te confirma<small>Revisa que tus prendas estén y te responde por el mismo chat.</small>
              </span>
            </li>
            <li>
              {/* «Coordinas … con la tienda» (como «Cómo separar»): «Coordinan el pago» no decía quién. */}
              <span>
                Coordinas el pago y lo recoges<small>Por WhatsApp acuerdas con la tienda cómo pagas, y lo recoges en {tienda}.</small>
              </span>
            </li>
          </ol>
          <div className="t-separado-acc">
            {enlace ? (
              <a className="t-btn t-btn-ancho t-btn-wsp" href={enlace} target="_blank" rel="noopener noreferrer">
                <Icono nombre="chat" />
                Enviar por WhatsApp
              </a>
            ) : (
              // Si la tienda no tiene su WhatsApp en la web, «escríbele» sin decir dónde era un callejón: «Nuestras tiendas» tiene
              // cómo llegar a cada una.
              <p className="w-texto-sec">
                Escríbele a {tienda} con tu número de pedido, <span className="t-codigo">{p.codigo}</span>. Sus datos están en{" "}
                <Link className="w-enlace" href="/tiendas">
                  Nuestras tiendas
                </Link>
                .
              </p>
            )}
          </div>
          <div className="w-tarjeta">
            <span className="w-lbl">Tu pedido · {tienda}</span>
            {vivas(p).map((l, i) => (
              <PrendaDelPedido key={`${l.varianteId}-${i}`} linea={l} />
            ))}
            <div className="w-resumen">
              {/* El cupón del Club que quedó reservado para este pedido (20261019224000): se usa cuando lo pagues. */}
              {p.cupon && p.cupon.descuento > 0 && (
                <div>
                  <span>
                    Cupón <span className="t-codigo">{p.cupon.codigo}</span>
                  </span>
                  <span className="num t-ahorro">−{soles(p.cupon.descuento)}</span>
                </div>
              )}
              <div className="tot">
                <span>Total</span>
                <span className="num">
                  <TotalQueCuenta valor={p.total} />
                </span>
              </div>
            </div>
          </div>
          <Link className="w-enlace" href={`/cuenta/pedidos/${p.codigo}`}>
            Ver el estado de mi pedido
          </Link>
          {/* El momento justo para ofrecer instalar CAYLA (ADR-0431): ya separó, y va debajo de lo que importa. */}
          <TarjetaInstalar />
        </div>
      </div>
    </MarcoCuenta>
  );
}
