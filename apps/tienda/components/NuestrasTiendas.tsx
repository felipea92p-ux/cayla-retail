import Link from "next/link";
import { Icono } from "./Icono";
import { enlaceMapa, enlaceWhatsapp, whatsappLegible, type Sede } from "@/lib/tiendas";

/**
 * «Nuestras tiendas» (la maqueta, `seccionTiendas`): dónde recoger lo que se separa, con el horario y el WhatsApp de cada tienda, y
 * «Cómo llegar» (la dirección en el mapa del celular). Los datos los pone el ERP en Configuración ▸ Tienda web. En la portada es una
 * sección más (va solo si hay tiendas); en `/tiendas` es el título de la página, con una línea que dice para qué sirve, y sin tiendas lo
 * dice con «Volver a intentar». En el Inicio (con cuenta, `ver`), cada tienda lleva además «Ver solo lo que hay aquí», que la elige en
 * «Ver lo que hay en». Lo que se toca mide 44 px de alto: se toca con el dedo.
 */
export function NuestrasTiendas({
  sedes,
  enPagina = false,
  ver,
}: {
  sedes: Sede[];
  enPagina?: boolean;
  /** Por id de tienda: a dónde lleva «Ver solo lo que hay aquí» y si es la tienda elegida. */
  ver?: Record<string, { href: string; actual: boolean }>;
}) {
  const Titulo = enPagina ? "h1" : "h2";
  return (
    <section className="t-sec t-ancho t-nuestras-tiendas" aria-labelledby="nuestras-tiendas">
      <div className="t-sec-cab">
        <div>
          <span className="t-ceja">{ver ? "Mira lo que hay en cada una" : "Recoge en la que te quede cerca"}</span>
          <Titulo id="nuestras-tiendas">
            Nuestras <em>tiendas</em>
          </Titulo>
          {enPagina && <p>Lo que separas en la web lo recoges en la tienda que elijas. ¿Tienes una duda? Escríbele por WhatsApp.</p>}
        </div>
      </div>
      {sedes.length > 0 ? (
        <ul className="t-tiendas">
          {sedes.map((s) => {
            const enlace = ver?.[s.id];
            return (
              <li key={s.id} className="t-tienda">
                <Icono nombre="tienda" />
                <b>{s.nombre}</b>
                <small>
                  {s.direccion}
                  {s.horario && (
                    <>
                      <br />
                      {s.horario}
                    </>
                  )}
                </small>
                <div className="t-tienda-acc">
                  {/* El nombre que oye un lector empieza con lo que se ve escrito (así también lo encuentra quien habla para tocar). */}
                  <a
                    className="t-tienda-wsp"
                    href={enlaceWhatsapp(s.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${whatsappLegible(s.whatsapp)}: escribirle a la tienda de ${s.nombre} (se abre WhatsApp)`}
                  >
                    <Icono nombre="chat" />
                    WhatsApp {whatsappLegible(s.whatsapp)}
                  </a>
                  <a
                    className="t-tienda-wsp t-tienda-mapa"
                    href={enlaceMapa(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Cómo llegar a la tienda de ${s.nombre} (se abre el mapa)`}
                  >
                    <Icono nombre="ubicacion" />
                    Cómo llegar
                  </a>
                </div>
                {enlace && (
                  <Link className="t-enlace t-tienda-ver" href={enlace.href} aria-current={enlace.actual ? "true" : undefined} scroll={false}>
                    {enlace.actual ? `Viendo lo de ${s.nombre}` : "Ver solo lo que hay aquí"}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="t-tiendas-vacio" role="status">
          <p>Por ahora no podemos mostrarte nuestras tiendas. Vuelve a intentarlo en un momento.</p>
          <Link className="t-btn t-btn-sec t-tiendas-reintentar" href="/tiendas">
            Volver a intentar
          </Link>
        </div>
      )}
    </section>
  );
}
