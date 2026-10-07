// Guías interactivas (ADR-0362, Felipe 2026-10-07): el vocabulario de una guía, sin React ni DOM.
//
// Una GUÍA es la demo de UNA pantalla (una `page.tsx`): una lista de PASOS que el motor (`components/guias/`) recorre
// encendiendo una pieza a la vez bajo un velo oscuro, con una tarjeta que dice qué es y para qué sirve. Cada paso se ancla a
// un `data-guia="<ancla>"` del código (nunca a clases de estilo: el estilo cambia sin avisar). El piloto automático puede
// ABRIR, ESCRIBIR un ejemplo y ELEGIR, pero NUNCA guardar: `lib/guias/reglas.ts` (`motivoParaNoTocar`) lo prohíbe.

/** Lo que el piloto automático hace solo, a la vista de la persona. Todo es de pantalla: nada llega a la base. */
export type AccionGuia =
  /** Toca la pieza anclada (abrir un modal, una pestaña, una tarjeta). Se niega si la pieza guarda (`motivoParaNoTocar`). */
  | { tipo: "clic"; ancla: string }
  /** Escribe un texto de ejemplo en el campo anclado, letra a letra, como lo haría una persona. */
  | { tipo: "escribir"; ancla: string; texto: string }
  /** Vacía el campo anclado (para dejar la pantalla como estaba). */
  | { tipo: "vaciar"; ancla: string }
  /** Escape: cierra el modal o la lista que la guía abrió. */
  | { tipo: "escape" };

export type PasoGuia = {
  /** Único dentro de su guía (lo usa la prueba y el recorredor para nombrar el paso que falla). */
  id: string;
  /** El `data-guia` de la pieza que se enciende. `null`: la tarjeta va al centro, sin recorte (bienvenida, cierre). */
  ancla: string | null;
  titulo: string;
  /** Qué es y para qué sirve, en lenguaje de tienda («tú», sin jerga). Dos o tres frases. */
  texto: string;
  /** Lo que el piloto hace ANTES de encender la pieza (abrir el modal donde vive). */
  preparar?: readonly AccionGuia[];
  /** Lo que el piloto hace CON la pieza ya encendida, para que se vea funcionar (escribir un ejemplo). */
  demostrar?: readonly AccionGuia[];
  /**
   * El paso depende del estado o del rol (la caja abierta, un permiso): si su pieza no aparece, se salta sin decir nada.
   * Sin esto, una pieza que no aparece se explica igual con la tarjeta al centro («ahora no está a la vista»).
   */
  opcional?: boolean;
  /** Solo se muestra si estas anclas están en la pantalla (p. ej. la caja abierta). */
  requiere?: readonly string[];
  /** Se salta si alguna de estas anclas está en la pantalla (p. ej. la persiana de caja cerrada). */
  excluye?: readonly string[];
  /** Solo en escritorio (≥ 1024 px) o solo en celular (< 1024 px): el punto de venta cambia de forma. */
  solo?: "escritorio" | "celular";
};

export type Guia = {
  /** Clave estable: la ruta del registro de pantallas sin la barra inicial y con «.» (`vender.apartados`). Es lo que se
   *  guarda en `retail.guias_vistas`: cambiarla vuelve a ofrecer la guía a todos. */
  id: string;
  /** La ruta como la escribe `lib/guia-de-foco-pantallas.ts` («/vender», «/vender/historial»). */
  ruta: string;
  /** Lo que se ve en el selector «Demo» del perfil y en la oferta. */
  titulo: string;
  /** Una frase: para qué sirve la pantalla. */
  resumen: string;
  pasos: readonly PasoGuia[];
  /** Lo que el piloto hace al terminar o al salir, para dejar la pantalla como estaba (vaciar el buscador, cerrar). */
  alSalir?: readonly AccionGuia[];
};

/** Cómo se ve, para la regla de «no tocar», la pieza que el piloto está por tocar. Lo arma el motor desde el DOM. */
export type PiezaATocar = {
  /** `button`, `a`, `input`, `div`… */
  etiqueta: string;
  /** El texto visible o, si no tiene, su `aria-label`/`title`. */
  texto: string;
  /** El `type` del botón o del campo («submit», «button», «checkbox»…), o null. */
  tipo: string | null;
  /** ¿Está dentro de un `<form>`? (un `<button>` sin `type` dentro de un form ENVÍA el form). */
  enFormulario: boolean;
  /** El `href` de un enlace, o null. */
  href: string | null;
  /** La ruta donde corre la guía (un enlace a otra ruta saca a la persona de la pantalla y corta la demo). */
  rutaActual: string;
};
