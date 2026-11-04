"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/ui/Avisos";
import { Chip } from "@/components/ui/Chip";
import { PieTabla, Superficie, TituloDeTarjeta } from "@/components/finanzas/kit";
import { ajustarCelular, celularValido } from "@/lib/club-reglas";
import type { TiendaConfig } from "@/lib/configuracion-reglas";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { FilaResponsable, MarcoCasilla, useGuardarCasilla, useVistoGuardado, type Guardar } from "@/components/ConfiguracionCasilla";
import { cambioLaCasilla } from "@/lib/configuracion-casilla";
import { ConfiguracionAsistente } from "@/components/asistente/ConfiguracionAsistente";
import type { SedeAsistente } from "@/lib/asistente/sedes";

// Configuración ▸ Empresa y tiendas: lo de cada sede que no es una meta. El WhatsApp de cada tienda para el QR del club (ADR-0288 tanda 1b,
// `guardar_whatsapp_tienda`), el asistente por sede y la carga inicial. Vivían en «Tiendas y caja» hasta que Felipe la partió el 2026-11-04; las
// metas pasaron a `ConfiguracionMetas`. Cada casilla se guarda sola al salir de ella, firmada con el responsable.

/** El WhatsApp de la tienda (ADR-0288 tanda 1b): se guarda al salir si cambió. Solo deja los 9 dígitos (pegar «+51 987…» los
 *  deja limpios); vacío lo quita (la tienda queda sin QR del club). */
function CasillaCelular({ valor, etiqueta, alGuardar }: { valor: string; etiqueta: string; alGuardar: (numero: string) => Promise<boolean> }) {
  const [t, setT] = useState(valor);
  const [antes, setAntes] = useState(valor);
  if (valor !== antes) {
    setAntes(valor);
    setT(valor);
  }
  const visto = useVistoGuardado();
  return (
    <MarcoCasilla vez={visto.vez}>
      <input
        aria-label={etiqueta}
        inputMode="tel"
        value={t}
        placeholder="—"
        onChange={(e) => setT(ajustarCelular(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setT(valor);
        }}
        onBlur={async () => {
          if (!cambioLaCasilla(t, valor)) return;
          if (t !== "" && !celularValido(t)) {
            avisar.error(`${etiqueta}: tiene 9 dígitos y empieza en 9. Si la tienda no tiene uno, déjalo vacío.`);
            setT(valor);
            return;
          }
          const ok = await alGuardar(t);
          if (ok) visto.marcar();
          else setT(valor);
        }}
        className="fin-control fin-num inline-block w-[7.6rem]"
      />
    </MarcoCasilla>
  );
}

function FilaWhatsapp({ tienda, guardar }: { tienda: TiendaConfig; guardar: Guardar }) {
  const conQr = celularValido(tienda.whatsappNumero);
  return (
    <tr>
      <td className="fin-ancha" data-l="Tienda">
        <b>{tienda.nombre}</b>
      </td>
      <td className="fin-num" data-l="WhatsApp">
        <CasillaCelular
          valor={tienda.whatsappNumero ?? ""}
          etiqueta={`WhatsApp de ${tienda.nombre}`}
          alGuardar={(numero) =>
            guardar(
              () => createClient().rpc("guardar_whatsapp_tienda", { p_ubicacion_id: tienda.id, p_numero: numero || undefined }),
              "guardar el WhatsApp de la tienda",
              numero ? `${tienda.nombre}: WhatsApp ${numero}. Su QR del club ya se puede imprimir.` : `${tienda.nombre}: sin WhatsApp. No muestra QR del club.`,
            )
          }
        />
      </td>
      <td data-l="QR del club">
        <Chip tono={conQr ? "verde" : "neutro"}>{conQr ? "Con QR" : "Sin QR"}</Chip>
      </td>
    </tr>
  );
}

/** `carga`: la tarjeta de la carga inicial (ADR-0328). Se pasa armada desde la página: tiene su propio responsable y su propia hoja, no usa las
 *  casillas de aquí. `asistente`: el interruptor de «Pregúntale a CAYLA» por sede (ADR-0536, act. 8), que sí usa el responsable de aquí; `null` si
 *  la base no lo tiene todavía. */
export function ConfiguracionTiendas({
  tiendas,
  hoy,
  carga,
  asistente,
}: {
  tiendas: TiendaConfig[];
  hoy: string;
  carga?: ReactNode;
  asistente?: { sedes: SedeAsistente[]; gastado: number | null } | null;
}) {
  const { responsable, guardando, guardar } = useGuardarCasilla();

  return (
    <>
      <FilaResponsable responsable={responsable} guardando={guardando} />

      {/* A lo ancho (ADR-0462), dos tablas cortas van lado a lado: no piden todo el ancho. */}
      <div className="grid items-start gap-6 min-[1280px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*:only-child]:col-span-full min-[1280px]:[&_.fin-tabla]:min-w-0">
        {tiendas.length > 0 && (
          <Superficie className="anim-sube" guia="config.tiendas-whatsapp">
            <TituloDeTarjeta titulo="WhatsApp de cada tienda" bajada="El número del QR del club y de la tienda web. Sin número, la tienda no muestra QR ni sale en la web.">
              <BotonVer href="/clientas/cartel" chico>
                Ver el cartel del club
              </BotonVer>
            </TituloDeTarjeta>
            <div className="fin-tabla-wrap">
              <table className="fin-tabla fin-tabla-apretada">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th className="fin-num">WhatsApp</th>
                    <th>QR del club</th>
                  </tr>
                </thead>
                <tbody>
                  {tiendas.map((t) => (
                    <FilaWhatsapp key={t.id} tienda={t} guardar={guardar} />
                  ))}
                </tbody>
              </table>
            </div>
            <PieTabla>
              <span>
                9 dígitos que empiezan en 9, sin +51. Vacío = sin QR. Antes de cargarlo, que el celular de la tienda tenga encendido el respaldo
                de WhatsApp: su chat es la prueba de que el cliente pidió las novedades.
              </span>
            </PieTabla>
          </Superficie>
        )}

        {asistente && asistente.sedes.length > 0 && <ConfiguracionAsistente sedes={asistente.sedes} gastado={asistente.gastado} hoy={hoy} guardar={guardar} />}
      </div>

      {carga}
    </>
  );
}
