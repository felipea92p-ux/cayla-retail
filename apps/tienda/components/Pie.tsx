import Link from "next/link";
import { Isotipo } from "./Isotipo";

type Columna = { titulo: string; enlaces: [string, string][] };

const AYUDA: Columna = {
  titulo: "Ayuda",
  enlaces: [["Cómo separar", "/como-separar"], ["Cambios y devoluciones", "/cambios-y-devoluciones"], ["Nuestras tiendas", "/tiendas"]],
};

/** Sin cuenta, la cuenta se crea o se recupera; con cuenta (`conCuenta`), las listas para comprar (maqueta, `pieTienda`) y la cuenta
 *  desde «Club CAYLA». «Arma tu look» se suma con la actividad 11. */
const columnas = (conCuenta: boolean): Columna[] => [
  conCuenta
    ? {
        titulo: "Comprar",
        enlaces: [["Lo nuevo", "/catalogo?lista=nuevo"], ["Ofertas", "/catalogo?lista=ofertas"], ["Más vendidos", "/catalogo?lista=vendidos"], ["Toda la ropa", "/catalogo"]],
      }
    : { titulo: "Tu cuenta", enlaces: [["Crear mi cuenta", "/crear-cuenta"], ["Entrar", "/entrar"], ["Olvidé mi contraseña", "/olvide-mi-contrasena"]] },
  AYUDA,
  {
    titulo: "CAYLA",
    enlaces: [["Club CAYLA", conCuenta ? "/cuenta" : "/crear-cuenta"], ["Privacidad", "/privacidad"], ["Términos del club", "/terminos-del-club"]],
  },
];

/** El pie: la marca, la cuenta, la ayuda y lo legal. */
export function Pie({ anio, conCuenta = false }: { anio: number; conCuenta?: boolean }) {
  return (
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
          {columnas(conCuenta).map((c) => (
            <div key={c.titulo}>
              <h4>{c.titulo}</h4>
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
  );
}
