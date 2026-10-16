import { Icono, type NombreIcono } from "../Icono";
import "@/app/estilos/ayuda.css";

/**
 * Un punto de lo que hay que saber en las páginas de ayuda: su ícono, lo que hay que saber como título (EB Garamond) y su explicación
 * debajo; y, si hace falta, a dónde seguir (`children`: un enlace). La usan «Cómo separar» (los plazos de un pedido) y «Cambios y
 * devoluciones» (cuánto tiempo, dónde y qué llevar). Van de a tres en fila desde 960 px (`.ay-puntos`, ayuda.css). `nivel`: el título
 * es h2 si la página no tiene otro título encima (Cambios) y h3 bajo un bloque («Lo que tienes que saber»).
 */
export function NotaAyuda({
  icono,
  titulo,
  texto,
  nivel = "h3",
  children,
}: {
  icono: NombreIcono;
  titulo: string;
  texto: string;
  nivel?: "h2" | "h3";
  children?: React.ReactNode;
}) {
  const Titulo = nivel;
  return (
    <div className="ay-punto">
      <span className="ay-punto-ic" aria-hidden="true">
        <Icono nombre={icono} />
      </span>
      <div className="ay-punto-cuerpo">
        <Titulo className="ay-punto-t">{titulo}</Titulo>
        <p className="ay-punto-x">{texto}</p>
        {children}
      </div>
    </div>
  );
}
