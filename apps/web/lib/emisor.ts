// Quién emite el comprobante: los datos que van impresos en el ticket.
//
// Son datos PÚBLICOS (figuran en cada boleta que se entrega), no secretos como `LUCODE_TOKEN`:
// por eso viven en el código, con los valores reales de CAYLA S.A.C. (ficha RUC de SUNAT y el
// ticket que hoy emite Alegra, dados por Felipe el 2026-09-18). Así el ticket sale completo sin
// depender de configurar variables en cada entorno (Vercel incluido).
//
// Cada dato se puede sobreescribir con `NEXT_PUBLIC_EMISOR_*` — pensado para el día que este
// sistema lo use otra marca. Cada variable se lee con su nombre literal: Next solo sustituye
// `process.env.NEXT_PUBLIC_X` escrito así, no accesos dinámicos.
//
// `resolucion` (la «Autorizado mediante resolución N° …» del PSE) queda VACÍA a propósito: la que
// imprime hoy Alegra es la de Alegra, no la de Lucode. Se imprime solo si se configura.
//
// `direccion` es el domicilio fiscal: la dirección de cada tienda todavía no está en `ubicaciones`;
// debajo se imprime el nombre de la tienda.

export type Emisor = {
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  /** Líneas ya partidas para el ancho de la térmica. */
  direccion: string[];
  telefono: string;
  email: string;
  web: string;
  regimen: string;
  lema: string;
  /** «Autorizado mediante resolución N° …» del PSE que transmite. Vacío = no se imprime. */
  resolucion: string;
};

const env = (valor: string | undefined, porDefecto: string) => valor?.trim() || porDefecto;

export const EMISOR: Emisor = {
  razonSocial: env(process.env.NEXT_PUBLIC_EMISOR_RAZON_SOCIAL, "CAYLA S.A.C."),
  nombreComercial: env(process.env.NEXT_PUBLIC_EMISOR_NOMBRE_COMERCIAL, "CAYLA"),
  ruc: env(process.env.NEXT_PUBLIC_EMISOR_RUC, "20605964550"),
  direccion: process.env.NEXT_PUBLIC_EMISOR_DIRECCION?.trim()
    ? [process.env.NEXT_PUBLIC_EMISOR_DIRECCION.trim()]
    : ["Mz. Q Lt. 26, Urb. San Andrés V Etapa", "Víctor Larco Herrera, Trujillo, La Libertad"],
  telefono: env(process.env.NEXT_PUBLIC_EMISOR_TELEFONO, "+51 953 585 537"),
  email: env(process.env.NEXT_PUBLIC_EMISOR_EMAIL, "caylaperu@gmail.com"),
  web: env(process.env.NEXT_PUBLIC_EMISOR_WEB, "www.cayla.pe"),
  regimen: env(process.env.NEXT_PUBLIC_EMISOR_REGIMEN, "Régimen MYPE tributario"),
  lema: env(process.env.NEXT_PUBLIC_EMISOR_LEMA, "Donde el estilo transforma"),
  resolucion: env(process.env.NEXT_PUBLIC_EMISOR_RESOLUCION, ""),
};

/** Con RUC de 11 dígitos y razón social el ticket es presentable; sin eso no se le puede
 *  entregar a una clienta como comprobante. */
export function emisorCompleto(e: Emisor = EMISOR): boolean {
  return /^\d{11}$/.test(e.ruc) && e.razonSocial !== "";
}
