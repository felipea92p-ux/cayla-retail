// Los íconos de la tienda: los mismos trazos de la maqueta aprobada (docs/maquetas/tienda-online-2026-10).
const TRAZOS = {
  bolsa: <><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  persona: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" /></>,
  tienda: <><path d="M4 9h16l-1.4-4.5H5.4L4 9Z" /><path d="M5 9v11h14V9" /><path d="M10 20v-5h4v5" /></>,
  chat: <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  regalo: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18V6H3zM12 6v14M12 6c-1.5-3-5-3-5-1s3 1 5 1Zm0 0c1.5-3 5-3 5-1s-3 1-5 1Z" /></>,
  ticket: <><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z" /><path d="M10 7v10" /></>,
  chispa: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  pedido: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sobre: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  // Catálogo (actividad 3): el botón que cambia el orden de la lista.
  flechas: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  // La ficha (actividad 4): el acordeón y lo que falta para que termine la campaña.
  chevron: <path d="M7 10l5 5 5-5" />,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3 2" /></>,
  // La cabecera con cuenta (actividad 5): el menú, el buscador y cerrar sus hojas.
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  lupa: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
};

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre }: { nombre: NombreIcono }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}
