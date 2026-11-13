import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LaboratorioFotos } from "@/components/laboratorio/LaboratorioFotos";
import { proveedoresDelLaboratorio } from "@/lib/laboratorio-fotos";

export const metadata: Metadata = { title: "Laboratorio de fotos · CAYLA" };
export const dynamic = "force-dynamic";

// Laboratorio de fotos (2026-11-13): se sueltan fotos crudas de prendas y se compara lo que devuelve cada IA (Photoroom, OpenAI) contra la prenda
// real recortada, con la misma prueba de recorte que usa el armador de looks y una medida del color. No guarda nada. Vive FUERA de `(app)` a
// propósito: no es una pantalla del menú ni un módulo (ADR-0161), es una prueba local que no existe en producción. El proxy igual pide sesión.
// Por qué y qué se encontró: `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`.
export default function LaboratorioFotosPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LaboratorioFotos proveedores={proveedoresDelLaboratorio()} />;
}
