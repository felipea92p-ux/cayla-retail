"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { useEsperando } from "@/components/ui/Espera";
import { BotonDescargar } from "@/components/ui/BotonDescargar";
import { descargarBlob } from "@/lib/exportar-csv";
import { mesTitulo } from "@/lib/resultados-reglas";
import { ARCHIVOS_CONTADOR, nombreArchivoContador, type ArchivoContador } from "@/lib/contador-reglas";

// «Descargar Excel» de un cuadro del contador (ADR-0585; Felipe 2026-10-31: la barra con las siete vistas y la descarga dentro de cada
// cuadro). Baja SOLO el cuadro que se está mirando, con sus cuentas. Lo arma el servidor (`/finanzas/reportes/descargar`), con la misma
// función que la pantalla; mientras tanto, el loader de pantalla (ADR-0149) dice qué se está armando. Si falla, el aviso dice por qué.
export function DescargarCuadro({ archivo, mes }: { archivo: ArchivoContador; mes: string }) {
  const [armando, setArmando] = useState(false);
  const nombre = ARCHIVOS_CONTADOR.find((a) => a.clave === archivo)!.etiqueta;
  useEsperando(armando, { etiqueta: "Para el contador", titulo: `Armando ${nombre.toLowerCase()}`, detalle: mesTitulo(mes) });

  async function bajar() {
    setArmando(true);
    try {
      const r = await fetch(`/finanzas/reportes/descargar?archivo=${archivo}&mes=${mes}`, { cache: "no-store" });
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
        avisar.error(cuerpo?.error ?? "No se pudo armar el archivo. Prueba de nuevo.");
        return;
      }
      descargarBlob(nombreArchivoContador(archivo, mes), await r.blob());
    } catch {
      avisar.error("Se cortó la conexión: el archivo no se descargó. Prueba de nuevo.");
    } finally {
      setArmando(false);
    }
  }

  return (
    <BotonDescargar onClick={() => void bajar()} cargando={armando} guia="fin-estados.descargar" chico>
      Descargar Excel
    </BotonDescargar>
  );
}
