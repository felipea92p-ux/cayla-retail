/* ====================================================================
   vista-rapida-reglas · qué flecha pasa de registro en un cajón de vista rápida
   (2026-09-26, ADR-0128 «Actualización 2026-09-26»)

   Las cuatro vistas rápidas (Por pagar, Proveedores, Recibidas y Notas de crédito) pasan al registro siguiente
   o al anterior con ↓ ↑ sin cerrar el cajón. Escuchaban las flechas en todo su `Dialog.Content`, y eso atrapaba
   teclas ajenas: en el cajón de Por pagar, «Pagar» abre «Registrar pago», un modal que en la página vive en otro
   portal pero que en el árbol de React está DENTRO del cajón, y React hace subir los eventos de un portal por sus
   ancestros de React. Un ↓ en el monto o en un combo del pago llegaba al cajón, que pasaba al comprobante
   siguiente: su contenido se vuelve a montar (`key`) y el pago desaparecía con todo lo escrito.

   El cajón se queda solo con la flecha que (a) nació dentro de su propio DOM —la que sube desde un modal abierto
   desde el cajón tiene su destino afuera—, (b) ningún control usó antes, (c) no viene de un campo, donde mueve
   el cursor o cambia el valor, y (d) va sin Ctrl, ⌘ ni Alt, que la vuelven un atajo del navegador (⌘↓ baja al
   final de lo que se desplaza).

   Sin DOM a propósito, como `escaner-tecla-suelta.ts`: el cajón traduce su evento a estos datos
   (`components/ui/useFlechasDelCajon.ts`) y la regla se prueba en Node.

   Contrato. PROMETE: 1 (siguiente), −1 (anterior) o `null` (la tecla no es del cajón y queda para quien la
   recibió). ASUME: que un control que usa una flecha llama a `preventDefault`, como ya lo hacen `Desplegable`,
   `ComboBuscable`, `ComboResponsable`, `CampoFecha`, `MenuAcciones` y las fichas de medio de pago. NO PROMETE:
   navegar; eso lo hace el cajón con lo que esto devuelve.
   ==================================================================== */

/** Lo que importa de una tecla que llegó al `onKeyDown` del cajón, ya traducido a datos simples. */
export type TeclaEnCajon = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Un control ya la usó (`preventDefault`): la lista de un combo, la grilla de una fecha, un grupo de fichas. */
  defaultPrevented: boolean;
  /** Quien la recibió está dentro del DOM del cajón. Falso si subió desde un modal abierto desde el cajón. */
  nacioEnElCajon: boolean;
  /** Quien la recibió (el elemento con el foco). `isContentEditable` solo existe en HTMLElement, por eso opcional. */
  destino: { tagName: string; isContentEditable?: boolean };
};

// Campos donde la flecha es del navegador: mueve el cursor en un texto y cambia el valor de un número, una fecha, un
// radio o un <select>. Todo `input`, sin mirar su tipo: una regla sin excepciones que recordar.
const CAMPOS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function pasoConFlecha(t: TeclaEnCajon): 1 | -1 | null {
  const paso = t.key === "ArrowDown" ? 1 : t.key === "ArrowUp" ? -1 : null;
  if (paso === null) return null;
  if (!t.nacioEnElCajon) return null; // (a)
  if (t.defaultPrevented) return null; // (b)
  if (CAMPOS.has(t.destino.tagName.toUpperCase()) || t.destino.isContentEditable) return null; // (c)
  if (t.ctrlKey || t.metaKey || t.altKey) return null; // (d)
  return paso;
}
