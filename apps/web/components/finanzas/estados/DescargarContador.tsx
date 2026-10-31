"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { useEsperando } from "@/components/ui/Espera";
import { MenuDescargar } from "@/components/ui/BotonDescargar";
import { descargarBlob } from "@/lib/exportar-csv";
import { mesTitulo } from "@/lib/resultados-reglas";
import { ARCHIVOS_CONTADOR, motivoArchivoContador, nombreArchivoContador, type ArchivoContador } from "@/lib/contador-reglas";

// «Descargar para el contador» (ADR-0585, actividad 8): un botón que abre la lista de archivos del mes y baja SOLO el que se elige
// (Felipe 2026-10-30). Las cuentas, que la pantalla ya no muestra, van en estos archivos. Cada uno lo arma el servidor
// (`/finanzas/reportes/descargar`); mientras tanto, el loader de pantalla (ADR-0149) dice qué se está armando. Si falla, el aviso dice por qué.
export function DescargarContador({ mes, veTodo }: { mes: string; veTodo: boolean }) {
  const [armando, setArmando] = useState<string | null>(null);
  useEsperando(armando !== null, armando ? { etiqueta: "Para el contador", titulo: `Armando ${armando.toLowerCase()}`, detalle: mesTitulo(mes) } : undefined);

  async function bajar(clave: ArchivoContador, etiqueta: string) {
    setArmando(etiqueta);
    try {
      const r = await fetch(`/finanzas/reportes/descargar?archivo=${clave}&mes=${mes}`, { cache: "no-store" });
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
        avisar.error(cuerpo?.error ?? "No se pudo armar el archivo. Prueba de nuevo.");
        return;
      }
      descargarBlob(nombreArchivoContador(clave, mes), await r.blob());
    } catch {
      avisar.error("Se cortó la conexión: el archivo no se descargó. Prueba de nuevo.");
    } finally {
      setArmando(null);
    }
  }

  return (
    <MenuDescargar
      texto="Descargar para el contador"
      guia="fin-estados.contador"
      items={ARCHIVOS_CONTADOR.map((a) => ({
        clave: a.clave,
        etiqueta: a.etiqueta,
        onSelect: () => void bajar(a.clave, a.etiqueta),
        ...(motivoArchivoContador(a.clave, veTodo) ? { motivo: motivoArchivoContador(a.clave, veTodo)! } : {}),
      }))}
    />
  );
}
