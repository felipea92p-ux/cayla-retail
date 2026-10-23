"use client";

import type { CSSProperties } from "react";
import { soles } from "@/lib/flujo-caja-reglas";
import { useConsultaMedia } from "@/lib/useConsultaMedia";
import { acomodarRetazo, type PiezaRetazo } from "@/lib/gastos-telar-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";

/**
 * El retazo de Gastos (El telar, ADR-0493): «¿en qué se va la plata?» como una tela cortada en pedazos. Cada categoría es un pedazo
 * del tamaño de lo que se gastó en ella, con su nombre, su monto y su parte; abajo, su orillo dice qué sede lo gastó (el color de cada
 * hilo). Tocar un pedazo filtra la lista de abajo por esa categoría; tocarlo otra vez lo quita. Se despliega una vez al llegar
 * (ADR-0136, excepción del telar). En el celular la tela es más alta que ancha, para que los nombres quepan.
 */
export function RetazoGastos({
  piezas,
  sedes,
  elegida,
  onElegir,
}: {
  piezas: PiezaRetazo[];
  sedes: SedeTelar[];
  elegida: string;
  onElegir: (categoria: string) => void;
}) {
  const angosto = useConsultaMedia("(max-width: 639px)");
  const ancho = 100;
  const alto = angosto ? 110 : 46;
  const acomodadas = acomodarRetazo(piezas, ancho, alto);
  return (
    <div className="retazo-gastos" data-alto={angosto ? "" : undefined} data-guia="fin-gastos.retazo">
      {acomodadas.map((p, i) => {
        const chica = (p.w / ancho) * 100 < 14 || (p.h / alto) * 100 < 22;
        const estilo = {
          left: `${(p.x / ancho) * 100}%`,
          top: `${(p.y / alto) * 100}%`,
          width: `${(p.w / ancho) * 100}%`,
          height: `${(p.h / alto) * 100}%`,
          "--i": i,
        } as CSSProperties;
        return (
          <div key={p.categoria} className="retazo-pieza" style={estilo} data-chica={chica ? "" : undefined}>
            <button
              type="button"
              aria-pressed={elegida === p.categoria}
              onClick={() => onElegir(elegida === p.categoria ? "" : p.categoria)}
              title={`${p.nombre}: ${soles(p.total)} · ${p.pct} %`}
            >
              <span className="retazo-nombre">{p.nombre}</span>
              <span className="retazo-monto">{soles(p.total)}</span>
              <span className="retazo-pct">{p.pct} % de lo gastado</span>
              <span className="retazo-trama" aria-hidden>
                {sedes
                  .filter((s) => (p.porSede[s.clave] ?? 0) > 0)
                  .map((s) => (
                    <i key={s.clave} data-color={s.color} style={{ flexGrow: p.porSede[s.clave] }} />
                  ))}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
