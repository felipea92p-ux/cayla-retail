// Las dos piezas de tarjeta del Inicio: la etiqueta de sección y la tarjeta de cifra. Viven aparte de `page.tsx` porque las usan
// también las secciones de «Mi meta» (`MiMeta.tsx`) y una página de Next no puede exportar nada más que la pantalla.

export function Etiqueta({ children }: { children: React.ReactNode }) {
  return <p className="label-cayla mb-2.5 text-[11px] text-tinta/65">{children}</p>;
}

export function Tarjeta({ etiqueta, valor, className = "", children }: { etiqueta: string; valor: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`card-cayla p-4 sm:p-5 ${className}`}>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-1.5 text-2xl text-tinta tabular-nums sm:mt-2 sm:text-3xl">{valor}</p>
      {children && <div className="mt-1 text-xs text-tinta/65">{children}</div>}
    </div>
  );
}
