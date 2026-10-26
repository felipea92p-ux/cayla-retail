"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useLayoutEffect, type CSSProperties } from "react";
import { formaDeLaRuta, prendaDeLaRuta, tituloDeEspera, type FormaEsqueleto, type TituloDeEspera } from "@/lib/esqueleto";
import { useBolsaVista } from "./bolsa/BolsaRecordada";
import { useCabeceraVista } from "./CabeceraConCuenta";
import { EscenarioDelDesfile } from "./desfile/EscenarioDelDesfile";
import { Icono } from "./Icono";
import { usePrendaTocada } from "./PrendaTocada";
import { fotoQueViaja } from "./Vistas";
import "@/app/estilos/probador.css";

/**
 * Lo que se ve mientras llega una página (lo arma `EsqueletoDePagina`, debajo de la cabecera). Sin `forma`, la saca de la dirección a
 * la que se va (`formaDeLaRuta`): el esqueleto del catálogo cubre el Inicio, la lista, los looks y la ficha, y al tocar una prenda desde
 * el Inicio tiene que anunciar una ficha, no una grilla. Cada forma usa las MISMAS clases de su página (`.t-hero`, `.t-lista-cab`,
 * `.t-pdp`, `.t-bolsa`, `.r-pag`, `.pf-perfil`…), y escribe ya lo que se sabe sin preguntarle a nadie (Felipe 2026-10-17: «quisiera que
 * sea más fiel a lo que mostrará el contenido»): el héroe con su campaña, el título de la lista, los textos fijos de cada página y, en la
 * ficha, la foto, el nombre y el precio de la tarjeta tocada. Solo brilla lo que de verdad falta, y nada salta al llegar.
 */
/** Adónde se va, cuando el esqueleto lo pone la página de antes (`EnCamino`, de una lista a otra): la dirección todavía es la de antes,
 *  así que la de destino se dice aquí (la lista saca de ella su título). */
export type DestinoDeEspera = { ruta: string; buscar: string };

export function FormaDelEsqueleto({
  forma,
  heroe = null,
  destino = null,
}: {
  forma?: FormaEsqueleto;
  heroe?: React.ReactNode;
  destino?: DestinoDeEspera | null;
}) {
  // Leer la dirección en una página que se arma por adelantado (una ficha cuyo id aún no se sabe) frena el armado: se lee en su propio
  // <Suspense>, con la grilla mientras tanto (ADR-0432). Con la forma dicha de antemano no se lee nada.
  if (forma) return <FormaDicha la={forma} heroe={heroe} destino={destino} />;
  return (
    <Suspense fallback={<FormaDicha la="grilla" heroe={heroe} />}>
      <FormaSegunLaRuta heroe={heroe} />
    </Suspense>
  );
}

function FormaSegunLaRuta({ heroe }: { heroe: React.ReactNode }) {
  const ruta = usePathname();
  return <FormaDicha la={formaDeLaRuta(ruta ?? "")} heroe={heroe} />;
}

function FormaDicha({
  la,
  heroe,
  destino = null,
}: {
  la: FormaEsqueleto;
  heroe: React.ReactNode;
  destino?: DestinoDeEspera | null;
}) {
  // La página que viene empieza arriba. Next sube la página al llegar a otra, pero con el esqueleto propio de la ficha (un segmento
  // adentro del catálogo) dejaba de hacerlo: tocada una prenda de abajo del Inicio o de «Mi perfil», la ficha llegaba con la página
  // bajada, sin la cabecera ni la foto. El esqueleto solo sale al ir a otra página (cambiar la tienda o el color de una ficha no lo
  // muestra), así que subir aquí no le quita a nadie su lugar. Antes de pintar: no se ve el salto.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    return marcarTrasEsqueleto();
  }, []);
  return (
    <>
      {/* El Inicio va de borde a borde (su héroe); las demás, en el ancho de la página. */}
      <div className={`${la === "inicio" ? "" : "t-ancho "}t-esqueleto`} data-forma={la} role="status">
        <span className="t-solo-lector">Cargando…</span>
        {la === "inicio" ? (
          <Inicio heroe={heroe} />
        ) : la === "ficha" ? (
          <Ficha />
        ) : la === "perfil" ? (
          <Perfil />
        ) : la === "lista" ? (
          <Lista />
        ) : la === "probador" ? (
          <Probador />
        ) : la === "bolsa" ? (
          <Bolsa />
        ) : la === "recomendaciones" ? (
          <Recomendaciones />
        ) : la === "looks" ? (
          <Looks />
        ) : la === "look" ? (
          <Look />
        ) : destino ? (
          <GrillaDe buscar={destino.buscar} />
        ) : (
          <Suspense fallback={<Grilla titulo={null} />}>
            <GrillaSegunLaDireccion />
          </Suspense>
        )}
      </div>
    </>
  );
}

// Mientras se ve un esqueleto, y un momento después, la página lleva `data-tras-esqueleto` (2026-10-17): lo que el esqueleto ya mostraba
// tal cual (el título del héroe del Inicio) no vuelve a entrar con su animación al llegar la página; solo entra lo nuevo (las polaroids).
// Al abrir la pestaña no hay esqueleto antes: el héroe entra como siempre.
let quitarMarca: number | undefined;
function marcarTrasEsqueleto() {
  window.clearTimeout(quitarMarca);
  document.documentElement.dataset.trasEsqueleto = "";
  return () => {
    window.clearTimeout(quitarMarca);
    quitarMarca = window.setTimeout(() => {
      delete document.documentElement.dataset.trasEsqueleto;
    }, 1200);
  };
}

/* ---------------- Piezas ---------------- */

/** Una tarjeta de prenda que espera: la foto que brilla y dos líneas (el nombre y el precio), con las cajas de `TarjetaPrenda`. Se cuelga en
 *  cascada (ADR-0466): `i` es su lugar en la fila, que da el retraso (las de más allá de la octava entran junto con ella). */
function Tarjeta({ i = 0 }: { i?: number }) {
  return (
    <div className="t-card" style={{ "--i": Math.min(i, 7) } as CSSProperties}>
      <div className="t-card-media">
        <span className="t-card-foto" />
      </div>
      <div className="t-card-info">
        <i className="t-esqueleto-linea t-esq-nombre" />
        <i className="t-esqueleto-linea t-esq-precio-tarjeta" />
        <i className="t-esqueleto-linea t-esq-colores" />
      </div>
    </div>
  );
}

function Tarjetas({ cuantas }: { cuantas: number }) {
  return (
    <>
      {Array.from({ length: cuantas }, (_, i) => (
        <Tarjeta key={i} i={i} />
      ))}
    </>
  );
}

/**
 * El título de una lista que se cuelga (ADR-0466, Felipe 2026-10-20: «el título se cuelga»): cada palabra sube desde su línea, una tras
 * otra, y la última (la cursiva) cierra. Es el esqueleto el que lo hace —la pantalla de carga del cambio de pestaña—; la página, al llegar,
 * escribe el mismo título quieto en el mismo lugar. Las palabras llevan su lugar (`--j`) para el retraso.
 */
function TituloQueSeCuelga({ primera, cursiva }: { primera: string; cursiva: string }) {
  const palabras = primera.split(" ").filter(Boolean);
  return (
    <h1>
      {palabras.map((p, j) => (
        <Fragment key={j}>
          <span className="t-pal" style={{ "--j": j } as CSSProperties}>
            {p}
          </span>{" "}
        </Fragment>
      ))}
      <em className="t-pal" style={{ "--j": palabras.length } as CSSProperties}>
        {cursiva}
      </em>
    </h1>
  );
}

/** Lo de arriba de una lista (`.t-lista-cab`): escrito si se sabe; si no, sus líneas. */
function CabeceraDeLista({ titulo }: { titulo: TituloDeEspera | null }) {
  if (!titulo)
    return (
      <header className="t-lista-cab" aria-hidden="true">
        <i className="t-esqueleto-linea t-esq-ceja" />
        <i className="t-esq-titulo-lista" />
      </header>
    );
  const [primera, cursiva] = titulo.titulo;
  return (
    <header className="t-lista-cab t-cuelga" aria-hidden="true">
      <span className="t-ceja">{titulo.ceja}</span>
      <TituloQueSeCuelga primera={primera} cursiva={cursiva} />
      {titulo.frase && <p>{titulo.frase}</p>}
    </header>
  );
}

/* ---------------- Las formas ---------------- */

/** El Inicio: el héroe (con su campaña, lo arma el servidor: `EsqueletoDePagina`), los círculos de las categorías y «Lo nuevo». */
function Inicio({ heroe }: { heroe: React.ReactNode }) {
  // Tantos círculos como categorías tenía la última cabecera vista (las del Inicio son las mismas): centrados como en la página, no se
  // corren al llegar. Sin cabecera vista, ocho.
  const cabecera = useCabeceraVista();
  const circulos = cabecera ? cabecera.menus.reduce((n, m) => n + m.grupos.reduce((k, g) => k + g.categorias.length, 0), 0) || 8 : 8;
  return (
    <div aria-hidden="true">
      {heroe ?? <EscenarioDelDesfile enEspera piezas={[]} modo="portada" ceja="Llegó en los últimos 30 días" titulo="Lo nuevo" boton={{ texto: "Ver lo nuevo", href: null }} />}
      <div className="t-carril-envol t-circs-envol">
        <div className="t-circs">
          {Array.from({ length: circulos }, (_, i) => (
            <span key={i} className="t-circ">
              <span className="t-circ-img">
                <span className="t-card-foto" />
              </span>
              <i className="t-esqueleto-linea t-esq-circ" />
            </span>
          ))}
        </div>
      </div>
      <section className="t-programa-sec t-ancho">
        <div className="t-cab-centro">
          <span className="t-ceja">El programa</span>
          <h2>
            En las <em>tiendas</em>
          </h2>
          <p>Lo que llegó a nuestras tiendas. Mira cuánto hay en cada una y sepáralo sin pagar.</p>
        </div>
        <ol className="t-salidas">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} style={{ padding: "26px 0" }}>
              <i className="t-esqueleto-linea" style={{ display: "block", width: `${46 - i * 4}%`, height: 28 }} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function GrillaSegunLaDireccion() {
  return <GrillaDe buscar={useSearchParams().toString()} />;
}

function GrillaDe({ buscar }: { buscar: string }) {
  const cabecera = useCabeceraVista();
  const q = new URLSearchParams(buscar);
  return <Grilla titulo={tituloDeEspera(q, cabecera?.menus ?? null)} conFiltros={q.get("lista") !== "favoritos"} />;
}

/** Una lista del catálogo: su título (`tituloDeEspera`), los filtros y el orden, el conteo y la grilla. Con filtros de color y talla (todas las
 *  listas menos «Tus favoritos», ADR-0512) la barra lleva su fila de más: el esqueleto la guarda para que lo de abajo no baje al llegar. */
function Grilla({ titulo, conFiltros = true }: { titulo: TituloDeEspera | null; conFiltros?: boolean }) {
  const pildoras = (
    <span className="t-pildoras">
      {[64, 132, 74, 118, 76].map((ancho) => (
        <i key={ancho} className="t-esq-pildora" style={{ width: ancho }} />
      ))}
    </span>
  );
  return (
    <>
      <CabeceraDeLista titulo={titulo} />
      <div className="t-filtros t-esq-filtros" aria-hidden="true">
        {conFiltros ? (
          <div className="t-filtros-niveles">
            {pildoras}
            <span className="fp-fila">
              <i className="t-esq-pildora t-esq-palabra" />
              <i className="t-esq-pildora t-esq-palabra" />
            </span>
          </div>
        ) : (
          pildoras
        )}
        <span className="t-orden">
          <i className="t-esq-pildora t-esq-orden" />
        </span>
      </div>
      <p className="t-conteo" aria-hidden="true">
        <i className="t-esqueleto-linea t-esq-conteo" />
      </p>
      <div className="t-grilla" aria-hidden="true">
        <Tarjetas cuantas={8} />
      </div>
    </>
  );
}

function Lista() {
  return (
    <div className="t-esqueleto-lista" aria-hidden="true">
      <div className="t-esqueleto-titulo" />
      {Array.from({ length: 4 }, (_, i) => (
        <Fila key={i} />
      ))}
    </div>
  );
}

function Fila() {
  return (
    <div className="t-esqueleto-fila">
      <div className="t-card-foto" />
      <div>
        <div className="t-esqueleto-linea" />
        <div className="t-esqueleto-linea" />
      </div>
    </div>
  );
}

/** «Arma el tuyo» (`Probador`): el título, el arco del estudio donde va la figura y la tira de opciones, con las clases del probador. */
function Probador() {
  return (
    <div className="pb" aria-hidden="true">
      <div className="pb-cab">
        <i className="pb-esq-ceja" />
        <i className="pb-esq-titulo" />
      </div>
      {/* Como la figura de verdad: el estudio y, debajo, la franja de estado con su alto reservado (la etiqueta «Ajustando tu look…»). */}
      <div className="pb-figura">
        <div className="pb-escena">
          <div className="pb-arco pb-esq-arco" />
        </div>
        <div className="pb-estado" />
      </div>
      <div className="pb-tira-carril pb-esq-tira">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className="pb-esq-tarjeta" />
        ))}
      </div>
    </div>
  );
}

/** La ficha de una prenda (`FichaPrenda`): la ruta, las fotos (en la computadora, la primera grande y dos debajo) y a su lado el nombre,
 *  el precio, los colores, las tallas y el botón (en el celular, en la barra de abajo). Si se llegó tocando una tarjeta, su foto, su
 *  nombre, su precio y su categoría ya están: los de la tarjeta (`usePrendaTocada`). */
function Ficha() {
  return (
    <Suspense fallback={<FichaDe id={null} tocada={null} />}>
      <FichaSegunLaDireccion />
    </Suspense>
  );
}

function FichaSegunLaDireccion() {
  return <FichaDeLaPrenda id={prendaDeLaRuta(usePathname() ?? "")} />;
}

function FichaDeLaPrenda({ id }: { id: string | null }) {
  return <FichaDe id={id} tocada={usePrendaTocada(id)} />;
}

function FichaDe({ id, tocada }: { id: string | null; tocada: ReturnType<typeof usePrendaTocada> }) {
  // A donde vuela la foto de la tarjeta tocada; después, la de la ficha ocupa su lugar con el mismo nombre (`fotoQueViaja`).
  const primera = (
    <div className={`t-foto-g${tocada?.foto ? " con-foto" : ""}`} style={id ? fotoQueViaja(id) : undefined}>
      {tocada?.foto && (
        // La foto que el navegador ya tiene (la de la tarjeta): se ve al instante, sin pasar otra vez por el optimizador.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tocada.foto} alt="" className="t-foto-previa" />
      )}
    </div>
  );
  return (
    <div aria-hidden="true">
      <div className="t-ruta">
        {tocada ? (
          <>
            <span>Inicio</span>
            <span>/</span>
            {tocada.categoria && (
              <>
                <span>{tocada.categoria}</span>
                <span>/</span>
              </>
            )}
            <span>{tocada.nombre}</span>
          </>
        ) : (
          <i className="t-esqueleto-linea t-esq-ruta" />
        )}
      </div>
      <div className="t-pdp">
        <div className="cp-galeria">
          <div className="t-galeria">
            {primera}
            <div className="t-foto-g" />
            <div className="t-foto-g" />
          </div>
        </div>
        <div className="t-pdp-info">
          <div className="cp-pdp-cab">
            <i className="t-esq-chip" />
            {tocada ? (
              <h1>{tocada.nombre}</h1>
            ) : (
              <>
                <i className="t-esq-titulo" />
                <i className="t-esq-titulo corto" />
              </>
            )}
          </div>
          {tocada?.precio ? (
            <div className="t-bloque t-bloque-precio">
              <span className={`t-precio grande${tocada.oferta ? " oferta" : ""}`}>
                <b className="num">{tocada.precio}</b>
                {tocada.antes && <s className="num">{tocada.antes}</s>}
              </span>
              {/* Con campaña, la ficha dice cuánto le falta («Termina en 4 días»): su renglón. */}
              {tocada.oferta && <i className="t-esqueleto-linea t-esq-cuenta" />}
            </div>
          ) : (
            <i className="t-esq-precio" />
          )}
          <div className="t-bloque">
            <i className="t-esqueleto-linea t-esq-etq" />
            <div className="t-swatches">
              {Array.from({ length: 4 }, (_, i) => (
                <i key={i} className="t-esq-swatch" />
              ))}
            </div>
          </div>
          <div className="t-bloque">
            <i className="t-esqueleto-linea t-esq-etq" />
            <div className="t-tallas">
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} className="t-esq-talla" />
              ))}
            </div>
          </div>
          {/* «Stock por tienda»: las tiendas en filas y las tallas en columnas. */}
          <div className="t-bloque">
            <i className="t-esqueleto-linea t-esq-etq" />
            <i className="t-esq-tabla" />
          </div>
          <i className="t-esq-boton" />
        </div>
      </div>
      {/* En el celular, el botón vive en la barra de abajo (`.t-pdp-barra`): la que brilla, en el mismo lugar. */}
      <div className="t-pdp-barra">
        <div className="t-esq-barra">
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

/** «Arma tu look» (`app/(catalogo)/looks/page.tsx`): su título, que es fijo, y las láminas de los looks con sus datos. */
function Looks() {
  return (
    <div aria-hidden="true">
      <header className="t-lista-cab t-cuelga">
        <span className="t-ceja">Combinaciones listas</span>
        <TituloQueSeCuelga primera="Arma tu" cursiva="look" />
        <p>Prendas que se ven bien juntas. Agrega el look completo y eliges cada talla en un solo paso.</p>
      </header>
      {/* De a tres, como la página con tres looks (`looksDeATres`). */}
      <div className="t-looks" data-tres="">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="t-look-card" style={{ "--i": i } as CSSProperties}>
            <div className="t-lamina t-esq-lamina" />
            <i className="t-esqueleto-linea t-esq-ceja" />
            <i className="t-esq-look-nombre" />
            <i className="t-esqueleto-linea" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Un look (`app/(catalogo)/looks/[id]/page.tsx`): la ruta, la lámina grande y, a su lado, sus prendas, el total y el botón. */
function Look() {
  return (
    <div aria-hidden="true">
      <div className="t-ruta">
        <i className="t-esqueleto-linea t-esq-ruta" />
      </div>
      <div className="t-look t-look-abierto">
        <div className="t-lamina t-esq-lamina" />
        <div className="t-look-info">
          <i className="t-esqueleto-linea t-esq-ceja" />
          <i className="t-esq-titulo" />
          <div className="t-esqueleto-lista">
            {Array.from({ length: 3 }, (_, i) => (
              <Fila key={i} />
            ))}
          </div>
          <i className="t-esq-boton t-esq-boton-siempre" />
        </div>
      </div>
    </div>
  );
}

/** La bolsa (`app/bolsa/page.tsx`): con tantas filas como decía la cabecera, su título («3 prendas por separar») y el resumen; vacía,
 *  lo que dice vacía y Lo nuevo. Sin saber cuántas (recién abierta la pestaña), dos filas. */
function Bolsa() {
  const cuantas = useBolsaVista();
  if (cuantas === 0)
    return (
      <div className="cp-bolsa-vacia" aria-hidden="true">
        <div className="t-vacio">
          <Icono nombre="bolsa" />
          <h3>Tu bolsa está vacía</h3>
          <p>Elige una prenda y su talla, o agrega un look completo.</p>
          <div className="cp-vacio-acciones">
            <span className="t-btn">Ver toda la tienda</span>
            <span className="t-btn t-btn-sec">Ver los looks</span>
          </div>
        </div>
        <section className="t-sec cp-sigue">
          <div className="t-sec-cab cp-sec-cab">
            <div>
              <i className="t-esqueleto-linea t-esq-ceja" />
              <i className="t-esq-titulo-lista" />
            </div>
          </div>
          <div className="t-carril-envol cp-carril">
            <div className="t-carril">
              <Tarjetas cuantas={4} />
            </div>
          </div>
        </section>
      </div>
    );
  const filas = Math.min(Math.max(cuantas ?? 2, 1), 4);
  return (
    <div aria-hidden="true">
      <header className="t-lista-cab t-bolsa-cab cp-sec-cab">
        <span className="t-ceja">Tu bolsa</span>
        {cuantas ? (
          <h1>
            {cuantas} {cuantas === 1 ? "prenda" : "prendas"} <em>por separar</em>
          </h1>
        ) : (
          <i className="t-esq-titulo-lista" />
        )}
        <span className="t-ver">
          Seguir mirando <Icono nombre="flecha" />
        </span>
      </header>
      <div className="t-bolsa">
        <div className="t-bolsa-principal">
          <div className="t-bolsa-items">
            {Array.from({ length: filas }, (_, i) => (
              <div key={i} className="t-bolsa-item">
                <span className="t-bolsa-foto">
                  <span className="t-card-foto" />
                </span>
                <span>
                  <i className="t-esqueleto-linea" />
                  <i className="t-esqueleto-linea" />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="t-bolsa-lado">
          <div className="t-resumen">
            <h3>Resumen</h3>
            <i className="t-esqueleto-linea" />
            <i className="t-esqueleto-linea" />
          </div>
          <i className="t-esq-boton t-esq-boton-siempre" />
        </div>
      </div>
    </div>
  );
}

/** «Recomendaciones» (`app/recomendaciones/page.tsx`): el título y su frase, que son fijos, el formulario y, al lado, lo que ya
 *  escribió. */
function Recomendaciones() {
  return (
    <div className="r-pag" aria-hidden="true">
      <div className="r-cab">
        <span className="t-ceja">Recomendaciones</span>
        <h1>
          Cuéntanos cómo <em>mejorar.</em>
        </h1>
        <p className="w-texto-sec">
          Una idea, algo que te gustaría encontrar en una tienda o algo que podamos hacer mejor. Lo lee el equipo de CAYLA.
        </p>
        <div className="t-esq-formulario">
          <i className="t-esqueleto-linea t-esq-etq" />
          <span className="t-esq-opciones">
            <i />
            <i />
            <i />
          </span>
          <i className="t-esqueleto-linea t-esq-etq" />
          <i className="t-esq-caja" />
          <i className="t-esq-boton t-esq-boton-siempre" />
        </div>
      </div>
      <div className="r-mias">
        <i className="t-esq-caja alta" />
      </div>
    </div>
  );
}

/** «Mi perfil» (`app/cuenta/page.tsx`): el saludo, los cuatro cuadros y sus dos primeras secciones (los pedidos y el Club, con su
 *  tarjeta), lado a lado en una pantalla ancha como en la página. */
function Perfil() {
  return (
    <div className="pf-perfil" aria-hidden="true">
      <div className="pf-cab">
        <i className="t-esqueleto-linea pf-esq-ceja" />
        <i className="pf-esq-hola" />
        <i className="t-esqueleto-linea pf-esq-linea" />
      </div>
      <div className="pf-atajos">
        <ul>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <div className="pf-atajo pf-esq-atajo">
                <i className="pf-atajo-ic" />
                <span className="pf-atajo-txt">
                  <i className="t-esqueleto-linea" />
                  <i className="t-esqueleto-linea" />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="pf-cuerpo">
        <div className="pf-sec" data-mitad="">
          <i className="t-esqueleto-titulo" />
          <Fila />
        </div>
        <div className="pf-sec" data-mitad="">
          <i className="t-esqueleto-titulo" />
          <div className="pf-club">
            <div className="pf-club-fila">
              <i className="pf-esq-tarjeta" />
              <div className="pf-beneficios">
                <i className="pf-esq-beneficio" />
                <i className="pf-esq-beneficio" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
