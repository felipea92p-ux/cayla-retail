import "@/app/estilos/ayuda.css";

/**
 * La cabecera de una página de ayuda («Cómo separar», «Cambios y devoluciones», «Nuestras tiendas») y de las lecturas largas
 * (Privacidad, Términos del Club): la ceja, el título grande en EB Garamond con su parte en cursiva roja y, al lado en la computadora
 * (debajo en el celular), la frase que dice para qué sirve la página. Revisión «a nivel mundial» (2026-10-16): antes eran columnas de
 * 620 px en una página vacía; ahora el título ocupa el ancho de la tienda, como las demás secciones. `sello`: lo que va sobre la ceja
 * (el «Borrador» de los textos legales). `apilado`: la frase va debajo del título también en la computadora (una lectura larga se lee
 * de arriba abajo, alineada con su texto).
 */
export function EncabezadoAyuda({
  id,
  ceja,
  titulo,
  bajada,
  sello,
  apilado = false,
}: {
  /** El id del título, para la sección que lo nombra (`aria-labelledby`). */
  id?: string;
  ceja?: string;
  titulo: React.ReactNode;
  bajada?: React.ReactNode;
  sello?: React.ReactNode;
  apilado?: boolean;
}) {
  return (
    <header className="ay-cab" data-apilado={apilado ? "" : undefined}>
      <div className="ay-cab-tit">
        {sello}
        {ceja && <span className="t-ceja">{ceja}</span>}
        <h1 id={id} className="ay-titulo">
          {titulo}
        </h1>
      </div>
      {bajada && <p className="ay-bajada">{bajada}</p>}
    </header>
  );
}
