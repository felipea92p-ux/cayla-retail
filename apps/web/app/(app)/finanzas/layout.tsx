import { Suspense } from "react";
import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getSedesDelTelar } from "@/lib/finanzas-telar";
import { ARBOL, esGrupo, type Hoja } from "@/lib/menu";
import { hoyLima } from "@/lib/fechas-lima";
import { mesDelDia } from "@/lib/finanzas-telar-reglas";
import { MesaDeMando, type SubmoduloTelar } from "@/components/finanzas/telar/MesaDeMando";

// El telar de Finanzas (Felipe 2026-10-23): la mesa de mando se monta UNA vez aquí y la comparten los seis submódulos. Las
// pestañas salen de las hijas de Finanzas en el menú (`lib/menu.ts`) que la cuenta ve, así que la barra y el lateral nunca
// muestran submódulos distintos. Los hilos de sede: quien ve las finanzas de todo (`veFinanzasDeTodoDe`, la misma pregunta
// que la base, `fn_ve_finanzas_de_todo`) elige entre todas las ubicaciones activas y la empresa; los demás ven solo su sede.
// La puerta de cada submódulo sigue en su propio layout (`exigirModulo`).
export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActualV2();
  const finanzas = ARBOL.find((n) => n.id === "finanzas");
  const submodulos: SubmoduloTelar[] =
    finanzas && esGrupo(finanzas)
      ? finanzas.hijos
          .filter((h): h is Hoja => h.estado === "viva" && "ruta" in h && !!h.modulo && veModulo(persona, h.modulo))
          .map((h) => ({ clave: h.id, etiqueta: h.etiqueta, ruta: h.ruta }))
      : [];
  if (!submodulos.length) return <>{children}</>;

  const { sedes, veTodo, propia } = await getSedesDelTelar();

  return (
    <>
      {/* `useSearchParams` pide su Suspense; sin datos de la URL, la barra se dibuja con la sede y el mes por defecto. */}
      <Suspense fallback={null}>
        <MesaDeMando submodulos={submodulos} sedes={sedes} veTodo={veTodo} sedePropia={propia} mesDeHoy={mesDelDia(hoyLima())} puedeRegistrarGasto={veModulo(persona, "gastos")} />
      </Suspense>
      {children}
    </>
  );
}
