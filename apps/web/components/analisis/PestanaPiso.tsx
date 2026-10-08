"use client";

import Link from "next/link";
import { useAnalisis } from "@/components/analisis/contexto";
import { Carril, type GrupoCarril } from "@/components/analisis/Carril";
import { Icono } from "@/components/analisis/iconos";
import { Ayuda, COLOR_ESTADO, nombreLargo, Numero, soles } from "@/components/analisis/piezas";
import { IconoCategoria } from "@/components/IconoCategoria";
import type { PrendaAnalisis } from "@/lib/analisis-tipos";
import { plural } from "@/lib/analisis-reglas";
import { hrefReponerPiso } from "@/lib/analisis-acciones";
import {
  AYUDA_TIPO_PISO,
  cifrasPiso,
  diasEnAlmacen,
  finEjePiso,
  lugarDeLoQueTienes,
  marcasEjePiso,
  modelosEnElPiso,
  nuncaSalio,
  PRENDAS_POR_TIPO_PISO,
  TEXTO_VACIO_PISO,
  textoVendidasTipo,
  tiposPiso,
  vacioPiso,
  type VacioPiso,
} from "@/lib/analisis-piso";
import { Vacio } from "@/components/ui/Vacio";
import { Check, Hourglass, Shirt } from "lucide-react";

// Análisis v4 (ADR-0357, act. 2026-10-07 b): «Nunca salió al piso», la pestaña que Felipe pidió al ver que «No se vende» mandaba a
// liquidar ropa guardada que nadie vio. Como la maqueta aprobada: arriba las cifras de toda la tienda y dónde está lo que tienes;
// abajo el carril «Días en el almacén», un grupo por tipo de prenda, empezando por el que más se vende, con «Bájalas al piso» (todo
// el tipo) y «Bajar» (una prenda), que abren Existencias ▸ Reponer a piso con ellas. La lógica pura vive en `lib/analisis-piso.ts`.
//
// Las cifras y la barra son de toda la tienda (como «No se vende»); el carril, de lo que deja ver el buscador. Si la base todavía no
// dice cuándo salió al piso cada prenda (`datos.sabePiso`), la pestaña lo dice y no inventa una lista.

const nf = (n: number): string => Math.round(n).toLocaleString("es-PE");

export function PestanaPiso() {
  const { datos, acceso, prendas, diasDeVentas } = useAnalisis();
  const sinSalir = datos.prendas.filter(nuncaSalio).length;
  const vacio = vacioPiso({ sabePiso: datos.sabePiso, prendas: datos.prendas.length, sinSalir, fallas: datos.fallas.length });
  if (vacio === "sin-saber" || vacio === "sin-datos") return <SinCarril tipo={vacio} />;

  const cifras = cifrasPiso(datos.prendas);
  const tipos = tiposPiso(datos.prendas, prendas, datos.hoy);
  const colgados = modelosEnElPiso(datos.prendas);
  const fin = finEjePiso(Math.max(0, ...tipos.flatMap((t) => t.prendas.map((p) => diasEnAlmacen(p, datos.hoy) ?? 0))));

  const grupos: GrupoCarril[] = tipos.map((t) => {
    const href = hrefReponerPiso(t.prendas, acceso);
    const cuantas = `${t.prendas.length} ${plural(t.prendas.length, "prenda", "prendas")}`;
    return {
      clave: `piso:${t.categoria}`,
      titulo: t.categoria,
      ayuda: AYUDA_TIPO_PISO,
      icono: "caja",
      dibujo: <IconoCategoria prefijo={t.prefijo} familia={(t.familia ?? null) as Parameters<typeof IconoCategoria>[0]["familia"]} className="h-4 w-4" />,
      est: "ate",
      prendas: t.prendas,
      detalle: `${nf(t.unidades)} ${plural(t.unidades, "unidad", "unidades")} · ${textoVendidasTipo(t.vendidas, diasDeVentas)}`,
      corte: PRENDAS_POR_TIPO_PISO,
      lote: href ? (
        <Link href={href} className="btn-cayla btn-secundario btn-s" aria-label={`Bájalas al piso: ${cuantas} de ${t.categoria}`}>
          <Icono nombre="piso" />
          Bájalas al piso
        </Link>
      ) : undefined,
    };
  });

  // La pista: los días que lleva en la tienda desde que llegó, sobre un eje de un mes (o de los meses que hagan falta).
  const pista = (p: PrendaAnalisis) => {
    const dias = diasEnAlmacen(p, datos.hoy);
    if (dias === null) {
      return (
        <span className="pista almacen">
          <b className="d" style={{ left: 7 }}>
            —
          </b>
        </span>
      );
    }
    const n = Math.min(dias, fin) / fin;
    const cifraALaIzquierda = n > 0.85;
    return (
      <span className="pista almacen">
        <i className="barra cx" style={{ ["--n" as string]: n }} />
        <span
          className="punto po"
          data-color-dato
          style={{ ["--n" as string]: n, ["--prenda" as string]: p.colorHex ?? "var(--color-grafico-neutro)", ["--c" as string]: COLOR_ESTADO.ate }}
        />
        <b className="d" style={cifraALaIzquierda ? { left: "auto", right: `calc(${(1 - n) * 100}% + 12px)` } : { left: `calc(${n * 100}% + 12px)` }}>
          {dias} d
        </b>
      </span>
    );
  };

  const pildoras = (p: PrendaAnalisis) => (
    <>
      <span className="pil">
        <b>{p.almacen}</b> en el almacén
      </span>
      {colgados.has(p.productoId) && <span className="pil modelo">El modelo ya está en el piso</span>}
    </>
  );

  const accion = (p: PrendaAnalisis) => {
    const href = hrefReponerPiso([p], acceso);
    return href ? (
      <Link href={href} className="btn-cayla btn-secundario btn-s" aria-label={`Bajar al piso: ${nombreLargo(p)}`}>
        Bajar
      </Link>
    ) : null;
  };

  return (
    <>
      <div className="dos d21">
        <section className="tarjeta bloque q-numeros entra" style={{ ["--i" as string]: 0 }}>
          <Numero
            valor={nf(cifras.prendas)}
            et={plural(cifras.prendas, "prenda sin salir al piso", "prendas sin salir al piso")}
            sub={`${nf(cifras.unidades)} ${plural(cifras.unidades, "unidad", "unidades")}, de ${nf(cifras.modelos)} ${plural(cifras.modelos, "modelo", "modelos")}`}
          />
          <Numero
            valor={cifras.costo === null ? "—" : soles(cifras.costo)}
            et={
              <>
                costaron
                {cifras.sinCosto > 0 && <Ayuda texto={`${cifras.sinCosto} ${plural(cifras.sinCosto, "no tiene", "no tienen")} costo guardado: no se cuentan aquí.`} />}
              </>
            }
            sub={`a precio de venta ${cifras.precioVenta === null ? "—" : soles(cifras.precioVenta)}`}
          />
          <Numero valor={nf(cifras.conModeloEnPiso)} et="son de un modelo que ya está en el piso" sub="en otra talla u otro color" />
        </section>
        <DondeEstaLoQueTienes />
      </div>

      {vacio === "todo-salio" ? (
        <section className="tarjeta carril entra" style={{ ["--i" as string]: 2 }}>
          <div className="c-cab">
            <h3 className="b-tit">Días en el almacén</h3>
          </div>
          <SinCarril tipo="todo-salio" dentro />
        </section>
      ) : (
        <Carril
          titulo="Días en el almacén"
          nota="Desde que llegaron a tu tienda · empieza por lo que más se vende"
          eje={marcasEjePiso(fin)}
          grupos={grupos}
          pista={pista}
          pildoras={pildoras}
          accion={accion}
        />
      )}
    </>
  );
}

/** «Dónde está lo que tienes»: las unidades libres de la tienda en el piso, guardadas que ya salieron y guardadas que nunca salieron. */
function DondeEstaLoQueTienes() {
  const { datos } = useAnalisis();
  const l = lugarDeLoQueTienes(datos.prendas);
  const tramos = [
    { clase: "p-piso", etiqueta: "En el piso", unidades: l.piso },
    { clase: "p-guardadas", etiqueta: "Guardadas, ya salieron", unidades: l.yaSalieron },
    { clase: "p-nunca", etiqueta: "Nunca salieron", unidades: l.nunca },
  ];
  const total = l.piso + l.yaSalieron + l.nunca;
  return (
    <section className="tarjeta bloque entra" style={{ ["--i" as string]: 1 }}>
      <div className="b-cab" style={{ marginBottom: 8 }}>
        <h3 className="b-tit" style={{ fontSize: 18 }}>
          Dónde está lo que tienes
        </h3>
      </div>
      <div className="edad">
        {total === 0 ? (
          <i className="q-sin">Sin prendas</i>
        ) : (
          // Un tramo sin unidades no se dibuja: no hay nada que decir de él.
          tramos
            .filter((t) => t.unidades > 0)
            .map((t, k) => (
              <i
                key={t.clase}
                className={`${t.clase} cx`}
                style={{ flex: t.unidades, ["--d" as string]: k }}
                data-tip={`${t.etiqueta}: ${nf(t.unidades)} ${plural(t.unidades, "unidad", "unidades")}`}
              />
            ))
        )}
      </div>
      <div className="leyenda" style={{ marginTop: 10 }}>
        {tramos.map((t) => (
          <span key={t.clase}>
            <i className={t.clase} />
            {t.etiqueta} <b>{nf(t.unidades)}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Sin carril: la base todavía no lo sabe, no se pudieron leer las prendas, o todo salió al piso (la respuesta corta y buena). */
function SinCarril({ tipo, dentro = false }: { tipo: VacioPiso; /** Dentro de la tarjeta del carril, sin tarjeta propia. */ dentro?: boolean }) {
  const texto = TEXTO_VACIO_PISO[tipo];
  // La pieza única de vacío (ADR-0358, ronda 5): el título ya dice el estado, así que el chip «bien / sin datos» ya no se repite.
  const vacio = (
    <Vacio icono={tipo === "todo-salio" ? <Check /> : tipo === "sin-saber" ? <Hourglass /> : <Shirt />} titulo={texto.titulo}>
      {texto.linea}
    </Vacio>
  );
  if (dentro) return vacio;
  return (
    <section className="tarjeta entra" style={{ ["--i" as string]: 0 }}>
      {vacio}
    </section>
  );
}
