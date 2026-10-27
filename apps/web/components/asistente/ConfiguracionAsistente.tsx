"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/Chip";
import { Interruptor } from "@/components/ui/campos";
import { PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import type { Guardar } from "@/components/ConfiguracionCasilla";
import { fechaCorta } from "@/lib/gastos-reglas";
import { TOPE_MENSUAL_USD } from "@/lib/asistente/respuesta";
import { estadoDeSede, gastoDelMes, type SedeAsistente } from "@/lib/asistente/sedes";

// Configuración ▸ Tiendas y caja ▸ «Pregúntale a CAYLA» en cada sede (ADR-0529, actividad 8). El piloto se prende sede por sede: solo
// en las encendidas sale «Preguntar» en la cabecera. Lo cambia quien ve Configuración (Felipe 2026-10-27, `guardar_asistente_sede`),
// con el mismo responsable y el mismo «se guarda solo» que el resto de la pestaña. Al lado, lo gastado en el mes contra el tope.

const TIPO: Record<SedeAsistente["tipo"], string> = { tienda: "Tienda", almacen: "Almacén", taller: "Taller" };

function FilaAsistente({ sede, hoy, guardar }: { sede: SedeAsistente; hoy: string; guardar: Guardar }) {
  // Lo que la persona eligió, mientras la base responde: el interruptor no vuelve atrás a mitad del guardado.
  const [pedido, setPedido] = useState<boolean | null>(null);
  const activo = pedido ?? sede.encendido;

  async function cambiar(encendido: boolean) {
    setPedido(encendido);
    await guardar(
      () => createClient().rpc("guardar_asistente_sede" as never, { p_ubicacion_id: sede.id, p_encendido: encendido } as never),
      `${encendido ? "encender" : "apagar"} el asistente de ${sede.nombre}`,
      encendido
        ? `${sede.nombre}: ya puede preguntarle a CAYLA. «Preguntar» sale en su cabecera.`
        : `${sede.nombre}: asistente apagado. Lo que ya preguntaron queda anotado.`,
    );
    setPedido(null);
  }

  return (
    <tr>
      <td className="fin-ancha" data-l="Sede">
        <b>{sede.nombre}</b>
        <span className="fin-sub">{estadoDeSede(sede, hoy, fechaCorta)}</span>
      </td>
      <td data-l="Tipo">{TIPO[sede.tipo]}</td>
      <td data-l="Asistente">
        <Interruptor
          activo={activo}
          disabled={pedido !== null}
          onActivo={cambiar}
          etiqueta={
            <>
              <span className="sr-only">Asistente en {sede.nombre}: </span>
              {activo ? "Encendido" : "Apagado"}
            </>
          }
        />
      </td>
    </tr>
  );
}

export function ConfiguracionAsistente({ sedes, gastado, hoy, guardar }: { sedes: SedeAsistente[]; gastado: number | null; hoy: string; guardar: Guardar }) {
  const gasto = gastoDelMes(gastado, TOPE_MENSUAL_USD);
  const encendidas = sedes.filter((s) => s.encendido).length;
  return (
    <Superficie className="anim-sube" guia="config.tiendas-asistente">
      <TituloDeTarjeta
        titulo="Pregúntale a CAYLA en cada sede"
        bajada="La ayuda de la cabecera que responde «¿cómo hago…?» y lleva al botón. Se prende sede por sede: solo en las encendidas sale «Preguntar»."
      >
        {gasto ? <Chip tono={gasto.tono}>{gasto.texto}</Chip> : <Chip tono="neutro">{encendidas ? `${encendidas} encendida${encendidas === 1 ? "" : "s"}` : "Apagado en todas"}</Chip>}
      </TituloDeTarjeta>
      <div className="fin-tabla-wrap">
        <table className="fin-tabla fin-tabla-apretada">
          <thead>
            <tr>
              <th>Sede</th>
              <th>Tipo</th>
              <th>Asistente</th>
            </tr>
          </thead>
          <tbody>
            {sedes.map((s) => (
              <FilaAsistente key={s.id} sede={s} hoy={hoy} guardar={guardar} />
            ))}
          </tbody>
        </table>
      </div>
      <PieTabla>
        <span>
          Una pregunta cuesta menos de un centavo de dólar. Si en el mes se llega a US$ {TOPE_MENSUAL_USD}, sigue respondiendo sin IA (busca entre las
          guías) hasta el día 1. Apagar no borra lo que ya se preguntó.
        </span>
      </PieTabla>
    </Superficie>
  );
}
