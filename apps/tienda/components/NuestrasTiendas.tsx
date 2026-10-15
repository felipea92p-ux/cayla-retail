import Link from "next/link";
import { Icono } from "./Icono";
import { enlaceWhatsapp, whatsappLegible, type Sede } from "@/lib/tiendas";

/**
 * «Nuestras tiendas» (la maqueta, `seccionTiendas`): dónde recoger lo que se separa, con el horario y el WhatsApp de cada tienda.
 * Los datos los pone el ERP en Configuración ▸ Tienda web. En la portada es una sección más (va solo si hay tiendas); en
 * `/tiendas` es el título de la página, y sin tiendas lo dice en una línea. En el Inicio (con cuenta, `ver`), cada tienda lleva
 * además «Ver solo lo que hay aquí», que la elige en «Ver lo que hay en».
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
                <a
                  className="t-tienda-wsp"
                  href={enlaceWhatsapp(s.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Escribir por WhatsApp a la tienda de ${s.nombre}: ${whatsappLegible(s.whatsapp)}`}
                >
                  <Icono nombre="chat" />
                  WhatsApp {whatsappLegible(s.whatsapp)}
                </a>
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
        <p className="t-tiendas-vacio">Por ahora no podemos mostrarte nuestras tiendas: vuelve a mirar en un rato.</p>
      )}
    </section>
  );
}
