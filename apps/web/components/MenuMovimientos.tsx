"use client";

import { MenuAcciones } from "@/components/ui/MenuAcciones";
import { avisar } from "@/components/ui/Avisos";

// El «Más» de Movimientos (ADR-0241; era un «⋯» hasta la ronda 13 de /unificar: en la cabecera va con su palabra): lo que se
// hace de vez en cuando —bajar el Excel para la oficina, mandar esta vista por WhatsApp— no ocupa el lugar de un botón a la
// vista, sobre todo en el celular, donde era el único botón de la cabecera y empujaba la lista hacia abajo. Exportar sigue
// siendo la misma ruta, con los filtros de la pantalla (ADR-0234). Solo en la computadora: en el celular, Exportar vive en la
// hoja de Filtros (el menú solo ocupaba una fila bajo la frase).
export function MenuMovimientos({ hrefExportar }: { hrefExportar: string }) {
  return (
    <div data-guia="movimientos.menu" className="hidden sm:block">
      <MenuAcciones
        etiqueta="Más opciones de Movimientos"
        texto="Más"
        items={[
          {
            clave: "exportar",
            etiqueta: "Descargar Excel",
            onSelect: () => {
              window.location.href = hrefExportar;
            },
          },
          { clave: "enlace", etiqueta: "Copiar enlace de esta vista", onSelect: () => void copiarVista() },
        ]}
      />
    </div>
  );
}

async function copiarVista() {
  const p = new URLSearchParams(window.location.search);
  p.delete("mov");
  p.delete("cursor");
  const qs = p.toString();
  const enlace = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}`;
  const ok = await navigator.clipboard?.writeText(enlace).then( // unificar-fijo: una opción del menú «Más», no un botón de copiar
    () => true,
    () => false
  );
  if (ok) avisar.exito("Enlace copiado", { detalle: "Abre Movimientos con estos mismos filtros." });
  else avisar.error("No se pudo copiar el enlace", { detalle: "Copia la dirección de arriba del navegador." });
}
