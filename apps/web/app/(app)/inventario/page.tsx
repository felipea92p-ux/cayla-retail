import Link from "next/link";
import { exigirModulo, puede, veModulo } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getExistencias, resumirExistencias, getPrendasDanadasPendientes } from "@/lib/inventario-v2";
import { getSububicaciones, encontrarPorTipo } from "@/lib/sububicaciones";
import { getTrasladosEnCurso } from "@/lib/traslados";
import { getCoberturaPorVariante, getFilasRecientesDeSede, getFilasSemanaDeSede } from "@/lib/resumen-inventario";
import { deltaDisponibleSede, recortarFilaSemana } from "@/lib/existencias-categorias";
import { recomendacionesDeSede } from "@/lib/existencias-recomendaciones";
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

  // La cobertura («cuánto dura este stock al ritmo reciente») solo tiene sentido donde se vende: una tienda.
  const vende = ubicacionActiva?.tipo === "tienda";
  const [stockBase, sububicaciones, traslados, danadosPendientes, cobertura, apartados, filasSemana, filasRecientes] = await Promise.all([
    // D-54 (ADR-0159): sin el toggle «Con datos de prueba» que sí tienen Caja/Ventas, Existencias
    // pide siempre el default de la función (apagado) — los productos archivados como dato de
    // prueba, nunca borrados, quedan afuera.
    getExistencias(ubicacionActivaId, ubicaciones),
    getSububicaciones(ubicacionActivaId),
    getTrasladosEnCurso(ubicacionActivaId),
    getPrendasDanadasPendientes(ubicacionActivaId),
    vende ? getCoberturaPorVariante(ubicacionActivaId) : Promise.resolve(null),
    // Reservas para clientas (ADR-0141): solo donde se vende. Taller no aparta.
    // Una terminal libera cualquier apartado (Felipe, 2026-09-22, ADR-0162): `persona.terminal` lo dice.
    vende ? getApartadosAbiertos(ubicacionActivaId, { esTerminal: persona.terminal }) : Promise.resolve([]),
    // Rediseño 2026-09-22: costo/precio/categoría y el delta de 7 días para «Disponible total»,
    // «Ritmo de venta (7D)» de la tabla y el overlay de categorías — misma RPC que ya usaba la cobertura.
    getFilasSemanaDeSede(ubicacionActivaId),
    // «Ver recomendaciones»: el ritmo de `DIAS_RITMO_RECIENTE` (30 días, no 7) — la misma ventana que ya
    // usa `getCoberturaPorVariante` — es la que espera `planDeReposicion` (el motor de Producción).
    vende ? getFilasRecientesDeSede(ubicacionActivaId) : Promise.resolve([]),
  ]);
  // Dato secundario: si su cálculo falló, cada fila queda en «N/D» y se avisa; el stock no se cae.
  const stock = cobertura?.datos ? stockBase.map((f) => ({ ...f, cobertura: cobertura.datos?.[f.varianteId] ?? null })) : stockBase;
  const resumen = resumirExistencias(stock);
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
  const recomendaciones = ubicacionActiva && vende ? recomendacionesDeSede(filasRecientes, ubicacionActiva) : [];

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
        coberturaFallo={cobertura?.fallo ?? null}
        filasSemana={filasSemana.map(recortarFilaSemana)}
        deltaSede={deltaSede}
        recomendaciones={recomendaciones}
      />
    </div>
  );
}
