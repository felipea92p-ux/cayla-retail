import type { NombreIcono } from "@/components/Icono";
import { soles } from "./cuentas";
import type { ConfigPuntos } from "./puntos";

// La página pública del Club (/club, rediseño Premium, 2026-11-07): lo que se gana y cómo se usa, con las cifras de la configuración
// que usa la caja (`tienda_puntos_config`), las mismas de los Términos del Club. Sin base, cada regla se dice sin cifras: nunca un número
// inventado. Lógica pura, con su prueba al lado.

export type ReglaDelClub = { icono: NombreIcono; titulo: string; texto: string };

const enDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const veces = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

/** Las cinco reglas del programa de puntos, en el orden en que se viven: ganar, cuánto valen, canjear, usar el cupón y el cumpleaños. */
export function reglasDelClub(c: ConfigPuntos | null): ReglaDelClub[] {
  if (!c) {
    return [
      { icono: "chispa", titulo: "Ganas puntos en cada compra", texto: "En tienda o en la tienda online, con la compra a tu nombre y tu documento." },
      { icono: "ticket", titulo: "Tus puntos valen soles", texto: "Cada 100 puntos valen un descuento, en un cupón con código." },
      { icono: "ticket", titulo: "Los cambias por un cupón", texto: "Desde un mínimo de puntos, de 100 en 100, en la web o en caja." },
      { icono: "reloj", titulo: "Tu cupón vale unos días", texto: "Una sola vez, en una compra de varias veces su valor. Si no lo usas, tus puntos vuelven." },
      { icono: "regalo", titulo: "Puntos de regalo en tu cumpleaños", texto: "Tu primera compra del mes de tu cumpleaños los suma sola. Una vez al año." },
    ];
  }
  const porSol = c.puntosPorSol === 1 ? "1 punto" : `${c.puntosPorSol} puntos`;
  return [
    { icono: "chispa", titulo: `${porSol} por cada S/ 1`, texto: "En tienda o en la tienda online, con la compra a tu nombre y tu documento." },
    { icono: "ticket", titulo: `100 puntos valen ${soles(c.solesPor100)}`, texto: "De descuento, en un cupón con código." },
    {
      icono: "ticket",
      titulo: `Los cambias desde ${c.canjeMinimo.toLocaleString("es-PE")} puntos`,
      texto: `Un cupón de ${soles(Math.floor(c.canjeMinimo / 100) * c.solesPor100)} o más, de 100 en 100, en la web o en caja.`,
    },
    {
      icono: "reloj",
      titulo: `Tu cupón vale ${enDias(c.vigenciaDias)}`,
      texto: `Una sola vez, en una compra desde ${veces(c.compraMinimaX)} veces su valor. Si no lo usas, tus puntos vuelven.`,
    },
    {
      icono: "regalo",
      titulo: `+${c.regaloCumple.toLocaleString("es-PE")} puntos en tu cumpleaños`,
      texto: "Tu primera compra del mes de tu cumpleaños los suma sola. Una vez al año.",
    },
  ];
}
