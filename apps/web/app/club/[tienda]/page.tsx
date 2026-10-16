import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DIRECCION_TIENDA_ONLINE } from "@/lib/club-qr-reglas";

// La dirección que abren los carteles del Club ya impresos (ADR-0288 act. g, G-1): `/club/<uuid de la tienda>`. Hasta el
// 2026-10-16 era la página pública de registro del Club. Desde entonces el Club empieza al crear la cuenta en la tienda online
// (Felipe: «todo aquel que no tenga registrada su contraseña aún no es parte del club»; «al escanear el cartel lleva al link
// tienda.cayla.pe»; 20261016154000), así que aquí ya no se registra nadie: lleva a la tienda. Sigue pública
// (`lib/rutas-publicas.ts`) y fuera de `app/(app)` para que esos carteles sirvan sin reimprimirlos; el cartel nuevo lleva directo.
//
// Temporal (307) y no permanente: un celular que guardara una redirección permanente no volvería a preguntar si mañana esta
// dirección vuelve a servir para otra cosa.

export const metadata: Metadata = {
  title: "Club — CAYLA",
  robots: { index: false, follow: false },
};

export default function CartelLlevaALaTienda(): never {
  redirect(DIRECCION_TIENDA_ONLINE);
}
