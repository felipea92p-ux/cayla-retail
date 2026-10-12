import type { Metadata } from "next";
import { PantallaNoEncontrada } from "@/components/PantallaNoEncontrada";

export const metadata: Metadata = { title: "Pantalla no encontrada — CAYLA" };

// La 404 de una URL que no existe (ADR-0336): propia, en español y con los tokens del sistema, para que respete el modo oscuro.
export default function NoEncontrada() {
  return <PantallaNoEncontrada completa />;
}
