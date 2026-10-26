import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Lightbulb,
  MonitorSmartphone,
  PackageCheck,
  Shirt,
  Store,
  Undo2,
  Wallet,
} from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { SinFoto } from "@/components/ui/PrendaCelda";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { CaminoDePedidos } from "@/components/tienda-web/CaminoDePedidos";
import { MarcoWeb } from "@/components/tienda-web/MarcoWeb";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";
import { soles } from "@/lib/precio-sede-reglas";
import {
  fraseSinPedidos,
  fraseVentana,
  hayTiendasAMedias,
  lecturasCaidas,
  pendientesDe,
  sinPedidosAbiertos,
  type EntradaResumen,
  type IconoPendiente,
  type Pendiente,
  type TeselaWeb,
} from "@/lib/tienda-web-resumen";

const ICONO: Record<IconoPendiente, ReactNode> = {
  confirmar: <ClipboardCheck />,
  cobrar: <Wallet />,
  entregar: <PackageCheck />,
  devolver: <Undo2 />,
  recomendacion: <Lightbulb />,
  espera: <BellRing />,
  vitrina: <MonitorSmartphone />,
  look: <Shirt />,
  tienda: <Store />,
};

/**
 * Tienda web ▸ Resumen (ADR-0430, Felipe 2026-10-16): lo que la tienda online pide hoy, de un vistazo. Primero, lo que pide acción, de lo
 * urgente a lo que solo informa, cada cosa con la pantalla que la resuelve; después el camino de los pedidos de esta tienda (en una
 * línea si no hay ninguno abierto); y al final, como contexto, la vitrina como la ve el cliente (en su ventana de navegador) y cómo está
 * cada tienda en la web (propuesta A, Felipe 2026-10-26: la pregunta de la pantalla es «qué te pide hoy», no «cómo se ve»). Solo lee: cada bloque sale únicamente
 * si la cuenta ve el módulo de su pantalla, y si una lectura se cae, se dice y el resto se ve igual (principio 9).
 */
export function ResumenTiendaWeb({ entrada, teselas, tienda }: { entrada: EntradaResumen; teselas: TeselaWeb[] | null; tienda: string }) {
  const pendientes = pendientesDe(entrada);
  const caidas = lecturasCaidas(entrada);
  const sedes = entrada.ajustes.estado === "ok" ? entrada.ajustes.dato : null;
  const vitrina = entrada.vitrina.estado === "ok" ? entrada.vitrina.dato : null;
  const tiendasVisibles = sedes ? sedes.filter((s) => s.tono === "verde").length : null;
  const conVentana = entrada.vitrina.estado !== "sin_modulo";
  // «Tiendas en la web» solo cuando una está a medias: con todas bien repetía el pie de la ventana, y el caso a medias ya es un pendiente.
  const conTiendas = hayTiendasAMedias(sedes);

  // Lo que no tiene nada que decir baja (Felipe 2026-10-26): «Todo al día» y «sin pedidos abiertos» no son lo primero que hay que ver. Si hay algo
  // que hacer o pedidos abiertos, esa sección sigue arriba; con todo en calma, lo primero es la vitrina como la ve el cliente.
  const pendientesCalmos = pendientes.length === 0;
  const caminoCalmo = entrada.pedidos.estado === "ok" && sinPedidosAbiertos(entrada.pedidos.dato.cifras);

  const seccionPendientes = (
      <section className="space-y-3" data-guia="tienda-web.pendientes">
        <TituloSeccion cuenta={pendientes.length}>Lo que te pide hoy</TituloSeccion>
        {pendientes.length === 0 ? (
          <Vacio icono={<CheckCircle2 />} titulo="Todo al día" tamano="chico" alinear="izquierda">
            Nada de la tienda online espera por ti ahora. Si llega un pedido, aparece aquí y en el número del menú.
          </Vacio>
        ) : (
          <ul className="tw-bandeja">
            {pendientes.map((p, i) => (
              <li key={p.clave}>
                <FilaPendiente pendiente={p} i={i} />
              </li>
            ))}
          </ul>
        )}
      </section>
  );
  const seccionCamino = (
    <>
      {entrada.pedidos.estado === "ok" ? (
        <CaminoDePedidosResumen pedidos={entrada.pedidos.dato} tienda={tienda} />
      ) : entrada.pedidos.estado === "no_tienda" ? (
        <Aviso tono="info" titulo="Los pedidos web se atienden en una tienda">
          Cambia a una tienda desde el selector de arriba para ver el camino de sus pedidos.
        </Aviso>
      ) : null}
    </>
  );
  const seccionVentana = (
    <>
      {(conVentana || conTiendas) && (
        <div className={`grid gap-5 ${conVentana && conTiendas ? "xl:grid-cols-[minmax(0,1fr)_19rem]" : ""}`}>
          {conVentana && (
            // Sola (sin la tarjeta de tiendas al lado), la ventana conserva su tamaño de siempre: a todo el ancho sus prendas medían 225 px de alto.
            <div className={`min-w-0 ${conTiendas ? "" : "max-w-3xl"}`}>
            <MarcoWeb
              etiqueta="La vitrina de la tienda online, como la ve el cliente"
              i={0}
              guia="tienda-web.ventana"
              pie={
                <EnlaceVer href={DIRECCION_TIENDA_ONLINE} target="_blank">
                  Abrir la tienda
                </EnlaceVer>
              }
            >
              {entrada.vitrina.estado === "fallo" ? (
                <div className="p-5">
                  <Aviso tono="error" titulo="No se pudo leer la vitrina">
                    Recarga la página; si sigue, entra a Vitrina.
                  </Aviso>
                </div>
              ) : !teselas || teselas.length === 0 ? (
                <Vacio
                  icono={<MonitorSmartphone />}
                  titulo="Todavía no hay nada en la vitrina"
                  acciones={<BotonVer href="/tienda-web/vitrina">Elegir qué se ve</BotonVer>}
                >
                  Elige qué modelos se ven en la tienda online: el cliente los ve con su foto, al precio de la tienda que elige.
                </Vacio>
              ) : (
                <>
                  <div className="tw-mosaico">
                    {teselas.map((t, i) => (
                      <Tesela key={t.id} tesela={t} i={i} />
                    ))}
                  </div>
                  {vitrina && (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-sand px-5 py-3 text-[13px]">
                      <span className="text-tinta">
                        <b className="font-display text-[19px] font-normal tabular-nums">
                          <CifraQueCuenta valor={vitrina.cifras.seVen} alMontar />
                        </b>{" "}
                        <span className="text-taupe">{fraseVentana(vitrina.cifras.seVen, tiendasVisibles)}</span>
                      </span>
                      <BotonVer href="/tienda-web/vitrina" chico>
                        Ver la vitrina
                      </BotonVer>
                    </div>
                  )}
                </>
              )}
            </MarcoWeb>
            </div>
          )}

          {sedes && conTiendas && (
            <section className="card-cayla tw-entra self-start p-5" style={{ "--i": 1 } as CSSProperties} data-guia="tienda-web.tiendas">
              <TituloSeccion nivel={2} accion={<EnlaceVer href="/tienda-web/ajustes">Conf. Tienda</EnlaceVer>}>
                Tiendas en la web
              </TituloSeccion>
              <ul className="mt-2">
                {sedes.map((s, i) => (
                  <li key={s.id} className="tw-sede" style={{ "--i": i } as CSSProperties}>
                    <span aria-hidden className="tw-sede-punto" data-tono={s.tono} />
                    <span className="min-w-0">
                      <span className="block font-medium text-tinta">{s.nombre}</span>
                      <span className={`block text-[12.5px] ${s.tono === "ambar" ? "text-ambar-profundo" : "text-taupe"}`}>{s.texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-taupe">El cliente elige una de las que se ven para recoger lo que separa.</p>
            </section>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="tw space-y-8">
      {caidas.length > 0 && (
        <Aviso tono="atencion" titulo="Este resumen está incompleto">
          No se pudo leer {new Intl.ListFormat("es", { type: "conjunction" }).format(caidas)}. Recarga la página; si sigue, entra a su pantalla.
        </Aviso>
      )}

      {!pendientesCalmos && seccionPendientes}
      {!caminoCalmo && seccionCamino}
      {seccionVentana}
      {(pendientesCalmos || caminoCalmo) && (
        <div className="space-y-3">
          {pendientesCalmos && seccionPendientes}
          {caminoCalmo && seccionCamino}
        </div>
      )}
    </div>
  );
}

/** Una prenda de la ventana: su foto (o su categoría sobre su color, ADR-0333) y su nombre encima, como en la tienda. */
function Tesela({ tesela: t, i }: { tesela: TeselaWeb; i: number }) {
  // Sin foto: la prenda dibujada en su color, a todo el cuadro (ADR-0333), como la ve el cliente en la tienda.
  const sinFoto = <SinFoto tamano="h-full w-full !rounded-none" colorHex={t.colorHex} prefijo={t.prefijo} familia={t.familia} categoria={t.categoria} />;
  return (
    <Link href="/tienda-web/vitrina" className="tw-tesela" style={{ "--i": i } as CSSProperties} title={t.nombre}>
      <span>{t.foto ? <ImagenDePrenda src={t.foto} alt="" fill sizes="(min-width: 1280px) 140px, 30vw" className="object-cover" fondo={t.colorHex} fallback={sinFoto} /> : sinFoto}</span>
      {t.nuevo && <span className="tw-tesela-sello">Nuevo</span>}
      <span className="tw-tesela-pie">{t.nombre}</span>
    </Link>
  );
}

/** Una cosa por hacer: su ícono, su número que cuenta, qué pasa, por qué importa y a dónde ir. Toda la tarjeta lleva. */
function FilaPendiente({ pendiente: p, i }: { pendiente: Pendiente; i: number }) {
  return (
    <Link href={p.href} className="tw-pendiente" data-tono={p.tono} style={{ "--i": i } as CSSProperties}>
      <span aria-hidden className="tw-pendiente-icono">
        {ICONO[p.icono]}
      </span>
      <span className="min-w-0">
        <span className="tw-pendiente-titulo block">
          <b>
            <CifraQueCuenta valor={p.cifra} formato={p.formato} alMontar />
          </b>
          {p.titulo}
        </span>
        <span className="tw-pendiente-detalle block">{p.detalle}</span>
      </span>
      <span className="tw-pendiente-ir">
        {p.accion}
        <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

/** Los pedidos de esta tienda en su camino: las mismas cuatro estaciones que Pedidos, y cada una lleva ahí con su filtro puesto. Lo
 *  cobrado hoy va en el título: no es un paso del pedido (ADR-0430, act. 2026-10-17). */
function CaminoDePedidosResumen({ pedidos, tienda }: { pedidos: Extract<EntradaResumen["pedidos"], { estado: "ok" }>["dato"]; tienda: string }) {
  const { cifras: c, plazos } = pedidos;
  // Sin ningún pedido abierto, cuatro tarjetas en cero no dicen nada: una línea, con lo cerrado y el enlace a Pedidos (propuesta A, 2026-10-26).
  if (sinPedidosAbiertos(c)) {
    return (
      <section data-guia="tienda-web.camino">
        <Vacio icono={<Clock />} tamano="chico" alinear="izquierda" accion={{ texto: "Ver pedidos", href: "/tienda-web/pedidos" }}>
          {fraseSinPedidos(tienda, c.cerrados)}
        </Vacio>
      </section>
    );
  }
  return (
    <section className="space-y-3" data-guia="tienda-web.camino">
      <TituloSeccion dato={c.cobradoHoy > 0 ? <>En {tienda} · cobrado hoy {soles(c.cobradoHoy)}</> : <>En {tienda}</>}>El camino de los pedidos</TituloSeccion>
      <CaminoDePedidos cifras={c} plazos={plazos} etiqueta={`El camino de los pedidos web de ${tienda}: cada estación lleva a sus pedidos`} />
    </section>
  );
}
