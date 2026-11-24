import Link from "next/link";
import { hrefLista } from "@/lib/catalogo";
import { hrefLooks } from "@/lib/looks";
import { hrefDelProbador } from "@/lib/probador";
import { RecomendacionEnElPie } from "./recomendaciones/RecomendacionFlotante";
import { TEMAS_DE_AYUDA } from "./ayuda/temas";
import { leerDatosDelLibro } from "@/lib/libro-reclamaciones-servidor";
import { Icono } from "./Icono";
import { Logo } from "./Marca";
import { Redes } from "./Redes";
import "@/app/estilos/pie.css";

type Columna = { titulo: string; enlaces: [string, string][]; sugerencia?: boolean };

/** Las listas para comprar, con la tienda elegida (como la cabecera). Un nombre por destino (rediseño Premium, 2026-11-07): «Outfits
 *  listos» son los que arma CAYLA (/looks) y «Arma tu outfit» es la herramienta (/looks/arma); antes «Arma tu outfit» llevaba a /looks. */
const comprar = (sede: string | null): Columna => {
  const lista = (l: "nuevo" | "ofertas" | "vendidos") => hrefLista({ sede, categoria: null, orden: "destacado", lista: l });
  return {
    titulo: "Comprar",
    enlaces: [
      ["Lo nuevo", lista("nuevo")],
      ["Ofertas", lista("ofertas")],
      ["Más vendidos", lista("vendidos")],
      ["Outfits listos", hrefLooks(sede)],
      ["Arma tu outfit", hrefDelProbador(sede)],
      ["Toda la tienda", hrefLista({ sede, categoria: null, orden: "destacado" })],
    ],
  };
};

/** Cuatro columnas tras la marca: comprar, ayuda, el Club y la empresa. Los cuatro temas de la ayuda ya van arriba, a la vista, con lo que
 *  promete cada página (`TEMAS_DE_AYUDA`): la columna Ayuda no los repite (el 2026-11-22 salían dos veces) y suma lo que no está arriba,
 *  como «Envíanos una sugerencia», que abre la ventana de Recomendaciones. «Empresa» (plan «La casa CAYLA en la web», 2026-11-22): lo
 *  que 11 de los 12 referentes estudiados tienen en su pie, con «Trabaja con nosotros», la frase que usan todas sus versiones en español.
 *  Las listas son de todos (la tienda se mira sin cuenta, Felipe 2026-10-17); sin cuenta, el Club ofrece crearla o entrar. */
const columnas = (conCuenta: boolean, sede: string | null): Columna[] => [
  comprar(sede),
  { titulo: "Ayuda", enlaces: [["Preguntas frecuentes", "/preguntas-frecuentes"]], sugerencia: true },
  {
    titulo: "Club CAYLA",
    enlaces: [
      ["Cómo funciona el Club", "/club"],
      ...(conCuenta
        ? [["Mi perfil", "/cuenta"] as [string, string]]
        : [["Crear mi cuenta", "/crear-cuenta"] as [string, string], ["Entrar", "/entrar"] as [string, string]]),
      ["Términos del Club", "/terminos-del-club"],
      ["Privacidad", "/privacidad"],
    ],
  },
  {
    titulo: "Empresa",
    enlaces: [
      ["Nuestra historia", "/nuestra-historia"],
      ["Trabaja con nosotros", "/trabaja-con-nosotros"],
    ],
  },
];

/**
 * Quién vende (Ley 29733, art. 18; la revisión legal del 2026-11-18, H16): razón social, RUC y domicilio, leídos de la MISMA función que
 * usa el Libro de Reclamaciones (`tienda_libro_reclamaciones_datos`). El domicilio ya estaba escrito en cuatro lugares: el pie no es el
 * quinto. Sin base, los de respaldo (los mismos que copia la base). Se guarda armada por adelantado: no frena ninguna página.
 */
async function LineaLegal({ anio }: { anio: number }) {
  const { razonSocial, ruc, domicilio } = await leerDatosDelLibro();
  return (
    <p className="t-pie-legal">
      <span>© {anio} CAYLA</span>
      <span>
        {razonSocial} · RUC {ruc} · {domicilio}
      </span>
    </p>
  );
}

/**
 * El pie: la ayuda a la vista, la marca, lo de comprar o la cuenta, y lo legal. `sede`: la clave de la tienda elegida (o null con
 * «Todas»). Antes del pie va su aire (`.t-pie-aire`, pie.css): en una página corta crece y deja el pie al borde de
 * abajo de la ventana. Los títulos de columna son h2 (con la cara chica de la maqueta): en la página vienen después del h1 y sus h2,
 * sin saltar a h4.
 */
export function Pie({ anio, conCuenta = false, sede = null }: { anio: number; conCuenta?: boolean; sede?: string | null }) {
  return (
    <>
      <div className="t-pie-aire" aria-hidden="true" />
      <footer className="t-pie ay-pie">
        <div className="t-ancho">
          <div className="ay-pie-ayuda">
            <h2 className="t-pie-tit">Ayuda</h2>
            <ul>
              {TEMAS_DE_AYUDA.map((a) => (
                <li key={a.href}>
                  <Link className="ay-pie-tema" href={a.href}>
                    <span className="ay-pie-tema-ic" aria-hidden="true">
                      <Icono nombre={a.icono} />
                    </span>
                    <span className="ay-pie-tema-tx">
                      <b>{a.titulo}</b>
                    </span>
                    <Icono nombre="flecha" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="t-pie-in">
            <div className="t-pie-marca">
              <Link className="t-logo" href="/inicio" aria-label="CAYLA, ir al inicio">
                <Logo />
              </Link>
              <p className="t-pie-lema">Donde el estilo transforma.</p>
              {/* Las redes, junto a la marca: es «quiénes somos» y donde todo el mundo las busca (Felipe 2026-11-12). */}
              <div className="t-pie-redes">
                <h2 className="t-pie-tit">Síguenos</h2>
                <Redes donde="pie" conCuenta />
              </div>
            </div>
            {columnas(conCuenta, sede).map((c) => (
              <div key={c.titulo}>
                <h2 className="t-pie-tit">{c.titulo}</h2>
                <ul>
                  {c.enlaces.map(([texto, href]) => (
                    <li key={texto}>
                      <Link href={href}>{texto}</Link>
                    </li>
                  ))}
                  {c.sugerencia && (
                    <li>
                      <RecomendacionEnElPie />
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          <LineaLegal anio={anio} />
        </div>
      </footer>
    </>
  );
}
