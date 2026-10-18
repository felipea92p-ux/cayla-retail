import Link from "next/link";
import { hrefLista } from "@/lib/catalogo";
import { hrefLooks } from "@/lib/looks";
import { TEMAS_DE_AYUDA } from "./ayuda/temas";
import { Icono } from "./Icono";
import { Logo } from "./Marca";
import "@/app/estilos/pie.css";

type Columna = { titulo: string; enlaces: [string, string][] };

/** Las listas para comprar (maqueta, `pieTienda`), con la tienda elegida en «Ver lo que hay en» (como la cabecera). */
const comprar = (sede: string | null): Columna => {
  const lista = (l: "nuevo" | "ofertas" | "vendidos") => hrefLista({ sede, categoria: null, orden: "destacado", lista: l });
  return {
    titulo: "Comprar",
    enlaces: [
      ["Lo nuevo", lista("nuevo")],
      ["Ofertas", lista("ofertas")],
      ["Más vendidos", lista("vendidos")],
      ["Arma tu look", hrefLooks(sede)],
      ["Toda la tienda", hrefLista({ sede, categoria: null, orden: "destacado" })],
    ],
  };
};

/** Las listas para comprar son de todos (la tienda se mira sin cuenta, Felipe 2026-10-17). Sin cuenta, «CAYLA» ofrece entrar o crearla;
 *  con cuenta (`conCuenta`), el Club lleva a la cuenta y aparece «Recomendaciones» (Felipe 2026-10-15: lo que el cliente le quiera decir
 *  a CAYLA; va con su nombre, así que solo con cuenta). La ayuda va aparte, arriba y a la vista (revisión «a nivel mundial», 2026-10-16):
 *  cada página con lo que promete en una línea (`TEMAS_DE_AYUDA`, las mismas que ofrecen las páginas que no están). */
const columnas = (conCuenta: boolean, sede: string | null): Columna[] => [
  comprar(sede),
  {
    titulo: "CAYLA",
    enlaces: [
      ["Club CAYLA", conCuenta ? "/cuenta" : "/crear-cuenta"],
      ...(conCuenta
        ? [["Recomendaciones", "/recomendaciones"] as [string, string]]
        : [["Crear mi cuenta", "/crear-cuenta"] as [string, string], ["Entrar", "/entrar"] as [string, string]]),
      ["Privacidad", "/privacidad"],
      // «Club» con mayúscula, como en el título de la página («Términos del Club CAYLA») y en «Club CAYLA».
      ["Términos del Club", "/terminos-del-club"],
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
                      <small>{a.texto}</small>
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
              <p>Separa online, confirma por WhatsApp y recoge en tu tienda.</p>
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
                </ul>
              </div>
            ))}
          </div>
          <p className="t-pie-legal">
            <span>© {anio} CAYLA</span>
            <span>Sin publicidad por WhatsApp: las novedades están aquí</span>
          </p>
        </div>
      </footer>
    </>
  );
}
