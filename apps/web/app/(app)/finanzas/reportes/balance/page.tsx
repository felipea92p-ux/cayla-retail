import { exigirModulo, veEstadosFinancierosDeTodoDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { situacion, type UnidadBalance } from "@/lib/balance-reglas";
import { getBalanceGeneral, getBalancePorTienda, getConciliacion, getSaldosIniciales } from "@/lib/balance";
import { BalancePanel, MasDeLaSede, MasDelBalance } from "@/components/finanzas/BalancePanel";
import { hrefTelar, mesDelDia, sedeDeLaUrl } from "@/lib/finanzas-telar-reglas";
import { mesDe, rangoMes } from "@/lib/gastos-reglas";
import { getEstadoResultados } from "@/lib/resultados";
import { getParametrosFinanzas } from "@/lib/configuracion";
import { mesAnterior } from "@/lib/resultados-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { gruposDelBalance, medidores, recomendacionesVale } from "@/lib/vale-reglas";
import {
  cortesAnteriores,
  etiquetaDelCorte,
  ladosDeLaSede,
  ladosDelBalance,
  lecturaDeLaSede,
  lecturaDelBalance,
  partesDeLaSede,
  partesDelBalance,
  totalesDelBalance,
} from "@/lib/estados-balance";
import { textoDeVerMas } from "@/lib/estados-partes";
import { leerPeriodo } from "@/lib/estados-periodo";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";
import { Store } from "lucide-react";
import { Recomendaciones } from "@/components/finanzas/estados/Recomendaciones";
import { CabeceraEstados } from "@/components/finanzas/estados/CabeceraEstados";
import { EcuacionDelBalance } from "@/components/finanzas/estados/EcuacionDelBalance";
import { EstadoVidrio } from "@/components/finanzas/estados/EstadoVidrio";
import { MasDelEstado } from "@/components/finanzas/estados/MasDelEstado";
import { TubosDelBalance } from "@/components/finanzas/estados/TubosDelBalance";
import { formaDe, paramsDe } from "@/lib/estados-financieros-reglas";

// Finanzas ▸ Estados financieros ▸ Balance general (ADR-0195 F7, ADR-0585, ADR-0611). La fecha es la del calendario de arriba, la misma `hasta` de los otros tres estados (`?corte=`, el
// nombre viejo, se sigue entendiendo). Lee en el servidor, a la vez: la comprobación, el Balance y lo de cada tienda a esa fecha y en los dos cierres de antes (con los que se compara, solo
// si también cuadraron). Quien ve todo (ADR-0585) ve CAYLA entera o, con `?sede=<tienda>`, lo que es de una tienda; una terminal con el módulo, lo de SU tienda (lo decide la base). El Balance
// se dibuja solo si cuadra (ADR-0198): si no, la comprobación y la guía de qué falta. Los saldos de arranque los registra el líder.
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ corte?: string; desde?: string; hasta?: string; ver?: string; sede?: string; mes?: string; forma?: string }> }) {
  const persona = await exigirModulo("reportes_financieros");
  const sp = await searchParams;
  const hoy = hoyLima();
  const periodo = leerPeriodo(sp, hoy);
  const { mes, hasta: corte } = periodo;
  const esLider = persona.rol === "lider";
  const veTodo = veEstadosFinancierosDeTodoDe(persona);
  // «Todas las sedes» de la barra del telar es lo que aquí se llama «cayla» (el Balance de CAYLA entera).
  const pedida = sedeDeLaUrl(sp);
  // «Empresa» no tiene un Balance aparte: es el de CAYLA entera.
  const ver = veTodo ? (pedida !== "cayla" && pedida !== "todas" && pedida !== "empresa" ? pedida : "cayla") : persona.ubicacionId;
  const params = paramsDe(sp);
  const forma = formaDe(sp.forma);
  const cabecera = <CabeceraEstados pantalla="vale" mes={mes} sede={veTodo ? pedida : (persona.ubicacionId ?? "todas")} hoy={hoy} params={params} forma={forma} />;

  const href = (ruta: string, otra?: string) => hrefTelar(ruta, params, otra ? { sede: otra } : {}, { mismaPantalla: false, mesDeHoy: mesDelDia(hoy) });
  const deUnaSede = !veTodo || ver !== "cayla";
  const base = rangoMes(mesAnterior(mesDe(hoy)));
  const parametros = await getParametrosFinanzas();
  const cortes = cortesAnteriores(corte, parametros?.inicioFinanzas ?? null);

  const [chequeos, lineas, unidades, saldos, erBase, anteriores] = await Promise.all([
    deUnaSede ? Promise.resolve({ datos: [], falla: null }) : getConciliacion(corte),
    deUnaSede ? Promise.resolve({ datos: [], falla: null }) : getBalanceGeneral(corte),
    getBalancePorTienda(corte),
    deUnaSede ? Promise.resolve({ datos: [], falla: null }) : getSaldosIniciales(),
    // Para cuántos meses de venta alcanza la mercadería: lo que costó lo vendido en el último mes completo (CAYLA). Apoyo: sin él, el
    // medidor dice que falta un mes con ventas.
    deUnaSede ? Promise.resolve(null) : getEstadoResultados(base.desde, base.hasta),
    // Con qué se compara: un cierre que no cuadró no se usa. Si no se puede leer, la pantalla sale sin comparar.
    Promise.all(
      cortes.map(async (c) => {
        if (deUnaSede) return { etiqueta: c.etiqueta, grupos: null, unidades: (await getBalancePorTienda(c.corte)).datos };
        const [ch, li] = await Promise.all([getConciliacion(c.corte), getBalanceGeneral(c.corte)]);
        const sirve = !ch.falla && !li.falla && li.datos.length > 0 && situacion(ch.datos).tipo === "cuadra";
        return { etiqueta: c.etiqueta, grupos: sirve ? gruposDelBalance(li.datos) : null, unidades: [] as UnidadBalance[] };
      }),
    ),
  ]);
  const costoDelMes = erBase && !erBase.falla ? (erBase.datos.find((f) => f.unidad === "consolidado")?.costo ?? null) : null;
  const cuadra = deUnaSede ? null : situacion(chequeos.datos).tipo === "cuadra";
  const grupos = cuadra ? gruposDelBalance(lineas.datos) : [];
  const medidas = cuadra ? medidores(grupos, costoDelMes) : null;
  const recomendaciones = recomendacionesVale({ cuadra, medidas, unidades: unidades.datos, sede: deUnaSede ? ver : null, href });
  const unidad = deUnaSede ? (unidades.datos.find((u) => u.ubicacionId === ver) ?? unidades.datos[0] ?? null) : null;
  const fallas = [chequeos.falla, lineas.falla, unidades.falla, saldos.falla].filter((f): f is string => !!f);
  const etiquetaActual = etiquetaDelCorte(corte);
  const conVidrio = forma === "respuesta" && (deUnaSede ? !!unidad : !!cuadra);

  return (
    <div className="space-y-4">
      {cabecera}
      {forma === "respuesta" && fallas.map((f) => <Aviso key={f} tono="error">{f}</Aviso>)}
      {conVidrio && !deUnaSede && (() => {
        const partes = partesDelBalance({ grupos, comparadas: anteriores, etiquetaActual, corte });
        const t = totalesDelBalance(grupos);
        const delLado = (lado: "tiene" | "debe" | "tuyo") => partes.filter((p) => grupos.find((g) => g.clave === p.clave)?.lado === lado);
        return (
          <EstadoVidrio
            nombre={`Balance general · ${periodo.al}`}
            lectura={lecturaDelBalance(grupos, anteriores.at(-1)?.grupos ?? null, corte)}
            grafico={
              <TubosDelBalance
                guia="fin-vale.tubos"
                arriba={{ rotulo: "Lo que tienes", cifra: soles(t.tiene), partes: delLado("tiene") }}
                abajo={{ rotulo: "Lo que debes y lo que es tuyo", cifra: `${soles(t.debe)} + ${soles(t.tuyo)}`, partes: [...delLado("debe"), ...delLado("tuyo")] }}
                huecos={["tuyo"]}
              />
            }
            conAire
            guiaRespuesta="fin-vale.respuesta"
            guiaPartes="fin-vale.partes"
            guiaLibro="fin-vale.libro"
            titulo="En qué está y a quién se le debe"
            partes={partes}
            columnasDeTarjetas={4}
            tituloColumnas="Mes a mes"
            libro={{ titulo: "Balance general", detalle: `${periodo.al} · en soles · formato del contador`, lados: ladosDelBalance(grupos) }}
            pieDeLibro={<EcuacionDelBalance tiene={t.tiene} debe={t.debe} tuyo={t.tuyo} dicho="Activo = Pasivo + Patrimonio: cuadra" />}
          />
        );
      })()}
      {conVidrio && deUnaSede && unidad && (() => {
        const comparadas = anteriores.map((c) => ({ etiqueta: c.etiqueta, unidad: c.unidades.find((u) => u.ubicacionId === unidad.ubicacionId) ?? null }));
        const partes = partesDeLaSede({ unidad, comparadas, etiquetaActual, corte });
        const de = (...claves: string[]) => partes.filter((p) => claves.includes(p.clave));
        const tiene = (unidad.caja ?? 0) + unidad.mercaderia + unidad.activosFijos;
        return (
          <EstadoVidrio
            nombre={`${unidad.nombre} · ${periodo.al}`}
            lectura={lecturaDeLaSede(unidad, comparadas.at(-1)?.unidad ?? null, corte)}
            grafico={
              <TubosDelBalance
                arriba={{ rotulo: "Lo que tiene", cifra: soles(tiene), partes: de("caja", "mercaderia", "equipos") }}
                abajo={{ rotulo: "Lo que debe y lo invertido", cifra: `${soles(unidad.facturasPorPagar)} + ${soles(unidad.invertido)}`, partes: de("facturas", "invertido") }}
                huecos={["invertido"]}
              />
            }
            conAire
            guiaRespuesta="fin-balance.tienda-respuesta"
            guiaPartes="fin-balance.tienda-partes"
            guiaLibro="fin-balance.tienda-libro"
            titulo="En qué está y a quién se le debe"
            partes={partes}
            columnasDeTarjetas={4}
            tituloColumnas="Mes a mes"
            libro={{ titulo: unidad.nombre, detalle: `${periodo.al} · en soles`, lados: ladosDeLaSede(unidad) }}
          />
        );
      })()}
      {forma === "respuesta" && deUnaSede && !unidad && (
        <Vacio icono={<Store />} titulo="No hay una tienda que mostrar">
          Lo que es de una tienda se ve desde su sede. Si trabajas en una, elígela arriba.
        </Vacio>
      )}
      {!conVidrio && !(forma === "respuesta" && deUnaSede) && (
        <BalancePanel esLider={esLider} hoy={hoy} corte={corte} chequeos={chequeos.datos} lineas={lineas.datos} unidades={unidades.datos} saldos={saldos.datos} fallas={forma === "respuesta" ? [] : fallas} />
      )}
      <Recomendaciones recomendaciones={recomendaciones} />
      {conVidrio && !deUnaSede && (
        <MasDelEstado texto={textoDeVerMas(["dos preguntas que importan", "lo de cada sede", "cómo se comprobó"])!} guia="fin-vale.mas">
          <MasDelBalance esLider={esLider} hoy={hoy} chequeos={chequeos.datos} unidades={unidades.datos} saldos={saldos.datos} medidas={medidas} />
        </MasDelEstado>
      )}
      {conVidrio && deUnaSede && unidad && (
        <MasDelEstado texto={textoDeVerMas(["cómo le fue en el mes"])!} guia="fin-balance.tienda-mas">
          <MasDeLaSede unidad={unidad} hoy={hoy} veTodo={veTodo} />
        </MasDelEstado>
      )}
    </div>
  );
}
