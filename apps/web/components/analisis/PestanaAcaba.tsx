"use client";

import { BotonVer } from "@/components/ui/BotonDescargar";
import { useMemo } from "react";
import { Check } from "lucide-react";
import { useAnalisis } from "@/components/analisis/contexto";
import { nombreLargo, TilePrenda } from "@/components/analisis/piezas";
import { Respuesta, TarjetaPrenda, Tarjetas } from "@/components/analisis/Tarjetas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { queTiene } from "@/lib/analisis-modelo";
import { otraSedeQueLaTiene, plural } from "@/lib/analisis-reglas";
import { hrefComprar, hrefComprarTodas } from "@/lib/analisis-acciones";
import { textoRitmo } from "@/lib/analisis-pedir";
import { ordenar } from "@/lib/analisis-orden";
import { detalleAcaba, fraseAcaba, numeroAcaba, prendasQueSeAcaban, TEXTO_VACIO_ACABA, textoPedirA, vacioAcaba, type VacioAcaba } from "@/lib/analisis-acaba";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";

// Análisis, cara B (ADR-0357, act. 2026-11-21): «Se acaba». Abre con la respuesta («5 modelos · cómpralos ya: se acaban en 2 semanas o menos», con
// «Comprar todas») y sigue con una tarjeta por modelo: cuántos días le quedan o «Ya no hay», lo que falta, lo que viene en camino o quién
// más la tiene, y sus botones. Todo lo que se acaba se compra por defecto (decisión 7); si otra tienda la tiene, se ofrece pedírsela y la
// persona decide. Las reglas viven en `lib/analisis-acaba.ts`; los destinos de los botones, en `lib/analisis-acciones.ts` (un destino que
// la cuenta no ve no se dibuja). El orden lo elige la píldora «Ordenar por» de la barra (`lib/analisis-orden.ts`).

const AYUDA_COMPRAR =
  "Por defecto, todo lo que se acaba se compra al proveedor: el taller o terceros. Si otra tienda la tiene, toca la prenda para ver cuánto vende cada tienda y decide si pedirla.";

export function PestanaAcaba() {
  const { datos, acceso, prendas, liquidarDesde, diasDeVentas, orden, abrirFicha, sedeDe } = useAnalisis();
  // En la tienda (sin filtros): decide si hay algo que decir. Con filtros: las tarjetas.
  const enLaTienda = useMemo(() => prendasQueSeAcaban(datos.prendas, liquidarDesde).length, [datos.prendas, liquidarDesde]);
  const seAcaban = useMemo(() => ordenar(prendasQueSeAcaban(prendas, liquidarDesde), orden.acaba), [prendas, liquidarDesde, orden.acaba]);

  const vacio = vacioAcaba({ prendas: datos.prendas.length, seAcaban: enLaTienda, fallas: datos.fallas.length });
  if (vacio) return <SinNada tipo={vacio} />;

  const comprarTodas = hrefComprarTodas(seAcaban, acceso);
  const ciudadDe = (id: string) => sedeDe(id)?.ciudad;
  const n = seAcaban.length;

  return (
    <>
      <Respuesta
        guia="analisis.acaba-respuesta"
        est="urg"
        cuenta={n}
        cifra={plural(n, "modelo", "modelos")}
        frase={fraseAcaba(n)}
        ayuda={`${AYUDA_COMPRAR} ${textoRitmo(diasDeVentas)}.`}
        acciones={
          comprarTodas && n > 0 ? (
            <BotonVer href={comprarTodas} chico>
              Comprar todas
            </BotonVer>
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
        <Tarjetas guia="analisis.acaba-tarjetas">
          {seAcaban.map((m, k) => {
            const num = numeroAcaba(m);
            const detalle = detalleAcaba(m, datos.hoy, ciudadDe);
            return (
              <TarjetaPrenda
                key={m.varianteId}
                i={4 + k}
                miniatura={<TilePrenda prenda={m} tamano={72} />}
                nombre={m.nombre}
                que={queTiene(m)}
                numero={num?.numero ?? "—"}
                unidad={num?.unidad}
                est={num?.urgente ? "urg" : "ate"}
                detalle={detalle}
                acciones={<Acciones m={m} />}
                etiqueta={`${nombreLargo(m)}: ${num ? `${num.numero} ${num.unidad}`.trim() : ""}. ${detalle}. Enter abre su ficha.`}
                onAbrir={() => abrirFicha(m.varianteId)}
              />
            );
          })}
        </Tarjetas>
      )}
    </>
  );
}

/** «Comprar» (Compras o Producción, según de dónde viene) y, si otra tienda la tiene, «o pedir a Arequipa». */
function Acciones({ m }: { m: ModeloAnalisis }) {
  const { acceso, sedeDe, pedir } = useAnalisis();
  const comprar = hrefComprar(m, acceso);
  const otra = otraSedeQueLaTiene(m.otras);
  const sede = otra && acceso.pedir ? sedeDe(otra.sedeId) : undefined;
  if (!comprar && !sede) return null;
  return (
    <>
      {comprar && (
        // Con la flecha de «ver en otra pantalla»: «Comprar» no compra aquí, lleva a Compras o a Producción (prueba ciega de /formidable).
        // Va primero: se lee «Comprar, o pedir a Arequipa».
        <BotonVer href={comprar} chico etiqueta={`Comprar: ${nombreLargo(m)}`}>
          Comprar
        </BotonVer>
      )}
      {sede && (
        <button type="button" className="btn-cayla btn-enlace" aria-label={`${textoPedirA(sede)}: ${nombreLargo(m)}`} onClick={() => pedir([m], sede.id)}>
          {textoPedirA(sede)}
        </button>
      )}
    </>
  );
}

/** Nada se acaba (en positivo), o no se pudieron leer las prendas. */
function SinNada({ tipo }: { tipo: VacioAcaba }) {
  const texto = TEXTO_VACIO_ACABA[tipo];
  // «No pude ver tus prendas» no es un vacío sino una lectura que falló: va como aviso de error (Felipe 2026-10-08).
  if (tipo === "sin-datos")
    return (
      <Aviso tono="error" titulo={texto.titulo}>
        {texto.linea}
      </Aviso>
    );
  return (
    <section className="tarjeta entra" style={{ ["--i" as string]: 3 }}>
      <Vacio icono={<Check />} titulo={texto.titulo}>
        {texto.linea}
      </Vacio>
    </section>
  );
}
