import Link from "next/link";
import { hrefDePrenda, hrefLista } from "@/lib/catalogo";
import type { Hero } from "@/lib/inicio";
import { variablesDelDiseno, type DisenoDeLaTienda } from "@/lib/diseno-campana";
import { fechaCorta, fechaLarga, partirTitulo, pctTexto } from "@/lib/portada";
import { CollageDePrendas } from "./CollageDePrendas";
import { CuentaRegresiva } from "./CuentaRegresiva";
import { EfectoDeCampana } from "./EfectoDeCampana";
import { Icono } from "./Icono";
import { Isotipo } from "./Isotipo";
import { TextoConMarca } from "./Marca";
import "@/app/estilos/campana.css";
import "@/app/estilos/collage.css";
import "@/app/estilos/inicio.css";

/**
 * El héroe del Inicio (maqueta, `heroCampana` y `heroNuevo`): el texto a la izquierda y, en la computadora, las fotos como polaroids.
 * Lo usan el Inicio y su esqueleto (2026-10-17, Felipe: «quisiera que sea más fiel a lo que mostrará el contenido»): mientras llega el
 * Inicio, el héroe ya está, con la campaña de verdad (`leerPortada`, la misma que lee la franja), y solo las fotos esperan. Con
 * `enEspera`, los botones son su forma (todavía no se sabe a qué campaña lleva) y en lugar de las polaroids van sus marcos vacíos.
 */
export function HeroeDelInicio({
  hero,
  sede,
  origenFotos,
  verCampana,
  verNuevo,
  enEspera = false,
  diseno = null,
}: {
  hero: Hero;
  sede: string | null;
  origenFotos: string | undefined;
  verCampana: string;
  verNuevo: string | null;
  enEspera?: boolean;
  /** El diseño de la campaña que anuncia el héroe (Tienda web ▸ Campañas); sin él, el de siempre. Solo viste al héroe de una campaña. */
  diseno?: DisenoDeLaTienda | null;
}) {
  const piezas = hero.tipo === "marca" ? [] : hero.piezas;
  // Un botón del esqueleto se ve igual pero no lleva a ningún lado: la dirección de la campaña sale de las prendas, que aún no llegan.
  const boton = (clase: string, href: string | null, contenido: React.ReactNode) =>
    enEspera || !href ? (
      <span className={clase} aria-hidden="true">
        {contenido}
      </span>
    ) : (
      <Link className={clase} href={href}>
        {contenido}
      </Link>
    );
  const vestido = hero.tipo === "campana" && diseno?.donde.portada ? diseno : null;
  // Campaña con imagen propia: la portada ES la imagen (el texto de la campaña va dentro de ella) y encima, abajo a la izquierda, los botones.
  // En el celular, la versión vertical si el líder la subió; si no, la horizontal recortada al centro.
  if (hero.tipo === "campana" && vestido?.imagen) {
    return (
      <section className="t-hero t-hero-imagen" data-campana={vestido.plantilla} data-entrada={vestido.movimiento.entrada} style={variablesDelDiseno(vestido)}>
        <picture>
          {vestido.imagen.vertical && <source media="(max-width: 700px)" srcSet={vestido.imagen.vertical} />}
          {/* eslint-disable-next-line @next/next/no-img-element -- el banner de la campaña ya viene reducido por el ERP (300 KB o menos) y se sirve desde el almacén público */}
          <img className="t-hero-img" src={vestido.imagen.horizontal} alt={hero.campana.nombre} fetchPriority="high" decoding="async" />
        </picture>
        {!enEspera && <EfectoDeCampana efecto={vestido.movimiento.efecto} intensidad={vestido.movimiento.intensidad} duracion={vestido.movimiento.duracion} />}
        {/* La cuenta regresiva arriba a la derecha: abajo a la izquierda está el espacio que el texto de la imagen deja libre para los botones. */}
        {hero.campana.hasta && vestido.movimiento.cuenta !== "no" && !enEspera && (
          <div className="t-hero-img-cuenta">
            <CuentaRegresiva hasta={hero.campana.hasta} soloElUltimoDia={vestido.movimiento.cuenta === "ultimo"} />
          </div>
        )}
        <div className="t-hero-img-acciones">
          <div className="t-hero-acciones">
            {boton("t-btn t-btn-claro", verCampana, "Ver la campaña")}
            {(verNuevo || enEspera) && boton("t-btn t-btn-vidrio", verNuevo, "Lo nuevo")}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section
      className={`t-hero t-hero-inicio${hero.tipo === "campana" ? "" : " sin-campana"}`}
      data-campana={vestido?.plantilla}
      data-entrada={vestido?.movimiento.entrada}
      style={vestido ? variablesDelDiseno(vestido) : undefined}
    >
      {vestido && !enEspera && <EfectoDeCampana efecto={vestido.movimiento.efecto} intensidad={vestido.movimiento.intensidad} duracion={vestido.movimiento.duracion} />}
      <Isotipo className="t-colibri" />
      <div className="t-hero-texto">
        {hero.tipo === "campana" ? (
          <>
            <span className="t-hero-ceja">
              {hero.campana.hasta ? (
                <span>
                  Campaña · hasta el <span className="t-fecha-larga">{fechaLarga(hero.campana.hasta)}</span>
                  <span className="t-fecha-corta">{fechaCorta(hero.campana.hasta)}</span>
                </span>
              ) : (
                "Campaña vigente"
              )}
            </span>
            <TituloHeroe texto={vestido?.textos.titular ?? hero.campana.nombre} />
            {vestido?.textos.bajada && <p className="t-hero-baj">{vestido.textos.bajada}</p>}
            <p className="t-hero-desc">
              <b>−{pctTexto(hero.campana.pct)} % en prendas elegidas.</b> Sepáralas online, confírmalas por WhatsApp y recógelas en tu tienda.
            </p>
            {hero.campana.hasta && vestido?.movimiento.cuenta !== "no" && <CuentaRegresiva hasta={hero.campana.hasta} soloElUltimoDia={vestido?.movimiento.cuenta === "ultimo"} />}
            <div className="t-hero-acciones">
              {boton("t-btn t-btn-claro", verCampana, vestido?.textos.boton ?? "Ver la campaña")}
              {(verNuevo || enEspera) &&
                boton(
                  "t-enlace",
                  verNuevo,
                  <>
                    Ver lo nuevo <Icono nombre="flecha" />
                  </>,
                )}
            </div>
          </>
        ) : hero.tipo === "nuevo" ? (
          <>
            {/* «A · Muro» (Felipe 2026-10-17): el titular de la maqueta, «LO / NUEVO», y la fecha arriba, como la ficha de una sala. */}
            <span className="t-hero-ceja">Llegó en los últimos 30 días</span>
            <h1 className="t-hero-tit">
              <span>Lo</span> <span>nuevo</span>
            </h1>
            <p className="t-hero-desc">Lo que llegó a nuestras tiendas. Mira cuánto hay en cada una y sepáralo sin pagar.</p>
            <div className="t-hero-acciones">
              {verNuevo && boton("t-btn t-btn-claro", verNuevo, "Ver lo nuevo")}
            </div>
          </>
        ) : (
          <>
            <span className="t-hero-ceja">Tienda online</span>
            <h1 className="t-hero-tit">
              <span>Donde el estilo</span> <em>transforma</em>
            </h1>
            <p className="t-hero-desc">Mira lo que hay en cada tienda, sepáralo aquí y recógelo en tu tienda.</p>
            <div className="t-hero-acciones">
              {boton("t-btn t-btn-claro", hrefLista({ sede, categoria: null, orden: "destacado" }), "Ver toda la tienda")}
            </div>
          </>
        )}
      </div>
      {enEspera ? (
        <MarcosVacios marca={hero.tipo === "campana" ? `−${pctTexto(hero.campana.pct)}%` : null} />
      ) : (
        <CollageDePrendas
          piezas={piezas}
          href={(p) => hrefDePrenda(p, sede)}
          conPrecio
          origenFotos={origenFotos}
          marca={hero.tipo === "campana" ? `−${pctTexto(hero.campana.pct)}%` : null}
        />
      )}
    </section>
  );
}

/** El lugar de las polaroids mientras llegan sus fotos: los tres marcos, quietos y apagados, en el mismo sitio (`collage.css`). Al
 *  llegar el Inicio, las de verdad caen como siempre. */
function MarcosVacios({ marca }: { marca: string | null }) {
  return (
    <div className="t-collage t-collage-espera" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span key={n} className={`t-polaroid p${n}`}>
          <span className="t-card-foto" />
          <span className="t-polaroid-pie">
            <i />
            <i />
          </span>
        </span>
      ))}
      {marca && <span className="t-hero-pct">{marca}</span>}
    </div>
  );
}

/** «Aniversario» / «CAYLA»: la última palabra en cursiva (como la portada). */
function TituloHeroe({ texto }: { texto: string }) {
  const [linea, cursiva] = partirTitulo(texto);
  return (
    <h1 className="t-hero-tit">
      <span>
        <TextoConMarca texto={linea} />
      </span>
      {cursiva && (
        <>
          {" "}
          <em>
            <TextoConMarca texto={cursiva} />
          </em>
        </>
      )}
    </h1>
  );
}
