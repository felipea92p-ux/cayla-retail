import Link from "next/link";
import { Anuncio } from "@/components/Anuncio";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { Cabecera } from "@/components/Cabecera";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { Icono } from "@/components/Icono";
import { Isotipo } from "@/components/Isotipo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { Pie } from "@/components/Pie";
import { SeccionClub } from "@/components/SeccionClub";
import { TarjetaClub } from "@/components/TarjetaClub";
import { leerPortada } from "@/lib/portada-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";
import { anioLima, anuncios, fechaCorta, fechaLarga, partirTitulo, pctTexto, type Campana } from "@/lib/portada";
import "./estilos/tiendas.css";

// La campaña sale de la base y la página se guarda 5 minutos: lo que se cambia en el ERP aparece solo, sin volver a
// publicar la tienda. Si la base no responde, la portada sale igual, sin campaña ni tiendas, y esa versión también dura
// 5 minutos: a la vuelta siguiente se vuelve a leer la base. «Así se separa» y el Club son las mismas piezas del Inicio.
export const revalidate = 300;

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
            <p>Crea tu cuenta y forma parte del Club CAYLA.</p>
          </div>
        </section>

        <AsiSeSepara />
        <SeccionClub nombre={null} desde={anio} conCuenta={false} />

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
