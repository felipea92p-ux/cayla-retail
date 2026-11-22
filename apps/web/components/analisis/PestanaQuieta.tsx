"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { Check, Hourglass } from "lucide-react";
import { useAnalisis } from "@/components/analisis/contexto";
import { HojaLiquidarDesde } from "@/components/analisis/HojaLiquidarDesde";
import { nombreLargo, soles, TilePrenda, type Estado } from "@/components/analisis/piezas";
import { Respuesta, TarjetaPrenda, Tarjetas } from "@/components/analisis/Tarjetas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { queTiene, type ModeloAnalisis } from "@/lib/analisis-modelo";
import { DIAS_TRES_MESES, LIQUIDAR_MAX, LIQUIDAR_MIN, LIQUIDAR_PASO, plural, sedeQueMasVende, totalEnTienda } from "@/lib/analisis-reglas";
import { ERROR_DIAS_LIQUIDAR, leerDiasLiquidar, pasoLiquidar } from "@/lib/analisis-liquidar-reglas";
import { hrefEnviar, hrefRegistrarVentas } from "@/lib/analisis-acciones";
import { ordenarQuietas } from "@/lib/analisis-orden";
import {
  destinoDeTodas,
  ETIQUETA_LIQUIDAR_DESDE,
  gruposQuietas,
  lineaTodaviaNoQuietas,
  notaDeUmbrales,
  plataParada,
  TEXTO_VACIO_QUIETAS,
  vacioQuietas,
  type VacioQuietas,
} from "@/lib/analisis-quietas";

// Análisis, cara B (ADR-0357, act. 2026-11-21): «No se vende». Solo dice lo que no se vende y cuánta plata tiene parada; qué hacer lo
// decide quien mira (Felipe 2026-11-21: «hay que quitar el liquidar, basta con que aparezca lo que no se vende, así el usuario decide»).
// Arriba, la respuesta: la plata parada en lo que no se vende. Debajo, en secciones: lo que no se vende, lo que en otra tienda sí se vende
// (con «Mandar»), lo que puede ya haberse vendido (con «Registrar ventas») y lo que va lento. Cada modelo es una tarjeta: días sin
// venderse (rojo desde 3 meses), cuántas tienes y su plata parada. «Sin venderse desde … días» sigue moviendo las tarjetas EN VIVO y se
// guarda para todos en su hoja (`HojaLiquidarDesde`). Análisis no guarda nada por su cuenta (ADR-0245).

export function PestanaQuieta() {
  const { datos, acceso, prendas, liquidarDesde, orden, abrirFicha } = useAnalisis();
  const [guardar, setGuardar] = useState(false);
  const router = useRouter();

  const vacio = vacioQuietas(datos.prendas, liquidarDesde, datos.fallas.length, datos.hoy);
  if (vacio === "sin-datos") return <SinNada tipo={vacio} />;

  const g = gruposQuietas(prendas, liquidarDesde);
  const [noSeVenden, mandar, duda, lentas] = [g.liquidar, g.enviar, g.duda, g.vigila].map((ms) => ordenarQuietas(ms, orden.nose));
  // La respuesta cuenta lo mismo que la pestaña: lo que no se vende y lo que en otra tienda sí (`GRUPOS_QUIETAS`).
  const cuentan = [...noSeVenden, ...mandar];
  const parada = cuentan.reduce((t, m) => t + (plataParada(m) ?? 0), 0);
  const sinCosto = cuentan.filter((m) => plataParada(m) === null).length;
  const hayAlgo = cuentan.length + duda.length + lentas.length > 0;
  const control = <UmbralDias abrirGuardar={() => setGuardar(true)} />;

  return (
    <>
      {vacio ? (
        <section className="tarjeta bloque entra" style={{ ["--i" as string]: 3 }}>
          <div className="mb-2 flex flex-wrap items-center justify-end gap-3">{control}</div>
          <Vacio icono={vacio === "todavia-no" ? <Hourglass /> : <Check />} titulo={TEXTO_VACIO_QUIETAS[vacio].titulo}>
            {vacio === "todavia-no" ? lineaTodaviaNoQuietas(datos.prendas, liquidarDesde) : TEXTO_VACIO_QUIETAS[vacio].linea}
          </Vacio>
        </section>
      ) : (
        <Respuesta
          guia="analisis.nose-respuesta"
          est="ate"
          {...(parada > 0 ? { cifra: soles(parada) } : { cuenta: cuentan.length, cifra: plural(cuentan.length, "modelo", "modelos") })}
          frase={
            parada > 0
              ? `parados en ${cuentan.length} ${plural(cuentan.length, "modelo que no se vende", "modelos que no se venden")}`
              : plural(cuentan.length, "no se vende", "no se venden")
          }
          ayuda={sinCosto > 0 ? `${sinCosto} ${plural(sinCosto, "modelo no tiene", "modelos no tienen")} costo: no suman a la plata parada.` : undefined}
          acciones={
            acceso.frescura ? (
              // En palabras de tienda: «Frescura del piso» es el nombre del módulo y la prueba ciega no lo entendió (/formidable, 2026-11-21).
              // El nombre del módulo queda en el globito, para quien lo busca en el menú.
              <BotonVer href="/gestion/frescura" chico title="Abre Gestión ▸ Frescura del piso">
                Ver todo el piso
              </BotonVer>
            ) : undefined
          }
        />
      )}

      {!vacio && !hayAlgo && (
        <section className="tarjeta entra" style={{ ["--i" as string]: 4 }}>
          <Vacio tamano="chico" icono={<Check />}>
            Con estos filtros no hay ninguno aquí.
          </Vacio>
        </section>
      )}

      {!vacio && noSeVenden.length > 0 && (
        <Seccion
          guia="analisis.nose-tarjetas"
          titulo="No se venden"
          lista={noSeVenden}
          ayuda={notaDeUmbrales(datos.prendas, datos.frescura)}
          dato={resumen(noSeVenden)}
          extra={control}
          tono={(m) => ((m.diasSinVender ?? 0) >= DIAS_TRES_MESES ? "urg" : "ate")}
          abrirFicha={abrirFicha}
        />
      )}
      {!vacio && noSeVenden.length === 0 && hayAlgo && <div className="flex justify-end">{control}</div>}

      {mandar.length > 0 && <SeccionMandar lista={mandar} />}

      {duda.length > 0 && (
        <Seccion
          titulo="Puede que ya se vendieron"
          lista={duda}
          ayuda="Hay una venta anotada en caja de su tipo, talla y color que nadie registró. Regístrala antes de decidir qué hacer con ellas."
          accion={<RegistrarVentas />}
          tono={() => "info"}
          abrirFicha={abrirFicha}
        />
      )}

      {lentas.length > 0 && (
        <Seccion
          titulo="Van lentas"
          lista={lentas}
          ayuda="Llevan sin venderse más de lo que tardan 3 de cada 4 de su tipo (si su tipo todavía no tiene ritmo, un mes), pero todavía no tanto como lo que no se vende."
          tono={() => "nd"}
          abrirFicha={abrirFicha}
        />
      )}

      {/* La hoja se cierra sola (con su salida) después de guardar: aquí solo se vuelve a leer el valor guardado. */}
      {guardar && <HojaLiquidarDesde dias={liquidarDesde} onCerrar={() => setGuardar(false)} onGuardado={() => router.refresh()} />}
    </>
  );
}

/** «18 prendas · S/ 1,332 parados»: lo que resume una sección. */
function resumen(ms: readonly ModeloAnalisis[]): ReactNode {
  const unidades = ms.reduce((t, m) => t + totalEnTienda(m), 0);
  const parada = ms.reduce((t, m) => t + (plataParada(m) ?? 0), 0);
  return (
    <>
      <b>{unidades.toLocaleString("es-PE")}</b> {plural(unidades, "prenda", "prendas")}
      {parada > 0 && (
        <>
          {" · "}
          <b>{soles(parada)}</b> parados
        </>
      )}
    </>
  );
}

/** La línea de una tarjeta de lo quieto: cuántas tienes y su plata parada (si se sabe su costo). */
function detalleQuieta(m: ModeloAnalisis): string {
  const parada = plataParada(m);
  return `Tienes ${totalEnTienda(m)}${parada ? ` · ${soles(parada)} parados` : ""}`;
}

/** «Registrar ventas»: la cola de ventas sin su prenda, si la cuenta la ve. */
function RegistrarVentas() {
  const { acceso } = useAnalisis();
  const href = hrefRegistrarVentas(acceso);
  return href ? (
    <BotonVer href={href} chico>
      Registrar ventas
    </BotonVer>
  ) : null;
}

/** Una sección de lo quieto: su título (con cuántos, lo que resume y su «?») y una tarjeta por modelo. */
function Seccion({
  titulo,
  lista,
  ayuda,
  dato,
  accion,
  extra,
  tono,
  abrirFicha,
  guia,
  detalle = detalleQuieta,
  acciones,
}: {
  titulo: string;
  lista: ModeloAnalisis[];
  ayuda?: string;
  dato?: ReactNode;
  accion?: ReactNode;
  /** Lo que va bajo el título (el control de días). */
  extra?: ReactNode;
  tono: (m: ModeloAnalisis) => Estado;
  abrirFicha: (id: string) => void;
  guia?: string;
  detalle?: (m: ModeloAnalisis) => string;
  acciones?: (m: ModeloAnalisis) => ReactNode;
}) {
  return (
    <section className="entra flex flex-col gap-4" style={{ ["--i" as string]: 4 }} data-guia={guia}>
      <TituloSeccion cuenta={lista.length} ayuda={ayuda} dato={dato} accion={accion}>
        {titulo}
      </TituloSeccion>
      {extra && <div className="-mt-2 flex flex-wrap items-center gap-3">{extra}</div>}
      <Tarjetas>
        {lista.map((m, k) => (
          <TarjetaPrenda
            key={m.varianteId}
            i={5 + k}
            miniatura={<TilePrenda prenda={m} tamano={72} />}
            nombre={m.nombre}
            que={queTiene(m)}
            numero={String(m.diasSinVender ?? 0)}
            unidad={plural(m.diasSinVender ?? 0, "día sin venderse", "días sin venderse")}
            est={tono(m)}
            detalle={detalle(m)}
            acciones={acciones?.(m)}
            etiqueta={`${nombreLargo(m)}: ${m.diasSinVender ?? 0} días sin venderse. ${detalle(m)}. Enter abre su ficha.`}
            onAbrir={() => abrirFicha(m.varianteId)}
          />
        ))}
      </Tarjetas>
    </section>
  );
}

/** Lo que aquí no se vende pero en otra tienda sí: «Mandar» a la que más lo vende, y «Mandar todas» si van todas a la misma. */
function SeccionMandar({ lista }: { lista: ModeloAnalisis[] }) {
  const { acceso, sedeDe, abrirFicha } = useAnalisis();
  const destino = destinoDeTodas(lista);
  const ciudad = destino ? sedeDe(destino)?.ciudad : undefined;
  const todas = destino ? hrefEnviar(lista, { id: destino }, acceso) : null;
  const vende = (m: ModeloAnalisis) => {
    const v = sedeQueMasVende(m.otras);
    return v ? { ...v, ciudad: sedeDe(v.sedeId)?.ciudad ?? "otra tienda" } : null;
  };
  return (
    <Seccion
      guia="analisis.nose-mandar"
      titulo={ciudad ? `En ${ciudad} sí se venden` : "En otra tienda sí se venden"}
      lista={lista}
      ayuda="Aquí no se venden, y en otra tienda se vendieron este mes."
      accion={
        todas ? (
          <BotonVer href={todas} chico etiqueta={`Mandar todas a ${ciudad}`}>
            Mandar todas
          </BotonVer>
        ) : undefined
      }
      tono={() => "ate"}
      abrirFicha={abrirFicha}
      detalle={(m) => {
        const v = vende(m);
        return v ? `${v.ciudad} vendió ${v.vendidas30} este mes · tienes ${totalEnTienda(m)}` : detalleQuieta(m);
      }}
      acciones={(m) => {
        const v = vende(m);
        const href = v ? hrefEnviar([m], { id: v.sedeId }, acceso) : null;
        return href && v ? (
          <BotonVer href={href} chico etiqueta={`Mandar a ${v.ciudad}: ${nombreLargo(m)}`}>
            Mandar a {v.ciudad}
          </BotonVer>
        ) : null;
      }}
    />
  );
}

/**
 * «Sin venderse desde [− 60 +] días»: los días de la caja de los tipos que todavía no tienen ritmo propio (Felipe, 2026-10-07: sin barra
 * y sin tope, de 1 a 999). Lo escrito mueve las tarjetas EN VIVO; si queda distinto de lo guardado, aparece «Guardar para todos», que abre
 * su hoja. Las flechas ↑ ↓ suman o restan de a un día.
 */
function UmbralDias({ abrirGuardar }: { abrirGuardar: () => void }) {
  const { datos, liquidarDesde, setLiquidarDesde } = useAnalisis();
  const id = useId();
  // Lo escrito puede quedar a medio escribir («1» camino a «15»). Sigue al valor de afuera cuando este cambia por otro lado.
  const [texto, setTexto] = useState(String(liquidarDesde));
  const [textoDe, setTextoDe] = useState(liquidarDesde);
  if (textoDe !== liquidarDesde) {
    setTextoDe(liquidarDesde);
    if (leerDiasLiquidar(texto) !== liquidarDesde) setTexto(String(liquidarDesde));
  }
  const error = leerDiasLiquidar(texto) === null;
  const escribir = (v: string) => {
    setTexto(v);
    const n = leerDiasLiquidar(v);
    if (n !== null) setLiquidarDesde(n);
  };
  const mover = (delta: number) => {
    const n = pasoLiquidar(leerDiasLiquidar(texto) ?? liquidarDesde, delta);
    setTexto(String(n));
    setLiquidarDesde(n);
  };
  return (
    <span className="umbral" data-guia="analisis.nose-umbral">
      <label htmlFor={id}>{ETIQUETA_LIQUIDAR_DESDE}</label>
      <span className="paso-dias">
        <button type="button" aria-label={`${LIQUIDAR_PASO} días menos`} disabled={liquidarDesde <= LIQUIDAR_MIN} onClick={() => mover(-LIQUIDAR_PASO)}>
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => escribir(e.target.value)}
          onBlur={() => {
            if (error) setTexto(String(liquidarDesde));
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            mover(e.key === "ArrowUp" ? 1 : -1);
          }}
        />
        <button type="button" aria-label={`${LIQUIDAR_PASO} días más`} disabled={liquidarDesde >= LIQUIDAR_MAX} onClick={() => mover(LIQUIDAR_PASO)}>
          +
        </button>
      </span>
      <span>días</span>
      {error && (
        <span id={`${id}-error`} className="umbral-error" role="alert">
          {ERROR_DIAS_LIQUIDAR}
        </span>
      )}
      {liquidarDesde !== datos.liquidarDesde && (
        <button type="button" className="btn-cayla btn-secundario btn-chico" onClick={abrirGuardar}>
          Guardar para todos
        </button>
      )}
    </span>
  );
}

/** No se pudieron leer las prendas: un aviso de error, nunca «todo se mueve» por una falla. */
function SinNada({ tipo }: { tipo: VacioQuietas }) {
  return (
    <Aviso tono="error" titulo={TEXTO_VACIO_QUIETAS[tipo].titulo}>
      {TEXTO_VACIO_QUIETAS[tipo].linea}
    </Aviso>
  );
}
