import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { volverASeparar } from "@/app/acciones/bolsa";
import { CuentaAtras } from "@/components/bolsa/CuentaAtras";
import { PrendaDelPedido } from "@/components/bolsa/PrendaDelPedido";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { soles } from "@/lib/catalogo";
import { textoCuponLiberado } from "@/lib/cupon";
import {
  codigoDeLaUrl,
  diaCorto,
  enlaceDelPedido,
  enlaceParaHablarDelPedido,
  fechaCorta,
  fechaLarga,
  hitos,
  hora,
  nombreTienda,
  porQueSeCerro,
  solesEnFrase,
  textoCambiarlo,
  textoDeDevolucion,
  vivas,
  type Pedido,
  type Plazos,
} from "@/lib/pedidos";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { leerPedido } from "@/lib/pedidos-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { whatsappLegible } from "@/lib/tiendas";
import "../../../estilos/catalogo.css";
import "../../../estilos/bolsa.css";

export const metadata: Metadata = { title: "Mi pedido · CAYLA", robots: { index: false, follow: false } };

/**
 * El estado de un pedido (maqueta v4, `vPedido`): en qué va (separado → confirmado → pagado → entregado), sus prendas, cuánto falta
 * pagar y, cuando está listo para recoger, el código de 4 cifras que se muestra en caja (propuesta m). Solo si es de esta cuenta: el
 * de otro cliente responde como uno que no existe. Todo se coordina por WhatsApp con la tienda.
 */
export default async function MiPedido({ params }: { params: Promise<{ numero: string }> }) {
  const codigo = codigoDeLaUrl((await params).numero);
  if (!codigo) notFound();
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const lectura = sesion.estado === "con_sesion" ? await leerPedido(sesion.usuarioId, codigo) : { estado: "sin_respuesta" as const };
  if (lectura.estado === "no_esta" || lectura.estado === "sin_cuenta") notFound();
  if (lectura.estado === "sin_respuesta") {
    return (
      <MarcoCuenta conCuenta enPagina="cuenta" conPie>
        <div className="t-ancho">
          <div className="t-vacio" role="status">
            <Icono nombre="pedido" />
            <h3>No pudimos cargar tu pedido</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={`/cuenta/pedidos/${codigo}`}>
              Volver a intentar
            </Link>
          </div>
        </div>
      </MarcoCuenta>
    );
  }

  const { pedido: p, plazos } = lectura;
  const tienda = nombreTienda(p.tienda.nombre);
  const conDinero = p.estado === "confirmado" || p.estado === "pagado" || p.estado === "entregado";
  // Entregado: el plazo para cambiarlo es el de la caja (el que imprime su boleta), el mismo de «Cambios y devoluciones».
  const diasParaCambiar = p.estado === "entregado" ? (await leerAyuda()).diasParaCambiar : null;
  return (
    <MarcoCuenta conCuenta enPagina="cuenta" conPie>
      <div className="t-ancho t-angosto">
        <div className="w-ficha t-pedido">
          <nav className="t-ruta" aria-label="Estás en">
            <Link href="/cuenta">Mi perfil</Link>
            <span aria-hidden="true">/</span>
            <Link href="/cuenta/pedidos">Mis pedidos</Link>
            <span aria-hidden="true">/</span>
            <span>
              Pedido <span className="t-codigo">{p.codigo}</span>
            </span>
          </nav>
          <div className="w-estado-cab">
            <Cabeza p={p} tienda={tienda} plazos={plazos} />
          </div>
          <Extra p={p} tienda={tienda} diasParaCambiar={diasParaCambiar} />

          <div className="w-tarjeta">
            <ol className="w-linea">
              {hitos(p).map((h) => (
                <li key={h.nombre} className="w-hito" data-e={h.estado}>
                  <span className="w-hito-p">
                    {h.estado === "hecho" && <Icono nombre="check" />}
                    {h.estado === "anulado" && <Icono nombre="cerrar" />}
                  </span>
                  <span>
                    {h.nombre}
                    {h.cuando && (
                      <small>
                        {fechaCorta(h.cuando)}, {hora(h.cuando)}
                      </small>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="w-tarjeta">
            <span className="w-lbl">
              Pedido <span className="t-codigo">{p.codigo}</span> · {tienda}
            </span>
            {vivas(p).map((l, i) => (
              <PrendaDelPedido key={`${l.varianteId}-${i}`} linea={l} />
            ))}
            <div className="w-resumen">
              {conDinero && (
                <div>
                  <span>Entrega</span>
                  <span>Recojo en {tienda}</span>
                </div>
              )}
              {/* El cupón del Club (20261019224000): lo que descuenta, o que volvió a «Mi Club» y por qué. */}
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
                <span className="num">{soles(p.total)}</span>
              </div>
              {conDinero && (
                <div>
                  <span>Pagado</span>
                  <span className="num">{soles(p.pagado)}</span>
                </div>
              )}
              {p.boleta && (
                <div>
                  <span>Boleta</span>
                  <span className="num">{p.boleta}</span>
                </div>
              )}
              {p.estado === "anulado" && p.devuelto > 0 && (
                <div>
                  <span>Devuelto</span>
                  <span className="num">{soles(p.devuelto)}</span>
                </div>
              )}
              {p.notaCredito && (
                <div>
                  <span>Nota de crédito</span>
                  <span className="num">{p.notaCredito}</span>
                </div>
              )}
              {conDinero && p.falta > 0 && (
                <div>
                  <span>
                    <b>Falta pagar</b>
                  </span>
                  <span className="num">
                    <b>{soles(p.falta)}</b>
                  </span>
                </div>
              )}
            </div>
            {p.cupon && textoCuponLiberado(p.cupon) && <p className="w-texto-sec">{textoCuponLiberado(p.cupon)}</p>}
          </div>

          <ConLaTienda p={p} tienda={tienda} />
        </div>
      </div>
    </MarcoCuenta>
  );
}

/** Lo de arriba según el estado (maqueta, `vPedido`). */
function Cabeza({ p, tienda, plazos }: { p: Pedido; tienda: string; plazos: Plazos }) {
  switch (p.estado) {
    case "por_confirmar":
      return (
        <>
          <span className="w-estado-chip t-ambar">Por confirmar</span>
          <h1 className="w-titulo">
            Falta que <em>{tienda}</em> lo confirme.
          </h1>
          <p className="w-texto-sec">
            Ya lo separaste. Falta que la tienda revise que todo esté y te confirme.
            {p.venceEn && (
              <>
                {" "}
                Si nadie lo confirma, se cierra en <CuentaAtras hasta={p.venceEn} />.
              </>
            )}
          </p>
        </>
      );
    case "confirmado": {
      const llegan = vivas(p)
        .flatMap((l) => (l.estado === "por_conseguir" && l.fechaCompromiso ? [l.fechaCompromiso] : []))
        .sort();
      return (
        <>
          <span className="w-estado-chip t-verde">Confirmado</span>
          <h1 className="w-titulo">
            ¡Confirmado! <em>Ya es tuyo.</em>
          </h1>
          <p className="w-texto-sec">
            {tienda} lo guardó para ti. {llegan.length > 0 && `Una prenda llega el ${diaCorto(llegan[llegan.length - 1])} y te avisan. `}
            {p.pagado > 0 ? `Ya pagaste una parte: falta ${solesEnFrase(p.falta)}.` : "Coordina el pago por WhatsApp."}
          </p>
        </>
      );
    }
    case "pagado":
      return p.listoParaRecoger ? (
        <>
          <span className="w-estado-chip t-verde">Pagado · listo para recoger</span>
          <h1 className="w-titulo">
            Te espera en <em>{p.tienda.nombre}.</em>
          </h1>
        </>
      ) : (
        <>
          <span className="w-estado-chip t-verde">Pagado</span>
          <h1 className="w-titulo">
            Ya pagaste <em>todo.</em>
          </h1>
          <p className="w-texto-sec">{tienda} te avisa por WhatsApp cuando esté listo para recoger.</p>
        </>
      );
    case "entregado":
      return (
        <>
          <span className="w-estado-chip t-neutro">Entregado</span>
          <h1 className="w-titulo">
            ¡Gracias por comprar <em>en CAYLA!</em>
          </h1>
          {p.entregadoEn && (
            <p className="w-texto-sec">
              Lo recogiste en {tienda} el {fechaLarga(p.entregadoEn)}.
            </p>
          )}
        </>
      );
    case "vencido":
      return (
        <>
          <span className="w-estado-chip t-neutro">Se cerró</span>
          <h1 className="w-titulo">
            Pasaron {plazos.horasParaConfirmar} horas <em>sin confirmar.</em>
          </h1>
          <p className="w-texto-sec">El pedido se cerró porque la tienda no llegó a confirmarlo. Puedes volver a separarlo.</p>
        </>
      );
    case "anulado":
      return (
        <>
          <span className="w-estado-chip t-rojo">Anulado</span>
          <h1 className="w-titulo">
            La tienda <em>anuló el pedido.</em>
          </h1>
          <p className="w-texto-sec">
            {/* La frase es para el cliente, no el motivo como lo eligió la tienda en el ERP (`porQueSeCerro`). */}
            {porQueSeCerro(p.cierreMotivo)} {textoDeDevolucion(p) ? `${textoDeDevolucion(p)} ` : ""}Si tienes dudas, escríbele a {tienda}.
          </p>
        </>
      );
  }
}

/**
 * «Todo se coordina por WhatsApp», al pie. Por confirmar, el botón grande de arriba ya manda el mensaje del pedido: aquí solo se dice con
 * quién. En los demás estados es el camino a la tienda, con el número del pedido escrito («Coordina el pago por WhatsApp», «Si tienes
 * dudas, escríbele»): antes el número de la tienda era texto suelto y en el celular había que copiarlo a mano.
 */
function ConLaTienda({ p, tienda }: { p: Pedido; tienda: string }) {
  const enlace = p.estado === "por_confirmar" ? null : enlaceParaHablarDelPedido(p);
  const contenido = (
    <>
      <Icono nombre="chat" />
      <span>
        <b>{enlace ? `Escríbele a ${tienda}` : "Todo se coordina por WhatsApp"}</b>
        <small>
          {enlace ? "Por WhatsApp" : tienda}
          {p.tienda.whatsapp ? ` · ${whatsappLegible(p.tienda.whatsapp)}` : ""}
        </small>
      </span>
    </>
  );
  return enlace ? (
    <a className="w-info w-info-enlace" href={enlace} target="_blank" rel="noopener noreferrer">
      {contenido}
      <Icono nombre="flecha" />
    </a>
  ) : (
    <div className="w-info">{contenido}</div>
  );
}

/** El botón o la caja de cada estado: WhatsApp por confirmar, el código para recoger, «Volver a separar». */
function Extra({ p, tienda, diasParaCambiar }: { p: Pedido; tienda: string; diasParaCambiar: number | null }) {
  if (p.estado === "por_confirmar") {
    const enlace = enlaceDelPedido(p);
    return enlace ? (
      <a className="t-btn t-btn-ancho t-btn-wsp" href={enlace} target="_blank" rel="noopener noreferrer">
        <Icono nombre="chat" />
        Enviar por WhatsApp
      </a>
    ) : (
      <p className="w-texto-sec">
        Escríbele a {tienda} con tu número de pedido, <span className="t-codigo">{p.codigo}</span>.
      </p>
    );
  }
  if (p.estado === "pagado" && p.listoParaRecoger && p.codigoRecojo) {
    return (
      <div className="w-codigo-caja">
        <small>Muestra este código en caja</small>
        <span className="w-codigo-recojo num">{p.codigoRecojo}</span>
        {p.recogerHasta && <small>Recoge hasta el {fechaLarga(p.recogerHasta)}</small>}
      </div>
    );
  }
  if (p.estado === "entregado") {
    return (
      <div className="w-info">
        <Icono nombre="tienda" />
        <span>
          <b>¿Necesitas cambiarlo?</b>
          <small>
            {textoCambiarlo(diasParaCambiar)} <Link href="/cambios-y-devoluciones">Cambios y devoluciones</Link>
          </small>
        </span>
      </div>
    );
  }
  if (p.estado === "vencido") {
    return (
      <form action={volverASeparar}>
        <input type="hidden" name="codigo" value={p.codigo} />
        <button className="t-btn t-btn-ancho" type="submit">
          Volver a separar
        </button>
      </form>
    );
  }
  return null;
}
