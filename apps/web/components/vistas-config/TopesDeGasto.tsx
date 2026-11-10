"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Desplegable } from "@/components/ui/campos";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Modal } from "@/components/ui/Modal";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Casilla, type Guardar } from "@/components/ConfiguracionCasilla";
import { mesDe, solesRedondo } from "@/lib/gastos-reglas";
import { mesConTopes } from "@/lib/gastos-config-reglas";
import { mesAnterior, mesNombre, mesTitulo } from "@/lib/resultados-reglas";
import {
  cambiosDePropuesta,
  claveCelda,
  leerPropuesta,
  lotePropuesta,
  mesesParaPresupuestar,
  nombreCortoPpto,
  parsearTope,
  textoOrigen,
  textoMetaVentasTopes,
  textoTope,
  type ConfigPpto,
  type OrigenPropuesta,
  type PropuestaFila,
  type UnidadConfigPpto,
} from "@/lib/presupuesto-reglas";

// Configuración ▸ Gastos ▸ Topes (ADR-0195, capa «para decidir»; Felipe 2026-11-05): una unidad a la vez en vez de una tabla de 12 rubros por 4 unidades, y un mes vacío pide partir de
// algo. CADA CASILLA SE GUARDA SOLA al salir de ella, firmada con el responsable. La meta de ventas NO se escribe aquí: es la suma de las metas del día. «Copiar de…» y «Sugerir…»
// PROPONEN (la base no guarda nada) y lo propuesto se ve en una hoja; recién al confirmar se guarda de una vez.

const nombreColumna = (u: UnidadConfigPpto) => (u.unidad === "tienda" ? nombreCortoPpto(u.nombre) : u.nombre);

export function TopesDeGasto({ datos, hoy, guardar, guardando, responsable }: { datos: ConfigPpto; hoy: string; guardar: Guardar; guardando: boolean; responsable: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [propuesta, setPropuesta] = useState<{ origen: OrigenPropuesta; filas: PropuestaFila[]; desde: string; hasta: string } | null>(null);
  const [proponiendo, setProponiendo] = useState<OrigenPropuesta | null>(null);
  const [unidadId, setUnidadId] = useState<string | null | undefined>(undefined);
  const [aMano, setAMano] = useState<string | null>(null);
  const mes = datos.mes;
  const unidad = datos.unidades.find((u) => u.id === unidadId) ?? datos.unidades[0];

  async function guardarCasilla(u: UnidadConfigPpto, cuenta: string, rubro: string, nuevo: string) {
    const v = parsearTope(nuevo);
    if (!v.ok) {
      avisar.error(`${rubro}, ${u.nombre}: ${v.error}`);
      return false;
    }
    return guardar(
      () => createClient().rpc("guardar_presupuesto" as never, { p_mes: `${mes}-01`, p_ubicacion_id: u.id, p_cuenta: cuenta, p_monto: v.valor } as never),
      "guardar el tope",
      `${rubro} de ${u.nombre} en ${mesNombre(mes)}: ${v.valor === null ? "sin tope" : `tope de ${solesRedondo(v.valor)}`}.`,
    );
  }

  async function proponer(origen: OrigenPropuesta) {
    setProponiendo(origen);
    const { data, error } = await createClient().rpc("fn_presupuesto_propuesta" as never, { p_mes: `${mes}-01`, p_origen: origen } as never);
    setProponiendo(null);
    if (error) {
      avisar.error(traducirError(error as never, "preparar la propuesta", { lectura: true }));
      return;
    }
    const filas = (data ?? []) as Record<string, unknown>[];
    setPropuesta({ origen, filas: filas.map(leerPropuesta), desde: String(filas[0]?.desde ?? ""), hasta: String(filas[0]?.hasta ?? "") });
  }

  const ir = (m: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("mes", m);
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  const botonSugerir = (peso: "primario" | "fantasma", chico: boolean) => (
    <Boton peso={peso} cargando={proponiendo === "promedio_3_meses"} textoCargando="Preparando…" type="button" className={chico ? "btn-chico" : undefined} onClick={() => proponer("promedio_3_meses")} disabled={!!proponiendo} aria-haspopup="dialog" data-guia="config.presupuesto-sugerir">
      {textoOrigen("promedio_3_meses", mes)}
    </Boton>
  );
  const botonCopiar = (chico: boolean) =>
    datos.anterior > 0 ? (
      <Boton peso="fantasma" cargando={proponiendo === "mes_anterior"} textoCargando="Preparando…" type="button" className={chico ? "btn-chico" : undefined} onClick={() => proponer("mes_anterior")} disabled={!!proponiendo}>
        {textoOrigen("mes_anterior", mes)}
      </Boton>
    ) : null;

  const vacio = !mesConTopes(datos) && aMano !== mes;

  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.presupuesto" style={{ "--e": 1 } as CSSProperties}>
      <TituloSeccion
        ayuda="Cuánto puede gastar cada unidad en cada rubro, mes por mes. Vacío es sin tope. Los topes son sin IGV, como el Estado de resultados. La planilla no lleva tope aquí: la decide Dynamic. Y la meta de ventas no se escribe aquí: sale de Metas, y va con IGV."
        accion={
          <span className="cv-par flex-wrap">
            {!vacio && datos.unidades.map((u) => (
              <button key={u.id ?? "empresa"} type="button" className="pildora-cayla" aria-pressed={u === unidad} onClick={() => setUnidadId(u.id)}>
                {nombreColumna(u)}
              </button>
            ))}
            <Desplegable forma="campo" className="cv-combo cv-mes-combo" etiquetaAccesible="Mes de los topes" valor={mes} onValor={ir} opciones={mesesParaPresupuestar(hoy).map((m) => ({ valor: m, texto: `${mesTitulo(m)}${m === mesDe(hoy) ? " · este mes" : ""}` }))} />
          </span>
        }
      >
        Topes de gasto
      </TituloSeccion>
      {!unidad || !datos.lineas.length ? (
        <Vacio tamano="chico" icono={<BarChart3 />} titulo="No hay unidades ni rubros de gasto para presupuestar" />
      ) : vacio ? (
        <Vacio
          icono={<BarChart3 />}
          titulo={`${mesTitulo(mes)} todavía no tiene topes`}
          acciones={
            <>
              {botonSugerir("primario", false)}
              {botonCopiar(false)}
              <Boton peso="fantasma" type="button" onClick={() => setAMano(mes)}>
                Escribirlos a mano
              </Boton>
            </>
          }
        >
          Lo más rápido es partir de lo que ya se gastó.
        </Vacio>
      ) : (
        <>
          <div className="cv-tarjetas">
            {datos.lineas.map((l, i) => (
              <div key={l.cuenta} className="cv-fila cv-tope" title={l.ejemplos || undefined} style={{ "--i": i } as CSSProperties}>
                <span className="cv-frase">{l.nombre}</span>
                <Casilla valor={textoTope(datos.montos[claveCelda(unidad.id, l.cuenta)])} etiqueta={`Tope de ${l.nombre} de ${unidad.nombre} en ${mesNombre(mes)}`} ancho="w-24" alGuardar={(n) => guardarCasilla(unidad, l.cuenta, l.nombre, n)} />
              </div>
            ))}
          </div>
          <div className="cv-pie-bloque">
            <span className="cv-par flex-wrap">
              {botonSugerir("fantasma", true)}
              {botonCopiar(true)}
            </span>
            <span className="cv-par flex-wrap">
              {unidad.unidad === "tienda" && (
                <Link href="/configuracion?tab=metas" className="btn-enlace" title="Se cambia en Metas">
                  {textoMetaVentasTopes(unidad.metaVentas)}
                </Link>
              )}
              <EnlaceVer href={`/finanzas/reportes?mes=${mes}`}>Ver lo gastado</EnlaceVer>
            </span>
          </div>
        </>
      )}
      {propuesta && (
        <HojaPropuesta
          propuesta={propuesta}
          datos={datos}
          guardando={guardando}
          responsable={responsable}
          onCerrar={() => setPropuesta(null)}
          onAplicar={async () => {
            const lote = lotePropuesta(propuesta.filas);
            const ok = await guardar(
              () => createClient().rpc("guardar_presupuesto_lote" as never, { p_mes: `${mes}-01`, p_filas: lote, p_origen: propuesta.origen } as never),
              "aplicar la propuesta",
              (n) => `Listo: ${Number(n ?? lote.length)} ${Number(n ?? lote.length) === 1 ? "tope cambió" : "topes cambiaron"} en ${mesNombre(mes)}.`,
            );
            if (ok) setPropuesta(null);
          }}
        />
      )}
    </section>
  );
}

/** Lo propuesto, antes de guardarlo: cada casilla que cambia con su antes y su después. */
function HojaPropuesta({
  propuesta,
  datos,
  guardando,
  responsable,
  onCerrar,
  onAplicar,
}: {
  propuesta: { origen: OrigenPropuesta; filas: PropuestaFila[]; desde: string; hasta: string };
  datos: ConfigPpto;
  guardando: boolean;
  responsable: React.ReactNode;
  onCerrar: () => void;
  onAplicar: () => void;
}) {
  const cambios = cambiosDePropuesta(propuesta.filas);
  const unidad = (id: string | null) => datos.unidades.find((u) => u.id === id)?.nombre ?? (id ? "Otra ubicación" : "De la empresa");
  const rubro = (cuenta: string) => datos.lineas.find((l) => l.cuenta === cuenta)?.nombre ?? `Cuenta ${cuenta}`;
  const deDonde =
    propuesta.origen === "mes_anterior"
      ? `Los topes de ${mesNombre(mesAnterior(datos.mes))}, tal cual.`
      : propuesta.desde
        ? `Lo gastado de ${mesNombre(propuesta.desde.slice(0, 7))} a ${mesNombre(propuesta.hasta.slice(0, 7))} (sin IGV), dividido entre 3 y redondeado hacia arriba a la decena.`
        : "Lo gastado en los 3 últimos meses completos, dividido entre 3.";
  return (
    // Una salida a la vista (ADR-0358, ronda 12): con cambios, «Cancelar» al pie; sin nada que cambiar, solo se lee y lleva la ×.
    <Modal variante="hoja" conCerrar={!cambios.length} titulo={textoOrigen(propuesta.origen, datos.mes)} subtitulo={deDonde} onClose={onCerrar} tamano="mediana">
      {cambios.length ? (
        <>
          <div className="fin-tabla-wrap" data-guia="config.propuesta">
            <table className="fin-tabla fin-tabla-hoja">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Rubro</th>
                  <th className="fin-num">Hoy</th>
                  <th className="fin-num">Propuesto</th>
                </tr>
              </thead>
              <tbody>
                {cambios.map((c) => (
                  <tr key={claveCelda(c.ubicacionId, c.cuenta)}>
                    <td data-l="Unidad">{unidad(c.ubicacionId)}</td>
                    <td data-l="Rubro">{rubro(c.cuenta)}</td>
                    <td className="fin-num" data-l="Hoy">
                      {c.actual === null ? <span className="fin-tenue">sin tope</span> : solesRedondo(c.actual)}
                    </td>
                    <td className="fin-num" data-l="Propuesto">
                      <b>{solesRedondo(c.propuesto)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-taupe">
            Nada se guardó todavía. Después puedes cambiar cualquier casilla.
          </p>
          <div className="mt-4">{responsable}</div>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-taupe" data-guia="config.propuesta">
          {propuesta.filas.length
            ? "Los topes de este mes ya son los que se proponen: no hay nada que cambiar."
            : propuesta.origen === "mes_anterior"
              ? `${mesTitulo(mesAnterior(datos.mes))} no tiene topes para copiar.`
              : "No hubo gastos en esos meses: no hay de dónde sugerir."}
        </p>
      )}
      {cambios.length > 0 && (
        <div className="fin-botones mt-4" data-guia="config.propuesta-botones">
          <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <Boton peso="primario" cargando={guardando} type="button" onClick={onAplicar} disabled={guardando}>
            {`Aplicar ${cambios.length} ${cambios.length === 1 ? "cambio" : "cambios"}`}
          </Boton>
        </div>
      )}
    </Modal>
  );
}
