"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { detalleDePar, nombreEnPar, prendasConDosOfertas, tituloDosOfertas, type ParQueChoca } from "@/lib/campana-reglas";
import { encabezadosOmitidos } from "@/lib/responsable-omitido";

// El aviso de Campañas (ADR-0655, decisión 2 de Felipe, 2026-11-14): una prenda quedó con dos ofertas por una puerta de fuera de la hoja
// (una insignia, una categoría, un modelo nuevo, una campaña reactivada). Mientras nadie elige, la caja cobra la que más le ahorra al
// cliente. Como en Shopify, se elige por par de ofertas y vale para todas las prendas que comparten. Un descuento de siempre no cede.

export function AvisoDosOfertas({ pares, alElegir }: { pares: readonly ParQueChoca[]; alElegir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  if (pares.length === 0) return null;

  async function elegir(par: ParQueChoca, gana: "oferta" | "otra") {
    const queda = gana === "oferta" ? par.oferta : par.otra;
    const cede = gana === "oferta" ? par.otra : par.oferta;
    setEligiendo(`${par.oferta.id}|${par.otra.id}|${gana}`);
    try {
      const res = await fetch("/api/productos/campana-reglas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...encabezadosOmitidos("etiqueta_campana") },
        body: JSON.stringify({ id: queda.id, accion: "queda", cede: cede.id }),
      });
      const datos = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo elegir la oferta.");
        return;
      }
      avisar.exito("Listo", { detalle: `Donde rigen las dos, queda ${nombreEnPar(queda)}.` });
      if (pares.length === 1) setAbierto(false);
      alElegir();
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setEligiendo(null);
    }
  }

  return (
    <>
      <Aviso
        tono="atencion"
        titulo={tituloDosOfertas(prendasConDosOfertas(pares))}
        guia="sellos.dos-ofertas"
        accion={
          <Boton peso="fantasma" onClick={() => setAbierto(true)}>
            Elegir cuál queda
          </Boton>
        }
      >
        Mientras no elijas, la caja cobra la que más le ahorra al cliente.
      </Aviso>
      {abierto && (
        <Modal titulo="Prendas con dos ofertas" subtitulo="Elige cuál queda en cada par: vale para todas sus prendas." tamano="mediana" conCerrar onClose={() => setAbierto(false)}>
          <ul className="mt-4 space-y-3">
            {pares.map((p) => {
              const clave = `${p.oferta.id}|${p.otra.id}`;
              return (
                <li key={clave}>
                  <Aviso tono="info" titulo={`${nombreEnPar(p.oferta)} y ${p.otra.tipo === "descuento" ? `el descuento de siempre de «${p.otra.nombre}»` : nombreEnPar(p.otra)}`}>
                    <span className="block">{detalleDePar(p)}</span>
                    {p.otra.tipo === "oferta" ? (
                      <span className="mt-2 flex flex-wrap gap-2">
                        <Boton peso="fantasma" cargando={eligiendo === `${clave}|oferta`} disabled={eligiendo !== null} onClick={() => elegir(p, "oferta")}>
                          {`Que quede «${p.oferta.nombre}»`}
                        </Boton>
                        <Boton peso="fantasma" cargando={eligiendo === `${clave}|otra`} disabled={eligiendo !== null} onClick={() => elegir(p, "otra")}>
                          {`Que quede «${p.otra.nombre}»`}
                        </Boton>
                      </span>
                    ) : (
                      <span className="mt-1 block">No cede: sácale esa categoría a la campaña o esas prendas a la oferta.</span>
                    )}
                  </Aviso>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </>
  );
}
