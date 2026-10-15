"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buscarEn, resaltar } from "@/lib/buscador";
import type { DatosCabecera } from "@/lib/inicio";
import { FotoTarjeta } from "./FotoTarjeta";
import { Icono } from "./Icono";
import { Isotipo } from "./Isotipo";
// El globo rojo de la bolsa y del corazón (`.t-globo`).
import "@/app/estilos/bolsa.css";

export type SeccionActual = "inicio" | "nuevo" | "vendidos" | "ofertas" | "looks" | "favoritos" | "cuenta" | null;

/** «3 favoritos», «1 favorito»: lo que oye el lector en el corazón. */
const etiquetaFavoritos = (n: number | null) => (n ? `Favoritos: ${n} ${n === 1 ? "guardado" : "guardados"}` : "Favoritos");

/**
 * La cabecera de quien tiene cuenta (maqueta v4, `cabT`): en el celular, el menú a la izquierda; en la computadora, «Lo nuevo», «Ropa»
 * (con sus categorías en columnas y la tarjeta de lo último que llegó), «Arma tu look», «Más vendidos» y «Ofertas». A la derecha, el
 * buscador (busca mientras se escribe, por nombre, categoría o color, sin tildes ni mayúsculas), el corazón de los favoritos con cuántos
 * hay (solo en la computadora: en el celular están en el menú), «Mi cuenta» y la bolsa con su globo. Todos los enlaces llevan la tienda
 * elegida, menos los favoritos (son de la persona, no de una tienda).
 */
export function CabeceraConCuenta({
  datos,
  actual = null,
  favoritos = null,
  bolsa = null,
}: {
  datos: DatosCabecera;
  actual?: SeccionActual;
  /** Cuántos modelos guardó con el corazón; null si no se sabe (la base no contestó): el corazón va sin globo. */
  favoritos?: number | null;
  /** La bolsa con su globo (`components/bolsa/BotonBolsa.tsx`, de servidor: lee la cookie de la bolsa). La pone el marco. */
  bolsa?: React.ReactNode;
}) {
  const [hoja, setHoja] = useState<"menu" | "buscar" | null>(null);
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
            {datos.columnas.length > 0 && (
              <div className="t-mega-envol">
                <button type="button" className="t-nav-b" aria-haspopup="true">
                  Ropa <Icono nombre="chevron" />
                </button>
                <div className="t-mega">
                  {datos.columnas.map((c) => (
                    <div key={c.titulo}>
                      <h4>{c.titulo}</h4>
                      <ul>
                        {c.categorias.map((x) => (
                          <li key={x.clave}>
                            <Link href={x.href}>
                              {x.nombre} <small>{x.cuantas}</small>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {datos.destacada && (
                    <Link className="t-mega-foto" href={datos.nuevo.href}>
                      <FotoTarjeta
                        foto={datos.destacada.foto}
                        segunda={null}
                        optimizar={[datos.destacada.optimizar, false]}
                        nombre={datos.destacada.nombre}
                        forma={datos.destacada.forma}
                        color={datos.destacada.color}
                        tamanos="150px"
                      />
                      <span>
                        <small>Recién llegado</small>
                        <b>Lo nuevo</b>
                        <small>
                          {datos.nuevo.cuantas} {datos.nuevo.cuantas === 1 ? "prenda" : "prendas"} de los últimos 30 días
                        </small>
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            )}
            <Link className="t-nav-b" href={datos.looks} aria-current={marca("looks")}>
              Arma tu look
            </Link>
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
          <Link className="t-ico t-solo-grande" href={datos.favoritos} aria-label={etiquetaFavoritos(favoritos)} aria-current={marca("favoritos")}>
            <Icono nombre="corazon" />
            {favoritos ? <span className="t-globo">{favoritos}</span> : null}
          </Link>
          <Link className="t-ico" href="/cuenta" aria-label="Mi cuenta" aria-current={marca("cuenta")}>
            <Icono nombre="persona" />
          </Link>
          {bolsa}
        </div>
      </header>

      {hoja && <div className="t-velo" aria-hidden="true" onClick={cerrar} />}
      {hoja === "menu" && <HojaMenu datos={datos} favoritos={favoritos} cerrar={cerrar} />}
      {hoja === "buscar" && <HojaBuscar datos={datos} cerrar={cerrar} />}
    </>
  );
}

/** El menú del celular (maqueta, hoja «menu»): lo grande arriba (con «Arma tu look» y los favoritos, que en el celular no van en la
 *  fila de arriba), las categorías en dos columnas y la ayuda al pie. */
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
      {datos.categorias.length > 0 && (
        <nav className="t-menu-cats" aria-label="Categorías">
          {datos.categorias.map((c) => (
            <Link key={c.clave} href={c.href} onClick={cerrar}>
              {c.nombre}
            </Link>
          ))}
        </nav>
      )}
      <div className="t-menu-pie">
        <Link className="t-enlace" href="/cuenta" onClick={cerrar}>
          Mi cuenta y mis pedidos
        </Link>
        <Link className="t-enlace" href="/como-separar" onClick={cerrar}>
          Cómo separar
        </Link>
        <Link className="t-enlace" href="/tiendas" onClick={cerrar}>
          Nuestras tiendas
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
          <div className="t-vacio t-vacio-chico">
            <Icono nombre="lupa" />
            <h3>No encontramos «{q.trim()}»</h3>
            <p>Prueba con otra palabra: un color, una prenda o un nombre.</p>
          </div>
        ) : (
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
                    <b className="num">{i.precio}</b>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
