// La etiqueta de sección del Inicio («Tu día», «Hoy en la sede»). Vive aparte de `page.tsx` porque la usan también las
// secciones de «Mi meta» (`MiMeta.tsx`) y una página de Next no puede exportar nada más que la pantalla.
// La tarjeta de cifra que vivía aquí (`Tarjeta`: el nombre en tinta/65 sin negrita, la misma letra que esta etiqueta, y
// el número de 24 a 30 px) se fue el 2026-10-06: el Inicio usa la pieza única `TarjetaCifra` (ADR-0357, /unificar).

export function Etiqueta({ children }: { children: React.ReactNode }) {
  return <p className="label-cayla mb-2.5 text-[11px] text-tinta/65">{children}</p>;
}
