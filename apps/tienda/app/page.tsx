import Link from "next/link";
import { Anuncio } from "@/components/Anuncio";
import { Cabecera } from "@/components/Cabecera";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { Icono, type NombreIcono } from "@/components/Icono";
import { Isotipo } from "@/components/Isotipo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { Pie } from "@/components/Pie";
import { TarjetaClub } from "@/components/TarjetaClub";
import { leerPortada } from "@/lib/portada-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import { anioLima, anuncios, fechaCorta, fechaLarga, partirTitulo, pctTexto, type Campana } from "@/lib/portada";
import "./estilos/tiendas.css";

// La campaña sale de la base y la página se guarda 5 minutos: lo que se cambia en el ERP aparece solo, sin volver a
// publicar la tienda. Si la base no responde, la portada sale igual, sin campaña ni tiendas, y esa versión también dura
// 5 minutos: a la vuelta siguiente se vuelve a leer la base.
export const revalidate = 300;

const PASOS: [NombreIcono, string, string][] = [
  ["persona", "Crea tu cuenta", "Con tu correo, tu DNI y tu celular. Ya eres del Club CAYLA."],
  ["tienda", "Elige y toca «Separar»", "Mira cuánto hay en cada tienda. No pagas nada aquí."],
  ["chat", "Mándalo por WhatsApp", "El mensaje ya va escrito con tu número de pedido. La tienda te confirma."],
  ["bolsa", "Paga y recógelo", "Coordinas el pago por WhatsApp y lo recoges en tu tienda."],
];

const BENEFICIOS: [NombreIcono, string, string][] = [
  ["regalo", "Descuento en tu cumpleaños", "Te avisamos por WhatsApp y lo ves en tu cuenta."],
  ["ticket", "Un vale de compra por cada año", "Cada aniversario con CAYLA suma un vale."],
  ["chispa", "Lo nuevo, primero", "Lo ves aquí, en tu cuenta. Sin mensajes de publicidad."],
  ["pedido", "Tus pedidos en un lugar", "Ves cada separación, si ya la confirmaron y cuánto falta pagar."],
];

export default async function Portada() {
  const [{ campana }, sedes] = await Promise.all([leerPortada(), leerSedes()]);
  const anio = anioLima();
  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera />
      <main className="t-pagina">
        <section className="t-hero t-portada">
          <Isotipo className="t-colibri" />
          <div className="t-hero-texto">
            {campana ? <TextoCampana campana={campana} /> : <TextoBienvenida />}
            <div className="t-hero-acciones">
              <Link className="t-btn t-btn-claro" href="/crear-cuenta">
                Crear mi cuenta
              </Link>
              <Link className="t-enlace" href="/entrar">
                Ya tengo cuenta · Entrar <Icono nombre="flecha" />
              </Link>
            </div>
          </div>
          <div className="t-portada-club">
            <TarjetaClub nombre="Tu nombre aquí" desde={anio} />
            <p>Al crear tu cuenta ya eres miembro del Club CAYLA.</p>
          </div>
        </section>

        <section className="t-sec t-ancho">
          <div className="t-sec-cab">
            <div>
              <span className="t-ceja">Sin pagar en la web</span>
              <h2>
                Así se <em>separa</em>
              </h2>
            </div>
            <Link className="t-ver" href="/como-separar">
              Cómo funciona <Icono nombre="flecha" />
            </Link>
          </div>
          <ol className="t-como">
            {PASOS.map(([icono, titulo, texto]) => (
              <li key={titulo}>
                <span className="t-como-ic">
                  <Icono nombre={icono} />
                </span>
                <b>{titulo}</b>
                <span>{texto}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="t-club">
          <div className="t-ancho t-club-in">
            <div className="t-revela">
              <span className="t-ceja">Club CAYLA</span>
              <h2>
                Crea tu cuenta y <em>ya eres del club.</em>
              </h2>
              <ul className="t-beneficios">
                {BENEFICIOS.map(([icono, titulo, texto]) => (
                  <li key={titulo}>
                    <span>
                      <Icono nombre={icono} />
                    </span>
                    <span>
                      <b>{titulo}</b>
                      <small>{texto}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <Link className="t-btn" href="/crear-cuenta">
                Crear mi cuenta
              </Link>
            </div>
            <TarjetaClub nombre="Tu nombre aquí" desde={anio} />
          </div>
        </section>

        {/* Las tiendas que el ERP muestra en la web (Configuración ▸ Tienda web). Sin ninguna, o sin base, la sección no sale. */}
        {sedes.length > 0 && <NuestrasTiendas sedes={sedes} />}

        <Pie anio={anio} />
      </main>
    </div>
  );
}

function TextoCampana({ campana }: { campana: Campana }) {
  const [linea, cursiva] = partirTitulo(campana.nombre);
  return (
    <>
      <span className="t-hero-ceja">
        {campana.hasta ? (
          // En el celular, la fecha corta: la larga llega hasta el colibrí.
          <span>
            Campaña · hasta el <span className="t-fecha-larga">{fechaLarga(campana.hasta)}</span>
            <span className="t-fecha-corta">{fechaCorta(campana.hasta)}</span>
          </span>
        ) : (
          "Campaña vigente"
        )}
      </span>
      <h1 className="t-hero-tit">
        <span>{linea}</span>
        {cursiva && <em>{cursiva}</em>}
      </h1>
      <p className="t-hero-desc">
        <b>−{pctTexto(campana.pct)} % en prendas elegidas.</b> Entra para ver el catálogo, cuánto hay en cada tienda y separar.
      </p>
      {campana.hasta && <CuentaRegresiva hasta={campana.hasta} />}
    </>
  );
}

// Sin campaña, la frase de la marca. Le habla igual a todos: la maqueta decía «Bienvenido a CAYLA», y un texto para el
// cliente no lleva género (ADR-0288 act. k).
function TextoBienvenida() {
  return (
    <>
      <span className="t-hero-ceja">Tienda online</span>
      <h1 className="t-hero-tit">
        <span>Donde el estilo</span>
        <em>transforma</em>
      </h1>
      <p className="t-hero-desc">Entra para ver el catálogo, cuánto hay en cada tienda y separar.</p>
    </>
  );
}
