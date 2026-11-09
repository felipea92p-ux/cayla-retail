import { CircleHelp } from "lucide-react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { EquilibrioMes } from "@/lib/equilibrio-mes-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import type { RespuestaResumen } from "@/lib/resumen-telar-reglas";
import type { TeDejaMes } from "@/lib/te-deja-mes-reglas";
import type { ClaveHoja } from "@/lib/hojas-resumen-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: la tarjeta «Noviembre va así» (Felipe 2026-11-09). Cuánto te deja el mes —estimado con su rango mientras
// corre, lo que fue si ya cerró—, lo vendido contra el período anterior, los gastos y, abajo, si ya se pagó el mes (la barra del equilibrio con la
// rayita de hoy). Solo DIBUJA: `teDejaDelMes` y `equilibrioMes` hacen las cuentas, y las dos salen del mismo ritmo, así que no se contradicen.

type Props = {
  titulo: string;
  te: TeDejaMes;
  eq: EquilibrioMes | null;
  /** Lo vendido y lo gastado en las fechas que se miran (sin IGV). */
  vendido: number;
  gastos: number;
  /** Cuánto cambió lo vendido contra el período anterior (0.06 = +6 %) y cómo se nombra ese período; `null` sin comparación. */
  cambio: { pct: number; contra: string } | null;
  /** Lo que se mira no vende (el Taller, la Empresa): la respuesta de siempre («¿Cuánto cuesta el Taller?»). */
  noVende: RespuestaResumen | null;
  provisional: boolean;
  /** «Día 9 de 30», para la rayita de hoy; `null` fuera del mes en curso. */
  hoyEnElMes: { van: number; total: number } | null;
  hrefGanancias: string | null;
  /** Abre la hoja de detalle («Lo que te deja», «Lo que vendiste», «En qué se va la plata»); `null` si esa hoja no tiene con qué. */
  onAbrir: (hoja: ClaveHoja) => void;
  hojas: readonly ClaveHoja[];
};

function Delta({ cambio }: { cambio: NonNullable<Props["cambio"]> }) {
  const p = Math.round(cambio.pct * 100);
  const tono: TonoChip = p === 0 ? "pizarra" : p > 0 ? "verde" : "ambar";
  const texto = p === 0 ? `Igual que ${cambio.contra}` : `${p > 0 ? "+" : "−"}${Math.abs(p)} % contra ${cambio.contra}`;
  return (
    <Chip tono={tono} versalitas={false} className="chip-envuelve">
      {texto}
    </Chip>
  );
}

/** Una cifra que abre su hoja, o la cifra sola si la hoja no está. */
function Cifra({ hoja, hojas, onAbrir, children, etiqueta }: { hoja: ClaveHoja; hojas: readonly ClaveHoja[]; onAbrir: (h: ClaveHoja) => void; children: React.ReactNode; etiqueta: string }) {
  if (!hojas.includes(hoja)) return <>{children}</>;
  return (
    <button type="button" className="mes-a-abre" onClick={() => onAbrir(hoja)} aria-label={etiqueta}>
      {children}
    </button>
  );
}

export function TarjetaMes({ titulo, te, eq, vendido, gastos, cambio, noVende, provisional, hoyEnElMes, hrefGanancias, onAbrir, hojas }: Props) {
  const etiqueta =
    te.tipo === "estimado"
      ? "Te deja (estimado)"
      : te.tipo === "cerrado"
        ? te.resultado >= 0
          ? "Te dejó"
          : "Te faltó"
        : te.tipo === "tramo"
          ? te.resultado >= 0
            ? "Te dejó"
            : "Te faltó"
          : "Te deja hasta hoy";
  // Lo que fue se dice en positivo con su palabra («Te faltó S/ 2,000»); lo que se estima o va hasta hoy lleva su signo.
  const conSigno = te.tipo === "estimado" ? te.estimado : te.tipo === "sin_estimado" ? te.hastaHoy : te.tipo === "cerrado" || te.tipo === "tramo" ? te.resultado : null;
  const cifra = conSigno === null ? null : te.tipo === "cerrado" || te.tipo === "tramo" ? Math.abs(conSigno) : conSigno;

  return (
    <section className="fin-superficie fin-pad mes-a" data-guia="fin-resumen.mes">
      <TituloSeccion
        className="mes-a-cab"
        accion={
          provisional ? (
            <Chip tono="ambar" versalitas={false} title="Al número le faltan cosas por registrar: «Vendido por sede» dice cuáles.">
              Provisional
            </Chip>
          ) : undefined
        }
      >
        {titulo}
      </TituloSeccion>

      {noVende ? (
        <>
          <p className="bolsillos-etiqueta">{noVende.pregunta}</p>
          {noVende.valor === null ? (
            <p className="bolsillos-motivo">{noVende.motivo}</p>
          ) : (
            <p className="mes-a-cifra">
              <CifraAnimada valor={Math.round(noVende.valor)} formato="soles-redondo" />
            </p>
          )}
        </>
      ) : (
        <>
          <p className="bolsillos-etiqueta">{etiqueta}</p>
          {cifra === null ? (
            <p className="bolsillos-motivo">{te.tipo === "sin_dato" ? te.motivo : ""}</p>
          ) : (
            <p className={`mes-a-cifra ${conSigno !== null && conSigno < 0 ? "es-falta" : ""}`}>
              <CifraAnimada valor={Math.round(cifra)} formato="soles-redondo" />
            </p>
          )}
          <p className="mes-a-bajada">
            {te.tipo === "estimado" && (
              <>
                Si el mes sigue así, puede quedar entre <b className="num">{soles(te.rango[0])}</b> y <b className="num">{soles(te.rango[1])}</b>. Hasta hoy te deja{" "}
                <b className="num">{soles(te.hastaHoy)}</b>: faltan las ventas de {te.dias.total - te.dias.van === 1 ? "1 día" : `${te.dias.total - te.dias.van} días`}
                {te.faltaGastar > 0 ? <> y {soles(te.faltaGastar)} de gastos del mes que todavía no se registran</> : null}.
              </>
            )}
            {te.tipo === "sin_estimado" && te.motivo}
            {te.tipo === "cerrado" && te.porCien !== null && (te.porCien >= 0 ? `De cada S/\u00a0100 vendidos, ${te.porCien} quedaron de ganancia.` : `Por cada S/\u00a0100 vendidos faltaron S/\u00a0${-te.porCien} para pagar todo.`)}
            {te.tipo === "tramo" && "Lo que quedó en estas fechas, con lo registrado."}
          </p>
        </>
      )}

      <dl className="mes-a-tres">
        <div>
          <dt>Vendiste</dt>
          <dd className="num mes-a-monto">
            <Cifra hoja="ventas" hojas={hojas} onAbrir={onAbrir} etiqueta="Ver lo que vendió cada tienda">
              {soles(vendido)}
            </Cifra>
          </dd>
          {cambio && (
            <dd>
              <Delta cambio={cambio} />
            </dd>
          )}
        </div>
        <div>
          <dt>{te.tipo === "estimado" || te.tipo === "sin_estimado" ? "Gastos, hasta hoy" : "Gastaste"}</dt>
          <dd className="num mes-a-monto">
            <Cifra hoja="gastos" hojas={hojas} onAbrir={onAbrir} etiqueta="Ver en qué se va la plata">
              {soles(gastos)}
            </Cifra>
          </dd>
          {te.tipo === "estimado" && te.faltaGastar > 0 && <dd className="mes-a-nota">de {soles(gastos + te.faltaGastar)} del mes</dd>}
          {(te.tipo === "cerrado" || te.tipo === "tramo") && vendido > 0 && <dd className="mes-a-nota">{Math.round((gastos / vendido) * 100)} de cada S/&nbsp;100 vendidos</dd>}
        </div>
      </dl>

      {eq && eq.tipo === "ok" && (
        <div className="mes-a-eq" data-guia="fin-resumen.equilibrio">
          <p className="mes-a-eq-titular">{eq.titular}</p>
          <BarraAvance
            pct={Math.min(100, (eq.vendido / Math.max(eq.pe, 1)) * 100)}
            alto="normal"
            tono={eq.estado === "no_llega" ? "ambar" : undefined}
            marca={hoyEnElMes ? (hoyEnElMes.van / hoyEnElMes.total) * 100 : null}
            etiqueta="Cuánto de lo que hay que vender para pagar el mes ya está vendido"
            texto={`${soles(eq.vendido)} de ${soles(eq.pe)}`}
          />
          <p className="mes-a-nota">
            {eq.detalle}
            {hoyEnElMes ? ` La rayita marca hoy: día ${hoyEnElMes.van} de ${hoyEnElMes.total}.` : ""}
          </p>
        </div>
      )}
      {eq && eq.tipo !== "ok" && !noVende && <p className="mes-a-nota mes-a-eq">{eq.motivo}</p>}

      {(hrefGanancias || hojas.includes("deja")) && (
        <div className="mes-a-pie">
          {hojas.includes("deja") && (
            <button type="button" className="btn-cayla btn-enlace bolsillos-como" onClick={() => onAbrir("deja")} data-guia="fin-resumen.cuenta-del-mes">
              <CircleHelp aria-hidden className="h-3.5 w-3.5" />
              ¿Cómo se calcula?
            </button>
          )}
          {hrefGanancias && <EnlaceVer href={hrefGanancias}>Ganancias y pérdidas</EnlaceVer>}
        </div>
      )}
    </section>
  );
}
