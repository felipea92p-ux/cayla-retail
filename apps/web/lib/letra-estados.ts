import { Inter } from "next/font/google";

// La letra de las cifras de Estados financieros (ADR-0611: Felipe eligió Inter mirando la maqueta). Solo vale en esa pantalla: la pone su layout, y
// también el calendario de fechas, que flota fuera de él. Se declara una vez: `next/font` no deja repetirla.
export const letraEstados = Inter({ subsets: ["latin"], variable: "--letra-estados", display: "swap", weight: ["400", "500", "600"] });
