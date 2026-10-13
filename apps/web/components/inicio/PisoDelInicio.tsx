import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Etiqueta } from "@/components/inicio/TarjetasInicio";
import { getPisoDeFrescuraParaElInicio } from "@/lib/frescura";
import { getPisoDelPlanParaElInicio } from "@/lib/plan-piso-servidor";
import { pisoQueSeVe, vistaPisoInicio, type AccesoPiso, type LecturaParaElInicio, type LineaPorDecidir, type PisoFrescuraInicio, type PisoPlanInicio, type VistaFrescuraInicio, type VistaPlanInicio } from "@/lib/inicio-piso-reglas";

// «Tu piso» (ADR-0395, Felipe 2026-10-13): dos tarjetas en el Inicio de una TIENDA que dicen cómo está el piso sin entrar a Gestión: la de Frescura del
// piso («¿tu piso está fresco?») y la del Plan del piso («¿cuánto del riel está ocupado?»). Aparece solo si la cuenta ve su módulo. Qué dice cada una
// vive en `lib/inicio-piso-reglas.ts`, con su prueba: lo que NO se puede afirmar se dice como lo dice la pantalla («Todavía no se puede saber: falta
// cuadrar el piso»), nunca un número, y trae el botón que lo arregla si la cuenta puede darlo. Con el piso afirmado, la tarjeta ENTERA lleva a su
// pantalla; sin afirmar, la tarjeta informa y su botón lleva a lo que falta (una cifra que se toca entera no lleva un botón adentro).
//
// Server Component async dentro de un `<Suspense>` (page.tsx). OJO con lo que eso NO hace: en una carga en frío del documento, «Hoy» y «Te toca» no
// esperan a esta lectura; pero en una NAVEGACIÓN interna a «/» el loader global (ADR-0149) suelta la ficha cuando llega el cuerpo COMPLETO de la
// respuesta, así que el velo dura lo que dure la lectura del piso (y el esqueleto queda detrás). Leer Frescura no tiene caché y es lo más pesado del
// Inicio: se MIDE en producción antes de cachearla o de sacarla a una lectura del navegador (ADR-0395, «Lo que queda abierto»).
//
// Cada mitad falla por separado y NUNCA lanza (un throw aquí caería en `error.tsx` y se llevaría el Inicio entero): una lectura caída dice «No se pudo
// leer el piso. Lo demás sí está al día», jamás un 0; una sede sin piso de venta no dibuja su mitad.

const HREF_FRESCURA = "/gestion/frescura";
const HREF_PLAN = "/gestion/plan-del-piso";
const NO_SE_PUDO = "No se pudo leer el piso. Lo demás sí está al día.";

function PorDecidir({ linea }: { linea: LineaPorDecidir }) {
  return <span className={linea.hay ? "font-semibold text-ambar-profundo" : undefined}>{linea.texto}</span>;
}

function Frase({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-tinta">{children}</span>;
}

export function CifraFrescura({ v }: { v: VistaFrescuraInicio }) {
  if (v.tipo === "todavia") {
    return (
      <TarjetaCifra
        etiqueta="Frescura del piso"
        valor={v.titular}
        // Con paso, la tarjeta INFORMA y el botón lleva a arreglarlo; sin paso (la cuenta no ve esa pantalla), la tarjeta entera lleva a Frescura.
        href={v.paso ? undefined : HREF_FRESCURA}
        accion={v.paso ? { texto: v.paso.texto, href: v.paso.href } : undefined}
        pie={v.porDecidir ? <PorDecidir linea={v.porDecidir} /> : undefined}
      >
        <Frase>{v.frase}</Frase>
      </TarjetaCifra>
    );
  }
  return (
    <TarjetaCifra etiqueta="Frescura del piso" valor={v.valor} unidad={v.unidad} href={HREF_FRESCURA} pie={v.porDecidir ? <PorDecidir linea={v.porDecidir} /> : undefined}>
      {(v.aproximado || v.tendencia) && (
        <span className="mb-1.5 flex flex-wrap gap-1.5">
          {v.aproximado && <Chip tono="pizarra">Aproximado</Chip>}
          {v.tendencia && (
            <Chip tono={v.tendencia.tono} versalitas={false}>
              {v.tendencia.texto}
            </Chip>
          )}
        </span>
      )}
      <BarraApilada segmentos={v.segmentos} alto={8} unidad="unidades colgadas" />
      <span className="mt-1.5 block text-[12.5px] leading-snug tabular-nums">{v.linea}</span>
    </TarjetaCifra>
  );
}

export function CifraPlan({ v }: { v: VistaPlanInicio }) {
  const pie = v.pie.length > 0 ? v.pie.join(" · ") : undefined;
  if (v.tipo === "porCuadrar") {
    return (
      <TarjetaCifra
        etiqueta="Plan del piso"
        valor={v.titular}
        punto="ambar"
        href={v.paso ? undefined : HREF_PLAN}
        accion={v.paso ? { texto: v.paso.texto, href: v.paso.href } : undefined}
        pie={pie}
      >
        <Frase>{v.frase}</Frase>
      </TarjetaCifra>
    );
  }
  return (
    <TarjetaCifra etiqueta="Plan del piso" valor={v.valor} unidad={v.unidad} href={HREF_PLAN} pie={pie}>
      <Frase>{v.frase}</Frase>
    </TarjetaCifra>
  );
}

/** La lectura que se cayó: no es «sin dato» sino «falló»; la persona sabe cuál de las dos cosas pasó. */
function CifraCaida({ etiqueta, href }: { etiqueta: string; href: string }) {
  return (
    <TarjetaCifra etiqueta={etiqueta} valor={null} noSePudoLeer href={href}>
      {NO_SE_PUDO}
    </TarjetaCifra>
  );
}

/** Una sola tarjeta ocupa todo el ancho; dos van lado a lado donde caben (bajo `lg` la página es de una columna; en `lg` la columna es angosta). */
const REJILLA = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2";

/** Lo que se ve mientras llegan las lecturas: el mismo alto que las tarjetas, sin saltos al cargar (una banda por mitad que la cuenta ve). */
export function EsqueletoPiso({ mitades }: { mitades: number }) {
  return (
    <section aria-hidden data-guia="inicio.piso">
      <Etiqueta>Tu piso</Etiqueta>
      <div className={mitades > 1 ? REJILLA : "grid grid-cols-1 gap-3"}>
        {Array.from({ length: mitades }, (_, i) => (
          <div key={i} className="card-cayla space-y-3 p-5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-tinta/10" />
            <div className="h-7 w-1/2 animate-pulse rounded bg-tinta/10" />
            <div className="h-2 w-full animate-pulse rounded bg-tinta/10" />
          </div>
        ))}
      </div>
    </section>
  );
}

export async function PisoDelInicio({
  ubicacionId,
  ubicacionEtiqueta,
  ubicacionTipo,
  terminal,
  modulos,
}: {
  ubicacionId: string;
  ubicacionEtiqueta: string;
  ubicacionTipo: "tienda" | "almacen" | "taller";
  terminal: boolean;
  modulos: readonly string[];
}) {
  const ve = pisoQueSeVe({ ubicacionTipo, terminal, modulos });
  if (!ve.alguno) return null;
  // Lo que la cuenta puede abrir: ningún botón lleva a un «Sin acceso».
  const acceso: AccesoPiso = { existencias: modulos.includes("existencias"), conteos: modulos.includes("conteos") };
  // Las dos lecturas a la vez y cada una solo si la cuenta ve su módulo: sin él, la base responde 42501 y el log se llenaría en cada carga del Inicio.
  const [frescura, plan]: [LecturaParaElInicio<PisoFrescuraInicio> | null, LecturaParaElInicio<PisoPlanInicio> | null] = await Promise.all([
    ve.frescura ? getPisoDeFrescuraParaElInicio({ ubicacionId, ubicacionEtiqueta, ubicacionTipo }) : Promise.resolve(null),
    ve.plan ? getPisoDelPlanParaElInicio({ ubicacionId, nombreSede: ubicacionEtiqueta }) : Promise.resolve(null),
  ]);
  const hayFrescura = frescura !== null && frescura.estado !== "no_aplica";
  const hayPlan = plan !== null && plan.estado !== "no_aplica";
  if (!hayFrescura && !hayPlan) return null;
  const vistas = vistaPisoInicio({ frescura: frescura?.estado === "ok" ? frescura.datos : null, plan: plan?.estado === "ok" ? plan.datos : null }, acceso);
  return (
    <section data-guia="inicio.piso" aria-label="Tu piso">
      <Etiqueta>Tu piso</Etiqueta>
      <div className={hayFrescura && hayPlan ? REJILLA : "grid grid-cols-1 gap-3"}>
        {hayFrescura && (vistas.frescura ? <CifraFrescura v={vistas.frescura} /> : <CifraCaida etiqueta="Frescura del piso" href={HREF_FRESCURA} />)}
        {hayPlan && (vistas.plan ? <CifraPlan v={vistas.plan} /> : <CifraCaida etiqueta="Plan del piso" href={HREF_PLAN} />)}
      </div>
    </section>
  );
}
