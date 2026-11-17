import { ENLACE_ACTUALIZAR_CHROME, TEXTOS_NAVEGADOR_VIEJO } from "@/lib/navegador-viejo-reglas";

// «Actualiza el navegador» (ADR-0674): el aviso para el navegador que no puede pintar bien el ERP. Componente de SERVIDOR, sin JavaScript:
// el servidor lo dibuja siempre, escondido, y `app/estilos/navegador-viejo.css` lo muestra cuando el script del <head> marcó <html> con
// `data-navegador-viejo`. No usa `<Aviso>` a propósito: ese es de cliente y anima su ícono, y aquí lo único seguro es HTML y CSS simple.
// unificar-fijo: el aviso tiene que verse en un navegador donde las piezas del sistema no corren (ADR-0674).

export function AvisoNavegadorViejo() {
  return (
    <div className="aviso-navegador-viejo" role="alert">
      <strong>{TEXTOS_NAVEGADOR_VIEJO.titulo}</strong>
      <div>{TEXTOS_NAVEGADOR_VIEJO.linea}</div>
      <a className="aviso-navegador-viejo-enlace" href={ENLACE_ACTUALIZAR_CHROME}>
        {TEXTOS_NAVEGADOR_VIEJO.accion}
      </a>
    </div>
  );
}
