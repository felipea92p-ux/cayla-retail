import { BotonDeFormulario } from "@/components/BotonDeFormulario";
import { TituloConLetras } from "@/components/TituloConLetras";
import type { Metadata } from "next";
import Link from "next/link";
import { elegirTiendaDeRecojo, quitarDeLaBolsa } from "@/app/acciones/bolsa";
import { CantidadEnLaBolsa } from "@/components/bolsa/CantidadEnLaBolsa";
import { FormularioSeparar } from "@/components/bolsa/FormularioSeparar";
import { Miniatura } from "@/components/bolsa/Miniatura";
import { TotalQueCuenta } from "@/components/bolsa/NumeroQueCuenta";
import { Promesas } from "@/components/bolsa/Promesas";
import { SigueMirando } from "@/components/bolsa/SigueMirando";
import { SubirAlLlenar } from "@/components/bolsa/SubirAlLlenar";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { Icono } from "@/components/Icono";
import { leerAyuda } from "@/lib/ayuda-servidor";
import {
  carrilesDeLaBolsaVacia,
  cuantas,
  importe,
  ofreceOtra,
  prendaParaLeer,
  textoDeLaMarca,
  TOPE_POR_PRENDA,
  vistaBolsa,
  yaNoEsta,
  type CarrilDeLaBolsaVacia,
} from "@/lib/bolsa";
import { leerBolsaDeLaCookie, leerBolsaEnBase } from "@/lib/bolsa-servidor";
import { formaDe, fotoOptimizable, hrefDePrenda, hrefLista, soles } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { aplicaA } from "@/lib/diseno-campana";
import { leerDisenoDeCampana } from "@/lib/diseno-campana-servidor";
import { leerPortada } from "@/lib/portada-servidor";
import { pctTexto } from "@/lib/portada";
import { leerGuardadosEnBase } from "@/lib/club-servidor";
import { promesasDeCompra } from "@/lib/ficha";
import { detalleDeLaPrenda, nombreTienda } from "@/lib/pedidos";
import { claveDeSede, sedesEnOrden, soloTiendas } from "@/lib/sede-elegida";
import { sedeDeLaPagina } from "@/lib/sede-servidor";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { cuponDicho } from "@/lib/puntos";
import { leerMisPuntosEnBase } from "@/lib/puntos-servidor";
import { notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../estilos/catalogo.css";
import "../estilos/bolsa.css";
import "../estilos/campana.css";

export const metadata: Metadata = { title: "Tu bolsa · CAYLA", robots: { index: false, follow: false } };

/** Lo que dice cada carril de la bolsa vacía y a qué lista lleva su «Ver todo». */
const CARRIL_DE_LA_BOLSA: Record<CarrilDeLaBolsaVacia["lista"], { ceja: string; titulo: [string, string]; href: string }> = {
  favoritos: { ceja: "Guardado por ti", titulo: ["Tus", "favoritos"], href: hrefLista({ lista: "favoritos", categoria: null, orden: "destacado" }) },
  nuevo: { ceja: "Recién llegado", titulo: ["Lo", "nuevo"], href: hrefLista({ lista: "nuevo", categoria: null, orden: "destacado" }) },
  todo: { ceja: "Para empezar", titulo: ["Toda la", "tienda"], href: hrefLista({ categoria: null, orden: "destacado" }) },
};

/**
 * La bolsa (maqueta v4, `vBolsa`): las prendas, la tienda donde se recoge TODO (una para todo: lo que no está ahí, la tienda lo trae
 * de otra) y el total con los precios de ESA tienda (sin tienda, el mayor de la web, como el catálogo con «Todas»). «Separar» crea
 * el pedido por confirmar: no se paga nada en la web. Los precios, lo que hay y lo que se puede separar los dice la base cada vez
 * (`retail.tienda_bolsa`); la bolsa solo guarda qué prendas y cuántas. El resumen termina con lo que la tienda ya cumple (las promesas
 * de la ficha, en corto) y, arriba, «Seguir mirando» vuelve a la tienda. Vacía, ofrece sus favoritos y Lo nuevo en carriles (2026-10-16).
 */
export default async function Bolsa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sesion = await leerSesion();
  // La bolsa se arma sin cuenta (vive en la cookie de este aparato); la cuenta se pide al «Separar» (Felipe 2026-10-17).
  const visitante = sesion.estado === "sin_sesion";
  // Con cuenta pero sin Club (ADR-0438), «Separar» pide completar el documento y el celular antes: se sabe aquí, sin esperar a que la base diga que no.
  const lectura = sesion.estado === "con_sesion" ? await leerMiCuentaEnBase(sesion.usuarioId) : null;
  const sinClub = lectura?.estado === "cuenta" && !lectura.cuenta.esDelClub;
  if (sesion.estado === "sin_respuesta")
    return <Aviso titulo="No pudimos revisar tu sesión" texto="Vuelve a intentarlo en unos minutos." />;

  const bolsa = await leerBolsaDeLaCookie();
  // El diseño de la campaña que anuncia la portada: la línea de cada prenda dice de qué campaña es su descuento, con el color de su sello.
  const diseno = await leerPortada().then(({ campana }) => leerDisenoDeCampana(campana?.nombre));
  // La tienda en la que se está (ADR-0465, Felipe 2026-10-21: «es importante mostrar la sede»): con prendas, la de la bolsa (cambiar de tienda la
  // vacía); sin ellas, la de la dirección o la que se eligió la última vez. Con ella, el selector de la cabecera y el catálogo de ESA tienda
  // (en Lima, con lo de CLAURE y su empresa en cada tarjeta).
  const sedes = sedesEnOrden(await leerSedes());
  const deLaBolsa = bolsa.lineas.length > 0 && bolsa.sedeId ? sedes.find((s) => s.id === bolsa.sedeId) ?? null : null;
  const elegida = deLaBolsa ?? (await sedeDeLaPagina(sp, sedes, "/bolsa", claveDeSede));
  const tiendasDeLaCabecera = soloTiendas(
    sedes.map((s) => ({ nombre: s.nombre, href: `/bolsa?sede=${claveDeSede(s.nombre)}`, actual: s.id === elegida?.id })),
  );
  const prendasEnBolsa = bolsa.lineas.reduce((n, l) => n + l.cantidad, 0);
  if (bolsa.lineas.length === 0) {
    // Vacía no es un callejón (2026-10-16): sus favoritos y Lo nuevo, en carriles, para llenarla desde aquí. El catálogo es la misma
    // lectura de la cabecera (`MarcoCuenta`, con «Todas»); si la base no responde, solo queda el vacío con sus dos caminos.
    const [catalogo, guardados] = await Promise.all([leerCatalogo(elegida?.id ?? null), sesion.estado === "con_sesion" ? leerGuardadosEnBase(sesion.usuarioId) : null]);
    const tiendas = sedes;
    const favoritos = guardados?.favoritos ?? new Set<string>();
    const carriles = carrilesDeLaBolsaVacia(catalogo?.prendas ?? [], favoritos);
    const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
    return (
      <MarcoCuenta conCuenta conPie visitante={visitante} tiendas={tiendasDeLaCabecera} prendasEnBolsa={prendasEnBolsa}>
        <div className="t-ancho cp-bolsa-vacia">
          <SubirAlLlenar />
          <div className="t-vacio">
            <Icono nombre="bolsa" />
            <h3>Tu bolsa está vacía</h3>
            <p>Elige una prenda y su talla, o agrega un look completo.</p>
            <div className="cp-vacio-acciones">
              <Link className="t-btn" href="/catalogo">
                Ver toda la tienda
              </Link>
              <Link className="t-btn t-btn-sec" href="/looks">
                Ver los looks
              </Link>
            </div>
          </div>
          {carriles.map((c) => (
            <SigueMirando
              key={c.lista}
              id={`bolsa-${c.lista}`}
              {...CARRIL_DE_LA_BOLSA[c.lista]}
              prendas={c.prendas}
              sede={elegida ? claveDeSede(elegida.nombre) : null}
              origenFotos={origenFotos}
              nota={(p) => notaDeStock(p.stock, elegida, tiendas)}
              guardados={favoritos}
            />
          ))}
        </div>
      </MarcoCuenta>
    );
  }

  // Los plazos de las promesas del resumen (la misma lectura de la ayuda) van junto con la bolsa: una sola espera.
  // Sus cupones vivos (20261019224000), para elegirlos con un toque en «Código de cupón». Si «Mi Club» no responde, el campo sigue: se escribe.
  const conCupon = sesion.estado === "con_sesion" && !sinClub;
  const [enBase, plazos, puntos] = await Promise.all([
    leerBolsaEnBase(bolsa.lineas, bolsa.sedeId),
    leerAyuda(),
    conCupon ? leerMisPuntosEnBase(sesion.usuarioId) : null,
  ]);
  const misCupones =
    puntos?.estado === "ok" ? puntos.puntos.cupones.filter((c) => c.estado === "activo").map((c) => ({ codigo: c.codigo, texto: cuponDicho(c) })) : [];
  if (!enBase)
    return (
      <Aviso
        titulo="No pudimos cargar tu bolsa"
        texto="Es un problema de conexión de nuestro lado. Tu bolsa sigue aquí: vuelve a intentarlo en un momento."
        reintentar
        visitante={visitante}
      />
    );
  const v = vistaBolsa(enBase);
  const promesas = promesasDeCompra(plazos);
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  const sedeDeLaFicha = v.sede ? claveDeSede(v.sede.nombre) : null;
  const totalPrendas = bolsa.lineas.reduce((n, l) => n + l.cantidad, 0);

  return (
    <MarcoCuenta conCuenta conPie visitante={visitante} tiendas={tiendasDeLaCabecera} prendasEnBolsa={prendasEnBolsa}>
      <div className="t-ancho">
        <header className="t-lista-cab t-bolsa-cab cp-sec-cab">
          <span className="t-ceja">Tu bolsa</span>
          <TituloConLetras primera={cuantas(totalPrendas)} cursiva="por separar" />
          <Link className="t-ver" href="/catalogo">
            Seguir mirando <Icono nombre="flecha" />
          </Link>
        </header>
        <div className="t-bolsa">
          <div className="t-bolsa-principal">
            <div className="t-bolsa-items">
              {v.lineas.map(({ linea, marca, importe: monto, antes }, orden) => {
                const texto = textoDeLaMarca(marca);
                // «Quitar» saca la prenda entera (la cantidad se baja con «−»), y dice cuál para quien usa lector de pantalla. Si la
                // prenda ya no se puede separar (agotada o fuera de la tienda online), quitarla es lo que toca: va como botón, no enlace.
                const urgente = marca.tipo === "agotada" || marca.tipo === "no_esta";
                const quitar = (leer: string) => (
                  <form action={quitarDeLaBolsa} className="t-bolsa-quitar">
                    <input type="hidden" name="variante" value={linea.varianteId} />
                    <input type="hidden" name="vista" value={linea.cantidad} />
                    <input type="hidden" name="todas" value="1" />
                    <BotonDeFormulario className={`w-quitar${urgente ? " urgente" : ""}`} textoPendiente="Quitando…" aria-label={`Quitar de tu bolsa: ${leer}`}>
                      Quitar
                    </BotonDeFormulario>
                  </form>
                );
                if (yaNoEsta(linea)) {
                  return (
                    <div key={linea.varianteId} className="t-bolsa-item" data-marca="no_esta" style={{ "--i": orden } as React.CSSProperties}>
                      <div className="t-bolsa-foto">
                        <Miniatura foto={null} optimizar={false} forma="percha" color={null} />
                      </div>
                      <span>
                        <b>Una prenda que ya no está</b>
                        <em>{texto}</em>
                      </span>
                      <div className="t-bolsa-acc">{quitar("una prenda que ya no está")}</div>
                    </div>
                  );
                }
                const href = hrefDePrenda({ id: linea.productoId }, sedeDeLaFicha);
                const leer = prendaParaLeer(linea);
                return (
                  <div key={linea.varianteId} className="t-bolsa-item" data-marca={marca.tipo} style={{ "--i": orden } as React.CSSProperties}>
                    <Link href={href} tabIndex={-1} aria-hidden="true" className="t-bolsa-foto">
                      <Miniatura
                        foto={linea.foto}
                        optimizar={linea.foto ? fotoOptimizable(linea.foto, origenFotos) : false}
                        forma={formaDe(linea.categoria?.prefijo)}
                        color={linea.color.hex}
                      />
                    </Link>
                    <span>
                      {/* La empresa de la prenda, encima de su nombre (ADR-0465; solo en Lima, donde conviven CAYLA y CLAURE). */}
                      {linea.empresa && <span className="t-bolsa-empresa">{linea.empresa.nombre}</span>}
                      <Link className="t-card-nom" href={href}>
                        {linea.nombre}
                      </Link>
                      <small>{detalleDeLaPrenda(linea)}</small>
                      {/* De qué campaña es el descuento (si el líder dejó la línea de la bolsa encendida), con el color de su sello. */}
                      {diseno?.donde.bolsa && aplicaA(diseno, linea.campana?.nombre) && linea.campana && (
                        <span className="t-bolsa-campana" style={{ background: diseno.sello.fondo, color: diseno.sello.texto }}>
                          {linea.campana.nombre} −{pctTexto(linea.campana.pct)} %
                        </span>
                      )}
                      {texto &&
                        (marca.tipo === "hay" ? (
                          <small className="t-ok">
                            <Icono nombre="check" />
                            {texto}
                          </small>
                        ) : (
                          <em>{texto}</em>
                        ))}
                    </span>
                    <span className="t-bolsa-der">
                      <b className="num">{importe(monto)}</b>
                      {/* Con campaña, lo que costaría sin ella, tachado (como en la ficha y la tarjeta). */}
                      {antes !== null && (
                        <s className="num">
                          <span className="t-sr">Antes </span>
                          {importe(antes)}
                        </s>
                      )}
                    </span>
                    <div className="t-bolsa-acc">
                      {/* Agotada: la cantidad no se puede cambiar (ni hay de dónde), solo quitarla. */}
                      {!urgente && (
                        <CantidadEnLaBolsa varianteId={linea.varianteId} cantidad={linea.cantidad} prenda={leer} puedeSumar={ofreceOtra(marca) && linea.cantidad < TOPE_POR_PRENDA} />
                      )}
                      {quitar(leer)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* La bolsa es de UNA tienda, la que se eligió arriba (cambiarla vacía la bolsa): se muestra solo esa. Solo si todavía no
                tiene tienda (una bolsa vieja) se ofrecen las demás para elegir. */}
            {v.sede && v.tiendas.some((t) => t.elegida) ? (
              <div id="bloque-tienda" className="w-bloque t-bolsa-tiendas" data-campo="tienda" data-estado="hecho">
                <span className="w-lbl">Recoges en</span>
                {v.tiendas
                  .filter((t) => t.elegida)
                  .map((t) => (
                    <div key={t.sede.id} className="w-opcion t-op-tienda t-op-fija">
                      <span className="w-opcion-cab">
                        <span className="w-opcion-t">
                          <b>{nombreTienda(t.sede.nombre)}</b>
                          {t.texto && <small>{t.texto}</small>}
                        </span>
                        <Icono nombre="tienda" />
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
            v.tiendas.length > 0 && (
              <div id="bloque-tienda" className="w-bloque t-bolsa-tiendas" data-campo="tienda" data-estado={v.sede ? "hecho" : "sigue"}>
                <span className="w-lbl" id="tienda-de-recojo">
                  ¿En qué tienda lo recoges? <span className="w-marca">{v.sede ? "✓ Listo" : "Sigue aquí"}</span>
                </span>
                <form action={elegirTiendaDeRecojo} className="w-lista" role="group" aria-labelledby="tienda-de-recojo">
                  {v.tiendas.map((t) => (
                    <BotonDeFormulario
                      key={t.sede.id}
                      className="w-opcion t-op-tienda"
                      name="sede"
                      value={t.sede.id}
                      aria-pressed={t.elegida}
                    >
                      <span className="w-opcion-cab">
                        <span className="w-radio" />
                        <span className="w-opcion-t">
                          <b>{nombreTienda(t.sede.nombre)}</b>
                          {t.texto && <small>{t.texto}</small>}
                        </span>
                        <Icono nombre="tienda" />
                      </span>
                    </BotonDeFormulario>
                  ))}
                </form>
              </div>
            ))}
          </div>

          {/* El resumen y «Separar»: en la computadora, la columna de la derecha que acompaña al bajar; en el celular, «Separar» queda
              pegado abajo (`bolsa.css`). */}
          <div className="t-bolsa-lado">
            <aside className="t-resumen" aria-label="Resumen">
              <h3>Resumen</h3>
              <div className="w-resumen">
                {/* Sin campañas el subtotal es el total; con ellas, «Prendas − Ahorras = Total» cuadra a la vista. */}
                <div>
                  <span>Prendas ({v.prendas})</span>
                  <span className="num">{soles(v.subtotal)}</span>
                </div>
                {v.ahorro > 0 && (
                  <div>
                    <span>Ahorras con las campañas</span>
                    <span className="num t-ahorro">−{soles(v.ahorro)}</span>
                  </div>
                )}
                <div className="tot">
                  <span>Total de tu pedido</span>
                  {/* G · Pasarela (ADR-0524): el total rueda hasta su valor al llegar y cada vez que cambia. */}
                  <span className="num">
                    <TotalQueCuenta valor={v.total} />
                  </span>
                </div>
              </div>
              {/* Lo que la tienda ya cumple, en corto (el detalle está en la ficha y en «Cómo separar»). */}
              <Promesas promesas={promesas} compacta />
            </aside>

            {/* El aviso de un intento que no separó se queda mientras la bolsa sea la misma (su marca); al quitar una prenda o cambiar
                de tienda, se va. */}
            <FormularioSeparar
              lineas={v.paraSeparar}
              marca={bolsa.marca}
              sedeId={v.sede?.id ?? null}
              listo={v.listo}
              sinCuenta={visitante}
              sinClub={sinClub}
              faltaTienda={v.faltaTienda}
              boton={v.boton}
              conCupon={conCupon}
              misCupones={misCupones}
              nota={
                <>
                  {v.nota.antes}
                  {v.nota.destacado && <b>{v.nota.destacado}</b>}
                  {v.nota.despues}
                </>
              }
            />
          </div>
        </div>
      </div>
    </MarcoCuenta>
  );
}

function Aviso({ titulo, texto, reintentar = false, visitante = false }: { titulo: string; texto: string; reintentar?: boolean; visitante?: boolean }) {
  return (
    <MarcoCuenta conCuenta conPie visitante={visitante}>
      <div className="t-ancho">
        <div className="t-vacio" role="status">
          <Icono nombre="bolsa" />
          <h3>{titulo}</h3>
          <p>{texto}</p>
          {reintentar && (
            <Link className="t-btn" href="/bolsa">
              Volver a intentar
            </Link>
          )}
        </div>
      </div>
    </MarcoCuenta>
  );
}
