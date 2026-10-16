import Link from "next/link";
import { Anuncio } from "@/components/Anuncio";
import { AsiSeSepara } from "@/components/AsiSeSepara";
import { Cabecera } from "@/components/Cabecera";
import { CollageDePrendas } from "@/components/CollageDePrendas";
import { CuentaRegresiva } from "@/components/CuentaRegresiva";
import { Icono } from "@/components/Icono";
import { Isotipo } from "@/components/Isotipo";
import { NuestrasTiendas } from "@/components/NuestrasTiendas";
import { Pie } from "@/components/Pie";
import { ConfianzaPortada } from "@/components/portada/ConfianzaPortada";
import { VitrinaSinPrecio } from "@/components/portada/VitrinaSinPrecio";
import { SeccionClub } from "@/components/SeccionClub";
import { TarjetaClub } from "@/components/TarjetaClub";
import { hrefDePrenda, hrefLista } from "@/lib/catalogo";
import { leerCatalogo } from "@/lib/catalogo-servidor";
import { leerBeneficiosDelClub } from "@/lib/cuentas-servidor";
import { hrefConVolver } from "@/lib/entrada";
import { heroDelInicio, type Hero } from "@/lib/inicio";
import { leerPortada } from "@/lib/portada-servidor";
import { anioLima, anuncios, fechaCorta, fechaLarga, partirTitulo, pctTexto, type Campana } from "@/lib/portada";
import { leerSedes } from "@/lib/tiendas-servidor";
import { vitrinaDePortada } from "@/lib/vitrina-portada";
import "./estilos/tiendas.css";
import "./estilos/portada.css";

// La campaña y las prendas salen de la base y la página se guarda 5 minutos: lo que se cambia en el ERP aparece solo, sin volver a
// publicar la tienda. Si la base no responde, la portada sale igual, sin campaña, sin fotos ni tiendas, y esa versión también dura
// 5 minutos: a la vuelta siguiente se vuelve a leer la base. «Así se separa» y el Club son las mismas piezas del Inicio.
export const revalidate = 300;

/**
 * La portada de quien todavía no tiene cuenta (maqueta v4; Felipe 2026-10-16: «competencia de grandes empresas mundiales» y «fotos sin
 * precio»). Arriba la campaña (o lo nuevo) con sus prendas como polaroids, SIN precio; la franja de lo que la tienda cumple; la vitrina de
 * lo que hay en tienda, también sin precio (cada foto lleva a crear la cuenta y, al terminarla, a esa prenda); cómo se separa; el Club con
 * su tarjeta (una sola: antes también estaba en el héroe); y nuestras tiendas. Precio, tallas y cuánto hay, solo con cuenta.
 */
export default async function Portada() {
  const [{ campana }, sedes, catalogo, beneficios] = await Promise.all([leerPortada(), leerSedes(), leerCatalogo(null), leerBeneficiosDelClub()]);
  const anio = anioLima();
  const prendas = catalogo?.prendas ?? [];
  const hero = heroDelInicio(campana, prendas);
  const piezas = hero.tipo === "marca" ? [] : hero.piezas;
  const vitrina = vitrinaDePortada(prendas, new Set(piezas.map((p) => p.id)));
  const origenFotos = process.env.TIENDA_FOTOS_ORIGEN;
  // El rojo de la campaña cuando el héroe la anuncia (con sus prendas o, sin ninguna publicada, solo su texto); si no, el oscuro.
  const conCampana = hero.tipo === "campana" || (hero.tipo === "marca" && campana !== null);
  // A dónde llega quien crea su cuenta desde el héroe: a la campaña, o a lo nuevo.
  const destino =
    hero.tipo === "campana"
      ? hrefLista({ categoria: null, orden: "destacado", lista: "ofertas", campana: hero.campanaId })
      : hero.tipo === "nuevo"
        ? hrefLista({ categoria: null, orden: "destacado", lista: "nuevo" })
        : null;

  return (
    <div className="tienda">
      <Anuncio frases={anuncios(campana)} />
      <Cabecera />
      <main className="t-pagina">
        <section className={`t-hero t-portada${piezas.length > 0 ? " po-hero" : ""}${conCampana ? "" : " sin-campana"}`}>
          <Isotipo className="t-colibri" />
          <div className="t-hero-texto">
            <TextoDelHeroe hero={hero} campana={campana} />
            <div className="t-hero-acciones">
              <Link className="t-btn t-btn-claro" href={hrefConVolver("/crear-cuenta", destino)}>
                Crear mi cuenta
              </Link>
              <Link className="t-enlace" href={hrefConVolver("/entrar", destino)}>
                Ya tengo cuenta · Entrar <Icono nombre="flecha" />
              </Link>
            </div>
          </div>
          {piezas.length > 0 ? (
            <CollageDePrendas
              piezas={piezas}
              href={(p) => hrefConVolver("/crear-cuenta", hrefDePrenda(p))}
              conPrecio={false}
              origenFotos={origenFotos}
              marca={hero.tipo === "campana" ? `−${pctTexto(hero.campana.pct)}%` : null}
            />
          ) : (
            // Sin prendas para mostrar (o sin base): la tarjeta del Club, como antes.
            <div className="t-portada-club">
              <TarjetaClub nombre="Tu nombre aquí" desde={anio} />
              <p>Crea tu cuenta y forma parte del Club CAYLA.</p>
            </div>
          )}
        </section>

        <ConfianzaPortada tiendas={sedes.map((s) => s.nombre)} />
        <VitrinaSinPrecio prendas={vitrina} total={prendas.length - piezas.length} origenFotos={origenFotos} />
        <AsiSeSepara />
        <SeccionClub nombre={null} desde={anio} conCuenta={false} cumplePct={beneficios?.pct ?? null} />

        {/* Las tiendas que el ERP muestra en la web (Configuración ▸ Tienda web). Sin ninguna, o sin base, la sección no sale. */}
        {sedes.length > 0 && <NuestrasTiendas sedes={sedes} />}
      </main>
      <Pie anio={anio} />
    </div>
  );
}

/** El texto del héroe: la campaña con sus prendas, lo nuevo, o la frase de la marca (sin nada que mostrar). */
function TextoDelHeroe({ hero, campana }: { hero: Hero; campana: Campana | null }) {
  if (hero.tipo === "campana") return <TextoCampana campana={hero.campana} />;
  if (hero.tipo === "nuevo") {
    return (
      <>
        <span className="t-hero-ceja">Recién llegado</span>
        <h1 className="t-hero-tit">
          <span>Lo nuevo</span>
          <em>de CAYLA</em>
        </h1>
        <p className="t-hero-desc">
          <b>Lo que llegó a nuestras tiendas en los últimos 30 días.</b> Crea tu cuenta para ver precios, tallas y cuánto hay en cada tienda.
        </p>
      </>
    );
  }
  // Una campaña sin prendas publicadas igual se anuncia (la franja de arriba ya la nombra), sin fotos.
  return campana ? <TextoCampana campana={campana} /> : <TextoBienvenida />;
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
        <b>−{pctTexto(campana.pct)} % en prendas elegidas.</b> Crea tu cuenta para ver los precios, cuánto hay en cada tienda y separar.
      </p>
      {campana.hasta && <CuentaRegresiva hasta={campana.hasta} />}
    </>
  );
}

// Sin campaña ni prendas, la frase de la marca. Le habla igual a todos: la maqueta decía «Bienvenido a CAYLA», y un texto para el
// cliente no lleva género (ADR-0288 act. k).
function TextoBienvenida() {
  return (
    <>
      <span className="t-hero-ceja">Tienda online</span>
      <h1 className="t-hero-tit">
        <span>Donde el estilo</span>
        <em>transforma</em>
      </h1>
      <p className="t-hero-desc">Crea tu cuenta para ver el catálogo, cuánto hay en cada tienda y separar.</p>
    </>
  );
}
