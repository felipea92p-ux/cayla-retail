/* ====================================================================
   El globito con número — una sola pieza (ADR-0358, ronda 15, Felipe eligió P1 el 2026-10-15)

   El número chico que dice cuántos hay, o cuántos te piden algo. Es el globito de las pestañas y de los títulos (ronda 9:
   `.pestana-cayla__cuenta`, `.titulo-cuenta`), el mismo en todo el ERP:
   · Junto a un nombre: 20 px, gris suave (tinta al 10 %). Cuenta lo que hay.
   · `pide`: te pide algo (traslados por recibir, pendientes de hoy): ámbar suave. Con 0 no se dibuja (un «0» que pide no dice nada).
   · `esquina`: sobre la esquina de un ícono o de un botón, donde un tinte no se vería: lleno (tinta, o ámbar si `pide`), 18 px y con
     su anillo de 2 px del color del fondo. `sobreOscuro` lo invierte (crema con anillo de tinta) cuando la tecla es negra.
   · `sobreOscuro` sin `esquina`: dentro de un botón negro, crema suave.
   · `error`: rojo suave. Solo si el número dice un error (lo que no llegó a SUNAT), nunca para contar.
   · `late`: al cambiar el número, late una vez (el «pop» de la bolsa de Vender y de la barra de Por pagar).
   Nada de JavaScript propio: sirve en un Server Component. Registro: docs/unificar/contador.md. Nunca un globito a mano.
   ==================================================================== */

export function Globito({
  n,
  etiqueta,
  pide = false,
  error = false,
  esquina = false,
  sobreOscuro = false,
  late = false,
  className = "",
}: {
  n: number;
  /** Lo que oye el lector junto al número («por atender», «prendas en el ticket»); sin ella, el número se lee solo. */
  etiqueta?: string;
  pide?: boolean;
  error?: boolean;
  esquina?: boolean;
  sobreOscuro?: boolean;
  late?: boolean;
  /** Solo posición (absolute, márgenes), nunca la cara. */
  className?: string;
}) {
  if (!Number.isFinite(n) || n < 0 || (n === 0 && (pide || esquina))) return null;
  const cifra = n > 99 ? "99+" : String(n);
  return (
    <span
      className={`globito ${className}`}
      data-pide={pide || undefined}
      data-error={error || undefined}
      data-esquina={esquina || undefined}
      data-oscuro={sobreOscuro || undefined}
    >
      <span key={late ? cifra : undefined} aria-hidden={etiqueta ? true : undefined} className={late ? "globito-late" : undefined}>
        {cifra}
      </span>
      {etiqueta && (
        <span className="sr-only">
          {n} {etiqueta}
        </span>
      )}
    </span>
  );
}
