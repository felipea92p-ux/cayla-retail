import Link from "next/link";
import { EncabezadoAyuda } from "./ayuda/EncabezadoAyuda";
import { BotonVerTienda } from "./BotonVerTienda";
import { Icono } from "./Icono";
import { columnasDeTiendas, enlaceMapa, enlaceWhatsapp, whatsappLegible, type Sede } from "@/lib/tiendas";
import "@/app/estilos/tiendas.css";

/**
 * «Nuestras tiendas» (la maqueta, `seccionTiendas`): dónde recoger lo que se separa, con la dirección, el horario y el WhatsApp de cada
 * tienda, y dos acciones a la vista: escribirle por WhatsApp (abre un chat, sin mensaje armado) y «Cómo llegar» (la dirección en el mapa
 * del celular). Los datos los pone el ERP en Configuración ▸ Tienda web. En la portada y el Inicio es una sección más; en `/tiendas` es la
 * página (con su título grande, como las demás de ayuda) y sin tiendas lo dice con «Volver a intentar» (`reintentar`). En el Inicio (con
 * cuenta, `ver`), cada tienda lleva además «Ver solo lo que hay aquí», que la elige en «Ver lo que hay en». Revisión «a nivel mundial»
 * (2026-10-16): la grilla queda pareja con cualquier cantidad de tiendas (`columnasDeTiendas`: con dos, antes sobraba un tercio) y una
 * tienda sola se acomoda a lo ancho. Lo que se toca mide 44 px o más: se toca con el dedo.
 */
export function NuestrasTiendas({
  sedes,
  enPagina = false,
  ver,
  ceja,
  reintentar = "/tiendas",
  idTitulo = "nuestras-tiendas",
}: {
  sedes: Sede[];
  enPagina?: boolean;
  /** Por id de tienda: a dónde lleva «Ver solo lo que hay aquí» y si es la tienda elegida. */
  ver?: Record<string, { href: string; actual: boolean }>;
  /** La ceja de la sección, si la página la dice de otra forma («Cambia tu prenda en la que te quede cerca»). */
  ceja?: string;
  /** A dónde lleva «Volver a intentar» si la base no dio las tiendas: la misma página. */
  reintentar?: string;
  /** El id del título de la sección (`aria-labelledby` y el ancla). Cada página pone el suyo: con cache components las últimas páginas
   *  visitadas siguen en el documento, escondidas, y dos ids iguales harían que el ancla o el nombre apuntaran a la copia escondida. */
  idTitulo?: string;
}) {
  const laCeja = ceja ?? (ver ? "Mira lo que hay en cada una" : "Recoge en la que te quede cerca");
  // Bajo el título de la página, cada tienda es un h2; en una sección (h2), un h3.
  const Nombre = enPagina ? "h2" : "h3";
  const lista =
    sedes.length > 0 ? (
      <ul className="ay-tiendas" data-columnas={columnasDeTiendas(sedes.length)}>
        {sedes.map((s) => {
          const enlace = ver?.[s.id];
          return (
            <li key={s.id} className="ay-tienda" data-elegida={enlace?.actual ? "" : undefined}>
              <div className="ay-tienda-in">
                <Nombre className="ay-tienda-nombre">{s.nombre}</Nombre>
                <ul className="ay-tienda-datos">
                  <li>
                    <Icono nombre="ubicacion" />
                    <span>
                      <span className="t-sr">Dirección: </span>
                      {s.direccion}
                    </span>
                  </li>
                  {s.horario && (
                    <li>
                      <Icono nombre="reloj" />
                      <span>
                        <span className="t-sr">Horario: </span>
                        {s.horario}
                      </span>
                    </li>
                  )}
                  <li>
                    <Icono nombre="chat" />
                    <span className="ay-tienda-num">
                      <span className="t-sr">WhatsApp: </span>
                      {whatsappLegible(s.whatsapp)}
                    </span>
                  </li>
                </ul>
                <div className="ay-tienda-acc">
                  {/* El nombre que oye un lector empieza con lo que se ve escrito (así también lo encuentra quien habla para tocar). */}
                  <a
                    className="t-btn ay-tienda-btn"
                    href={enlaceWhatsapp(s.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp: escribirle a la tienda de ${s.nombre} (se abre WhatsApp)`}
                  >
                    <Icono nombre="chat" />
                    WhatsApp
                  </a>
                  <a
                    className="t-btn t-btn-sec ay-tienda-btn"
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
                  // En el Inicio elegir la tienda deja la vista donde está (se sigue mirando esta sección); desde /tiendas se llega al
                  // Inicio desde arriba.
                  enlace.actual ? (
                    <Link className="ay-tienda-ver" href={enlace.href} aria-current="true" scroll={enPagina ? undefined : false}>
                      <Icono nombre="check" />
                      <span>Viendo lo de {s.nombre}</span>
                    </Link>
                  ) : (
                    <BotonVerTienda href={enlace.href} enPagina={enPagina}>
                      <span>Ver lo que hay</span>
                      <Icono nombre="flecha" />
                    </BotonVerTienda>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    ) : (
      <div className="ay-tiendas-vacio" role="status">
        <Icono nombre="tienda" />
        <p>Por ahora no podemos mostrarte nuestras tiendas. Vuelve a intentarlo en un momento.</p>
        <Link className="t-btn t-btn-sec ay-tiendas-reintentar" href={reintentar}>
          Volver a intentar
        </Link>
      </div>
    );

  if (enPagina) {
    return (
      <div className="t-ancho ay-pagina">
        <section className="ay-bloque ay-tiendas-pag" aria-labelledby={idTitulo}>
          <EncabezadoAyuda
            id={idTitulo}
            ceja={laCeja}
            titulo={
              <>
                Nuestras <em>tiendas</em>
              </>
            }
            bajada="Lo que separas en la web lo recoges en la tienda que elijas. ¿Tienes una duda? Escríbele por WhatsApp."
          />
          {lista}
        </section>
      </div>
    );
  }
  return (
    <section className="t-sec t-ancho ay-tiendas-sec" aria-labelledby={idTitulo}>
      <div className="t-sec-cab">
        <div>
          {laCeja && <span className="t-ceja">{laCeja}</span>}
          <h2 id={idTitulo}>
            Nuestras <em>tiendas</em>
          </h2>
        </div>
      </div>
      {lista}
    </section>
  );
}
