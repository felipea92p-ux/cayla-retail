import { Chip } from "@/components/ui/Chip";
import { TABLA, celda } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import type { HistoriaDelEspacio as Historia } from "@/lib/espacio-piso";
import type { GrupoMix } from "@/lib/plan-piso-grupos";

// Plan del piso ▸ Historia (ADR-0329, actividad 12): las fotos del espacio del piso que el cron guarda cada lunes (3:00 de Lima), por
// grupo del mix. Es la columna que falta para medir cuánto rinde el espacio en ropa: lo vendido ya se guarda, el espacio de cada categoría
// no, y lo que no se fotografió no se reconstruye. Por eso lo que esta pestaña cuida es que no haya huecos y que se diga cuáles hay: una
// semana sin foto es un hueco, nunca un 0 (ADR-0214).

/** Nombres cortos para la cabecera de cada columna (las columnas son angostas). Un grupo nuevo sin nombre corto usa el suyo. */
const CORTO: Record<string, string> = {
  polos_tops_blusas: "Polos y tops",
  jeans: "Jeans",
  pantalones_faldas_shorts: "Pantalones y faldas",
  vestidos_conjuntos: "Vestidos",
  bodys_corsets_lenceria: "Bodys",
  abrigo_y_capas: "Abrigo",
};

const n = (x: number) => x.toLocaleString("es-PE");
const dia = (fecha: string) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function HistoriaDelEspacio({ historia: h, grupos }: { historia: Historia; grupos: GrupoMix[] }) {
  const delRiel = grupos.filter((g) => g.enRiel);
  // Las columnas son anchas a propósito y la tabla se desplaza dentro de su tarjeta: en el celular no se apila (una fila de 10 cifras apilada
  // no se compara con la de arriba). La plantilla va en un `style` y no en una clase de Tailwind porque lleva el número de grupos: Tailwind solo
  // genera las clases que están escritas completas en el código, y una armada con `${n}` no existiría.
  const plantilla = { gridTemplateColumns: `7.5rem repeat(${delRiel.length}, minmax(4.75rem, 1fr)) 5.5rem 5.5rem 6.5rem` };
  const titulos = [
    { texto: "Foto", der: false },
    ...delRiel.map((g) => ({ texto: CORTO[g.clave] ?? g.nombre, der: true })),
    { texto: "Total del riel", der: true },
    { texto: "Fuera del riel", der: true },
    { texto: "Piso", der: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Fotos tomadas" valor={h.filas.length} className="anim-sube">
          {h.filas.length === 0 ? "todavía ninguna" : "una cada lunes, desde que se pegó"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Última foto" valor={h.diasDesdeLaUltima === null ? "—" : h.diasDesdeLaUltima === 0 ? "hoy" : `hace ${h.diasDesdeLaUltima} d`} acento={h.diasDesdeLaUltima !== null && h.diasDesdeLaUltima > 9} className="anim-sube" style={{ "--i": 1 } as React.CSSProperties}>
          {h.ultimaFoto === null ? "la primera se toma el lunes de madrugada" : dia(h.ultimaFoto)}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Semanas sin foto" valor={h.filas.length < 2 ? "—" : h.semanasSinFoto} acento={h.semanasSinFoto > 0} className="anim-sube" style={{ "--i": 2 } as React.CSSProperties}>
          {h.filas.length < 2 ? "hacen falta dos fotos para saberlo" : h.semanasSinFoto === 0 ? "ningún hueco" : "huecos que ya no se pueden reconstruir"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Fotos sin cuadrar" valor={h.sinCuadrar} acento={h.sinCuadrar > 0} className="anim-sube" style={{ "--i": 3 } as React.CSSProperties}>
          {h.sinCuadrar === 0 ? "todas con el piso cuadrado" : "no sirven para medir el espacio"}
        </TarjetaCifra>
      </div>

      <section className="card-cayla overflow-hidden anim-sube" style={{ "--i": 2 } as React.CSSProperties} aria-label="Fotos del espacio del piso">
        <div className="border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl text-tinta">Fotos del riel</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-tinta/70">
            Cada lunes de madrugada el sistema anota cuántas prendas había colgadas de cada grupo. No se puede reconstruir después: por eso se guarda desde ya.
          </p>
        </div>
        {h.filas.length === 0 ? (
          <p className="p-5 text-sm text-tinta/75" role="status">
            Todavía no hay fotos de esta sede. La primera se toma el próximo lunes a las 3:00 de la madrugada; no hace falta hacer nada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[62rem] divide-y divide-sand">
              <div className="encabezado-tabla-cayla grid items-end gap-x-4 px-5 py-2" style={plantilla} role="row">
                {titulos.map((t) => (
                  <span key={t.texto} role="columnheader" className={`${TABLA.titulo} block min-w-0 ${t.der ? "text-right" : "text-left"}`}>
                    {t.texto}
                  </span>
                ))}
              </div>
              {h.filas.map((f) => (
                <div key={f.fecha} className="fila-cayla grid items-center gap-x-4 px-5 py-3" style={plantilla} role="row">
                  <div className={celda("izq", "text-sm text-tinta")}>{dia(f.fecha)}</div>
                  {delRiel.map((g) => (
                    <div key={g.clave} className={celda("der", f.cuadrada ? "" : "text-taupe")}>
                      {n(f.porGrupo[g.clave] ?? 0)}
                    </div>
                  ))}
                  <div className={celda("der", `font-medium ${f.cuadrada ? "" : "text-taupe"}`)}>{n(f.totalRiel)}</div>
                  <div className={celda("der", "text-taupe")}>{n(f.fueraDelRiel)}</div>
                  <div className={celda("der")}>{f.cuadrada ? <Chip tono="verde">Cuadrado</Chip> : <Chip tono="ambar">Por cuadrar</Chip>}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="nota-cayla">
        <strong>Para qué sirve.</strong> La investigación del 5 de octubre no encontró ninguna medida de cuánto más vende una categoría de ropa por tener más lugar; la que
        circula es de supermercado. Con estas fotos y las ventas, en unos meses se podrá medir con los datos de CAYLA, y decidir con eso cuánto vale reasignar el piso.
        Una foto «por cuadrar» se guarda igual pero sale apagada: sin saber lo que cuelga de verdad, no sirve para medir.
      </p>
    </div>
  );
}
