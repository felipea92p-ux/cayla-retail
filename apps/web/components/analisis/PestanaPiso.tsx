"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import Link from "next/link";
import { Check, Hourglass } from "lucide-react";
import { useAnalisis } from "@/components/analisis/contexto";
import { nombreLargo, TilePrenda } from "@/components/analisis/piezas";
import { Respuesta, TarjetaPrenda, Tarjetas } from "@/components/analisis/Tarjetas";
import { queTiene, type ModeloAnalisis } from "@/lib/analisis-modelo";
import { plural } from "@/lib/analisis-reglas";
import { hrefReponerPiso } from "@/lib/analisis-acciones";
import { AYUDA_TIPO_PISO, diasEnAlmacen, nuncaSalio, ordenarPiso, TEXTO_VACIO_PISO, tiposPiso, vacioPiso, type VacioPiso } from "@/lib/analisis-piso";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";

// Análisis, cara B (ADR-0357, act. 2026-11-21): «Sin salir» (antes «Nunca salió al piso», act. 2026-10-07 b: lo guardado que nadie vio
// todavía en el piso). Abre con la respuesta («3 modelos están guardados y nadie los vio», con «Bajar todos») y sigue con una tarjeta por
// modelo: los días que lleva en la tienda, cuántas hay en el almacén y «Bajar», que abre Existencias ▸ Reponer a piso con él. Primero el
// tipo que más se vende (bajar primero lo que más se lleva la gente); la píldora «Ordenar por» lo cambia. Si la base todavía no dice
// cuándo salió al piso cada prenda (`datos.sabePiso`), la pestaña lo dice y no inventa una lista. Reglas: `lib/analisis-piso.ts`.

export function PestanaPiso() {
  const { datos, acceso, prendas, orden, abrirFicha } = useAnalisis();
  const sinSalir = datos.prendas.filter(nuncaSalio).length;
  const vacio = vacioPiso({ sabePiso: datos.sabePiso, prendas: datos.prendas.length, sinSalir, fallas: datos.fallas.length });
  if (vacio === "sin-saber" || vacio === "sin-datos") return <SinNada tipo={vacio} />;
  if (vacio === "todo-salio")
    return (
      <section className="tarjeta entra" style={{ ["--i" as string]: 3 }}>
        <Vacio icono={<Check />} titulo={TEXTO_VACIO_PISO[vacio].titulo}>
          {TEXTO_VACIO_PISO[vacio].linea}
        </Vacio>
      </section>
    );

  const lista = ordenarPiso(
    tiposPiso(datos.prendas, prendas, datos.hoy).flatMap((t) => t.prendas),
    orden.piso,
    datos.hoy,
  );
  const n = lista.length;
  const todos = hrefReponerPiso(lista, acceso);

  return (
    <>
      <Respuesta
        guia="analisis.piso-respuesta"
        est="info"
        cuenta={n}
        cifra={plural(n, "modelo", "modelos")}
        frase={plural(n, "está guardado y nadie lo vio", "están guardados y nadie los vio")}
        ayuda={`${AYUDA_TIPO_PISO} Empieza por el tipo que más se vende.`}
        acciones={
          todos && n > 0 ? (
            <Link href={todos} className="btn-cayla btn-secundario btn-chico">
              Bajar todos
            </Link>
          ) : undefined
        }
      />
      {n === 0 ? (
        <section className="tarjeta entra" style={{ ["--i" as string]: 4 }}>
          <Vacio tamano="chico" icono={<Check />}>
            Con estos filtros no hay ninguno aquí.
          </Vacio>
        </section>
      ) : (
        <Tarjetas guia="analisis.piso-tarjetas">
          {lista.map((m, k) => (
            <Tarjeta key={m.varianteId} m={m} i={4 + k} abrirFicha={abrirFicha} />
          ))}
        </Tarjetas>
      )}
    </>
  );
}

/** Un modelo guardado: los días que lleva en la tienda, cuántas hay en el almacén y «Bajar». */
function Tarjeta({ m, i, abrirFicha }: { m: ModeloAnalisis; i: number; abrirFicha: (id: string) => void }) {
  const { datos, acceso } = useAnalisis();
  const dias = diasEnAlmacen(m, datos.hoy);
  const bajar = hrefReponerPiso([m], acceso);
  const detalle = `${m.almacen} en el almacén`;
  return (
    <TarjetaPrenda
      i={i}
      miniatura={<TilePrenda prenda={m} tamano={72} />}
      nombre={m.nombre}
      que={queTiene(m)}
      numero={dias === null ? "—" : String(dias)}
      unidad={dias === null ? "sin fecha de llegada" : plural(dias, "día en la tienda", "días en la tienda")}
      est="info"
      detalle={detalle}
      acciones={
        bajar ? (
          <Link href={bajar} className="btn-cayla btn-secundario btn-chico" aria-label={`Bajar al piso: ${nombreLargo(m)}`}>
            Bajar
          </Link>
        ) : undefined
      }
      etiqueta={`${nombreLargo(m)}: ${dias ?? "sin fecha"} días en la tienda. ${detalle}. Enter abre su ficha.`}
      onAbrir={() => abrirFicha(m.varianteId)}
    />
  );
}

/** La base todavía no lo sabe, o no se pudieron leer las prendas. */
function SinNada({ tipo }: { tipo: VacioPiso }) {
  const texto = TEXTO_VACIO_PISO[tipo];
  // «No pude ver tus prendas» no es un vacío sino una lectura que falló: va como aviso de error (Felipe 2026-10-08).
  if (tipo === "sin-datos")
    return (
      <Aviso tono="error" titulo={texto.titulo}>
        {texto.linea}
      </Aviso>
    );
  return (
    <section className="tarjeta entra" style={{ ["--i" as string]: 3 }}>
      <Vacio icono={<Hourglass />} titulo={texto.titulo}>
        {texto.linea}
      </Vacio>
    </section>
  );
}
