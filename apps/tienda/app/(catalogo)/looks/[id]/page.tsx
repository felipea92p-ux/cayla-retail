import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Promesas } from "@/components/bolsa/Promesas";
import { Icono } from "@/components/Icono";
import { AgregarLookALaBolsa } from "@/components/looks/AgregarLookALaBolsa";
import { Foto, Lamina } from "@/components/looks/Lamina";
import { TarjetaLook } from "@/components/looks/TarjetaLook";
import { MarcoCatalogo } from "@/components/MarcoCatalogo";
import { leerAyuda } from "@/lib/ayuda-servidor";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { promesasDeCompra } from "@/lib/ficha";
import { hrefDelInicio } from "@/lib/inicio";
import { hrefDePieza, hrefLook, hrefLooks, otrosLooks, precioDePieza, totalDelLook } from "@/lib/looks";
import { leerLook, leerLooks } from "@/lib/looks-servidor";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
import { hayEnTienda } from "@/lib/stock";
import { leerSedes } from "@/lib/tiendas-servidor";
import "../../../estilos/looks.css";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const esId = (id: string) => z.string().uuid().safeParse(id).success;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!esId(id)) return { title: "Arma tu look · CAYLA" };
  const sedes = sedesEnOrden(await leerSedes());
  const lectura = await leerLook(id, sedeDeLaUrl(sp.sede, sedes)?.id ?? null);
  return { title: lectura?.look ? `${lectura.look.nombre} · Arma tu look · CAYLA` : "Arma tu look · CAYLA" };
}

// Un look abierto (maqueta v4, `vLook` y `lookInfo`): la lámina, «Look N de M», su nombre y su frase, cada prenda con su color y lo que cuesta
// en la tienda elegida, el total del look completo y «Agregar el look a mi bolsa», que pide la talla de cada prenda (propuesta h) y lo agrega
// a la bolsa con las mismas reglas que una prenda suelta; debajo del botón, lo que la tienda ya cumple (las promesas de la ficha) y, al
// final, los otros looks. Lleva el marco de la tienda: la cabecera, la franja de la tienda y el pie.
export default async function LookAbierto({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  // Con el look, los demás (para «Otros looks», abajo) y los plazos de las promesas: todo a la vez.
  const [lectura, catalogo, todos, plazos] = await Promise.all([
    esId(id) ? leerLook(id, pedida?.id ?? null) : Promise.resolve({ sede: null, look: null }),
    leerCatalogo(pedida?.id ?? null),
    esId(id) ? leerLooks(pedida?.id ?? null) : Promise.resolve(null),
    leerAyuda(),
  ]);
  const elegida = lectura?.sede ? sedes.find((s) => s.id === lectura.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const look = lectura?.look ?? null;
  const otros = look ? otrosLooks(todos?.looks ?? [], look.id) : [];
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  // La cabecera (el menú y el buscador) dice lo mismo que el catálogo de esa tienda.
  const prendas = (catalogo?.prendas ?? []).filter((p) => hayEnTienda(p.stock, elegida?.id ?? null));

  return (
    <MarcoCatalogo
      prendas={prendas}
      sede={sede}
      actual="looks"
      filtro={
        look
          ? [
              { nombre: "Todas", href: hrefLook(look.id, null), actual: elegida === null },
              ...sedes.map((s) => ({ nombre: s.nombre, href: hrefLook(look.id, claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
            ]
          : null
      }
    >
      <div className="t-ancho">
        <nav className="t-ruta" aria-label="Estás en">
          <Link href={hrefDelInicio(sede)}>Inicio</Link>
          <span aria-hidden="true">/</span>
          <Link href={hrefLooks(sede)}>Arma tu look</Link>
          {look && (
            <>
              <span aria-hidden="true">/</span>
              <span>{look.nombre}</span>
            </>
          )}
        </nav>

        {lectura === null ? (
          <div className="t-vacio" role="status">
            <Icono nombre="tienda" />
            <h3>No pudimos cargar este look</h3>
            <p>Es un problema de conexión de nuestro lado. Vuelve a intentarlo en un momento.</p>
            <Link className="t-btn" href={hrefLook(id, pedida ? claveDeSede(pedida.nombre) : null)}>
              Volver a intentar
            </Link>
          </div>
        ) : look === null ? (
          <div className="t-vacio">
            <Icono nombre="chispa" />
            <h3>Este look ya no está</h3>
            <p>Puede que alguna de sus prendas se haya agotado o que lo hayamos cambiado. Mira los otros looks.</p>
            <Link className="t-btn" href={hrefLooks(sede)}>
              Ver los looks
            </Link>
          </div>
        ) : (
          <div className="t-look t-look-abierto">
            <Lamina look={look} sede={sede} origenFotos={origenFotos} enlaces pronto />
            <div className="t-look-info">
              <span className="t-ceja">{`Look ${look.numero} de ${look.de}`}</span>
              <h1>{look.nombre}</h1>
              {look.frase && <p>{look.frase}</p>}
              <ol className="t-look-items">
                {look.piezas.map((p) => {
                  const precio = precioDePieza(p);
                  return (
                    <li key={p.posicion} className="t-look-item">
                      <b aria-hidden="true">{p.posicion}</b>
                      <span className="t-look-tile">
                        <Foto pieza={p} origenFotos={origenFotos} />
                      </span>
                      <span className="t-look-item-txt">
                        <Link className="t-card-nom" href={hrefDePieza(p, sede)}>
                          {p.prenda.nombre}
                        </Link>
                        <small>{p.color.nombre}</small>
                      </span>
                      <span className={`t-precio${precio.oferta ? " oferta" : ""}`}>
                        <b className="num">{precio.principal}</b>
                        {precio.anterior && (
                          <s className="num">
                            <span className="t-sr">Antes </span>
                            {precio.anterior}
                          </s>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="t-look-total">
                <span>El look completo</span>
                <b className="num">{totalDelLook(look)}</b>
              </div>
              <AgregarLookALaBolsa look={look} origenFotos={origenFotos} sedeId={elegida?.id ?? null} />
              <Promesas promesas={promesasDeCompra(plazos)} />
            </div>
          </div>
        )}
        {/* El look no termina en el pie: los demás, para seguir mirando (2026-10-16). */}
        {otros.length > 0 && (
          <section className="t-sec cp-otros-looks" aria-labelledby="otros-looks">
            <div className="t-sec-cab cp-sec-cab">
              <div>
                <span className="t-ceja">Combinaciones listas</span>
                <h2 id="otros-looks">
                  Otros <em>looks</em>
                </h2>
              </div>
              <Link className="t-ver" href={hrefLooks(sede)}>
                Ver todos <Icono nombre="flecha" />
              </Link>
            </div>
            {/* En el celular, un carril que se desliza (como en el Inicio); en la computadora, en una fila de dos o tres. */}
            <div className="cp-looks-carril" style={{ "--cp-columnas": Math.max(2, otros.length) } as CSSProperties}>
              {otros.map((l) => (
                <TarjetaLook key={l.id} look={l} sede={sede} origenFotos={origenFotos} />
              ))}
            </div>
          </section>
        )}
      </div>
    </MarcoCatalogo>
  );
}
