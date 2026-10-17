/**
 * Con cache components, Next no desmonta las últimas páginas que se visitaron: las esconde con `display: none` y las deja en el
 * documento (React `<Activity>`, ADR-0432). Una búsqueda global (`document.querySelector`) puede entonces dar con la copia ESCONDIDA de
 * otra página que tiene la misma pieza (la cabecera, el globo de la bolsa). Este filtro deja solo lo que se ve.
 */
export function visible<T extends Element>(elementos: Iterable<T>): T | null {
  for (const el of elementos) if (el.getClientRects().length > 0) return el;
  return null;
}
