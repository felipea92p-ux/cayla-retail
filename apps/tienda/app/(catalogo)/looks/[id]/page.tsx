import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { FiltroTienda } from "@/components/FiltroTienda";
import { Icono } from "@/components/Icono";
import { AgregarLook } from "@/components/looks/AgregarLook";
import { Foto, Lamina } from "@/components/looks/Lamina";
import { hrefDePieza, hrefLook, hrefLooks, precioDePieza, totalDelLook } from "@/lib/looks";
import { leerLook } from "@/lib/looks-servidor";
import { claveDeSede, sedeDeLaUrl, sedesEnOrden } from "@/lib/sede-elegida";
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
// en la tienda elegida, el total del look completo y «Agregar el look a mi bolsa», que pide la talla de cada prenda (propuesta h).
export default async function LookAbierto({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const sedes = sedesEnOrden(await leerSedes());
  const pedida = sedeDeLaUrl(sp.sede, sedes);
  const lectura = esId(id) ? await leerLook(id, pedida?.id ?? null) : { sede: null, look: null };
  const elegida = lectura?.sede ? sedes.find((s) => s.id === lectura.sede) ?? null : null;
  const sede = elegida ? claveDeSede(elegida.nombre) : null;
  const look = lectura?.look ?? null;
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;

  return (
    <>
      {sedes.length > 1 && look && (
        <FiltroTienda
          opciones={[
            { nombre: "Todas", href: hrefLook(look.id, null), actual: elegida === null },
            ...sedes.map((s) => ({ nombre: s.nombre, href: hrefLook(look.id, claveDeSede(s.nombre)), actual: elegida?.id === s.id })),
          ]}
        />
      )}
      <div className="t-ancho">
        <nav className="t-ruta" aria-label="Estás en">
          <Link href="/">Inicio</Link>
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
            <Lamina look={look} sede={sede} origenFotos={origenFotos} enlaces />
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
              <AgregarLook look={look} origenFotos={origenFotos} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
