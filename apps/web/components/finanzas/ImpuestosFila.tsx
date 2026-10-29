import Link from "next/link";
import { ChevronRight, Settings2 } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BarrasTiempo, type BarraTiempo } from "@/components/ui/BarrasTiempo";
import { Chip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Superficie } from "@/components/finanzas/kit";
import { solesRedondo } from "@/lib/gastos-reglas";
import type { LineaPendiente } from "@/lib/impuestos-antes-reglas";
import { avisoUmbral, porcentaje, type PanelImpuestos } from "@/lib/impuestos-reglas";
import type { LimiteImpuestos } from "@/lib/impuestos-cuenta-reglas";

// Finanzas ▸ Impuestos, «E · B++» (ADR-0573): la fila de tres. Pendientes con su monto, el límite del año con su proyección y el IGV de
// cada mes en barras. Las cifras y las frases las arma `lib/impuestos-cuenta-reglas.ts`; aquí solo se dibujan.

const TONO_PUNTO = { rojo: "rojo", ambar: "ambar", gris: "pizarra" } as const;

/** Lo que hay que ver antes de declarar: una línea por tema, con su monto y una frase corta; tocarla lleva a donde se arregla. */
export function PendientesImpuestos({ pendientes, guia }: { pendientes: LineaPendiente[]; guia?: string }) {
  return (
    <Superficie pad className="anim-sube" guia={guia}>
      <div className="fin-imp-cab">
        <h3 className="fin-imp-titulo">Pendientes</h3>
        <Chip tono={pendientes.length ? "ambar" : "verde"}>{pendientes.length ? `${pendientes.length} por revisar` : "Al día"}</Chip>
      </div>
      {pendientes.length === 0 ? (
        <p className="fin-tenue text-[14px]">Nada que revisar este mes.</p>
      ) : (
        <ul className="fin-imp-lista">
          {pendientes.map((p) => {
            const cuerpo = (
              <>
                <span className="fin-punto" data-tono={TONO_PUNTO[p.tono]} aria-hidden />
                <span className="min-w-0">
                  <b>{p.texto}</b>
                  <small>{p.detalle}</small>
                </span>
                <span className="fin-imp-monto">{solesRedondo(p.monto)}</span>
                {p.href ? <ChevronRight aria-hidden className="h-4 w-4 text-tinta/50" /> : <span />}
              </>
            );
            return (
              <li key={p.id}>
                {p.href ? (
                  <Link href={p.href} className="fin-imp-pend">
                    {cuerpo}
                  </Link>
                ) : (
                  <div className="fin-imp-pend">{cuerpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Superficie>
  );
}

/** El límite del año: lo vendido contra el tope del régimen, la marca del aviso y la franja de lo proyectado a diciembre. */
export function LimiteAnio({ limite, panel, guia }: { limite: LimiteImpuestos; panel: PanelImpuestos; guia?: string }) {
  if (limite.estado !== "ok") {
    return (
      <Superficie pad className="anim-sube" guia={guia}>
        <div className="fin-imp-cab">
          <h3 className="fin-imp-titulo">Límite del año</h3>
        </div>
        <Vacio
          tamano="chico"
          icono={<Settings2 />}
          accion={limite.estado === "sin_config" ? { texto: "Configúralos en Configuración ▸ Impuestos", href: "/configuracion?tab=impuestos" } : undefined}
        >
          {limite.estado === "sin_config" ? "Falta el valor de la UIT o el límite del régimen." : "Esta cifra aparece cuando la base de datos esté al día."}
        </Vacio>
      </Superficie>
    );
  }
  const aviso = avisoUmbral(panel);
  return (
    <Superficie pad className="anim-sube" guia={guia}>
      <div className="fin-imp-cab">
        <h3 className="fin-imp-titulo">Límite del año</h3>
        <Chip tono={limite.tono}>{porcentaje(limite.avance, 0)}</Chip>
      </div>
      <p className="fin-imp-vendido">{solesRedondo(limite.vendido)}</p>
      <div className="fin-umbral-envuelto">
        <div className="fin-umbral-barra" data-tono={limite.tono} role="img" aria-label={`${porcentaje(limite.avance, 0)} del límite; a diciembre, ${limite.proyectadoPct} %`}>
          <i className="fin-proy" style={{ width: `${Math.max(limite.proyectadoPct, Math.min(100, limite.avance * 100))}%` }} />
          <i style={{ width: `${Math.min(100, limite.avance * 100)}%` }} />
        </div>
        {limite.avisoPct !== null && <span className="fin-umbral-aviso" style={{ left: `${limite.avisoPct}%` }} aria-hidden />}
      </div>
      {limite.avisoPct !== null && (
        <div className="fin-umbral-escala" aria-hidden>
          <span style={{ left: `${limite.avisoPct}%` }}>Aviso{limite.avisoUit !== null ? ` · ${limite.avisoUit.toLocaleString("es-PE")} UIT` : ""}</span>
        </div>
      )}
      <p className="text-[13.5px] text-tinta">
        {limite.frase} <span className="fin-tenue">Tope: {solesRedondo(limite.umbralSoles)}.</span>
      </p>
      {aviso.titulo && (aviso.nivel === "aviso" || aviso.nivel === "cruzado") && (
        <Aviso tono={aviso.nivel === "cruzado" ? "error" : "atencion"} titulo={aviso.titulo.replace(/\.$/, "")} chico className="mt-3">
          {aviso.detalle}
        </Aviso>
      )}
      <p className="fin-tenue mt-2 text-[12px]">
        Sin IGV, solo lo registrado en el sistema, de enero a hoy. UIT (la medida de SUNAT) {limite.uit.anio}: {solesRedondo(limite.uit.valor)}
        {limite.uit.provisional ? " (por confirmar)" : ""}.
        {aviso.ajuste > 0 && ` Incluye ${solesRedondo(aviso.ajuste)} de ajuste (${solesRedondo(aviso.ventasSistema)} en el sistema).`}
      </p>
    </Superficie>
  );
}

/** El IGV de cada mes, una barra por mes: el que miras en tinta, el que se declara en ámbar, el que todavía corre, rayado. Tocar una barra cambia de mes. */
export function MesesImpuestos({ barras, destacada, onElegir, guia }: { barras: BarraTiempo[]; destacada: string | null; onElegir: (mes: string) => void; guia?: string }) {
  return (
    <Superficie pad className="anim-sube" guia={guia}>
      <div className="fin-imp-cab">
        <h3 className="fin-imp-titulo">IGV a pagar de cada mes</h3>
        {barras.some((b) => b.tono === "verde") && <span className="fin-tenue text-[12px]">verde: quedó a favor</span>}
      </div>
      <BarrasTiempo
        barras={barras}
        destacada={destacada}
        cifras="todas"
        alto={112}
        respuesta={{ onElegir }}
        etiqueta="IGV a pagar de cada mes. Toca un mes para verlo arriba."
      />
    </Superficie>
  );
}
