import Link from "next/link";
import { hrefLista } from "@/lib/catalogo";
import { CREDITOS_DE_ESCUDOS } from "@/lib/escudos-creditos";
import { hrefLooks } from "@/lib/looks";
import { hrefDelProbador } from "@/lib/probador";
import { RecomendacionEnElPie } from "./recomendaciones/RecomendacionFlotante";
import { TEMAS_DE_AYUDA } from "./ayuda/temas";
import { Icono } from "./Icono";
import { Logo } from "./Marca";
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

/** Cuatro columnas (maqueta Premium): la marca, comprar, ayuda y el Club. La ayuda también va arriba, a la vista, con lo que promete cada
 *  página (`TEMAS_DE_AYUDA`); aquí suma «Envíanos una sugerencia», que abre la ventana de Recomendaciones (antes, un botón flotante). Las
 *  listas son de todos (la tienda se mira sin cuenta, Felipe 2026-10-17); sin cuenta, el Club ofrece crearla o entrar. */
const columnas = (conCuenta: boolean, sede: string | null): Columna[] => [
  comprar(sede),
  { titulo: "Ayuda", enlaces: TEMAS_DE_AYUDA.map((a) => [a.titulo, a.href] as [string, string]), sugerencia: true },
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
];

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
          <p className="t-pie-legal">
            <span>© {anio} CAYLA</span>
          </p>
          {/* Los escudos de las ciudades (cabecera) son de Wikimedia Commons con licencia Creative Commons: piden mencionar al autor y la licencia. */}
          <p className="t-pie-creditos">
            Escudos de las ciudades, de Wikimedia Commons, reducidos de tamaño:{" "}
            {CREDITOS_DE_ESCUDOS.map((c, i) => (
              <span key={c.clave}>
                {i > 0 && (i === CREDITOS_DE_ESCUDOS.length - 1 ? " y " : ", ")}
                <a href={c.hrefArchivo} target="_blank" rel="noopener noreferrer">
                  {c.ciudad}
                </a>{" "}
                (por {c.autor},{" "}
                <a href={c.hrefLicencia} target="_blank" rel="noopener noreferrer">
                  {c.licencia}
                </a>
                )
              </span>
            ))}
            .
          </p>
        </div>
      </footer>
    </>
  );
}
