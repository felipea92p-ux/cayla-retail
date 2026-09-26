"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportarMovimientos } from "@/app/actions/movimientos";
import { avisar } from "@/components/ui/Avisos";
import { esperar } from "@/components/ui/Espera";
import { descargarCsv } from "@/lib/exportar-csv";
import { ENCABEZADOS_CSV_MOVIMIENTOS, hoyEnLima, nombreArchivoMovimientos } from "@/lib/movimientos-reglas";

// «Exportar a Excel» (ADR-0234, D3): baja TODO lo que está filtrado en pantalla —no solo la página— como un CSV, que abre
// igual en Excel y en Sheets. Los filtros salen de la URL de la pantalla, así que el archivo es exactamente lo que se ve.
export function ExportarMovimientos() {
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    setExportando(true);
    const fin = esperar({ etiqueta: "Exportar", titulo: "Preparando el archivo", detalle: "Juntando todos los movimientos filtrados…" });
    try {
      const r = await exportarMovimientos(window.location.search);
      if (!r.ok) {
        avisar.error("No se pudo exportar", { detalle: r.error });
        return;
      }
      if (r.filas.length === 0) {
        avisar.aviso("No hay movimientos para exportar", { detalle: "Con estos filtros la lista está vacía." });
        return;
      }
      descargarCsv(nombreArchivoMovimientos(r.sede, hoyEnLima()), [...ENCABEZADOS_CSV_MOVIMIENTOS], r.filas);
      avisar.exito(`${r.filas.length.toLocaleString("es-PE")} ${r.filas.length === 1 ? "fila exportada" : "filas exportadas"}`, {
        detalle: r.truncado ? "Son las 10.000 más recientes: acota el período para bajar el resto." : "Se abre con Excel o con Google Sheets.",
      });
    } catch {
      avisar.error("No se pudo exportar", { detalle: "Revisa la conexión y vuelve a intentar." });
    } finally {
      fin();
      setExportando(false);
    }
  }

  return (
    <button type="button" onClick={exportar} disabled={exportando} className="btn-cayla btn-secundario inline-flex items-center gap-2">
      <Download aria-hidden strokeWidth={1.5} className="h-4 w-4" />
      {exportando ? "Exportando…" : "Exportar a Excel"}
    </button>
  );
}
