// Reglas puras del aviso «¿Salir sin guardar?» (2026-09-28) — sin React ni DOM, para probarlas sin abrir la pantalla.
//
// CONTRATO
//   PROMETE: dado un clic sobre un enlace, decir si ese clic saca a la persona de la pantalla actual DENTRO del ERP (y a
//            dónde), que es lo único que el aviso debe frenar; y dadas dos fotos del formulario, decir si hay cambios.
//   ASUME:   quien llama ya sabe que el formulario tiene cambios; esto no mira el estado de la pantalla.
//   NO HACE: no frena abrir en otra pestaña (Ctrl/⌘/Shift/clic del medio, target=_blank): la ficha sigue abierta y nada
//            se pierde; tampoco un enlace a otro sitio ni una descarga — el navegador ya pregunta al salir (beforeunload).

export type ClicEnEnlace = {
  /** `MouseEvent.button`: 0 = principal. */
  boton: number;
  conTecla: boolean;
  yaAtendido: boolean;
  href: string | null;
  target: string | null;
  descarga: boolean;
};

/** Ruta interna (pathname + búsqueda + ancla) a la que llevaría el clic, o `null` si el clic no saca de esta pantalla. */
export function destinoQueSaleDeLaPantalla(clic: ClicEnEnlace, actual: string): string | null {
  if (clic.yaAtendido || clic.boton !== 0 || clic.conTecla || clic.descarga) return null;
  if (clic.target && clic.target !== "_self") return null;
  if (!clic.href) return null;
  let destino: URL;
  let aqui: URL;
  try {
    aqui = new URL(actual);
    destino = new URL(clic.href, aqui);
  } catch {
    return null;
  }
  if (destino.origin !== aqui.origin) return null;
  // Un ancla de la misma pantalla (#fotos) no sale: solo baja hasta esa parte.
  if (destino.pathname === aqui.pathname && destino.search === aqui.search) return null;
  return destino.pathname + destino.search + destino.hash;
}

/** Foto comparable de un formulario: mismo contenido → mismo texto, sin importar el orden de las claves. */
export function fotoFormulario(valor: unknown): string {
  return JSON.stringify(valor, (_clave, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}
