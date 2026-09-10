import { createClient } from "@/lib/supabase/server";
import { mapearRol } from "@/lib/persona";
import { getCatalogoConStock } from "@/lib/catalogo";

// Exporta el inventario completo como CSV (F2). Se abre directo en Excel /
// Google Sheets — el BOM inicial hace que Excel respete las tildes.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { data: personaRow, error: errPersona } = await supabase
    .from("personas")
    .select("id, nombre, rol, sede_id")
    .eq("auth_user_id", user.id)
    .single();
  // Sin esto, un fallo de consulta se reportaba como "Sin persona vinculada" (403) —
  // acusando al usuario de algo que es del servidor.
  if (errPersona) {
    return new Response("No se pudo verificar tu cuenta. Reintenta en un momento.", { status: 503 });
  }
  if (!personaRow || !personaRow.id || !personaRow.nombre || !personaRow.sede_id) {
    return new Response("Sin persona vinculada", { status: 403 });
  }

  const rol = mapearRol(personaRow.rol);
  const persona = {
    id: personaRow.id,
    nombre: personaRow.nombre,
    rol,
    sedeId: personaRow.sede_id,
    // Ni el codigo, ni la etiqueta, ni el tipo de sede los usa getCatalogoConStock: se
    // dejan vacios para evitar un round-trip a `sedes` que este export no necesita.
    sedeCodigo: "",
    sedeEtiqueta: "",
    sedeTipo: "",
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
