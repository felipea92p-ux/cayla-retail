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
  // El Club en la cuenta (actividad 12): el corazón de favoritos y la campana de «Avísame cuando llegue».
  corazon: <path d="M12 20s-7-4.6-7-10.1A4 4 0 0 1 12 7.6a4 4 0 0 1 7 2.3C19 15.4 12 20 12 20Z" />,
  campana: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  pedido: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  // La bolsa y los pedidos (actividad 7): el plazo para confirmar y la prenda que la tienda trae de otra. El reloj también dice,
  // en la ficha (actividad 4), lo que falta para que termine la campaña.
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3 2" /></>,
  traslado: <path d="M3 7h12l-3-3M21 17H9l3 3" />,
  sobre: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  // Catálogo (actividad 3): el botón que cambia el orden de la lista.
  flechas: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  // La ficha (actividad 4): el acordeón.
  chevron: <path d="M7 10l5 5 5-5" />,
  // La cabecera con cuenta (actividad 5): el menú, el buscador y cerrar sus hojas.
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  lupa: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  // Instalar CAYLA en el celular (ADR-0431): los botones que la guía nombra, dibujados como los del navegador para reconocerlos.
  compartir: <path d="M12 15V3M8 7l4-4 4 4M6 11H5v10h14V11h-1" />,
  agregar: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></>,
  puntos: <><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>,
  // Nuestras tiendas (revisión 2026-10-15): «Cómo llegar», el pin del mapa.
  ubicacion: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  // «Arma el tuyo» (ADR-0434): el candado que deja una prenda fija (cerrado y abierto), «Sorpréndeme», las flechas de la figura, agregar
  // una prenda y «Sin bolso».
  candado: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  candadoAbierto: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.6-1.8" /></>,
  chispas: <><path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L4 9.5l4.4-1.6Z" /><path d="M18 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></>,
  izquierda: <path d="M15 5l-7 7 7 7" />,
  derecha: <path d="M9 5l7 7-7 7" />,
  mas: <path d="M12 5v14M5 12h14" />,
  ninguna: <><circle cx="12" cy="12" r="8" /><path d="M6.5 17.5l11-11" /></>,
  // El look guardado (actividad 8): «Cambiar el nombre».
  lapiz: <path d="M16.5 3.5l4 4L8 20H4v-4z" />,
};

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre }: { nombre: NombreIcono }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}
