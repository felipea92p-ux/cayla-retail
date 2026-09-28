/** El colibrí de CAYLA en vector — mismo trazo calcado a mano en `EtiquetaPrecio.tsx` (2026-09-25, tras
 *  salir "serruchado" en la Brother a partir del PNG de 223 px). Acá se reusa para pantalla, con el
 *  rojo de marca por defecto (muestreado del propio `/cayla-isotipo.png`: #b8412d en la enorme mayoría
 *  de sus píxeles) en vez del negro que usa la etiqueta impresa. */
export function IsotipoCayla({ className, color = "#b8412d" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 223 150" aria-hidden fill="none" stroke={color} strokeWidth={9} strokeLinejoin="round" className={className}>
      <path d="M3,6 C45,14 95,28 118,50 C134,64 136,96 124,112 C110,130 80,138 47,146 L68,102" />
      <path d="M3,6 C10,40 40,70 70,80 C85,85 100,87 112,87" />
      <path d="M104,40 C102,22 118,6 140,5 C155,4 165,10 172,16 L220,12" />
      <path d="M172,16 C156,22 144,38 134,62" />
    </svg>
  );
}
