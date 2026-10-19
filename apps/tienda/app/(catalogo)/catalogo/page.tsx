import type { Metadata } from "next";
import Link from "next/link";
import { SigueMirando } from "@/components/bolsa/SigueMirando";
import { BotonBuscarCatalogo } from "@/components/BotonBuscarCatalogo";
import { ElegidoALaVista } from "@/components/ElegidoALaVista";
import { FiltrosDeLista } from "@/components/FiltrosDeLista";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { MasPrendas } from "@/components/MasPrendas";
import { PendienteDelEnlace } from "@/components/PendienteDelEnlace";
import { TusLooks } from "@/components/probador/TusLooks";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import {
  cabeceraDeLista,
  campanasDe,
  categoriasDe,
  conteoDeLista,
  deFavoritos,
  filtrarYOrdenar,
  fotoOptimizable,
  hrefLista,
  leerCampana,
  leerCategoria,
  leerLista,
  leerOrden,
  nombreOrden,
  siguienteOrden,
  type CampanaVigente,
  type Lista,
} from "@/lib/catalogo";
import { categoriasConLaElegida, dondeHay, gruposConLoElegido, paraSeguirMirando, queSeBusca, vacioEnTienda } from "@/lib/catalogo-lista";
import { leerGuardadosEnBase } from "@/lib/club-servidor";
import { delGrupo, delMenu, grupoDe, gruposDe, leerGrupo, leerMenu, MENUS, tituloPartido } from "@/lib/grupos";
import { leerMisLooksEnBase } from "@/lib/looks-guardados-servidor";
import { armarProbador } from "@/lib/probador";
import { leerProbador } from "@/lib/probador-servidor";
import { fechaLarga, pctTexto } from "@/lib/portada";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { sedeDeLaPagina } from "@/lib/sede-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { conMostrar, leerMostrar, tandaDe } from "@/lib/tandas";
import { leerSedes } from "@/lib/tiendas-servidor";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITULOS: Record<Lista, string> = {
  todo: "Toda la tienda",
  nuevo: "Lo nuevo",
  ofertas: "Ofertas",
  vendidos: "Más vendidos",
  favoritos: "Tus favoritos",
};

/** Cuántas tarjetas de arriba cargan su foto apenas llega la página (las que se ven sin bajar: 2 en el celular, 4 en la computadora). */
const ARRIBA = 4;

// El título de la pestaña dice lo que se ve, como el de la página: la categoría (con su nombre: la lectura del catálogo es la misma de
// la página, una sola por visita) o el grupo.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const lista = leerLista(sp.lista);
  if (lista !== "todo") return { title: `${TITULOS[lista]} · CAYLA` };
  const pedida = leerCategoria(sp.categoria);
  if (pedida) {
    const sedes = sedesEnOrden(await leerSedes());
    const catalogo = await leerCatalogo(sedeDeLaUrl(sp.sede, sedes)?.id ?? null);
    const categoria = categoriasDe(catalogo?.prendas ?? []).find((c) => c.clave === pedida);
    if (categoria) return { title: `${categoria.nombre} · CAYLA` };
  }
  return { title: `${leerGrupo(sp.grupo)?.nombre ?? leerMenu(sp.menu)?.nombre ?? TITULOS.todo} · CAYLA` };
}

// Las listas del catálogo (maqueta v4, `vLista` y `filtroTienda`): toda la tienda, Lo nuevo, las ofertas (con una tarjeta por campaña),
// los más vendidos (en su ranking) y «Tus favoritos» (lo que el cliente guardó con el corazón), de lo que el ERP muestra en Catálogo ▸
// Vitrina web, al precio de la tienda que el cliente elige en «Ver lo que hay en» o, con «Todas», al mayor entre las tiendas de la web,
// con la campaña encima. Con una tienda elegida, solo lo que hay en ella («N más en otras tiendas»; los favoritos no: lo guardado se ve
// igual), y cada tarjeta dice cuánto queda como nivel, nunca la cifra. Si la tienda elegida no tiene nada de lo pedido y otra sí, la
// lista dice dónde hay y lleva allá. Se lee en cada visita (la dirección trae la lista, la tienda, la categoría, la campaña y el orden):
// lo que se enciende, se apaga o se vende se ve al recargar.
export default async function Catalogo({ searchParams }: Props) {
  const sp = await searchParams;
  const lista = leerLista(sp.lista);
  const orden = leerOrden(sp.orden);
  const categoriaPedida = leerCategoria(sp.categoria);
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = await sedeDeLaPagina(sp, sedes, "/catalogo", claveDeSede);
  const esFavoritos = lista === "favoritos";
  const sesion = esFavoritos ? await leerSesion() : null;
  // Lo guardado es la misma lectura del marco del catálogo (una sola consulta por visita). En los favoritos, también los looks que armó
  // en «Arma el tuyo» (ADR-0434, actividad 8) y lo del probador para dibujarlos: si no llegan, la lista de prendas se ve igual.
  const conCuenta = sesion?.estado === "con_sesion" ? sesion.usuarioId : null;
  const [catalogo, guardados, misLooks, lecturaProbador] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    conCuenta ? leerGuardadosEnBase(conCuenta) : null,
    conCuenta ? leerMisLooksEnBase(conCuenta) : null,
    conCuenta ? leerProbador(pedida?.id ?? null) : null,
  ]);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const prendas = catalogo?.prendas ?? null;
  // La categoría pedida, si existe en lo publicado (en cualquier tienda). Una que no existe (un enlace viejo, una dirección escrita a
  // mano) se ignora como un grupo, una lista o una campaña que no existen: se ve la lista entera, nunca «0 prendas» con un grupo
  // cualquiera encendido.
  const categoriaElegida = categoriaPedida ? categoriasDe(prendas ?? []).find((c) => c.clave === categoriaPedida) ?? null : null;
  const categoria = categoriaElegida?.clave ?? null;
  // Un grupo de categorías (lib/grupos.ts: «Arriba», «Bolsos y accesorios»…), el de los títulos de los menús de la cabecera. Con una
  // categoría elegida no hace falta: ella dice su grupo.
  const grupoPedido = categoria ? null : leerGrupo(sp.grupo);
  // Un menú de la cabecera («Ropa», «Accesorios»): toda la ropa junta. Se queda aunque se elija un grupo o una categoría de adentro; si lo
  // elegido es de otro menú (una dirección escrita a mano) o son los favoritos, se ignora, como un grupo que no existe.
  const menuLeido = leerMenu(sp.menu);
  const menuPedido =
    menuLeido &&
    !esFavoritos &&
    (!categoriaElegida || grupoDe(categoriaElegida.clave).menu === menuLeido.clave) &&
    (!grupoPedido || grupoPedido.menu === menuLeido.clave)
      ? menuLeido
      : null;
  const claveMenu = menuPedido?.clave ?? null;
  // Con una tienda elegida, solo lo que hay en ella (maqueta, `hayEnFiltro`): las categorías, las campañas y el conteo salen de ahí.
  // Los favoritos, no: son lo guardado, en su orden (lo último primero), haya o no en esa tienda.
  const enLaTienda = prendas ? prendas.filter((p) => hayEnTienda(p.stock, elegida?.id ?? null)) : [];
  const favoritosSinLeer = esFavoritos && guardados === null;
  const base = esFavoritos ? deFavoritos(prendas ?? [], guardados?.favoritos ?? []) : delMenu(enLaTienda, claveMenu);
  const campanas = lista === "ofertas" ? campanasDe(base) : [];
  const campana = campanas.find((c) => c.id === leerCampana(sp.campana))?.id ?? null;
  const deLaLista = filtrarYOrdenar(base, { categoria: null, orden: "destacado", lista, campana });
  // La lista en todas las tiendas: si tampoco ahí hay nada, lo que falta no es la tienda (la lista dice su propio vacío).
  const enTodas = esFavoritos ? deLaLista : filtrarYOrdenar(delMenu(prendas ?? [], claveMenu), { categoria: null, orden: "destacado", lista, campana });
  const vista = delGrupo(filtrarYOrdenar(base, { categoria, orden, lista, campana }), grupoPedido);
  // Las tarjetas se dibujan en tandas (lib/tandas.ts): las primeras 24 y, al acercarse al final, las que siguen. El conteo y los filtros
  // siguen siendo de la lista entera.
  const tanda = tandaDe(vista.length, leerMostrar(sp.mostrar));
  const loPedidoEnTodas = esFavoritos ? vista : delGrupo(filtrarYOrdenar(delMenu(prendas ?? [], claveMenu), { categoria, orden, lista, campana }), grupoPedido);
  const enOtras = loPedidoEnTodas.length - vista.length;
  // El grupo encendido: el pedido o el de la categoría elegida. Lo elegido sale en los filtros aunque esta tienda no tenga nada de eso
  // (con 0): la persona ve dónde está.
  const grupoActivo = grupoPedido ?? (categoriaElegida ? grupoDe(categoriaElegida.clave) : null);
  const grupos = gruposConLoElegido(gruposDe(deLaLista), grupoActivo, categoriaElegida);
  const categorias = categoriasConLaElegida(categoriasDe(deLaLista), categoriaElegida);
  const delActivo = grupoActivo ? grupos.find((g) => g.clave === grupoActivo.clave) ?? null : null;
  // Con muchas categorías y más de un grupo, primero los grupos y, debajo, las categorías del grupo encendido (Felipe 2026-10-15: 28
  // píldoras en tres filas «podría verse mucho mejor»). Con pocas (los favoritos, una tienda chica), todas de una vez.
  const porGrupos = grupos.length > 1 && categorias.length > 8;
  const cab = cabeceraDeLista(lista);
  // En «Toda la tienda», el título dice lo que se está viendo: la categoría (con su grupo arriba) o el grupo (con su menú arriba).
  const ceja =
    lista === "todo" && categoriaElegida
      ? grupoDe(categoriaElegida.clave).nombre
      : lista === "todo" && grupoPedido
        ? MENUS.find((m) => m.clave === grupoPedido.menu)?.nombre ?? cab.ceja
        : cab.ceja;
  const titulo =
    lista === "todo" && categoriaElegida
      ? tituloPartido(categoriaElegida.nombre)
      : lista === "todo" && grupoPedido
        ? tituloPartido(grupoPedido.nombre)
        : lista === "todo" && menuPedido
          ? menuPedido.titulo
          : cab.titulo;
  const href = (cambios: {
    sede?: string | null;
    categoria?: string | null;
    orden?: typeof orden;
    campana?: string | null;
    grupo?: string | null;
    menu?: string | null;
  }) => hrefLista({ sede, categoria, orden, lista, campana, grupo: grupoPedido?.clave ?? null, menu: claveMenu, ...cambios });
  // Lo pedido, para decir lo que falta («No hay cinturones en Lima»).
  const que = queSeBusca(lista, categoriaElegida?.nombre ?? grupoPedido?.nombre ?? menuPedido?.nombre ?? null);
  // Vacía en la tienda elegida, pero otra sí tiene: dónde hay y un botón que lleva allá (con lo mismo elegido).
  const vacioAqui =
    vista.length === 0 && elegida && !esFavoritos
      ? vacioEnTienda(que, elegida.nombre, dondeHay(loPedidoEnTodas, sedes).filter((s) => s.id !== elegida.id))
      : null;
  // El origen del almacén público de fotos (no es una llave): solo sus fotos pasan por el optimizador de Next.
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  // «Tus looks»: los guardados, con las prendas del probador de todas las tiendas (como las prendas favoritas, se ven haya o no aquí).
  // Solo con la lista entera: con una categoría elegida se buscan prendas.
  const tusLooks = esFavoritos && !categoria && !grupoPedido && misLooks && misLooks.length > 0 && lecturaProbador && prendas ? misLooks : [];
  const delProbador =
    tusLooks.length > 0 && lecturaProbador && prendas
      ? armarProbador(prendas, lecturaProbador, { elegida, tiendas: sedes, optimizable: (url) => fotoOptimizable(url, origenFotos) })
      : [];
  const looksArriba = tusLooks.length > 0 && <TusLooks looks={tusLooks} prendas={delProbador} sede={sede} />;
  // Lo que se ofrece para seguir mirando (de lo que hay en la tienda elegida): debajo del vacío de una lista vacía en todas las tiendas y
  // al final de tus favoritos (la página terminaba en tus dos o tres prendas guardadas), sin repetirlas.
  const seguir =
    enTodas.length === 0 && cab.vacio
      ? paraSeguirMirando(enLaTienda, lista)
      : esFavoritos && vista.length > 0
        ? paraSeguirMirando(enLaTienda, lista, { fuera: vista.map((p) => p.id) })
        : null;
  const carrilSeguir = seguir && (
    <SigueMirando
      id="seguir-mirando"
      {...(seguir.lista === "nuevo"
        ? { ceja: "Recién llegado", titulo: ["Lo", "nuevo"] as [string, string], href: hrefLista({ sede, lista: "nuevo", categoria: null, orden: "destacado" }) }
        : { ceja: "Para empezar", titulo: ["Toda la", "tienda"] as [string, string], href: hrefLista({ sede, categoria: null, orden: "destacado" }) })}
      prendas={seguir.prendas}
      sede={sede}
      origenFotos={origenFotos}
      nota={(p) => notaDeStock(p.stock, elegida, sedes)}
    />
  );

  return (
    <MarcoCatalogo
      prendas={enLaTienda}
      sede={sede}
      actual={lista === "todo" ? null : lista}
      filtro={[
        { nombre: "Todas", href: href({ sede: null }), actual: elegida === null },
        ...sedes.map((s) => ({ nombre: s.nombre, href: href({ sede: claveDeSede(s.nombre) }), actual: elegida?.id === s.id })),
      ]}
    >
      {/* Sin migas («Inicio / Toda la ropa»): en una lista de arriba del todo solo repetían el título, y el logo ya lleva al Inicio
          (Felipe 2026-10-15). La ficha y los pedidos sí las llevan: ahí dicen de dónde se vino. */}
      <div className="t-ancho">
        <header className="t-lista-cab">
          <span className="t-ceja">{ceja}</span>
          <h1>
            {titulo[0] ? `${titulo[0]} ` : null}
            <em>{titulo[1]}</em>
          </h1>
          {cab.frase && <p>{cab.frase}</p>}
        </header>

        {prendas === null ? (
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar el catálogo</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={href({ sede: pedida ? claveDeSede(pedida.nombre) : null, categoria: categoriaPedida })}>
              Volver a intentar
            </Link>
          </div>
        ) : prendas.length === 0 ? (
          <div className="t-vacio">
            <Icono nombre="tienda" />
            <h3>Pronto verás aquí nuestras prendas</h3>
            <p>Todavía no hay prendas en la tienda online. Mientras tanto, te esperamos en nuestras tiendas.</p>
            <Link className="t-btn" href="/tiendas">
              Ver nuestras tiendas
            </Link>
          </div>
        ) : favoritosSinLeer ? (
          <div className="t-vacio" role="status">
            <Icono nombre="corazon" />
            <h3>No pudimos cargar tus favoritos</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={href({})}>
              Volver a intentar
            </Link>
          </div>
        ) : enTodas.length === 0 && cab.vacio ? (
          // La lista misma está vacía en todas las tiendas (no es la categoría ni la tienda elegida): dice qué aparecería aquí, sin
          // filtros ni orden que no sirven, y debajo ofrece algo para seguir mirando (Lo nuevo o toda la tienda): no es un callejón.
          <>
            {looksArriba}
            <div className="t-vacio">
              <Icono nombre={esFavoritos ? "corazon" : "tienda"} />
              <h3>{tusLooks.length > 0 ? "Aún no guardas prendas" : cab.vacio.titulo}</h3>
              <p>{cab.vacio.texto}</p>
              <Link className="t-btn" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
                Ver toda la tienda
              </Link>
            </div>
            {carrilSeguir}
          </>
        ) : (
          <>
            {looksArriba}
            {/* Una tarjeta por campaña, que la elige o la suelta. Con una sola, la tarjeta solo informa: elegirla no cambiaba nada. */}
            {campanas.length === 1 ? (
              <div className="t-campanas">
                <div className="t-campana">
                  <DatosDeCampana c={campanas[0]} />
                </div>
              </div>
            ) : campanas.length > 1 ? (
              <nav className="t-campanas" aria-label="Campañas">
                {campanas.map((c) => (
                  <Link
                    key={c.id}
                    className="t-campana"
                    href={href({ campana: campana === c.id ? null : c.id, categoria: null })}
                    aria-current={campana === c.id ? "true" : undefined}
                    scroll={false}
                  >
                    <DatosDeCampana c={c} />
                    <PendienteDelEnlace />
                  </Link>
                ))}
              </nav>
            ) : null}
            {/* Los filtros: al tocar uno con la barra ya pegada arriba, la vista vuelve al comienzo de la lista (`FiltrosDeLista`). */}
            <FiltrosDeLista>
              {porGrupos ? (
                <div className="t-filtros-niveles">
                  <nav className="t-pildoras" aria-label="Qué ver">
                    <Link
                      className="t-pildora"
                      href={href({ grupo: null, categoria: null })}
                      aria-current={grupoActivo === null ? "true" : undefined}
                      scroll={false}
                    >
                      Todo <small>{deLaLista.length}</small>
                      <PendienteDelEnlace />
                    </Link>
                    {grupos.map((g) => (
                      <Link
                        key={g.clave}
                        className="t-pildora"
                        href={href({ grupo: g.clave, categoria: null })}
                        aria-current={grupoActivo?.clave === g.clave ? "true" : undefined}
                        scroll={false}
                      >
                        {g.nombre} <small>{g.cuantas}</small>
                        <PendienteDelEnlace />
                      </Link>
                    ))}
                  </nav>
                  {delActivo && delActivo.categorias.length > 1 && (
                    <nav className="t-subcats" aria-label={`Categorías de ${delActivo.nombre}`}>
                      <Link
                        className="t-subcat"
                        href={href({ grupo: delActivo.clave, categoria: null })}
                        aria-current={categoria === null ? "true" : undefined}
                        scroll={false}
                      >
                        Todo
                        <PendienteDelEnlace />
                      </Link>
                      {delActivo.categorias.map((c) => (
                        <Link
                          key={c.clave}
                          className="t-subcat"
                          href={href({ categoria: c.clave })}
                          aria-current={categoria === c.clave ? "true" : undefined}
                          scroll={false}
                        >
                          {c.nombre} <small>{c.cuantas}</small>
                          <PendienteDelEnlace />
                        </Link>
                      ))}
                    </nav>
                  )}
                </div>
              ) : categorias.length > 1 ? (
                <nav className="t-pildoras" aria-label="Categoría">
                  <Link
                    className="t-pildora"
                    href={href({ categoria: null, grupo: null })}
                    aria-current={categoria === null ? "true" : undefined}
                    scroll={false}
                  >
                    Todas <small>{deLaLista.length}</small>
                    <PendienteDelEnlace />
                  </Link>
                  {categorias.map((c) => (
                    <Link
                      key={c.clave}
                      className="t-pildora"
                      href={href({ categoria: c.clave })}
                      aria-current={categoria === c.clave ? "true" : undefined}
                      scroll={false}
                    >
                      {c.nombre} <small>{c.cuantas}</small>
                      <PendienteDelEnlace />
                    </Link>
                  ))}
                </nav>
              ) : (
                <span className="t-esp" />
              )}
              <BotonBuscarCatalogo />
              <div className="t-orden">
                <Link
                  href={href({ orden: siguienteOrden(orden) })}
                  aria-label={`Orden: ${nombreOrden(orden, lista)}. Cambiar a ${nombreOrden(siguienteOrden(orden), lista)}`}
                  scroll={false}
                >
                  <Icono nombre="flechas" />
                  <span className="t-orden-rot">Orden:</span>
                  {nombreOrden(orden, lista)}
                  <PendienteDelEnlace />
                </Link>
              </div>
            </FiltrosDeLista>
            <ElegidoALaVista selector=".t-filtros .t-pildoras, .t-filtros .t-subcats" />
            {/* Sin prendas, el vacío de abajo dice lo que pasa: un «0 prendas» encima solo lo repetía. */}
            {vista.length > 0 && (
              <p className="t-conteo" aria-live="polite">
                {conteoDeLista(vista.length, {
                  categoria: categoriaElegida?.nombre ?? grupoPedido?.nombre ?? menuPedido?.nombre ?? null,
                  tienda: esFavoritos ? null : elegida?.nombre ?? null,
                  enOtras,
                })}
              </p>
            )}
            {vista.length > 0 ? (
              <>
                <div className={`t-grilla${esFavoritos ? " t-grilla-favoritos" : ""}`}>
                  {vista.slice(0, tanda.visibles).map((p, i) => (
                    <TarjetaPrenda
                      key={p.id}
                      prenda={p}
                      sede={sede}
                      origenFotos={origenFotos}
                      nota={notaDeStock(p.stock, elegida, sedes)}
                      puesto={lista === "vendidos" && orden === "destacado" ? i + 1 : null}
                      sinNuevo={lista === "nuevo"}
                      arriba={i < ARRIBA}
                    />
                  ))}
                </div>
                {tanda.siguiente !== null && (
                  <MasPrendas href={conMostrar(href({}), tanda.siguiente)} cuantasMas={tanda.cuantasMas} quedan={tanda.quedan} />
                )}
                {carrilSeguir}
              </>
            ) : vacioAqui ? (
              <div className="t-vacio" role="status">
                <Icono nombre="tienda" />
                <h3>{vacioAqui.titulo}</h3>
                <p>{vacioAqui.texto}</p>
                <Link className="t-btn" href={href({ sede: vacioAqui.boton.tienda ? claveDeSede(vacioAqui.boton.tienda.nombre) : null })}>
                  {vacioAqui.boton.texto}
                </Link>
              </div>
            ) : (
              <div className="t-vacio" role="status">
                <Icono nombre="tienda" />
                <h3>No hay {que} aquí por ahora</h3>
                <p>Prueba con otra categoría o mira todas.</p>
                <Link className="t-btn" href={href({ categoria: null, grupo: null, menu: null })}>
                  {lista === "todo" ? "Ver toda la tienda" : "Ver todas"}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </MarcoCatalogo>
  );
}

/** Lo que dice la tarjeta de una campaña: su descuento, su nombre, cuántas prendas tiene y hasta cuándo. */
function DatosDeCampana({ c }: { c: CampanaVigente }) {
  return (
    <>
      <span className="pct">−{pctTexto(c.pct)} %</span>
      <b>{c.nombre}</b>
      <small>
        {c.cuantas} {c.cuantas === 1 ? "prenda" : "prendas"} · {c.hasta ? `hasta el ${fechaLarga(c.hasta)}` : "sin fecha de término"}
      </small>
    </>
  );
}
