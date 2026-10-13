"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { useSalidaSinGuardar } from "@/components/ui/useSalidaSinGuardar";
import { soltarPaginaEstable } from "@/components/ui/PaginaEstable";
import { useResponsable } from "@/lib/useResponsable";
import {
  borradorInicial,
  buenasDeRecibidos,
  hayAlgoEnElBorrador,
  TEXTO_LA_RECIBE_OTRA,
  totalesDeRecepcion,
  type CatalogoParaRecibir,
  type DetalleEnvio,
  type ResultadoApertura,
  type ResultadoRecepcion,
} from "@/lib/recepcion-envio-reglas";
import type { EstadoEnvio } from "@/lib/ordenes-compra-reglas";
import { ComoSeCerro } from "./ComoSeCerro";
import { EmpezarARecibir } from "./EmpezarARecibir";
import { FormularioRecepcion } from "./FormularioRecepcion";
import { CabeceraEnvio, LoQueTrae, origenDelEnvio } from "./PiezasEnvio";

// «Recibir ENV-000061» (ADR-0362, fase 4): recibir en la sede un envío de orden de compra. Tres caras según el envío: en camino → un solo botón,
// «Empezar a recibir» (lo abre); abierto → el formulario (qué prenda es cada línea, cuántas llegaron, faltantes, sobrantes y dañadas);
// cerrado → cómo se cerró, con las etiquetas y «Bajar al piso». Anulado: ya no llega.
//
// Este componente se monta con el id del envío como key y NO cambia con la sede de la cabecera: el conteo a medio hacer vive aquí, así que
// cambiar de sede (que es un `router.refresh()`) no lo borra; en otra sede la pantalla dice desde dónde se recibe y, al volver, el conteo sigue
// ahí (Felipe 2026-10-11, el mismo problema que tuvo «Llegó mercadería»). Lo mismo con la regla de quién recibe (decisión 17): quien hizo una
// de las órdenes ve lo que trae, pero no lo recibe.

export function RecibirEnvio({
  detalle,
  sedeActual,
  creadoPorMi,
  catalogo,
  lotes,
  veExistencias,
}: {
  detalle: DetalleEnvio;
  /** La sede de la cabecera: la del envío es la única desde donde se recibe. */
  sedeActual: { id: string; etiqueta: string };
  creadoPorMi: boolean;
  catalogo: CatalogoParaRecibir | null;
  lotes: string[];
  veExistencias: boolean;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  // Abierto aquí mismo, antes de que la página vuelva a leer el envío: el formulario sale enseguida.
  const [apertura, setApertura] = useState<ResultadoApertura | null>(null);
  // Cerrado aquí mismo: lo que contestó la base (los lotes para las etiquetas) y lo bueno por variante (para bajar al piso).
  const [cierre, setCierre] = useState<{ resultado: ResultadoRecepcion | null; buenas: { varianteId: string; cantidad: number }[] } | null>(null);
  const [borrador, setBorrador] = useState(() => borradorInicial(detalle));
  // Un token por recepción, el mismo en cada reintento: la base devuelve la misma recepción si el pedido se repite igual.
  const [token] = useState(() => crypto.randomUUID());

  const estado: EstadoEnvio = cierre ? "cerrado" : detalle.estado === "en_camino" && apertura ? "abierto" : detalle.estado;
  // Cuando la base ya dice «abierto», manda su versión; mientras tanto, la que devolvió `abrir_despacho`.
  const version = detalle.estado === "abierto" ? detalle.version : (apertura?.version ?? detalle.version);
  const porRecibir = estado === "en_camino" || estado === "abierto";
  const otraSede = porRecibir && detalle.sede !== null && detalle.sede.id !== sedeActual.id;
  const noLoRecibe = porRecibir && !otraSede && creadoPorMi;

  // Recibir cambia la VISTA (del formulario largo a «cómo se cerró»), no es un bloque que se encogió: se suelta <PaginaEstable> (ADR-0185)
  // antes de pintar y la vista va arriba, donde está lo que quedó y lo que sigue. Sin esto, en el celular la persona quedaba abajo, en el
  // aire que reservaba PaginaEstable, con la pantalla en blanco (medido a 375 px, 2026-10-12). Mismo caso que TrasladoEnviado.
  useLayoutEffect(() => {
    if (!cierre) return;
    soltarPaginaEstable();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [cierre]);

  const avisoSalida = useSalidaSinGuardar(
    estado === "abierto" && !cierre && hayAlgoEnElBorrador(detalle, borrador),
    "Contaste parte de este envío y todavía no se recibió. Si sales ahora, se pierde lo que contaste (el envío sigue abierto para recibirlo después).",
  );

  const origen = origenDelEnvio(detalle);
  const totales = totalesDeRecepcion(detalle, borrador);
  const frase =
    estado === "anulado"
      ? "Este envío se anuló: ya no llega."
      : estado === "cerrado"
        ? `${origen}. Ya se recibió.`
        : otraSede || noLoRecibe
          ? `${origen}. Se recibe en ${detalle.sede?.nombre ?? "su sede"}.`
          : estado === "abierto"
            ? `${origen}. Di qué prenda es cada línea, cuéntala y recibe.`
            : `${origen}. Viene en camino a ${detalle.sede?.nombre ?? "la sede"}.`;
  const cifra =
    estado === "abierto" && !otraSede && !noLoRecibe
      ? { rotulo: "Contadas", valor: `${totales.contado.toLocaleString("es-PE")} de ${totales.enviado.toLocaleString("es-PE")}` }
      : estado === "cerrado"
        ? { rotulo: "Recibidas", valor: (cierre?.resultado?.unidades ?? (detalle.recibidos ?? []).reduce((a, r) => a + r.cantidad, 0)).toLocaleString("es-PE") }
        : estado === "anulado"
          ? null
          : { rotulo: "Vienen", valor: `${detalle.enviado.toLocaleString("es-PE")} ${detalle.enviado === 1 ? "prenda" : "prendas"}` };

  return (
    <div className="space-y-6">
      <CabeceraEnvio sede={sedeActual.etiqueta} detalle={detalle} frase={frase} cifra={cifra} />

      {estado === "anulado" && (
        <Aviso tono="atencion" titulo="Este envío se anuló: ya no llega">
          {detalle.motivoAnulacion ? `Motivo: ${detalle.motivoAnulacion}.` : "Quien compró lo anuló antes de que llegara."} Si la mercadería igual está en la tienda, recíbela en «Llegó mercadería».
        </Aviso>
      )}

      {(otraSede || noLoRecibe) && (
        <>
          {otraSede ? (
            <Aviso tono="atencion" guia="recepcion.otra-sede" titulo={`Este envío va a ${detalle.sede?.nombre ?? "otra sede"}`}>
              Se recibe desde esa sede: cámbiala arriba, en la cabecera, para recibirlo.{" "}
              {hayAlgoEnElBorrador(detalle, borrador) ? "Lo que ya contaste aquí no se pierde: sigue cuando vuelvas." : ""}
            </Aviso>
          ) : (
            <Aviso tono="atencion" guia="recepcion.quien-compro" titulo={TEXTO_LA_RECIBE_OTRA}>
              Quien hace una orden no la recibe, ni siquiera un líder: así nadie da por recibido lo que él mismo pidió. Pídele a otra persona de la
              tienda que lo reciba.
            </Aviso>
          )}
          <section className="card-cayla space-y-3 p-4 sm:p-5" aria-label="Lo que trae">
            <h2 className="font-display text-xl text-tinta">Lo que trae</h2>
            <LoQueTrae detalle={detalle} />
          </section>
        </>
      )}

      {estado === "en_camino" && !otraSede && !noLoRecibe && (
        <EmpezarARecibir
          detalle={detalle}
          sede={sedeActual.etiqueta}
          responsable={responsable}
          onAbierto={(r) => {
            setApertura(r ?? { despachoId: detalle.id, numero: detalle.numero, estado: "abierto", version: null });
            router.refresh();
          }}
        />
      )}

      {estado === "abierto" && !otraSede && !noLoRecibe && (
        <FormularioRecepcion
          detalle={detalle}
          version={version}
          catalogo={catalogo}
          sede={sedeActual.etiqueta}
          responsable={responsable}
          borrador={borrador}
          setBorrador={setBorrador}
          token={token}
          onRecibido={(resultado, buenas) => {
            setCierre({ resultado, buenas });
            // El refresco va DESPUÉS de retirar la guardia de «¿Salir sin guardar?», como en «Llegó mercadería».
            void avisoSalida.retirarYa().then(() => router.refresh());
          }}
        />
      )}

      {estado === "cerrado" && (
        <ComoSeCerro
          detalle={detalle}
          resultado={cierre?.resultado ?? null}
          lotes={cierre?.resultado?.lotes.length ? cierre.resultado.lotes : lotes}
          buenas={cierre?.buenas ?? buenasDeRecibidos(detalle.recibidos)}
          veExistencias={veExistencias}
        />
      )}

      {avisoSalida.aviso}
    </div>
  );
}
