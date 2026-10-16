import { Icono, type NombreIcono } from "../Icono";

/**
 * Una nota de las páginas de ayuda (maqueta v4, `.w-info`): su ícono, lo que hay que saber en negrita y su explicación debajo; y, si hace
 * falta, a dónde seguir (`children`: un enlace). La usan «Cómo separar» y «Cambios y devoluciones»; su cara vive en ayuda.css.
 */
export function NotaAyuda({ icono, titulo, texto, children }: { icono: NombreIcono; titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="w-info">
      <Icono nombre={icono} />
      <span>
        <b>{titulo}</b>
        <small>{texto}</small>
        {children}
      </span>
    </div>
  );
}
