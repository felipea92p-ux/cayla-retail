import Link from "next/link";
import { Isotipo } from "./Isotipo";

const COLUMNAS: { titulo: string; enlaces: [string, string][] }[] = [
  {
    titulo: "Tu cuenta",
    enlaces: [["Crear mi cuenta", "/crear-cuenta"], ["Entrar", "/entrar"], ["Olvidé mi contraseña", "/olvide-mi-contrasena"]],
  },
  {
    titulo: "Ayuda",
    enlaces: [["Cómo separar", "/como-separar"], ["Cambios y devoluciones", "/cambios-y-devoluciones"], ["Nuestras tiendas", "/tiendas"]],
  },
  {
    titulo: "CAYLA",
    enlaces: [["Club CAYLA", "/crear-cuenta"], ["Privacidad", "/privacidad"], ["Términos del club", "/terminos-del-club"]],
  },
];

/** El pie sin cuenta: la marca, la cuenta, la ayuda y lo legal. */
export function Pie({ anio }: { anio: number }) {
  return (
    <footer className="t-pie">
      <div className="t-ancho">
        <div className="t-pie-in">
          <div className="t-pie-marca">
            <Link className="t-logo" href="/" aria-label="CAYLA, ir a la portada">
              <Isotipo />
              <span>CAYLA</span>
            </Link>
            <p>Separa online, confirma por WhatsApp y recoge en tu tienda.</p>
          </div>
          {COLUMNAS.map((c) => (
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
