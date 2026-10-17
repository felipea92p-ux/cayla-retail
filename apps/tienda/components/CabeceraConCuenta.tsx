"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salir } from "@/app/acciones/cuenta";
import { buscarEn, resaltar } from "@/lib/buscador";
import type { DatosCabecera, FotoChica, MenuCabecera } from "@/lib/inicio";
import { useGuardados } from "./club/Guardados";
import { BotonCerrarSesion } from "./cuenta/BotonCerrarSesion";
import { FotoTarjeta } from "./FotoTarjeta";
import { Icono } from "./Icono";
import { Isotipo } from "./Isotipo";
// El globo rojo de la bolsa y del corazón (`.t-globo`).
import "@/app/estilos/bolsa.css";

export type SeccionActual = "inicio" | "nuevo" | "vendidos" | "ofertas" | "looks" | "probador" | "favoritos" | "cuenta" | null;

/** «3 favoritos», «1 favorito»: lo que oye el lector en el corazón. */
const etiquetaFavoritos = (n: number | null) => (n ? `Favoritos: ${n} ${n === 1 ? "guardado" : "guardados"}` : "Favoritos");

/**
 * La cabecera de quien tiene cuenta (maqueta v4, `cabT`): en el celular, el menú a la izquierda; en la computadora, «Lo nuevo», «Ropa» y
 * «Accesorios» (cada uno abre sus grupos de categorías con fotos y lo último que llegó), «Arma tu look», «Más vendidos» y «Ofertas». A la derecha, el
 * buscador (busca mientras se escribe, por nombre, categoría o color, sin tildes ni mayúsculas), el corazón de los favoritos con cuántos
 * hay (solo en la computadora: en el celular están en el menú), la persona (abre su menú: el nombre, «Mi perfil» y «Cerrar sesión») y la
 * bolsa con su globo. Todos los enlaces llevan la tienda elegida, menos los favoritos (son de la persona, no de una tienda).
 */
export function CabeceraConCuenta({
  datos,
  actual = null,
  favoritos = null,
  bolsa = null,
  nombre = null,
}: {
  datos: DatosCabecera;
  actual?: SeccionActual;
  /** Cuántos modelos guardó con el corazón; null si no se sabe (la base no contestó): el corazón va sin globo. */
  favoritos?: number | null;
  /** La bolsa con su globo (`components/bolsa/BotonBolsa.tsx`, de servidor: lee la cookie de la bolsa). La pone el marco. */
  bolsa?: React.ReactNode;
  /** El nombre corto de la cuenta («María»), para el saludo del menú de la persona; null si no se sabe (sale sin saludo). */
  nombre?: string | null;
}) {
  const [hoja, setHoja] = useState<"menu" | "buscar" | null>(null);
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

  const marca = (seccion: SeccionActual) => (actual === seccion ? "page" : undefined);

  return (
    <>
      <header className="t-cab">
        <div className="t-cab-fila">
          <button type="button" className="t-ico t-solo-movil" aria-label="Abrir el menú" onClick={(e) => abrir("menu", e.currentTarget)}>
            <Icono nombre="menu" />
          </button>
          <Link className="t-logo" href={datos.inicio} aria-label="CAYLA, ir al inicio">
            <Isotipo />
            <span>CAYLA</span>
          </Link>
          <nav className="t-nav" aria-label="Secciones">
            <Link className="t-nav-b" href={datos.nuevo.href} aria-current={marca("nuevo")}>
              Lo nuevo
            </Link>
            {datos.menus.map((m) => (
              <MenuGrande key={m.clave} menu={m} hrefNuevo={datos.nuevo.href} />
            ))}
            <Link className="t-nav-b" href={datos.looks} aria-current={marca("looks")}>
              Arma tu look
            </Link>
            {datos.probador && (
              <Link className="t-nav-b" href={datos.probador} aria-current={marca("probador")}>
                Arma el tuyo
              </Link>
            )}
            <Link className="t-nav-b" href={datos.vendidos.href} aria-current={marca("vendidos")}>
              Más vendidos
            </Link>
            <Link className="t-nav-b oferta" href={datos.ofertas.href} aria-current={marca("ofertas")}>
              Ofertas
            </Link>
          </nav>
          <span className="t-esp" />
          <button type="button" className="t-ico" aria-label="Buscar" onClick={(e) => abrir("buscar", e.currentTarget)}>
            <Icono nombre="lupa" />
          </button>
          <Link className="t-ico t-solo-grande" href={datos.favoritos} aria-label={etiquetaFavoritos(cuantosFavoritos)} aria-current={marca("favoritos")}>
            <Icono nombre="corazon" />
            {cuantosFavoritos ? <span className="t-globo">{cuantosFavoritos}</span> : null}
          </Link>
          <MenuDeLaCuenta nombre={nombre} enCuenta={actual === "cuenta"} />
          {bolsa}
        </div>
      </header>

      {hoja && <div className="t-velo" aria-hidden="true" onClick={cerrar} />}
      {hoja === "menu" && <HojaMenu datos={datos} favoritos={cuantosFavoritos} cerrar={cerrar} />}
      {hoja === "buscar" && <HojaBuscar datos={datos} cerrar={cerrar} />}
    </>
  );
}

/**
 * Un menú de la computadora («Ropa», «Accesorios»; lib/grupos.ts): se abre al pasar el mouse o con el teclado (Tab), bajo toda la
 * cabecera. Cada grupo es una columna con su título (lleva a todo el grupo) y sus categorías, cada una con la foto de una de sus prendas
 * para reconocerla de un vistazo; a la derecha, lo último que llegó de ese menú (Felipe 2026-10-15: el menú «Ropa» era una lista de
 * texto con un hueco al medio y una columna de 17 filas que mezclaba la ropa con los aretes y el maquillaje).
 */
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
                <Link href={g.href}>{g.nombre}</Link>
              </h4>
              <ul>
                {g.categorias.map((c) => (
                  <li key={c.clave}>
                    <Link className="t-mega-cat" href={c.href}>
                      <span className="t-mega-mini" aria-hidden="true">
                        <FotoChicaDe foto={c.foto} tamanos="40px" />
                      </span>
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
 * El menú de la persona (Felipe 2026-10-15: «al dar click en la persona debería desplegar algo con el nombre, "Mi perfil" y cerrar
 * sesión»). Baja del ícono, en el celular y en la computadora; se cierra con Escape, al tocar fuera o al elegir. «Cerrar sesión» es el
 * mismo botón de «Tu cuenta» en «Mi perfil» (`salir`, `BotonCerrarSesion`) y dice «Cerrando sesión…» mientras la espera. Es un
 * desplegable (el botón dice si está abierto y qué abre; se recorre con Tab), no un `role="menu"`: ese rol promete moverse con las
 * flechas, y con dos opciones no hace falta.
 */
function MenuDeLaCuenta({ nombre, enCuenta }: { nombre: string | null; enCuenta: boolean }) {
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
        aria-label={nombre ? `Tu cuenta, ${nombre}` : "Tu cuenta"}
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icono nombre="persona" />
      </button>
      {abierto && (
        <div className="t-persona-menu" id={idMenu}>
          {nombre && (
            <p className="t-persona-hola">
              Hola, <b>{nombre}</b>
            </p>
          )}
          <Link className="t-persona-op" href="/cuenta" aria-current={enCuenta ? "page" : undefined} onClick={() => setAbierto(false)}>
            <Icono nombre="persona" />
            Mi perfil
          </Link>
          <form action={salir}>
            <BotonCerrarSesion className="t-persona-op" conIcono />
          </form>
        </div>
      )}
    </div>
  );
}

/** El menú del celular (maqueta, hoja «menu»): lo grande arriba (con «Arma tu look» y los favoritos, que en el celular no van en la
 *  fila de arriba), las categorías en dos columnas bajo su menú («Ropa», «Accesorios») y la ayuda al pie. */
function HojaMenu({ datos, favoritos, cerrar }: { datos: DatosCabecera; favoritos: number | null; cerrar: () => void }) {
  return (
    <div className="t-menu" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="t-menu-cab">
        <span className="t-logo">
          <Isotipo />
          <span>CAYLA</span>
        </span>
        <button type="button" className="t-ico" aria-label="Cerrar el menú" onClick={cerrar} autoFocus>
          <Icono nombre="cerrar" />
        </button>
      </div>
      <nav className="t-menu-grandes" aria-label="Secciones">
        <Link href={datos.nuevo.href} onClick={cerrar}>
          Lo nuevo <small>{datos.nuevo.cuantas}</small>
        </Link>
        <Link href={datos.looks} onClick={cerrar}>
          Arma tu look
        </Link>
        {datos.probador && (
          <Link href={datos.probador} onClick={cerrar}>
            Arma el tuyo
          </Link>
        )}
        <Link href={datos.vendidos.href} onClick={cerrar}>
          Más vendidos
        </Link>
        <Link href={datos.favoritos} onClick={cerrar}>
          Favoritos {favoritos ? <small>{favoritos}</small> : null}
        </Link>
        <Link className="oferta" href={datos.ofertas.href} onClick={cerrar}>
          Ofertas <small>{datos.ofertas.cuantas}</small>
        </Link>
      </nav>
      {datos.menus.map((m) => (
        <nav key={m.clave} className="t-menu-cats" aria-label={m.nombre}>
          <h4>{m.nombre}</h4>
          <Link className="t-menu-todo" href={m.href} onClick={cerrar}>
            {m.todo} <small>{m.grupos.reduce((n, g) => n + g.categorias.reduce((k, c) => k + c.cuantas, 0), 0)}</small>
          </Link>
          {m.grupos.flatMap((g) => g.categorias).map((c) => (
            <Link key={c.clave} href={c.href} onClick={cerrar}>
              {c.nombre}
            </Link>
          ))}
        </nav>
      ))}
      <div className="t-menu-pie">
        <Link className="t-enlace" href="/cuenta" onClick={cerrar}>
          Mi perfil y mis pedidos
        </Link>
        <Link className="t-enlace" href="/como-separar" onClick={cerrar}>
          Cómo separar
        </Link>
        <Link className="t-enlace" href="/tiendas" onClick={cerrar}>
          Nuestras tiendas
        </Link>
        {/* Lo que el cliente le quiera recomendar a CAYLA (Felipe 2026-10-15), con su nombre. */}
        <Link className="t-enlace" href="/recomendaciones" onClick={cerrar}>
          Recomendaciones
        </Link>
      </div>
    </div>
  );
}

/** El buscador (maqueta, hoja «buscar»): busca mientras se escribe; vacío, las categorías para tocar; sin nada, lo dice. */
function HojaBuscar({ datos, cerrar }: { datos: DatosCabecera; cerrar: () => void }) {
  const [q, setQ] = useState("");
  const encontradas = buscarEn(datos.indice, q);
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
