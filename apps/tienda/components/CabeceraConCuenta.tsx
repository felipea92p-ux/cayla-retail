"use client";

import { Suspense, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { salir } from "@/app/acciones/cuenta";
import { buscarEn, leerRespuestaDelBuscador, resaltar, type RespuestaBuscador } from "@/lib/buscador";
import { hrefConVolver } from "@/lib/entrada";
import { seccionDeLaRuta, type SeccionActual } from "@/lib/esqueleto";
import type { DatosCabecera, FotoChica, MenuCabecera } from "@/lib/inicio";
import { useGuardados } from "./club/Guardados";
import { useCamino } from "./EnCamino";
import { BotonCerrarSesion } from "./cuenta/BotonCerrarSesion";
import { FotoTarjeta } from "./FotoTarjeta";
import { EVENTO_BUSCAR } from "@/lib/buscar-evento";
import { claveDeLaOpcion, type OpcionTienda } from "@/lib/sede-elegida";
import { vaciarBolsaPorCambioDeTienda } from "@/app/acciones/bolsa";
import { marcarUbicacionPreguntada, recordarSede, sedeYaRecordada, ubicacionYaPreguntada } from "@/lib/sede-cookie";
import { claveMasCercana, debePedirUbicacion } from "@/lib/sede-cercana";
import { ahoraMs, debeCubrir, esperaHastaElTope, esperaParaSalir, EVENTO_CAMBIAR_TIENDA, VELO_SALE_MS } from "@/lib/sede-velo";
import { Icono } from "./Icono";
import { Logo } from "./Marca";
import { marcarViaje, useRayaDelNav, viajaHacia } from "./useRayaDelNav";
import { NombreQueRueda, VeloDeSede } from "./VeloDeSede";
// El globo rojo de la bolsa y del corazón (`.t-globo`).
import "@/app/estilos/bolsa.css";

export type { SeccionActual };

// La cabecera de la última página que llegó (2026-10-17, Felipe: «cuando cambia de vista es muy abrupto»). Mientras llega la siguiente,
// el esqueleto dibujaba una cabecera vacía: sin «Ropa», «Accesorios» ni «Arma el tuyo», sin el nombre y sin los globos, que volvían al
// llegar la página; en cada toque la cabecera se encogía y se volvía a estirar. Ahora la cabecera que espera (`deEspera`) es la última
// que se vio, con lo mismo, y sus enlaces funcionan. Vive en la memoria de esta pestaña: la primera espera después de recargar va con la
// cabecera vacía de siempre (es la que mandó el servidor, así que hidrata igual).
type CabeceraVista = { datos: DatosCabecera; favoritos: number | null; nombre: string | null; bolsa: React.ReactNode; campanita: React.ReactNode; visitante: boolean };
let ultimaVista: CabeceraVista | null = null;
const sinAvisos = () => () => {};
const laUltima = () => ultimaVista;
const ninguna = () => null;

/** Lo que dijo la última cabecera vista (sus menús con los nombres de cada grupo y categoría): el esqueleto de una lista escribe con eso
 *  el título de la categoría que viene. null sin ninguna vista. */
export function useCabeceraVista(): DatosCabecera | null {
  return useSyncExternalStore(sinAvisos, laUltima, ninguna)?.datos ?? null;
}

/** «Entrar» / «Crear mi cuenta» desde donde se está: al terminar, la persona vuelve a esta misma página (con su tienda y su búsqueda). */
function hrefDeEntrada(base: "/entrar" | "/crear-cuenta"): string {
  if (typeof window === "undefined") return base;
  const { pathname, search } = window.location;
  return hrefConVolver(base, pathname + search);
}

/** «3 favoritos», «1 favorito»: lo que oye el lector en el corazón. */

// La lista del buscador no viaja con cada página (2026-10-17): se pide al primer roce de la lupa (`GET /api/buscador`) y se guarda en
// este aparato 30 s por tienda, los mismos que el catálogo se comparte en el servidor (el navegador también la guarda esos 30 s): abrir y
// cerrar el buscador, o pasar a otra página, no la vuelve a pedir. Un fallo no se guarda: el próximo roce lo vuelve a intentar.
const SEGUNDOS_DEL_INDICE = 30;
const indicesGuardados = new Map<string, { hasta: number; promesa: Promise<RespuestaBuscador> }>();
function pedirIndice(sede: string | null): Promise<RespuestaBuscador> {
  const clave = sede ?? "";
  const guardado = indicesGuardados.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.promesa;
  const promesa = fetch(`/api/buscador?sede=${encodeURIComponent(sede ?? "")}`, { headers: { accept: "application/json" } })
    .then((r) => r.json())
    .then(leerRespuestaDelBuscador)
    .catch((): RespuestaBuscador => ({ estado: "sin_respuesta" }));
  indicesGuardados.set(clave, { hasta: Date.now() + SEGUNDOS_DEL_INDICE * 1000, promesa });
  void promesa.then((r) => {
    if (r.estado !== "ok") indicesGuardados.delete(clave);
  });
  return promesa;
}

/**
 * La cabecera de una página que todavía carga (el esqueleto): la última vista (`deEspera`), con la sección de la página que viene ya
 * marcada (la raya bajo «Lo nuevo» no se apaga mientras llega Lo nuevo). Leer la dirección en una página armada por adelantado frena el
 * armado: se lee en su propio <Suspense>, con la cabecera sin marca mientras tanto (ADR-0432).
 */
export function CabeceraDeEspera(props: { datos: DatosCabecera; bolsa?: React.ReactNode; campanita?: React.ReactNode }) {
  return (
    <Suspense fallback={<CabeceraConCuenta {...props} deEspera />}>
      <CabeceraConLaSeccion {...props} />
    </Suspense>
  );
}

function CabeceraConLaSeccion(props: { datos: DatosCabecera; bolsa?: React.ReactNode; campanita?: React.ReactNode }) {
  const ruta = usePathname();
  const buscar = useSearchParams();
  return <CabeceraConCuenta {...props} deEspera actual={seccionDeLaRuta(ruta ?? "", new URLSearchParams(buscar.toString()))} />;
}

/**
 * La cabecera de quien tiene cuenta (maqueta v4, `cabT`): en el celular, el menú a la izquierda; en la computadora, «Lo nuevo», «Ropa» y
 * «Accesorios» (cada uno abre sus grupos de categorías con fotos y lo último que llegó), «Arma tu look», «Más vendidos» y «Ofertas». A la derecha, el
 * buscador (busca mientras se escribe, por nombre, categoría o color, sin tildes ni mayúsculas), el corazón de los favoritos con cuántos
 * hay (solo en la computadora: en el celular están en el menú), la persona (abre su menú: el nombre, «Mi perfil» y «Cerrar sesión») y la
 * bolsa con su globo. Todos los enlaces llevan la tienda elegida, menos los favoritos (son de la persona, no de una tienda).
 */
export function CabeceraConCuenta({
  datos: propios,
  actual = null,
  favoritos: favoritosPropios = null,
  bolsa: bolsaPropia = null,
  campanita: campanitaPropia = null,
  nombre: nombrePropio = null,
  visitante: visitantePropio = false,
  deEspera = false,
  tiendas = null,
  prendasEnBolsa = 0,
}: {
  datos: DatosCabecera;
  actual?: SeccionActual;
  /** Cuántos modelos guardó con el corazón; null si no se sabe (la base no contestó): el corazón va sin globo. */
  favoritos?: number | null;
  /** La bolsa con su globo (`components/bolsa/BotonBolsa.tsx`, de servidor: lee la cookie de la bolsa). La pone el marco. */
  bolsa?: React.ReactNode;
  /** La campanita de los avisos (`components/campanita/`, de servidor: lee la sesión y la base). La pone el marco; va entre el corazón y la persona. */
  campanita?: React.ReactNode;
  /** El nombre corto de la cuenta («María»), para el saludo del menú de la persona; null si no se sabe (sale sin saludo). */
  nombre?: string | null;
  /** Sin sesión (Felipe 2026-10-17: la tienda se mira sin cuenta): la persona ofrece «Entrar» y «Crear mi cuenta» en vez de «Mi perfil». */
  visitante?: boolean;
  /** La cabecera de una página que todavía carga (el esqueleto): repite la última que se vio; sin ninguna vista, la que le pasan. */
  deEspera?: boolean;
  /** Las tiendas de la web para elegir («Todas ▾», a la derecha de la cabecera); null con una sola tienda. */
  tiendas?: OpcionTienda[] | null;
  /** Cuántas prendas lleva la bolsa: cambiar de tienda la vacía, y el selector lo avisa antes. */
  prendasEnBolsa?: number;
}) {
  const vista = useSyncExternalStore(sinAvisos, deEspera ? laUltima : ninguna, ninguna);
  const datos = vista?.datos ?? propios;
  const favoritos = vista ? vista.favoritos : favoritosPropios;
  const nombre = vista ? vista.nombre : nombrePropio;
  // Sin sesión, el esqueleto repite también eso: no le dibuja a quien no tiene cuenta el menú de «Mi perfil».
  const visitante = vista ? vista.visitante : visitantePropio;
  const bolsa = vista ? vista.bolsa : bolsaPropia;
  const campanita = vista ? vista.campanita : campanitaPropia;
  useEffect(() => {
    if (!deEspera) {
      ultimaVista = { datos: propios, favoritos: favoritosPropios, nombre: nombrePropio, bolsa: bolsaPropia, campanita: campanitaPropia, visitante: visitantePropio };
    }
  }, [deEspera, propios, favoritosPropios, nombrePropio, bolsaPropia, campanitaPropia, visitantePropio]);
  const [hoja, setHoja] = useState<"menu" | "buscar" | null>(null);
  // La lista del buscador de ESTA tienda, cuando llega (null mientras tanto, o si es de otra tienda: la persona cambió de tienda).
  const [indice, setIndice] = useState<{ sede: string | null; respuesta: RespuestaBuscador } | null>(null);
  const prepararBuscador = () => {
    const sede = datos.sede;
    void pedirIndice(sede).then((respuesta) => setIndice({ sede, respuesta }));
  };
  const indiceDeEstaTienda = indice && indice.sede === datos.sede ? indice.respuesta : null;
  // El globo del corazón, al día: dentro del catálogo lo guardado se lleva en el navegador (`ProveedorGuardados`) y baja apenas se quita
  // un favorito; fuera de él (Mi cuenta, la bolsa), lo que contó el servidor.
  const guardados = useGuardados();
  const cuantosFavoritos = guardados ? guardados.cuantos : favoritos;
  const disparador = useRef<HTMLButtonElement | null>(null);

  function abrir(cual: "menu" | "buscar", boton: HTMLButtonElement) {
    disparador.current = boton;
    setHoja(cual);
  }
  function cerrar() {
    setHoja(null);
    disparador.current?.focus();
  }

  // «Buscar» ya no está en la cabecera: vive en la barra del catálogo (`BotonBuscarCatalogo`), que le avisa a la cabecera con este evento.
  useEffect(() => {
    const alPedir = (e: Event) => {
      const boton = (e as CustomEvent<{ boton?: HTMLButtonElement | null }>).detail?.boton ?? null;
      disparador.current = boton;
      prepararBuscador();
      setHoja("buscar");
    };
    window.addEventListener(EVENTO_BUSCAR, alPedir);
    return () => window.removeEventListener(EVENTO_BUSCAR, alPedir);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `prepararBuscador` se vuelve a crear en cada dibujo y solo lee `datos.sede`.
  }, [datos.sede]);

  // Con una hoja abierta: Escape la cierra y la página de atrás no se desplaza.
  useEffect(() => {
    if (!hoja) return;
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHoja(null);
        disparador.current?.focus();
      }
    };
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", alEscape);
    return () => {
      window.removeEventListener("keydown", alEscape);
      document.documentElement.style.overflow = antes;
    };
  }, [hoja]);

  // Si se tocó otra lista (de Lo nuevo a Más vendidos), la raya pasa ya a la tocada, mientras llega (`EnCamino`).
  const camino = useCamino();
  const marcada = camino ? seccionDeLaRuta(camino.ruta, new URLSearchParams(camino.buscar)) : actual;
  const marca = (seccion: SeccionActual) => (marcada === seccion ? "page" : undefined);
  // La raya que viaja (ADR-0524): una sola, bajo la pestaña marcada; corre de la de antes a la que se tocó mientras llega la página.
  const nav = useRef<HTMLElement>(null);
  useRayaDelNav(nav, marcada);

  return (
    <>
      <header className="t-cab">
        <div className="t-cab-fila">
          <button type="button" className="t-ico t-solo-movil" aria-label="Abrir el menú" onClick={(e) => abrir("menu", e.currentTarget)}>
            <Icono nombre="menu" />
          </button>
          <Link className="t-logo" href={datos.inicio} aria-label="CAYLA, ir al inicio">
            <Logo />
          </Link>
          {/* Al tocar una pestaña se apunta hacia dónde va el recorrido (a la derecha o a la izquierda): la página entra de lado en ese sentido (`vistas.css`). */}
          <nav className="t-nav" aria-label="Secciones" ref={nav} onClickCapture={(e) => marcarViaje(nav.current, (e.target as Element).closest(".t-nav-b"))}>
            <Link className="t-nav-b" href={datos.nuevo.href} aria-current={marca("nuevo")}>
              Lo nuevo
            </Link>
            {datos.menus.map((m) => (
              <MenuGrande key={m.clave} menu={m} hrefNuevo={datos.nuevo.href} />
            ))}
            <Link className="t-nav-b" href={datos.looks} aria-current={marca("looks")}>
              Looks
            </Link>
            <Link className="t-nav-b" href={datos.ofertas.href} aria-current={marca("ofertas")}>
              Ofertas
            </Link>
            <span className="t-raya" aria-hidden="true" />
          </nav>
          <span className="t-esp" />
          {tiendas && <SelectorTienda opciones={tiendas} prendasEnBolsa={prendasEnBolsa} />}
          {/* La bolsa antes y la cuenta al final (Felipe 2026-10-19): la cuenta, con su menú, queda en la esquina. */}
          {bolsa}
          {!visitante && campanita}
          <MenuDeLaCuenta
            nombre={nombre}
            enCuenta={actual === "cuenta"}
            visitante={visitante}
            hrefFavoritos={datos.favoritos}
            favoritos={cuantosFavoritos}
          />
        </div>
      </header>

      {hoja && <div className="t-velo" aria-hidden="true" onClick={cerrar} />}
      {hoja === "menu" && <HojaMenu datos={datos} cerrar={cerrar} visitante={visitante} />}
      {hoja === "buscar" && <HojaBuscar datos={datos} indice={indiceDeEstaTienda} reintentar={prepararBuscador} cerrar={cerrar} />}
    </>
  );
}

/**
 * Un menú de la computadora («Ropa», «Accesorios»; lib/grupos.ts): se abre al pasar el mouse o con el teclado (Tab), bajo toda la
 * cabecera. Cada grupo es una columna con su título (lleva a todo el grupo) y sus categorías, cada una con la foto de una de sus prendas
 * para reconocerla de un vistazo; a la derecha, lo último que llegó de ese menú (Felipe 2026-10-15: el menú «Ropa» era una lista de
 * texto con un hueco al medio y una columna de 17 filas que mezclaba la ropa con los aretes y el maquillaje).
 */
/** «Lentes/Gorros/Pañuelos» es una sola palabra sin espacios: sin un punto de corte no cabe en su columna y pisa a la vecina. */
function conCortes(nombre: string) {
  return nombre.split("/").flatMap((parte, i) => (i === 0 ? [parte] : ["/", <wbr key={i} />, parte]));
}

function MenuGrande({ menu, hrefNuevo }: { menu: MenuCabecera; hrefNuevo: string }) {
  return (
    <div className="t-mega-envol">
      {/* Un enlace, no un botón: al hacer clic lleva a TODO el menú («Toda la ropa»); el menú de abajo se abre igual con el mouse o con Tab. */}
      <Link className="t-nav-b" href={menu.href} aria-haspopup="true">
        {menu.nombre} <Icono nombre="chevron" />
      </Link>
      <div className="t-mega">
        <div className="t-mega-in" style={{ "--grupos": menu.grupos.length } as React.CSSProperties}>
          {menu.grupos.map((g) => (
            <div key={g.clave} className="t-mega-grupo">
              <h4>
                <Link href={g.href}>{conCortes(g.nombre)}</Link>
              </h4>
              <ul>
                {g.categorias.map((c) => (
                  <li key={c.clave}>
                    <Link className="t-mega-cat" href={c.href}>
                      <span className="t-mega-cat-nom">{c.nombre}</span>
                      <small>{c.cuantas}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {menu.recien.length > 0 && (
            <div className="t-mega-recien">
              <div className="t-mega-recien-in">
                <div className="t-mega-recien-cab">
                  <h4>Recién llegado</h4>
                  <Link href={hrefNuevo}>
                    Ver lo nuevo <Icono nombre="flecha" />
                  </Link>
                </div>
                <div className="t-mega-recien-fila">
                  {menu.recien.map((p) => (
                    <Link key={p.id} className="t-mega-prenda" href={p.href}>
                      <span aria-hidden="true">
                        <FotoChicaDe foto={p.foto} tamanos="140px" />
                      </span>
                      <b>{p.nombre}</b>
                      <small data-oferta={p.oferta ? "" : undefined}>{p.precio}</small>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** La foto chica de una categoría o de una prenda del menú (sin foto, su silueta en su color). */
function FotoChicaDe({ foto, tamanos }: { foto: FotoChica; tamanos: string }) {
  return (
    <FotoTarjeta
      foto={foto.foto}
      segunda={null}
      optimizar={[foto.optimizar, false]}
      nombre={foto.nombre}
      forma={foto.forma}
      color={foto.color}
      tamanos={tamanos}
    />
  );
}

/**
 * La tienda que se mira (A · Muro, Felipe 2026-10-19: «siempre se debe elegir una tienda», sin «Todas»): su nombre con una flecha, en la
 * cabecera de la computadora y del celular; al tocarla se abren las demás. Son enlaces (la tienda elegida va en la dirección y se puede
 * compartir) y, al elegir una, se recuerda en una cookie: la próxima visita sin tienda en la dirección abre en esa.
 */
function SelectorTienda({ opciones, prendasEnBolsa }: { opciones: OpcionTienda[]; prendasEnBolsa: number }) {
  const [abierto, setAbierto] = useState(false);
  // La tienda a la que quiere pasar mientras la bolsa lleva prendas: se confirma antes (cambiar de tienda vacía la bolsa).
  const [pendiente, setPendiente] = useState<OpcionTienda | null>(null);
  const [cambiando, cambiar] = useTransition();
  // El velo de «Ahora ves lo que hay en LIMA» (ADR-0466): la pantalla de carga de este cambio, que Next no muestra por su cuenta (cambiar de
  // tienda es la misma vista, `claveDeVista`). Se queda mientras llega la página y un mínimo, y se va sola a los 8 s si no llega.
  const [velo, setVelo] = useState<{ nombre: string; desde: number; arriba: number; fase: "espera" | "sale" } | null>(null);
  const router = useRouter();
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const idMenu = useId();
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
        setPendiente(null);
      }
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        setPendiente(null);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);
  // El velo se disipa cuando la página llegó (`cambiando` vuelve a false) y ya estuvo a la vista el mínimo; o al tope, aunque no llegue.
  useEffect(() => {
    if (!velo || velo.fase !== "espera" || cambiando) return;
    const t = window.setTimeout(() => setVelo((v) => (v ? { ...v, fase: "sale" } : v)), esperaParaSalir(ahoraMs() - velo.desde));
    return () => window.clearTimeout(t);
  }, [velo, cambiando]);
  useEffect(() => {
    if (!velo || velo.fase !== "espera") return;
    const t = window.setTimeout(() => setVelo((v) => (v ? { ...v, fase: "sale" } : v)), esperaHastaElTope(ahoraMs() - velo.desde));
    return () => window.clearTimeout(t);
  }, [velo]);
  useEffect(() => {
    if (velo?.fase !== "sale") return;
    const t = window.setTimeout(() => setVelo(null), VELO_SALE_MS);
    return () => window.clearTimeout(t);
  }, [velo]);
  const elegida = opciones.find((o) => o.actual) ?? opciones[0];
  // Elegir una tienda: se recuerda en la cookie, se cubre con el velo y se navega dentro de una transición (`cambiando` dura hasta que la
  // página nueva llega). Con prendas en la bolsa, antes se vacía (la persona ya lo confirmó).
  const ir = (o: OpcionTienda, vaciar: boolean) => {
    const clave = claveDeLaOpcion(o.href);
    if (clave) recordarSede(clave);
    setAbierto(false);
    setPendiente(null);
    // Justo bajo la cabecera: lo que rueda en ella se ve nítido (el velo es `fixed` en el `<body>`).
    const arriba = Math.max(0, Math.round(document.querySelector(".t-cab")?.getBoundingClientRect().bottom ?? 0));
    setVelo({ nombre: o.nombre, desde: ahoraMs(), arriba, fase: "espera" });
    cambiar(async () => {
      if (vaciar) await vaciarBolsaPorCambioDeTienda();
      router.push(o.href, { scroll: false });
    });
  };
  // Lo último que vio este selector, para que la respuesta de la ubicación (que llega segundos después) decida con lo de AHORA y no con lo
  // de cuando se preguntó: otra tienda elegida a mano, otra página o prendas nuevas en la bolsa.
  const vivo = useRef({ opciones, prendasEnBolsa, ir });
  useEffect(() => {
    vivo.current = { opciones, prendasEnBolsa, ir };
  });
  // «Ver lo que hay» de cada tienda (`BotonVerTienda`) pide el mismo cambio que este selector: con velo, cookie y, si la bolsa lleva prendas,
  // la confirmación. Si la tienda pedida ya es la que se ve, no se atiende (el enlace sigue su camino).
  useEffect(() => {
    const alPedir = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      const { opciones: ahora, prendasEnBolsa: enBolsa, ir: irA } = vivo.current;
      // La tienda se reconoce por su clave (`?sede=`); se va al enlace que pidió el botón (el Inicio), no al de esta página.
      const clave = claveDeLaOpcion(href);
      const tienda = ahora.find((o) => claveDeLaOpcion(o.href) === clave);
      const actual = ahora.find((o) => o.actual) ?? ahora[0];
      if (!clave || !tienda || !actual) return;
      if (!debeCubrir(claveDeLaOpcion(actual.href), clave)) return;
      e.preventDefault();
      const destino = { ...tienda, href };
      if (enBolsa > 0) {
        setPendiente(destino);
        setAbierto(true);
      } else irA(destino, false);
    };
    window.addEventListener(EVENTO_CAMBIAR_TIENDA, alPedir);
    return () => window.removeEventListener(EVENTO_CAMBIAR_TIENDA, alPedir);
  }, []);
  const pidioUbicacion = useRef(false);
  // La tienda más cercana (Felipe 2026-10-21): al entrar al Inicio por primera vez se pide la ubicación y se pasa a la tienda más cercana, con
  // el mismo velo de cambiar de tienda. La ubicación solo se usa para esto, aquí en el aparato: no se manda ni se guarda; se recuerda la
  // tienda (la cookie de siempre). Si dice que no, o no hay señal, se queda en la tienda de siempre y no se le vuelve a preguntar.
  useEffect(() => {
    if (pidioUbicacion.current || !("geolocation" in navigator)) return;
    const estado = () => ({
      ruta: window.location.pathname,
      tiendaRecordada: sedeYaRecordada(),
      yaPreguntada: ubicacionYaPreguntada(),
      prendasEnBolsa: vivo.current.prendasEnBolsa,
      tiendas: vivo.current.opciones.length,
    });
    if (!debePedirUbicacion(estado())) return;
    pidioUbicacion.current = true;
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        marcarUbicacionPreguntada();
        const { opciones: ahora, ir: irA } = vivo.current;
        // Si mientras tanto eligió una a mano, cambió de página o llenó la bolsa, no se le cambia nada por su cuenta.
        if (!debePedirUbicacion({ ...estado(), yaPreguntada: false })) return;
        const clave = claveMasCercana(
          { lat: posicion.coords.latitude, lng: posicion.coords.longitude },
          ahora.flatMap((o) => claveDeLaOpcion(o.href) ?? []),
        );
        const cercana = clave ? ahora.find((o) => claveDeLaOpcion(o.href) === clave) : undefined;
        if (!cercana) return;
        if (cercana.actual) recordarSede(clave!);
        else irA(cercana, false);
      },
      () => marcarUbicacionPreguntada(),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }, [opciones, prendasEnBolsa]);
  return (
    <div className="t-persona t-sel-tienda" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="t-nav-b"
        aria-label={`Tienda: ${elegida.nombre}. Cambiar`}
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => {
          setPendiente(null);
          setAbierto((a) => !a);
        }}
      >
        <NombreQueRueda nombre={elegida.nombre} /> <span aria-hidden="true">▾</span>
      </button>
      {velo && <VeloDeSede nombre={velo.nombre} fase={velo.fase} arriba={velo.arriba} />}
      {abierto && (
        <div className="t-persona-menu" id={idMenu}>
          {pendiente ? (
            // Con prendas en la bolsa, cambiar de tienda las quita: un aviso corto y dos botones.
            <div className="t-sel-aviso" role="alert">
              <p>Tu bolsa se vaciará.</p>
              <div className="t-sel-aviso-acc">
                <button type="button" className="t-btn t-btn-chico" disabled={cambiando} onClick={() => ir(pendiente, true)}>
                  Cambiar a {pendiente.nombre}
                </button>
                <button type="button" className="t-enlace" onClick={() => setPendiente(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            opciones.map((o) => (
              <Link
                key={o.href}
                className="t-persona-op"
                href={o.href}
                scroll={false}
                aria-current={o.actual ? "true" : undefined}
                onClick={(e) => {
                  // Un clic con modificador (abrir en otra pestaña) sigue siendo un enlace normal.
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  // La misma tienda: no hay nada que esperar (un velo se quedaría hasta el tope).
                  if (!debeCubrir(claveDeLaOpcion(elegida.href), claveDeLaOpcion(o.href) ?? "")) {
                    setAbierto(false);
                    return;
                  }
                  if (prendasEnBolsa > 0) setPendiente(o);
                  else ir(o, false);
                }}
              >
                {o.nombre}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El menú de la persona (Felipe 2026-10-15: «al dar click en la persona debería desplegar algo con el nombre, "Mi perfil" y cerrar
 * sesión»). Baja del ícono, en el celular y en la computadora; se cierra con Escape, al tocar fuera o al elegir. «Cerrar sesión» es el
 * mismo botón de «Tu cuenta» en «Mi perfil» (`salir`, `BotonCerrarSesion`) y dice «Cerrando sesión…» mientras la espera. Es un
 * desplegable (el botón dice si está abierto y qué abre; se recorre con Tab), no un `role="menu"`: ese rol promete moverse con las
 * flechas, y con dos opciones no hace falta.
 */
function MenuDeLaCuenta({
  nombre,
  enCuenta,
  visitante,
  hrefFavoritos,
  favoritos,
}: {
  nombre: string | null;
  enCuenta: boolean;
  visitante: boolean;
  hrefFavoritos: string;
  favoritos: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  const boton = useRef<HTMLButtonElement | null>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  return (
    <div className="t-persona" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="t-ico"
        aria-label={visitante ? "Entrar o crear mi cuenta" : nombre ? `Tu cuenta, ${nombre}` : "Tu cuenta"}
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        data-destino-corazon
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="persona" />
      </button>
      {abierto && (
        <div className="t-persona-menu" id={idMenu}>
          {visitante ? (
            <>
              <Link className="t-persona-op" href={hrefDeEntrada("/entrar")} onClick={() => setAbierto(false)}>
                <Icono nombre="persona" />
                Entrar
              </Link>
              <Link className="t-persona-op" href={hrefDeEntrada("/crear-cuenta")} onClick={() => setAbierto(false)}>
                <Icono nombre="persona" />
                Crear mi cuenta
              </Link>
              <Link className="t-persona-op" href={hrefFavoritos} onClick={() => setAbierto(false)}>
                <Icono nombre="corazon" />
                Favoritos{favoritos ? <small className="t-persona-n"> {favoritos}</small> : null}
              </Link>
            </>
          ) : (
            <>
              {nombre && (
                <p className="t-persona-hola">
                  Hola, <b>{nombre}</b>
                </p>
              )}
              <Link className="t-persona-op" href="/cuenta" aria-current={enCuenta ? "page" : undefined} onClick={() => setAbierto(false)}>
                <Icono nombre="persona" />
                Mi perfil
              </Link>
              <Link className="t-persona-op" href={hrefFavoritos} onClick={() => setAbierto(false)}>
                <Icono nombre="corazon" />
                Favoritos{favoritos ? <small className="t-persona-n"> {favoritos}</small> : null}
              </Link>
              <form action={salir}>
                <BotonCerrarSesion className="t-persona-op" conIcono />
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** El menú del celular (A · Muro, Felipe 2026-10-19: lo mismo que la cabecera de la computadora, sin más): las mismas secciones, en
 *  grande («Ropa» se abre y muestra sus grupos), la tienda que se mira con su título, y al pie la cuenta, «Favoritos» y la ayuda. */
function HojaMenu({
  datos,
  cerrar,
  visitante,
}: {
  datos: DatosCabecera;
  cerrar: () => void;
  visitante: boolean;
}) {
  return (
    // En el celular no hay raya: al tocar una sección del menú, la página entra de lado hacia la derecha (ADR-0524).
    <div className="t-menu" role="dialog" aria-modal="true" aria-label="Menú" onClickCapture={(e) => ((e.target as Element).closest("a") ? viajaHacia(1) : undefined)}>
      <div className="t-menu-cab">
        <span className="t-logo">
          <Logo />
        </span>
        <button type="button" className="t-ico" aria-label="Cerrar el menú" onClick={cerrar} autoFocus>
          <Icono nombre="cerrar" />
        </button>
      </div>
      <nav className="t-menu-grandes" aria-label="Secciones">
        <Link href={datos.nuevo.href} onClick={cerrar}>
          Lo nuevo
        </Link>
        {datos.menus.map((m) => (
          <details key={m.clave} className="t-menu-acor">
            <summary>{m.nombre}</summary>
            <div className="t-menu-sub">
              <Link href={m.href} onClick={cerrar}>
                {m.todo}
              </Link>
              {m.grupos.map((g) => (
                <div key={g.clave} className="t-menu-grupo">
                  <Link className="t-menu-grupo-t" href={g.href} onClick={cerrar}>
                    {g.nombre}
                  </Link>
                  {g.categorias.map((c) => (
                    <Link key={c.clave} href={c.href} onClick={cerrar}>
                      {c.nombre}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ))}
        <Link href={datos.looks} onClick={cerrar}>
          Looks
        </Link>
        <Link href={datos.ofertas.href} onClick={cerrar}>
          Ofertas
        </Link>
      </nav>
      <div className="t-menu-pie">
        <Link href={visitante ? hrefDeEntrada("/entrar") : "/cuenta"} onClick={cerrar}>
          {visitante ? "Entrar" : "Mi perfil"}
        </Link>
        <Link href={datos.favoritos} onClick={cerrar}>
          Favoritos
        </Link>
        <Link href="/como-separar" onClick={cerrar}>
          Cómo separar
        </Link>
        <Link href="/tiendas" onClick={cerrar}>
          Tiendas
        </Link>
        {/* Lo que el cliente le quiera recomendar a CAYLA (Felipe 2026-10-15), con su nombre: solo con cuenta. */}
        {!visitante && (
          <Link href="/recomendaciones" onClick={cerrar}>
            Recomendaciones
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * El buscador (maqueta, hoja «buscar»): busca mientras se escribe; vacío, las categorías para tocar; sin nada, lo dice. La lista llega
 * aparte (`indice`, casi siempre ya está: se pidió al rozar la lupa); si se escribe antes de que llegue, «Buscando…» con tres filas que
 * brillan con la forma de los resultados, y si la base no contestó, «Volver a intentar».
 */
function HojaBuscar({
  datos,
  indice,
  reintentar,
  cerrar,
}: {
  datos: DatosCabecera;
  indice: RespuestaBuscador | null;
  reintentar: () => void;
  cerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const lista = indice?.estado === "ok" ? indice.indice : null;
  const encontradas = lista ? buscarEn(lista, q) : [];
  const corto = q.trim().length < 2;
  const router = useRouter();
  return (
    <div className="t-buscador" role="dialog" aria-modal="true" aria-label="Buscar en la tienda">
      <div className="t-buscador-fila">
        <label className="t-buscador-caja">
          <Icono nombre="lupa" />
          <span className="t-sr">Buscar en la tienda</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca por nombre, prenda o color"
            autoComplete="off"
            enterKeyHint="search"
            autoFocus
            onKeyDown={(e) => {
              // «Buscar» del teclado del celular (o Enter): abre la primera prenda encontrada. Antes no hacía nada.
              if (e.key === "Enter" && !corto && encontradas.length > 0) {
                e.preventDefault();
                cerrar();
                router.push(encontradas[0].href);
              }
            }}
          />
        </label>
        <button type="button" className="t-ico" aria-label="Cerrar el buscador" onClick={cerrar}>
          <Icono nombre="cerrar" />
        </button>
      </div>
      <div aria-live="polite">
        {corto ? (
          datos.sugerencias.length > 0 && (
            <>
              <span className="t-ceja">Busca por categoría</span>
              <div className="t-sugerencias">
                {datos.sugerencias.map((s) => (
                  <button key={s} type="button" className="t-pildora" onClick={() => setQ(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )
        ) : indice === null ? (
          <>
            <span className="t-ceja t-resultados-cuenta">Buscando…</span>
            <div className="t-esqueleto t-resultados-esqueleto" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="t-resultado">
                  <span className="t-card-foto" />
                  <span>
                    <i className="t-esqueleto-linea" />
                    <i className="t-esqueleto-linea" />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : lista === null ? (
          <div className="t-vacio t-vacio-chico">
            <Icono nombre="lupa" />
            <h3>No pudimos buscar ahora</h3>
            <p>Es un problema de conexión de nuestro lado.</p>
            <button type="button" className="t-btn t-btn-sec" onClick={reintentar}>
              Volver a intentar
            </button>
          </div>
        ) : encontradas.length === 0 ? (
          <>
            <div className="t-vacio t-vacio-chico">
              <Icono nombre="lupa" />
              <h3>No encontramos «{q.trim()}»</h3>
              <p>Prueba con otra palabra: un color, una prenda o un nombre.</p>
            </div>
            {/* Sin resultados, no es un callejón sin salida: las categorías siguen a un toque. */}
            {datos.sugerencias.length > 0 && (
              <div className="t-sugerencias t-sugerencias-centro">
                {datos.sugerencias.map((s) => (
                  <button key={s} type="button" className="t-pildora" onClick={() => setQ(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <span className="t-ceja t-resultados-cuenta">
              {encontradas.length} {encontradas.length === 1 ? "prenda" : "prendas"}
            </span>
            <ul className="t-resultados">
              {encontradas.map((i) => {
                const partes = resaltar(i.nombre, q);
                return (
                  <li key={i.id}>
                    <Link className="t-resultado" href={i.href} onClick={cerrar}>
                      <FotoTarjeta
                        foto={i.foto}
                        segunda={null}
                        optimizar={[i.optimizar, false]}
                        nombre=""
                        forma={i.forma}
                        color={i.color}
                        tamanos="52px"
                      />
                      <span>
                        {/* El nombre en su propia caja: suelto, cada trozo sería una línea de la columna. */}
                        <span className="t-resultado-nom">
                          {partes ? (
                            <>
                              {partes[0]}
                              <mark>{partes[1]}</mark>
                              {partes[2]}
                            </>
                          ) : (
                            i.nombre
                          )}
                        </span>
                        <small>
                          {i.categoria ?? "CAYLA"}
                          {i.oferta ? ` · ${i.oferta}` : ""}
                        </small>
                      </span>
                      <b className="num" data-oferta={i.oferta ? "" : undefined}>
                        {i.precio}
                      </b>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
