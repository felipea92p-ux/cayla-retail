"use client";

import type { CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Linea, topeRedondo } from "@/components/ui/Linea";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { fechaEnPalabras, type CajaCayla, type CajaProxima, type CajaSede, type SalidaGrande } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";

// Finanzas ▸ Resumen, «Tu caja en las próximas dos semanas» (Felipe 2026-10-24, spike 1). Solo DIBUJA lo que arma `cajaProxima`: la línea del
// saldo contra el mínimo en escritorio, y bajo 640 px tres cifras y una barra (las dos en el HTML y una escondida por CSS: nada mide la
// pantalla con JavaScript). Mirando una sede no hay línea: el saldo de los bancos es de CAYLA entera y repartirlo sería inventarlo.
// Las piezas son las del sistema (`Linea`, `TarjetaCifra`, `BarraApilada`): esta no dibuja nada a mano.

const TITULO = "Tu caja en las próximas dos semanas";
const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaYMes = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;

export function CajaProximaPieza({ caja, hrefFlujo }: { caja: CajaProxima; hrefFlujo: string }) {
  if (caja.tipo === "oculta") return null;
  if (caja.tipo === "falla")
    return (
      <Superficie pad guia="fin-resumen.caja">
        <CabeceraBloque titulo={TITULO} bajada="No se pudo leer la caja. Vuelve a cargar la página en un rato: el resto del Resumen sigue igual." />
      </Superficie>
    );
  return caja.tipo === "sede" ? <CajaDeSede caja={caja} hrefFlujo={hrefFlujo} /> : <CajaDeCayla caja={caja} hrefFlujo={hrefFlujo} />;
}

/** Lo que más pesa en el horizonte, con la misma lista de montos del resto de Finanzas. */
function Pesan({ mayores }: { mayores: readonly SalidaGrande[] }) {
  if (!mayores.length) return null;
  return (
    <>
      <p className="label-cayla mt-4">Lo que más pesa</p>
      <ul className="fin-lista-mov" aria-label="Las salidas que más pesan">
        {mayores.map((m) => (
          <li key={`${m.fecha}|${m.titulo}`}>
            <span>{m.titulo}</span>
            <span className="num">
              {soles(m.monto)} · {diaYMes(m.fecha)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Los chips de estado: a la derecha del título en escritorio, y bajo él en el celular (a 375 px el título quedaba en una columna angosta). */
function Estados({ c, estado, className }: { c: CajaCayla; estado: string | null; className: string }) {
  if (!c.provisional && !estado) return null;
  return (
    <div className={`${className} shrink-0 flex-wrap items-center justify-end gap-2`}>
      {c.provisional && (
        <Chip tono="pizarra" title="Faltan datos para que esta proyección sea firme">
          Provisional
        </Chip>
      )}
      {estado && <Chip tono={c.tono}>{estado}</Chip>}
    </div>
  );
}

function CajaDeCayla({ caja: c, hrefFlujo }: { caja: CajaCayla; hrefFlujo: string }) {
  const ultimo = c.puntos.at(-1)!;
  const menor = Math.min(...c.puntos.map((p) => p.saldo));
  const minY = menor < 0 ? -topeRedondo(-menor) : 0;
  const hayMinimo = c.minimo > 0;
  const bajo = hayMinimo && c.queda < c.minimo;
  // El chip sale de lo que pasa, no del color: el ámbar es «bajo tu mínimo» (dentro de las dos semanas) y también «ojo después».
  const estado = c.sinPlata ? "Sin plata" : c.bajaDelMinimo ? "Bajo tu mínimo" : c.luego ? "Ojo después" : c.tono === "verde" ? "Te alcanza" : null;
  // Las marcas del eje: hoy, la mitad y el último día, con su mes («31 oct», «7 nov»): el horizonte casi siempre cruza de mes.
  const marcas = [0, 7, ultimo.dia]
    .filter((x, k, a) => x <= ultimo.dia && a.indexOf(x) === k)
    .map((x) => ({ x, texto: x === 0 ? "hoy" : diaYMes(c.puntos.find((p) => p.dia === x)?.fecha ?? c.hoy), fuerte: x === 0 }));
  const etiqueta = `${TITULO}. ${c.titular} Hoy tienes ${soles(c.saldoHoy)}; hasta el ${fechaEnPalabras(c.hasta)} sale ${soles(c.sale)} y te quedan ${soles(c.queda)}.`;

  return (
    <Superficie pad guia="fin-resumen.caja">
      <CabeceraBloque titulo={TITULO} bajada={c.titular}>
        <Estados c={c} estado={estado} className="hidden sm:flex" />
      </CabeceraBloque>
      <Estados c={c} estado={estado} className="mb-3 sm:hidden" />

      {/* Escritorio: la línea del saldo contra tu mínimo. */}
      <div className="hidden sm:block">
        <Linea
          etiqueta={etiqueta}
          serie={c.puntos.map((p) => ({ x: p.dia, y: p.saldo }))}
          referencia={hayMinimo ? [{ x: 0, y: c.minimo }, { x: ultimo.dia, y: c.minimo }] : null}
          desde={0}
          hasta={ultimo.dia}
          minY={minY}
          marcasX={marcas}
          cifra={soles(c.queda)}
          cifraReferencia={hayMinimo ? { valor: soles(c.minimo), texto: "mínimo" } : null}
          leer={(x) => {
            const p = c.puntos.reduce((a, b) => (Math.abs(b.dia - x) < Math.abs(a.dia - x) ? b : a));
            return (
              <>
                <b>{p.dia === 0 ? "Hoy" : fechaEnPalabras(p.fecha)}</b>
                <span>{p.dia === 0 ? "Tienes" : "Tendrás"}: {soles(p.saldo)}</span>
                {p.sale > 0 && (
                  <span>
                    {c.porSemana ? "Esa semana sale" : "Ese día sale"}: {soles(p.sale)}
                    {p.principal ? ` (${p.principal})` : ""}
                  </span>
                )}
                {p.entra > 0 && <span>Esperas cobrar: {soles(p.entra)}</span>}
              </>
            );
          }}
          vacio="Todavía no hay una proyección de caja."
          alto={200}
        />
      </div>

      {/* Celular: tres cifras y una barra. */}
      <div className="sm:hidden">
        <div className="grid gap-3">
          <TarjetaCifra etiqueta="Hoy tienes" valor={soles(c.saldoHoy)} {...entra(1)}>
            Cajones, cajas fuertes y bancos.
          </TarjetaCifra>
          <TarjetaCifra etiqueta={`Hasta el ${fechaEnPalabras(c.hasta)} sale`} valor={soles(c.sale)} {...entra(2)}>
            {c.entra > 0 ? `Y esperas cobrar ${soles(c.entra)}.` : "No se espera cobrar nada."}
          </TarjetaCifra>
          <TarjetaCifra etiqueta={`El ${fechaEnPalabras(c.hasta)} te queda`} valor={soles(c.queda)} tono={bajo ? "text-rojo" : undefined} {...entra(3)}>
            {hayMinimo ? (bajo ? `Tu mínimo es ${soles(c.minimo)}: te faltan ${soles(c.minimo - c.queda)}.` : `Tu mínimo es ${soles(c.minimo)}.`) : "No tienes un mínimo de caja puesto."}
          </TarjetaCifra>
        </div>
        <BarraApilada
          className="mt-4"
          unidad="soles"
          formato={soles}
          etiqueta={`De ${soles(c.saldoHoy + c.entra)} que tendrás, ${soles(c.sale)} se van y ${soles(Math.max(c.queda, 0))} quedan`}
          total={c.saldoHoy + c.entra}
          segmentos={[
            { clave: "queda", nombre: "Lo que te queda", valor: Math.max(c.queda, 0), clase: bajo ? "bg-rojo" : "bg-verde" },
            { clave: "sale", nombre: "Lo que sale", valor: c.sale, clase: "bg-tinta/25" },
          ]}
        />
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-taupe">
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase={bajo ? "bg-rojo" : "bg-verde"} /> Lo que te queda
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MuestraTramo clase="bg-tinta/25" /> Lo que sale
          </span>
        </p>
      </div>

      <Pesan mayores={c.mayores} />
      {c.sinPlanilla && <p className="nota-cayla mt-3">La planilla no se ve desde tu cuenta en Dynamic: no está en lo que sale.</p>}
      {c.provisional && c.faltan[0] && (
        <p className="nota-cayla mt-3">
          Es provisional: {c.faltan[0].texto.charAt(0).toLowerCase() + c.faltan[0].texto.slice(1)}
          {c.faltan.length > 1 ? ` Y ${c.faltan.length - 1 === 1 ? "1 cosa más" : `${c.faltan.length - 1} cosas más`} en el flujo completo.` : ""}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <EnlaceVer href={hrefFlujo}>Ver el flujo completo</EnlaceVer>
      </div>
    </Superficie>
  );
}

function CajaDeSede({ caja: c, hrefFlujo }: { caja: CajaSede; hrefFlujo: string }) {
  return (
    <Superficie pad guia="fin-resumen.caja">
      <CabeceraBloque titulo={TITULO} bajada={c.titular} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra etiqueta={c.vende ? `Efectivo en ${c.nombre}` : "Efectivo"} valor={c.efectivo === null ? null : soles(c.efectivo)} {...entra(1)}>
          {c.efectivo === null ? "Tu cuenta no ve el efectivo de este lugar." : "En el cajón y la caja fuerte."}
        </TarjetaCifra>
        {c.vende && (
          <TarjetaCifra etiqueta={`Hasta el ${fechaEnPalabras(c.hasta)} esperas cobrar`} valor={soles(c.entra)} {...entra(2)}>
            Según su meta del día o su promedio.
          </TarjetaCifra>
        )}
        <TarjetaCifra etiqueta={`Hasta el ${fechaEnPalabras(c.hasta)} sale`} valor={soles(c.sale)} {...entra(3)}>
          Lo que vence o se paga en {c.nombre}.
        </TarjetaCifra>
      </div>
      <Pesan mayores={c.mayores} />
      <p className="nota-cayla mt-3">
        Los bancos son de CAYLA entera: no se reparten por sede. Elige «Todas las sedes» para ver la caja de todo.
        {c.sinPlanilla ? " La planilla no se ve desde tu cuenta en Dynamic: no está en lo que sale." : ""}
      </p>
      <div className="mt-3 flex justify-end">
        <EnlaceVer href={hrefFlujo}>Ver el flujo completo</EnlaceVer>
      </div>
    </Superficie>
  );
}
