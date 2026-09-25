import Link from "next/link";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getExistencias, resumirExistencias, getPrendasDanadasPendientes } from "@/lib/inventario-v2";
import { getSububicaciones, encontrarPorTipo } from "@/lib/sububicaciones";
import { getTrasladosEnCurso } from "@/lib/traslados";
import { getFilasSemanaDeSede } from "@/lib/resumen-inventario";
import { getRitmoRecientePorVariante } from "@/lib/existencias-ritmo-servidor";
import { deltaDisponibleSede, recortarFilaSemana } from "@/lib/existencias-categorias";
import { recomendacionesDeSede, accionHoyPorVariante } from "@/lib/existencias-recomendaciones";
import { politicaDe } from "@/lib/politica-operativa-inventario";
import { getApartadosAbiertos } from "@/lib/apartados";
import { estaAtrasado } from "@/lib/traslados-reglas";
import { InventarioPanel } from "@/components/InventarioPanel";
import { InventarioHero, fotoHeroPorPantalla } from "@/components/InventarioHero";

// Fase UI 2 (2026-09-14): piso de venta vs. almacén de tienda
// (20260914210000_inventario_piso_almacen.sql). Sigue siendo UNA tabla
// `stock` — la separación es una columna más (`sububicacion_id`), no dos
// tablas como en V1 — pero ahora una ubicación puede tener más de una fila
// por variante, así que la pantalla necesita saber agregar antes de
// mostrar. Esa agregación vive en `getStockPorUbicacion`, no acá.
//
// Existencias (2026-09-16, diseño de Felipe): a cada prenda se le suma lo que
// viene en camino hacia acá y lo que hay en las otras sedes
// (`getExistencias`), y arriba tres cifras: cuánto hay, cuántas prendas
// piden algo, cuánto está por llegar. Esta página sigue siendo solo "traer
// los datos y elegir el layout".
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ubicacion?: string }>;
}) {
  const persona = await exigirModulo("existencias"); // ADR-0161: URL directa sin el módulo en su rol → «Sin acceso»
  const { ubicacion: ubicacionQuery } = await searchParams;
  const ubicaciones = await getUbicaciones();

  const ubicacionActivaId =
    persona.rol === "lider" && ubicacionQuery && ubicaciones.some((u) => u.id === ubicacionQuery)
      ? ubicacionQuery
      : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId);

  // «Acción hoy»/Cobertura piso solo tienen sentido donde se vende: una tienda.
  const vende = ubicacionActiva?.tipo === "tienda";
  const [stockBase, sububicaciones, traslados, danadosPendientes, apartados, filasSemana] = await Promise.all([
    // D-54 (ADR-0159): sin el toggle «Con datos de prueba» que sí tienen Caja/Ventas, Existencias
    // pide siempre el default de la función (apagado) — los productos archivados como dato de
    // prueba, nunca borrados, quedan afuera.
    getExistencias(ubicacionActivaId, ubicaciones),
    getSububicaciones(ubicacionActivaId),
    getTrasladosEnCurso(ubicacionActivaId),
    getPrendasDanadasPendientes(ubicacionActivaId),
    // Reservas para clientas (ADR-0141): solo donde se vende. Taller no aparta.
    // Una terminal libera cualquier apartado (Felipe, 2026-09-22, ADR-0162): `persona.terminal` lo dice.
    vende ? getApartadosAbiertos(ubicacionActivaId, { esTerminal: persona.terminal }) : Promise.resolve([]),
    // Rediseño 2026-09-22: costo/precio/categoría y el delta de 7 días para «Disponible total» y el
    // overlay de categorías — sin cambios (2026-09-25): sigue siendo un dato de 7 días aparte del
    // Ritmo reciente, que ahora vive en `existencias-ritmo.ts`.
    getFilasSemanaDeSede(ubicacionActivaId),
    // REHECHO 2026-09-25: ya NO se pide `getFilasRecientesDeSede` (`fn_resumen_variantes`, 30 días)
    // para Existencias — el motor nuevo de «Acción hoy» (`calcularAccionHoy`) decide con lo que
    // Existencias ya trae en `stock` (piso, almacén, en tránsito), sin una cuarta reconstrucción
    // del ledger. Esa función sigue viva para Producción («Nueva orden», ADR-0133 F5).
  ]);

  // Política operativa de Inventario (Felipe, 2026-09-25): una sola casa para los umbrales que
  // gobiernan «Acción hoy» — hoy global, con override futuro por sede (`politicaDe`).
  const politica = politicaDe(ubicacionActivaId);

  // Ritmo reciente / Cobertura piso (2026-09-25): sobre el ledger único (`fn_ledger_puntos`), no
  // sobre `fn_resumen_variantes` — depende de conocer las variantes de esta sede primero.
  const varianteIds = stockBase.map((f) => f.varianteId);
  const pisoPorVariante = new Map(stockBase.map((f) => [f.varianteId, f.piso ?? 0]));
  const ritmoReciente = vende
    ? await getRitmoRecientePorVariante(ubicacionActivaId, varianteIds, pisoPorVariante)
    : { datos: null, fallo: null };

  // Motor único de «Acción hoy» (`existencias-recomendaciones.ts`, sin `planDeReposicion`): sobre
  // `stockBase` directo — piso/almacén/en tránsito ya vienen ahí, ninguna otra reconstrucción.
  // Regla física de piso (2026-09-25, cuarta ronda): ya NO recibe Ritmo reciente ni Cobertura
  // piso — no le hacen falta para decidir nada (`politica.umbralStockPisoReposicion` manda solo).
  const accionHoy = vende ? accionHoyPorVariante(stockBase, politica) : new Map();

  // Ritmo reciente/Cobertura piso son dato SECUNDARIO de sus propias columnas — ya no alimentan
  // Acción hoy: si su cálculo falla, esas dos columnas quedan en «N/D» y se avisa, pero la
  // decisión de reponer (que no depende de la RPC) sigue firme.
  const stock = stockBase.map((f) => ({
    ...f,
    ritmoReciente: ritmoReciente.datos?.ritmo.get(f.varianteId) ?? null,
    coberturaPiso: ritmoReciente.datos?.cobertura.get(f.varianteId) ?? null,
    accionHoy: accionHoy.get(f.varianteId) ?? null,
  }));
  // «Reponer a piso hoy» (tarjeta y filtro) cuenta por «Acción hoy» — MISMA fuente que la columna
  // de la tabla y el botón inline «Reponer»: una tarjeta que contara distinto de lo que la fila
  // muestra sería exactamente la incoherencia que Felipe pidió cerrar (sección 15/16, 2026-09-25).
  const resumen = resumirExistencias(stock, [...accionHoy.values()].filter((a) => a.tipo === "reponer_a_piso").length);
  const sububicacionPiso = encontrarPorTipo(sububicaciones, "piso_venta");
  const sububicacionAlmacen = encontrarPorTipo(sububicaciones, "almacen_tienda");

  // «Bajar al piso» (ADR-0208): la única entrada a /inventario/bajar (Felipe, 2026-09-25; el lateral no cambia). Solo si
  // su rol ve «Bajada al piso» y si lo que se mira es SU sede activa y separa piso y almacén: esa pantalla baja siempre en
  // la sede activa, y en otra (o en el Taller) no tendría nada que bajar.
  const puedeBajarAlPiso =
    veModulo(persona, "bajada_piso") && ubicacionActivaId === persona.ubicacionId && sububicacionPiso !== null && sububicacionAlmacen !== null;

  // Lo que viene HACIA esta ubicación, para la tarjeta «En camino»: cuántos
  // traslados, cuándo llega el próximo y si alguno ya debería haber llegado.
  const haciaAca = traslados.filter((t) => t.ubicacionDestinoId === ubicacionActivaId);
  const proximaLlegada = haciaAca.map((t) => t.fechaEstimadaLlegada).filter((f): f is string => !!f).sort()[0] ?? null;
  const enCamino = {
    traslados: haciaAca.length,
    proximaLlegada,
    // Solo lo que sigue en camino y ya debió llegar: un traslado con diferencia ya llegó (lo que espera es la
    // revisión de un líder) y no está «atrasado». Mismo criterio que la pantalla Traslados.
    atrasados: haciaAca.filter((t) => t.estado === "en_transito" && t.fechaEstimadaLlegada && estaAtrasado(t.fechaEstimadaLlegada, t.estado)).length,
  };

  // La foto es del momento en que se cargó: la app no sincroniza en segundo
  // plano, y decir «actualizado hace 2 min» prometería algo que no pasa.
  const horaCarga = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });

  const deltaSede = deltaDisponibleSede(filasSemana);
  const recomendaciones = vende ? recomendacionesDeSede(stockBase, politica) : [];

  return (
    <div className="space-y-4">
      {/* Sin selector de sede propio ni interruptor de «datos de prueba» a propósito (Felipe,
          2026-09-22): el selector global de la barra superior ya cambia toda la app, y uno
          segundo acá desacomodaba el layout al abrirse; el de «datos de prueba» se quitó del
          todo (render, estado y lectura de `?prueba=`), no solo se ocultó. */}
      <InventarioHero
        eyebrow="Inventario · Existencias"
        titulo={ubicacionActiva?.nombre ?? "—"}
        descripcion="Qué hay en piso y almacén, qué viene en camino y qué deberías reponer hoy."
        auxiliar={<p className="mt-1 text-xs text-taupe">Vista cargada a las {horaCarga} — recarga para ver lo último.</p>}
        foto={fotoHeroPorPantalla("existencias")}
        variante="integrado"
        accion={
          <>
            {/* Sobre la foto de la cabecera, el secundario transparente no se lee: lleva fondo de papel. */}
            {puedeBajarAlPiso && (
              <Link href="/inventario/bajar" className="btn-cayla btn-secundario bg-papel">
                Bajar al piso
              </Link>
            )}
            <Link href="/inventario/mover" className="btn-cayla btn-primario">
              + Nuevo traslado
            </Link>
          </>
        }
      />

      {/* `key` por sede: cambiar de sede (selector de arriba o `?ubicacion=`) es un `router.refresh`, no una
          pantalla nueva, y sin la llave el panel conservaba sus filtros. Un filtro de TRU («Por colgar»,
          «Dañado», una talla) aplicado al Taller dejaba la tabla vacía, sin control visible que lo explicara. */}
      <InventarioPanel
        key={ubicacionActivaId}
        ubicacionId={ubicacionActivaId}
        stock={stock}
        resumen={resumen}
        enCamino={enCamino}
        sububicaciones={sububicaciones}
        sububicacionPiso={sububicacionPiso}
        sububicacionAlmacen={sububicacionAlmacen}
        danadosPendientes={danadosPendientes}
        apartados={apartados}
        esLider={persona.rol === "lider"}
        puedeAjustar={puede(persona, "ajustarInventario")}
        coberturaFallo={ritmoReciente.fallo}
        filasSemana={filasSemana.map(recortarFilaSemana)}
        deltaSede={deltaSede}
        recomendaciones={recomendaciones}
        politica={politica}
      />
    </div>
  );
}
