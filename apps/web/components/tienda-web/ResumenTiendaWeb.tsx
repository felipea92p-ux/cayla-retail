import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
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
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { ImagenDePrenda } from "@/components/ui/ImagenDePrenda";
import { Camino } from "@/components/tienda-web/Camino";
import { MarcoWeb } from "@/components/tienda-web/MarcoWeb";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";
import { plazoCorto, URGENTE_MS } from "@/lib/pedidos-web-reglas";
import {
  fraseVentana,
  lecturasCaidas,
  pendientesDe,
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
 * Tienda web ▸ Resumen (ADR-0430, Felipe 2026-10-16): lo que la tienda online pide hoy, de un vistazo. Arriba, la vitrina como la ve el
 * cliente (en su ventana de navegador) y cómo está cada tienda en la web; después, lo que pide acción, de lo urgente a lo que solo
 * informa, cada cosa con la pantalla que la resuelve; y el camino de los pedidos de esta tienda. Solo lee: cada bloque sale únicamente
 * si la cuenta ve el módulo de su pantalla, y si una lectura se cae, se dice y el resto se ve igual (principio 9).
 */
export function ResumenTiendaWeb({ entrada, teselas, tienda }: { entrada: EntradaResumen; teselas: TeselaWeb[] | null; tienda: string }) {
  const pendientes = pendientesDe(entrada);
  const caidas = lecturasCaidas(entrada);
  const sedes = entrada.ajustes.estado === "ok" ? entrada.ajustes.dato : null;
  const vitrina = entrada.vitrina.estado === "ok" ? entrada.vitrina.dato : null;
  const tiendasVisibles = sedes ? sedes.filter((s) => s.tono === "verde").length : null;
  const conVentana = entrada.vitrina.estado !== "sin_modulo";

  return (
    <div className="tw space-y-8">
      {caidas.length > 0 && (
        <Aviso tono="atencion" titulo="Este resumen está incompleto">
          No se pudo leer {new Intl.ListFormat("es", { type: "conjunction" }).format(caidas)}. Recarga la página; si sigue, entra a su pantalla.
        </Aviso>
      )}

      {(conVentana || sedes) && (
        <div className={`grid gap-5 ${conVentana && sedes ? "xl:grid-cols-[minmax(0,1fr)_19rem]" : ""}`}>
          {conVentana && (
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
          )}

          {sedes && (
            <section className="card-cayla tw-entra self-start p-5" style={{ "--i": 1 } as CSSProperties} data-guia="tienda-web.tiendas">
              <TituloSeccion nivel={2} accion={<EnlaceVer href="/tienda-web/ajustes">Datos y plazos</EnlaceVer>}>
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

      {entrada.pedidos.estado === "ok" ? (
        <CaminoDePedidos pedidos={entrada.pedidos.dato} tienda={tienda} />
      ) : entrada.pedidos.estado === "no_tienda" ? (
        <Aviso tono="info" titulo="Los pedidos web se atienden en una tienda">
          Cambia a una tienda desde el selector de arriba para ver el camino de sus pedidos.
        </Aviso>
      ) : null}

      <div className="nota-cayla space-y-2 text-[13px]" data-guia="tienda-web.nota">
        <p>
          Este resumen solo mira: cada cosa se resuelve en su pantalla, a un toque. Muestra lo que tu rol ve; si una pantalla de Tienda web no
          te aparece en el menú, aquí tampoco. Los pedidos son los de la tienda en la que estás; la vitrina, las recomendaciones y los
          ajustes son de toda CAYLA.
        </p>
      </div>
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

/** Los pedidos de esta tienda en su camino: confirmar → cobrar → entregar, y lo cobrado hoy aparte. Cada cifra lleva a su pestaña. */
function CaminoDePedidos({ pedidos, tienda }: { pedidos: Extract<EntradaResumen["pedidos"], { estado: "ok" }>["dato"]; tienda: string }) {
  const { cifras: c, plazos } = pedidos;
  const urgente = c.proximoVenceEnMs !== null && c.proximoVenceEnMs < URGENTE_MS;
  return (
    <section className="space-y-3" data-guia="tienda-web.camino">
      <TituloSeccion dato={<>En {tienda}</>}>El camino de los pedidos</TituloSeccion>
      <Camino
        etiqueta={`El camino de los pedidos web de ${tienda}`}
        tramos={[
          { verbo: "Confirmas", plazo: `en ${plazos.horasParaConfirmar} h` },
          { verbo: "Paga", plazo: `en ${plazos.horasAvisoSinPagar} h` },
        ]}
        pasos={[
          <TarjetaCifra
            key="confirmar"
            punto={c.porConfirmar > 0 ? (urgente ? "rojo" : "ambar") : "neutro"}
            etiqueta="Por confirmar"
            className="anim-entra"
            style={{ ["--i" as string]: 0 }}
            valor={<CifraQueCuenta valor={c.porConfirmar} alMontar />}
            href="/tienda-web/pedidos?pestana=confirmar"
          >
            {c.proximoVenceEnMs !== null ? `El próximo vence en ${plazoCorto(c.proximoVenceEnMs)}` : "Nada esperando"}
          </TarjetaCifra>,
          <TarjetaCifra
            key="cobrar"
            punto={c.sinPagar > 0 ? "rojo" : c.confirmados > 0 ? "ambar" : "neutro"}
            etiqueta="Por cobrar"
            className="anim-entra"
            style={{ ["--i" as string]: 1 }}
            valor={<CifraQueCuenta valor={c.porCobrar} formato="soles" alMontar />}
            href="/tienda-web/pedidos?pestana=cobrar"
          >
            {c.confirmados === 0 ? "Nada por cobrar" : `${c.confirmados} ${c.confirmados === 1 ? "pedido confirmado" : "pedidos confirmados"}`}
          </TarjetaCifra>,
          <TarjetaCifra
            key="entregar"
            punto={c.sinRecoger > 0 ? "rojo" : c.porEntregar > 0 ? "verde" : "neutro"}
            etiqueta="Por entregar"
            className="anim-entra"
            style={{ ["--i" as string]: 2 }}
            valor={<CifraQueCuenta valor={c.porEntregar} alMontar />}
            href="/tienda-web/pedidos?pestana=entregar"
          >
            {`Recoge en ${plazos.diasAvisoSinRecoger} días, con su código`}
          </TarjetaCifra>,
        ]}
        cierre={
          <TarjetaCifra
            punto="neutro"
            etiqueta="Cobrado hoy"
            className="anim-entra"
            style={{ ["--i" as string]: 3 }}
            valor={<CifraQueCuenta valor={c.cobradoHoy} formato="soles" alMontar />}
          >
            En pedidos web
          </TarjetaCifra>
        }
      />
    </section>
  );
}
