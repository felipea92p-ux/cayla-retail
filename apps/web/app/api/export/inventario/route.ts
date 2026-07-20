import { createClient } from "@/lib/supabase/server";
import { getCatalogoConStock } from "@/lib/catalogo";

// Exporta el inventario completo como CSV (F2). Se abre directo en Excel /
// Google Sheets — el BOM inicial hace que Excel respete las tildes.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { data: personaRow } = await supabase
    .from("personas")
    .select("id, nombre, rol, sede_id, sedes(codigo)")
    .eq("auth_user_id", user.id)
    .single();
  if (!personaRow) return new Response("Sin persona vinculada", { status: 403 });

  const sede = Array.isArray(personaRow.sedes) ? personaRow.sedes[0] : personaRow.sedes;
  const persona = {
    id: personaRow.id,
    nombre: personaRow.nombre,
    rol: personaRow.rol as "lider" | "integrante",
    sedeId: personaRow.sede_id,
    sedeCodigo: sede?.codigo ?? "",
  };
  const esLider = persona.rol === "lider";

  const variantes = await getCatalogoConStock(persona);

  // Columnas de sede dinámicas, en orden estable
  const sedes = [...new Set(variantes.flatMap((v) => Object.keys(v.stockPorSede)))].sort();

  const celda = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const cabecera = [
    "SKU", "Referencia", "Familia", "Categoría", "Talla", "Color", "Marca",
    ...sedes.map((s) => `Stock ${s}`),
    "Stock total", "Mínimo general",
    ...(esLider ? ["Costo", "Precio"] : ["Precio"]),
  ];

  const filas = variantes.map((v) => [
    v.sku, v.referencia, v.familia ?? "", v.categoria ?? "", v.talla ?? "", v.color ?? "", v.marca ?? "",
    ...sedes.map((s) => v.stockPorSede[s] ?? 0),
    v.stockTotal, v.stockMinimo,
    ...(esLider ? [v.costo ?? "", v.precio ?? ""] : [v.precio ?? ""]),
  ]);

  // Punto y coma como separador: es lo que Excel en español espera por defecto.
  const csv = "﻿" + [cabecera, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");

  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cayla-inventario-${fecha}.csv"`,
    },
  });
}
