"use client";

import { useMemo, useState } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Chip } from "@/components/ui/Chip";
import { CifrasPlan } from "@/components/plan-compra/CifrasPlan";
import { ListaCategorias, type VistaPlan } from "@/components/plan-compra/ListaCategorias";
import { AvisoStock } from "@/components/plan-compra/AvisoStock";
import { ExportarPlan } from "@/components/plan-compra/ExportarPlan";
import { PasoAPaso } from "@/components/plan-compra/PasoAPaso";
import { PlanCategoriaModal } from "@/components/plan-compra/PlanCategoriaModal";
import { armarFilas, confianzaDelStock, fechaLargaES, leerPlan, momentoDeLaCampana, siguienteSinPlan, totalesDelPlan, type CategoriaPlan, type FiltroPlan, type OrdenPlan } from "@/lib/plan-compra-reglas";
import type { FamiliaPlan } from "@/lib/plan-compra";
import type { LecturaMotor } from "@/lib/motor-demanda";
import { CalendarDays } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";

// Compras ▸ Plan de campaña (ADR-0349). Una fila por categoría: su barra de rango (los tres escenarios contra lo que ya hay y lo que hay
// que comprar), cuánto cuesta; al abrirla, su ventana para armar o corregir el plan. Durante y después de la campaña, lo que se vendió de
// verdad al lado. Toda la cuenta vive en lib/plan-compra-reglas.ts (con su prueba); aquí solo se arma la pantalla con sus piezas y se
// guarda qué filtros están puestos (las cifras y la lista los comparten).

export function PlanCampana({ datos, falla, familias, preparacion, puedeContar }: { datos: unknown; falla: string | null; familias: FamiliaPlan[]; preparacion: LecturaMotor; puedeContar: boolean }) {
  const plan = useMemo(() => leerPlan(datos), [datos]);
  const [abierta, setAbierta] = useState<CategoriaPlan | null>(null);
  // Las que se guardaron con «Guardar y seguir» en esta tanda: la lectura del servidor tarda un instante en traerlas y la hoja no debe
  // volver a ofrecerlas como «la siguiente».
  const [hechas, setHechas] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<FiltroPlan>("todas");
  const [familia, setFamilia] = useState("todas");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenPlan>("ventas");
  const [sinMovAbiertas, setSinMovAbiertas] = useState(false);
  const [vista, setVista] = useState<VistaPlan>("tabla");
  const [exportando, setExportando] = useState(false);
  const filas = useMemo(() => (plan ? armarFilas(plan) : []), [plan]);

  if (!plan) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede="Todas las tiendas" titulo="Plan de campaña" subtitulo="Cuánto comprar por categoría para una campaña." />
        {falla ? (
          <Aviso tono="error">{falla}.</Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio icono={<CalendarDays />} titulo="Todavía no hay ninguna campaña para planificar">
              Cuando exista una campaña, aquí armas cuánto comprar de cada categoría para ella.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  const momento = momentoDeLaCampana(plan.hoy, plan.plan.desde, plan.plan.hasta);
  const totales = totalesDelPlan(filas);
  const confianza = confianzaDelStock(preparacion);
  const siguiente = abierta ? (siguienteSinPlan(filas, [...hechas, abierta.id])?.c ?? null) : null;
  const cerrarHoja = () => {
    setAbierta(null);
    setHechas([]);
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Plan de campaña"
        subtitulo={`${plan.plan.nombre}, del ${fechaLargaES(plan.plan.desde)} al ${fechaLargaES(plan.plan.hasta)}: cuánto comprar por categoría, con tres escenarios. En enero, al lado, lo que se vendió de verdad.`}
        acciones={
          totales.conPlan > 0 ? (
            <Boton peso="fantasma" onClick={() => setExportando(true)}>
              Exportar
            </Boton>
          ) : undefined
        }
        pie={
          <Chip tono={momento.estado === "durante" ? "verde" : "pizarra"}>
            <b className="font-semibold">{momento.fuerte}</b> · {momento.resto}
          </Chip>
        }
      />

      <AvisoStock confianza={confianza} puedeContar={puedeContar} />

      <CifrasPlan totales={totales} estado={momento.estado} filas={filas} filtro={filtro} onFiltro={setFiltro} onSeguirLlenando={() => setVista("guiado")} />

      <ListaCategorias
        filas={filas}
        estado={momento.estado}
        familias={familias}
        filtro={filtro}
        onFiltro={setFiltro}
        familia={familia}
        onFamilia={setFamilia}
        q={q}
        onQ={setQ}
        orden={orden}
        onOrden={setOrden}
        sinMovAbiertas={sinMovAbiertas}
        onSinMov={setSinMovAbiertas}
        onAbrir={(f) => setAbierta(f.c)}
        vista={vista}
        onVista={setVista}
        pasoAPaso={<PasoAPaso planId={plan.plan.id} filas={filas} vendidoPorTalla={plan.vendidoPorTalla} totales={totales} familias={familias} onTabla={() => setVista("tabla")} />}
      />

      <p className="nota-cayla">
        Cómo se calcula: con tus tres escenarios, el sistema compra según cuánto cuesta quedarse corto (lo que dejas de ganar) frente a
        sobrar (lo que pierdes al vender lo que queda más barato). Si lo que sobra se vende casi al mismo precio, conviene cubrir un
        diciembre bueno; si se pierde, conviene quedarse más cerca del flojo. No hay historia de ventas de diciembre en el ERP: estos
        números son tus supuestos, y en enero se comparan con lo que pasó.
      </p>

      {exportando && <ExportarPlan planNombre={plan.plan.nombre} filas={filas} confianza={confianza} onClose={() => setExportando(false)} />}

      {abierta && (
        <PlanCategoriaModal
          planId={plan.plan.id}
          planNombre={plan.plan.nombre}
          categoria={abierta}
          linea={plan.lineas.get(abierta.id)}
          stock={plan.stock.get(abierta.id) ?? 0}
          ventas={filas.find((f) => f.c.id === abierta.id)?.ventas ?? 0}
          vendidoPorTalla={plan.vendidoPorTalla.get(abierta.id)}
          siguiente={siguiente}
          enSerie={hechas.length > 0}
          onGuardado={(seguir) => {
            if (seguir && siguiente) {
              setHechas((h) => [...h, abierta.id]);
              setAbierta(siguiente);
            }
          }}
          onClose={cerrarHoja}
        />
      )}
    </div>
  );
}
