import Link from "next/link";
import { hrefLista } from "@/lib/catalogo";
import { hrefLooks } from "@/lib/looks";
import { Isotipo } from "./Isotipo";
import "@/app/estilos/pie.css";

type Columna = { titulo: string; enlaces: [string, string][] };

const AYUDA: Columna = {
  titulo: "Ayuda",
  enlaces: [["Cómo separar", "/como-separar"], ["Cambios y devoluciones", "/cambios-y-devoluciones"], ["Nuestras tiendas", "/tiendas"]],
};

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

/** Sin cuenta, la cuenta se crea o se recupera; con cuenta (`conCuenta`), las listas para comprar, la cuenta desde «Club CAYLA» y
 *  «Recomendaciones» (Felipe 2026-10-15: lo que el cliente le quiera decir a CAYLA; va con su nombre, así que solo con cuenta). */
const columnas = (conCuenta: boolean, sede: string | null): Columna[] => [
  conCuenta
    ? comprar(sede)
    : { titulo: "Tu cuenta", enlaces: [["Crear mi cuenta", "/crear-cuenta"], ["Entrar", "/entrar"], ["Olvidé mi contraseña", "/olvide-mi-contrasena"]] },
  AYUDA,
  {
    titulo: "CAYLA",
    enlaces: [
      ["Club CAYLA", conCuenta ? "/cuenta" : "/crear-cuenta"],
      ...(conCuenta ? [["Recomendaciones", "/recomendaciones"] as [string, string]] : []),
      ["Privacidad", "/privacidad"],
      // «Club» con mayúscula, como en el título de la página («Términos del Club CAYLA») y en «Club CAYLA».
      ["Términos del Club", "/terminos-del-club"],
    ],
  },
];

/**
 * El pie: la marca, la cuenta, la ayuda y lo legal. `sede`: la clave de la tienda elegida (o null con «Todas»), solo con cuenta. Antes
 * del pie va su aire (`.t-pie-aire`, pie.css): en una página corta crece y deja el pie al borde de abajo de la ventana. Los títulos de
 * columna son h2 (con la cara chica de la maqueta): en la página vienen después del h1 y sus h2, sin saltar a h4.
 */
export function Pie({ anio, conCuenta = false, sede = null }: { anio: number; conCuenta?: boolean; sede?: string | null }) {
  return (
    <>
      <div className="t-pie-aire" aria-hidden="true" />
      <footer className="t-pie">
        <div className="t-ancho">
          <div className="t-pie-in">
            <div className="t-pie-marca">
              <Link className="t-logo" href={conCuenta ? "/inicio" : "/"} aria-label={conCuenta ? "CAYLA, ir al inicio" : "CAYLA, ir a la portada"}>
                <Isotipo />
                <span>CAYLA</span>
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
