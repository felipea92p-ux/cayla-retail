import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { listarCompras, ETIQUETA_TIPO_DOCUMENTO, type Cursor } from "@/lib/compras";
import { celdaCsv, rangoDelMes } from "@/lib/comprobantes-lista-reglas";
import { hoyLima } from "@/lib/fechas-lima";

// GET /compras/exportar?mes=aaaa-mm — el registro de compras del mes en CSV, para el contador
// (ADR-0111). Un comprobante por fila: fecha, tipo, serie-número, RUC, razón social, base, IGV,
// total, estado, condición y vencimiento. Las anuladas van MARCADAS, no ocultas: el contador
// necesita ver que existieron. Sin `mes`, el mes en curso (Lima).
//
// Quien ve los montos y el módulo Facturas de compra (el layout de /compras lo exige para las pantallas; una ruta
// aparte no hereda ese candado y hay que repetirlo). Se lee con la sesión de la persona: lo que la
// base no le deja ver no sale en el archivo.
//
// El BOM al inicio (﻿) hace que Excel abra las tildes bien sin pasar por «Importar datos».

const LIMITE_PAGINA = 200;
const MAX_FILAS = 20_000; // tope de seguridad: un mes real de CAYLA son decenas

export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  // 20260923130000: quien ve los montos y el módulo Facturas de compra (antes, solo el líder).
  if (!puede(persona, "verDineroCompras") || !veModulo(persona, "facturas_compra")) {
    return Response.json({ error: "Exportar el registro de compras necesita el módulo Facturas de compra en tu rol." }, { status: 403 });
  }

  const mes = new URL(request.url).searchParams.get("mes") ?? hoyLima().slice(0, 7);
  const rango = rangoDelMes(mes);
  if (!rango) return Response.json({ error: "El mes tiene que verse así: 2026-09." }, { status: 400 });

  const encabezado = ["Fecha de emisión", "Tipo de documento", "Serie-número", "RUC", "Proveedor", "Base", "IGV", "Total", "Estado", "Condición", "Vence"];
  const lineas: string[] = [encabezado.join(",")];

  let cursor: Cursor | null = null;
  let total = 0;
  do {
    const pagina = await listarCompras({ desde: rango.desde, hasta: rango.hasta }, { cursor, limite: LIMITE_PAGINA });
    for (const c of pagina.filas) {
      lineas.push(
        [
          c.fechaEmision,
          ETIQUETA_TIPO_DOCUMENTO[c.tipo],
          c.documento,
          c.proveedorRuc,
          c.proveedorNombre,
          c.subtotal.toFixed(2),
          c.igv.toFixed(2),
          c.total.toFixed(2),
          c.estado === "anulada" ? "Anulada" : "Vigente",
          c.condicion === "credito" ? "Crédito" : "Contado",
          c.fechaVencimiento,
        ]
          .map(celdaCsv)
          .join(","),
      );
    }
    total += pagina.filas.length;
    cursor = pagina.siguiente;
  } while (cursor && total < MAX_FILAS);

  return new Response(`﻿${lineas.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registro-compras-${mes}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
