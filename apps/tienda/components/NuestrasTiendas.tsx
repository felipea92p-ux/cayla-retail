import { Icono } from "./Icono";
import { enlaceWhatsapp, whatsappLegible, type Sede } from "@/lib/tiendas";

/**
 * «Nuestras tiendas» (la maqueta, `seccionTiendas`): dónde recoger lo que se separa, con el horario y el WhatsApp de cada tienda.
 * Los datos los pone el ERP en Configuración ▸ Tienda web. En la portada es una sección más (va solo si hay tiendas); en
 * `/tiendas` es el título de la página, y sin tiendas lo dice en una línea.
 */
export function NuestrasTiendas({ sedes, enPagina = false }: { sedes: Sede[]; enPagina?: boolean }) {
  const Titulo = enPagina ? "h1" : "h2";
  return (
    <section className="t-sec t-ancho t-nuestras-tiendas" aria-labelledby="nuestras-tiendas">
      <div className="t-sec-cab">
        <div>
          <span className="t-ceja">Recoge en la que te quede cerca</span>
          <Titulo id="nuestras-tiendas">
            Nuestras <em>tiendas</em>
          </Titulo>
        </div>
      </div>
      {sedes.length > 0 ? (
        <ul className="t-tiendas">
          {sedes.map((s) => (
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-tiendas-vacio">Por ahora no podemos mostrarte nuestras tiendas: vuelve a mirar en un rato.</p>
      )}
    </section>
  );
}
