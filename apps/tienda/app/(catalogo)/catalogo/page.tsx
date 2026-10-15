import type { Metadata } from "next";
import Link from "next/link";
import { ElegidoALaVista } from "@/components/ElegidoALaVista";
import { Icono } from "@/components/Icono";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { TarjetaPrenda } from "@/components/TarjetaPrenda";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import {
  cabeceraDeLista,
  campanasDe,
  categoriasDe,
  conteoDeLista,
  deFavoritos,
  filtrarYOrdenar,
  hrefLista,
  leerCampana,
  leerCategoria,
  leerLista,
  leerOrden,
  nombreOrden,
  siguienteOrden,
  type Lista,
} from "@/lib/catalogo";
import { leerGuardadosEnBase } from "@/lib/club-servidor";
import { delGrupo, grupoDe, gruposDe, leerGrupo, MENUS, tituloPartido } from "@/lib/grupos";
import { fechaLarga, pctTexto } from "@/lib/portada";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayEnTienda, notaDeStock } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITULOS: Record<Lista, string> = {
  todo: "Toda la ropa",
  nuevo: "Lo nuevo",
  ofertas: "Ofertas",
  vendidos: "Más vendidos",
  favoritos: "Tus favoritos",
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const lista = leerLista(sp.lista);
  const grupo = lista === "todo" && !leerCategoria(sp.categoria) ? leerGrupo(sp.grupo) : null;
  return { title: `${grupo?.nombre ?? TITULOS[lista]} · CAYLA` };
}

// Las listas del catálogo (maqueta v4, `vLista` y `filtroTienda`): toda la ropa, Lo nuevo, las ofertas (con una tarjeta por campaña),
// los más vendidos (en su ranking) y «Tus favoritos» (lo que el cliente guardó con el corazón), de lo que el ERP muestra en Catálogo ▸
// Vitrina web, al precio de la tienda que el cliente elige en «Ver lo que hay en» o, con «Todas», al mayor entre las tiendas de la web,
// con la campaña encima. Con una tienda elegida, solo lo que hay en ella («N más en otras tiendas»; los favoritos no: lo guardado se ve
// igual), y cada tarjeta dice cuánto queda como nivel, nunca la cifra. Se lee en cada visita (la dirección trae la lista, la tienda, la
// categoría, la campaña y el orden): lo que se enciende, se apaga o se vende se ve al recargar.
export default async function Catalogo({ searchParams }: Props) {
  const sp = await searchParams;
  const lista = leerLista(sp.lista);
  const orden = leerOrden(sp.orden);
  const categoria = leerCategoria(sp.categoria);
  // Un grupo de categorías (lib/grupos.ts: «Arriba», «Bolsos y accesorios»…), el de los títulos de los menús de la cabecera. Con una
  // categoría elegida no hace falta: ella dice su grupo.
  const grupoPedido = categoria ? null : leerGrupo(sp.grupo);
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const esFavoritos = lista === "favoritos";
  const sesion = esFavoritos ? await leerSesion() : null;
  // Lo guardado es la misma lectura del marco del catálogo (una sola consulta por visita).
  const [catalogo, guardados] = await Promise.all([
    leerCatalogo(pedida?.id ?? null),
    sesion?.estado === "con_sesion" ? leerGuardadosEnBase(sesion.usuarioId) : null,
  ]);
  // La tienda cuyo precio usó la base (si la escondieron entretanto, la base ya respondió con «Todas»).
  const elegida = catalogo?.sede ? sedes.find((s) => s.id === catalogo.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const prendas = catalogo?.prendas ?? null;
  // Con una tienda elegida, solo lo que hay en ella (maqueta, `hayEnFiltro`): las categorías, las campañas y el conteo salen de ahí.
  // Los favoritos, no: son lo guardado, en su orden (lo último primero), haya o no en esa tienda.
  const enLaTienda = prendas ? prendas.filter((p) => hayEnTienda(p.stock, elegida?.id ?? null)) : [];
  const favoritosSinLeer = esFavoritos && guardados === null;
  const base = esFavoritos ? deFavoritos(prendas ?? [], guardados?.favoritos ?? []) : enLaTienda;
  const campanas = lista === "ofertas" ? campanasDe(base) : [];
  const campana = campanas.find((c) => c.id === leerCampana(sp.campana))?.id ?? null;
  const deLaLista = filtrarYOrdenar(base, { categoria: null, orden: "destacado", lista, campana });
  const categorias = categoriasDe(deLaLista);
  const grupos = gruposDe(deLaLista);
  const vista = delGrupo(filtrarYOrdenar(base, { categoria, orden, lista, campana }), grupoPedido);
  const enOtras = prendas && !esFavoritos ? delGrupo(filtrarYOrdenar(prendas, { categoria, orden, lista, campana }), grupoPedido).length - vista.length : 0;
  const categoriaElegida = categoriasDe(prendas ?? []).find((c) => c.clave === categoria) ?? null;
  // El grupo encendido: el pedido o el de la categoría elegida.
  const grupoActivo = grupoPedido ?? (categoria ? grupoDe(categoria) : null);
  const delActivo = grupoActivo ? grupos.find((g) => g.clave === grupoActivo.clave) ?? null : null;
  // Con muchas categorías y más de un grupo, primero los grupos y, debajo, las categorías del grupo encendido (Felipe 2026-10-15: 28
  // píldoras en tres filas «podría verse mucho mejor»). Con pocas (los favoritos, una tienda chica), todas de una vez.
  const porGrupos = grupos.length > 1 && categorias.length > 8;
  const cab = cabeceraDeLista(lista);
  // En «Toda la ropa», el título dice lo que se está viendo: la categoría (con su grupo arriba) o el grupo (con su menú arriba).
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
        : cab.titulo;
  const href = (cambios: {
    sede?: string | null;
    categoria?: string | null;
    orden?: typeof orden;
    campana?: string | null;
    grupo?: string | null;
  }) => hrefLista({ sede, categoria, orden, lista, campana, grupo: grupoPedido?.clave ?? null, ...cambios });
  // El origen del almacén público de fotos (no es una llave): solo sus fotos pasan por el optimizador de Next.
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

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
            <Link className="t-btn" href={href({ sede: pedida ? claveDeSede(pedida.nombre) : null })}>
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
        ) : deLaLista.length === 0 && (!elegida || esFavoritos) && cab.vacio ? (
          // La lista misma está vacía (no es la categoría ni la tienda): dice qué aparecería aquí, sin filtros ni orden que no sirven.
          <div className="t-vacio">
            <Icono nombre={esFavoritos ? "corazon" : "tienda"} />
            <h3>{cab.vacio.titulo}</h3>
            <p>{cab.vacio.texto}</p>
            <Link className="t-btn" href={hrefLista({ sede, categoria: null, orden: "destacado" })}>
              Ver toda la ropa
            </Link>
          </div>
        ) : (
          <>
            {campanas.length > 0 && (
              <nav className="t-campanas" aria-label="Campañas">
                {campanas.map((c) => (
                  <Link
                    key={c.id}
                    className="t-campana"
                    href={href({ campana: campana === c.id ? null : c.id, categoria: null })}
                    aria-current={campana === c.id ? "true" : undefined}
                    scroll={false}
                  >
                    <span className="pct">−{pctTexto(c.pct)} %</span>
                    <b>{c.nombre}</b>
                    <small>
                      {c.cuantas} {c.cuantas === 1 ? "prenda" : "prendas"} · {c.hasta ? `hasta el ${fechaLarga(c.hasta)}` : "sin fecha de término"}
                    </small>
                  </Link>
                ))}
              </nav>
            )}
            <div className="t-filtros">
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
                        </Link>
                      ))}
                    </nav>
                  )}
                </div>
              ) : categorias.length > 1 ? (
                <nav className="t-pildoras" aria-label="Categoría">
                  <Link className="t-pildora" href={href({ categoria: null })} aria-current={categoria === null ? "true" : undefined}>
                    Todas <small>{deLaLista.length}</small>
                  </Link>
                  {categorias.map((c) => (
                    <Link key={c.clave} className="t-pildora" href={href({ categoria: c.clave })} aria-current={categoria === c.clave ? "true" : undefined}>
                      {c.nombre} <small>{c.cuantas}</small>
                    </Link>
                  ))}
                </nav>
              ) : (
                <span className="t-esp" />
              )}
              <div className="t-orden">
                <Link
                  href={href({ orden: siguienteOrden(orden) })}
                  aria-label={`Orden: ${nombreOrden(orden, lista)}. Cambiar a ${nombreOrden(siguienteOrden(orden), lista)}`}
                >
                  <Icono nombre="flechas" />
                  {nombreOrden(orden, lista)}
                </Link>
              </div>
            </div>
            <ElegidoALaVista selector=".t-filtros .t-pildoras, .t-filtros .t-subcats" />
            <p className="t-conteo" aria-live="polite">
              {conteoDeLista(vista.length, {
                categoria: categoriaElegida?.nombre ?? grupoPedido?.nombre ?? null,
                tienda: esFavoritos ? null : elegida?.nombre ?? null,
                enOtras,
              })}
            </p>
            {vista.length > 0 ? (
              <div className="t-grilla">
                {vista.map((p, i) => (
                  <TarjetaPrenda
                    key={p.id}
                    prenda={p}
                    sede={sede}
                    origenFotos={origenFotos}
                    nota={notaDeStock(p.stock, elegida, sedes)}
                    puesto={lista === "vendidos" && orden === "destacado" ? i + 1 : null}
                    sinNuevo={lista === "nuevo"}
                  />
                ))}
              </div>
            ) : elegida && !esFavoritos ? (
              <div className="t-vacio">
                <Icono nombre="tienda" />
                <h3>No hay prendas aquí en {elegida.nombre}</h3>
                <p>Prueba con otra tienda o mira todas.</p>
                <Link className="t-btn" href={href({ sede: null })}>
                  Ver todas las tiendas
                </Link>
              </div>
            ) : (
              <div className="t-vacio">
                <Icono nombre="tienda" />
                <h3>No hay prendas de esa categoría</h3>
                <p>Prueba con otra o mira todas.</p>
                <Link className="t-btn" href={href({ categoria: null })}>
                  {lista === "todo" ? "Ver toda la ropa" : "Ver todas"}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </MarcoCatalogo>
  );
}
