"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Desplegable, type Opcion } from "@/components/ui/campos";
import { calendarioDelSelector, campanasArchivadas, rotuloDeCampana, type CampanasLeidas, type RanuraCalendario } from "@/lib/plan-compra-reglas";

// El selector de campaña del plan (ADR-0372, B3 y B5): pasa entre las campañas activas (`?plan=<id>`) y, solo a quien puede (un líder), ofrece
// «+ Nueva campaña…», «Editar o quitar esta campaña…» y «Campañas archivadas (N)…», que abren su hoja. Las archivadas no salen en la lista: se
// ven desde su hoja. Con una sola campaña y nada más que ofrecer, no se dibuja: un control sin nada que elegir es ruido.
// Desde C1 (Felipe 2026-10-12) la lista va por momento y por año: «En curso», «Por venir · 2026», «Por venir · 2027»… y «Terminadas» (solo las
// del último año; las más viejas se miran en el Historial). Las acciones van al final, en su propio grupo.
// Desde la act. 2026-10-12 f (Felipe: «opción A») el selector ES el calendario de Catálogo ▸ Etiquetas: además de los planes, cada campaña que
// todavía no tiene plan este año o el que viene. Tocarla abre su hoja ya llena para armarlo (`onArmar`); quien no es líder la ve, apagada. Las
// campañas sin fechas salen al final, solo para el líder, para que se las ponga en Etiquetas. «+ Campaña que no está en el calendario» crea una
// nueva en Etiquetas con su plan.

const NUEVA = "__nueva";
const EDITAR = "__editar";
const ARCHIVADAS = "__archivadas";
const DEL_CALENDARIO = "cal:";

export function SelectorCampana({
  campanas,
  actualId,
  hoy,
  ruta = "/compras/plan",
  puedeCrear,
  onNueva,
  onArmar,
  onEditar,
  onArchivadas,
  estirarEnCelular = false,
}: {
  campanas: CampanasLeidas;
  actualId: string;
  /** Hoy en Lima («aaaa-mm-dd», el de la base): decide qué está en curso, por venir o terminado. */
  hoy: string;
  /** A qué pantalla lleva elegir una campaña: el Plan (por defecto) o sus Resultados. */
  ruta?: string;
  /** Un líder: crea, edita, quita y restaura campañas (la base lo exige también). */
  puedeCrear: boolean;
  onNueva: () => void;
  /** Tocar una campaña del calendario que aún no tiene plan: abre su hoja para armarlo (solo un líder). */
  onArmar?: (ranura: RanuraCalendario) => void;
  onEditar: () => void;
  onArchivadas: () => void;
  /** En el celular ocupa lo que sobra de su fila y corta el nombre con «…» (la cabecera del Plan, junto a sus dos íconos). */
  estirarEnCelular?: boolean;
}) {
  const router = useRouter();
  const enLista = useMemo(() => calendarioDelSelector(campanas, hoy, puedeCrear), [campanas, hoy, puedeCrear]);
  const archivadas = useMemo(() => campanasArchivadas(campanas), [campanas]);
  // La que está abierta sale en la lista aunque ya no le toque (terminó hace más de un año): sin ella, el selector no diría qué se está viendo.
  const actual = campanas.planes.find((c) => c.id === actualId && !c.archivado);
  const opciones = useMemo((): Opcion<string>[] => {
    const armar = puedeCrear && !!onArmar;
    const planes: Opcion<string>[] = enLista.map((x): Opcion<string> =>
      x.tipo === "plan"
        ? { valor: x.campana.id, texto: rotuloDeCampana(x.campana), grupo: x.grupo }
        : x.tipo === "calendario"
          ? // Sin plan todavía: el líder la arma con un toque; los demás la ven, apagada, para saber que viene.
            { valor: `${DEL_CALENDARIO}${x.ranura.etiquetaId}|${x.ranura.anio}`, texto: `${rotuloDeCampana(x.ranura)} · ${armar ? "armar plan" : "sin plan"}`, grupo: x.grupo, deshabilitada: !armar }
          : { valor: `sin-fechas:${x.etiqueta.id}`, texto: `${x.etiqueta.nombre} · ponle fechas en Etiquetas`, grupo: x.grupo, deshabilitada: true },
    );
    if (actual && !enLista.some((x) => x.tipo === "plan" && x.campana.id === actual.id)) planes.push({ valor: actual.id, texto: rotuloDeCampana(actual), grupo: "Terminadas" });
    if (!puedeCrear) return planes;
    const acciones: Opcion<string>[] = [{ valor: NUEVA, texto: "+ Campaña que no está en el calendario…", grupo: "Acciones" }];
    // Editar y archivar existen desde B5: si la base todavía no lo sabe, no se ofrece.
    if (campanas.edicion && actual) acciones.push({ valor: EDITAR, texto: "Editar o quitar esta campaña…", grupo: "Acciones" });
    if (campanas.edicion && archivadas.length > 0) acciones.push({ valor: ARCHIVADAS, texto: `Campañas archivadas (${archivadas.length})…`, grupo: "Acciones" });
    return [...planes, ...acciones];
  }, [enLista, actual, archivadas, campanas.edicion, puedeCrear, onArmar]);
  if (opciones.length < 2) return null;
  return (
    // La caja solo lleva el ancla de la guía (ADR-0389): el desplegable no recibe atributos sueltos.
    <div data-guia="plan.selector" className={estirarEnCelular ? "min-w-0 flex-1 sm:flex-none" : undefined}>
      <Desplegable
        valor={actual ? actualId : ""}
        onValor={(v) => {
          if (v === NUEVA) return onNueva();
          if (v === EDITAR) return onEditar();
          if (v === ARCHIVADAS) return onArchivadas();
          if (v.startsWith(DEL_CALENDARIO)) {
            const x = enLista.find((e) => e.tipo === "calendario" && `${DEL_CALENDARIO}${e.ranura.etiquetaId}|${e.ranura.anio}` === v);
            if (x?.tipo === "calendario") onArmar?.(x.ranura);
            return;
          }
          if (v !== actualId) router.push(`${ruta}?plan=${v}`);
        }}
        opciones={opciones}
        forma="pastilla"
        alineacion="derecha"
        // Las campañas crecen seis por año: se buscan por nombre o por año («madre», «2027») aunque todavía sean pocas (Felipe 2026-10-12).
        conBuscador
        etiquetaAccesible="Campaña"
        marcador="Campaña"
        // En la cabecera mide lo mismo que «Exportar» (40 px): la pastilla de la sede mide 30 y quedaba más baja en la misma fila.
        className={`[&>button]:h-10 ${estirarEnCelular ? "max-sm:w-full max-sm:[&>button]:w-full max-sm:[&>button]:justify-between max-sm:[&>button>span]:truncate" : ""}`}
      />
    </div>
  );
}
