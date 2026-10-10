import { BarraApilada } from "@/components/ui/BarraApilada";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { enteroES, segmentosDelTope, solesES, type EstadoCampana, type FilaPlan, type FiltroPlan, type TotalesPlan } from "@/lib/plan-compra-reglas";

// Un tono por tramo de la barra del tope: de la categoría que más cuesta a las demás, siempre tinta (nunca un color nuevo; debajo de /50 no llega a
// 3:1, por eso lo que dice la barra también se dice en texto).
const TONOS_TOPE = ["bg-tinta", "bg-tinta/85", "bg-tinta/70", "bg-tinta/60", "bg-tinta/50", "bg-tinta/35"];

// Las cifras del plan de campaña (ADR-0349): cuántas categorías ya tienen plan (y filtra la tabla), cuántas prendas comprar y cuánto
// cuesta y, la cuarta, la que cambia con el momento: antes, cuántas de las que más venden faltan por llenar; durante y después, lo que
// se vendió de verdad. Solo dibuja: los totales los saca `totalesDelPlan` (lib/plan-compra-reglas.ts).

export function CifrasPlan({
  totales,
  estado,
  filas,
  filtro,
  onFiltro,
  onSeguirLlenando,
  tope,
  onTope,
}: {
  totales: TotalesPlan;
  estado: EstadoCampana;
  filas: readonly FilaPlan[];
  filtro: FiltroPlan;
  onFiltro: (f: FiltroPlan) => void;
  /** «Por llenar primero» lleva al paso a paso. */
  onSeguirLlenando: () => void;
  /** El tope de inversión: `soportado` = la base ya sabe de topes; `valor` null = sin tope. */
  tope: { soportado: boolean; valor: number | null };
  /** Abre la hoja del tope; solo se pasa a quien puede fijarlo (un líder). Sin esto, el tope se ve pero no se edita. */
  onTope?: () => void;
}) {
  const verReal = estado !== "antes";
  const excede = tope.valor !== null ? Math.max(0, Math.round((totales.inversion - tope.valor) * 100) / 100) : 0;
  const lasQueMasVenden = filas.filter((f) => f.puesto !== null);
  const faltan = lasQueMasVenden.filter((f) => !f.linea).length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Las cifras cuentan una vez al entrar y cuando cambian (al guardar una categoría): el ojo nota qué se movió (maqueta, ADR-0136). */}
      <TarjetaCifra
        etiqueta="Categorías con plan"
        valor={
          <>
            <CifraQueCuenta valor={totales.conPlan} alMontar /> de {enteroES.format(totales.total)}
          </>
        }
        activa={filtro === "con"}
        onClick={() => onFiltro(filtro === "con" ? "todas" : "con")}
      >
        {totales.conPlan === 0 ? "Empieza por las que más venden" : "Las demás no suman a la compra"}
      </TarjetaCifra>
      <TarjetaCifra etiqueta="Prendas a comprar" valor={<CifraQueCuenta valor={totales.aComprar} alMontar />}>
        Lo que conviene tener menos lo que ya hay
      </TarjetaCifra>
      <TarjetaCifra
        etiqueta="Inversión al costo"
        valor={<CifraQueCuenta valor={totales.inversion} formato="soles" alMontar />}
        detalleTono={excede > 0 ? "text-ambar-profundo" : undefined}
        accion={tope.soportado && onTope ? { texto: tope.valor === null ? "Poner un tope" : "Editar el tope", onClick: onTope } : undefined}
        pie={
          tope.valor !== null ? (
            <BarraApilada
              alto={8}
              total={tope.valor}
              unidad="al costo"
              formato={solesES}
              etiqueta={`${solesES(totales.inversion)} de ${solesES(tope.valor)} de tope`}
              segmentos={segmentosDelTope(filas).map((x, i) => ({ clave: x.clave, nombre: x.nombre, valor: x.valor, clase: TONOS_TOPE[i] ?? TONOS_TOPE[TONOS_TOPE.length - 1] }))}
            />
          ) : undefined
        }
      >
        {tope.valor === null
          ? "Solo las categorías con plan"
          : excede > 0
            ? `Te pasas ${solesES(excede)} del tope de ${solesES(tope.valor)}`
            : `${Math.round((totales.inversion / tope.valor) * 100)} % del tope de ${solesES(tope.valor)}`}
      </TarjetaCifra>
      {verReal ? (
        <TarjetaCifra etiqueta="Vendido en la campaña" valor={enteroES.format(totales.vendido)}>
          {estado === "durante" ? "Hasta hoy, todas las categorías" : "Todas las categorías"}
        </TarjetaCifra>
      ) : lasQueMasVenden.length === 0 ? (
        <TarjetaCifra etiqueta="Las que más venden, sin plan" valor={null}>
          Todavía no hay ventas de los últimos 90 días para decir cuáles venden más
        </TarjetaCifra>
      ) : (
        // «Por llenar primero» no se entendía (prueba ciega, 2026-10-10): la etiqueta dice qué se cuenta.
        <TarjetaCifra etiqueta="Las que más venden, sin plan" valor={<CifraQueCuenta valor={faltan} alMontar />} onClick={faltan > 0 ? onSeguirLlenando : undefined}>
          {faltan === 0 ? `Las ${lasQueMasVenden.length} ya tienen plan` : `de ${lasQueMasVenden.length} · llénalas una por una`}
        </TarjetaCifra>
      )}
    </div>
  );
}
