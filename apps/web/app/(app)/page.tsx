import Link from "next/link";
import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { fechaCorta, listarMovimientos, textoDelta } from "@/lib/movimientos-v2";
import { etiquetaMovimiento } from "@/lib/movimientos-reglas";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { getAperturasPorRevisar } from "@/lib/caja";
import { getHoyDeLaSede, type HoyDeLaSede } from "@/lib/inicio";
import { accesosInicio, colasInicio, mostrarHoy, resumirHoy } from "@/lib/inicio-reglas";
import { aterrizajeDe } from "@/lib/menu";
import { formatoSoles } from "@/lib/resumen-formato";
import { contarVencidas } from "@/lib/por-regularizar";
import { contarComprobantesAtascados } from "@/lib/comprobantes";

// Inicio en cuatro capas, de arriba abajo, cada una con su pregunta: «Hoy» (¿cómo voy?), «Por atender» (¿qué me
// toca?), «Ir a» (¿a dónde voy?) y «Actividad reciente». Estructura tomada de tres referentes públicos (tablero del
// día, colas por procesar y malla de accesos); maqueta y comparación en docs/maquetas/inicio-referentes-2026-09/ y
// el porqué en docs/pantallas/inicio.md. Las reglas (qué se muestra a quién) viven en `lib/inicio-reglas.ts`.
//
// Cambia según el rol y la ubicación activa: la líder ve toda la sede y la meta; la colaboradora solo lo suyo (la
// RPC `fn_ventas_del_dia` ya le devuelve solo sus ventas); el Taller no ve «Hoy» (no vende) y su primer acceso es
// Producción. Se quitaron las tarjetas de conteo de catálogo (Productos, Variantes, Unidades): eran curiosidad, no
// decisión, y su suma en JS tenía un tope silencioso de 1.000 filas (auditoría, tareas #5 y #9).
//
// Cada bloque falla por separado: un dato que no se pudo leer se dice («No pude leer esto»), nunca se dibuja como 0.

export default async function InicioPage() {
  const persona = await requirePersonaActualV2();
  // Una terminal cuyo ROL ve el Punto de Venta aterriza ahí (pedido de Felipe, 2026-09-21; sin tipo desde 2026-09-22): su
  // menú no tiene «Inicio», su casa es el mostrador. Es un aterrizaje, no un candado. La regla vive en `aterrizajeDe`.
  const modulos = persona.modulos.map((m) => m.clave);
  const destino = aterrizajeDe({ terminal: persona.terminal, modulos });
  if (destino !== "/") redirect(destino);
  const esLider = persona.rol === "lider";
  const perfil = { rol: persona.rol, ubicacionTipo: persona.ubicacionTipo, terminal: persona.terminal, modulos };

  const [hoy, trasladosPorAtender, prendasVencidas, aperturasPorRevisar, comprobantesAtascados, actividad] = await Promise.all([
    mostrarHoy(perfil) ? getHoyDeLaSede(persona.ubicacionId, esLider) : Promise.resolve(null),
    // Total (nunca lanza): devuelve null si no pudo leer. Es la misma cifra del «2» del menú.
    getTrasladosPorAtender(persona.ubicacionId, puede(persona, "ajustarInventario")),
    // ADR-0179: el aviso de prendas vendidas sin registrar que almacén no regularizó a tiempo es del líder.
    esLider ? contarVencidas() : Promise.resolve(undefined),
    // ADR-0186: aperturas de caja que no coincidieron con el último cierre, el aviso al líder. Total (null si falla).
    esLider ? getAperturasPorRevisar() : Promise.resolve(undefined),
    // PL-114: comprobantes que el reintento automático ya soltó sin llegar a SUNAT, el aviso al líder. Total (null si falla).
    esLider ? contarComprobantesAtascados() : Promise.resolve(undefined),
    // Los últimos 8 de todo el historial (sin el recorte de 30 días de la pantalla de Movimientos): en Inicio
    // importa «lo último», no un período. Dato secundario: si falla, el resto sigue y el aviso va en su lugar.
    listarMovimientos(persona.ubicacionId, {}, { limite: 8 }).then(
      (pagina) => ({ filas: pagina.filas, fallo: null as string | null }),
      () => ({
        filas: [],
        fallo: "No se pudo cargar la actividad reciente. Lo demás de esta pantalla sí está al día.",
      })
    ),
  ]);
  const { filas: movimientosRecientes, fallo: falloActividad } = actividad;

  const colas = colasInicio({
    traslados: trasladosPorAtender,
    prendasVencidas,
    aperturas: aperturasPorRevisar === undefined ? undefined : (aperturasPorRevisar?.length ?? null),
    comprobantesAtascados,
  });
  const accesos = accesosInicio(perfil, hoy?.cajaAbierta ?? null);
  // La sede ya la dicen el selector de la cabecera y los textos de abajo: aquí solo el saludo. A un APARATO (ADR-0162, la
  // terminal que no vende) no se lo saluda por su «primer nombre» —saldría «Hola, Terminal»—: se lo nombra entero.
  const primerNombre = persona.nombre.trim().split(/\s+/)[0];
  const saludo = persona.terminal ? persona.nombre : primerNombre ? `Hola, ${primerNombre}` : "Hola";

  return (
    <div className="space-y-7 sm:space-y-10">
      <div>
        <h1 className="font-display text-2xl text-tinta">{saludo}</h1>
        <p className="mt-1 text-sm text-tinta/65">Así va {persona.ubicacionEtiqueta}</p>
      </div>

      {hoy && <SeccionHoy hoy={hoy} esLider={esLider} />}

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Por atender</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {colas.map((c) => (
            <Link key={c.clave} href={c.href} className="card-cayla group block p-5 transition-colors hover:bg-papel">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-tinta group-hover:text-rojo">{c.titulo}</p>
                <span
                  className={`min-w-6 rounded-full px-2 text-center text-xs font-semibold tabular-nums ${
                    c.cantidad === null ? "bg-tinta/10 text-tinta/75" : c.cantidad > 0 ? "bg-ambar text-crema" : "bg-verde text-crema"
                  }`}
                >
                  {c.cantidad === null ? "Sin leer" : c.cantidad}
                </span>
              </div>
              <p className="mt-1 text-xs text-tinta/65">{c.detalle}</p>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Ir a</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {accesos.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={
                a.principal
                  ? "block rounded-xl border border-tinta bg-tinta p-5 text-crema transition-colors hover:bg-tinta/90"
                  : "card-cayla group block p-5 transition-colors hover:bg-papel"
              }
            >
              <p className={`text-sm font-medium ${a.principal ? "" : "text-tinta group-hover:text-rojo"}`}>{a.etiqueta}</p>
              <p className={`mt-1 text-xs ${a.principal ? "text-crema/75" : "text-tinta/65"}`}>{a.detalle}</p>
            </Link>
          ))}
        </div>
      </div>

      {falloActividad && (
        <p role="status" className="rounded-xl border border-tinta/12 bg-papel px-5 py-3 text-sm text-tinta/75">
          {falloActividad}
        </p>
      )}

      {movimientosRecientes.length > 0 && (
        <div>
          <p className="label-cayla mb-3 text-[11px] text-tinta/65">Actividad reciente</p>
          <div className="card-cayla divide-y divide-tinta/10">
            {movimientosRecientes.map((m) => (
              <div key={m.id} className="flex items-baseline gap-3 px-5 py-2.5">
                <span className="w-16 shrink-0 text-xs tabular-nums text-tinta/65">{fechaCorta(m.fecha).slice(0, 5)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                  <span className="label-cayla text-[11px] text-tinta/65">{etiquetaMovimiento(m)}</span> {m.referencia}{" "}
                  <span className="text-tinta/65">{m.sku}</span>
                </span>
                <span className={`shrink-0 text-sm tabular-nums ${m.delta > 0 ? "text-verde-profundo" : "text-tinta/75"}`}>{textoDelta(m)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeccionHoy({ hoy, esLider }: { hoy: HoyDeLaSede; esLider: boolean }) {
  if (hoy.totales === null) {
    return (
      <div>
        <p className="label-cayla mb-3 text-[11px] text-tinta/65">Hoy</p>
        <p role="status" className="rounded-xl border border-tinta/12 bg-papel px-5 py-3 text-sm text-tinta/75">
          No se pudieron cargar las ventas de hoy. Lo demás de esta pantalla sí está al día.
        </p>
      </div>
    );
  }
  const r = resumirHoy(hoy.totales, hoy.semanaAnterior, hoy.metaVentaDiaria, hoy.nombreDia);

  return (
    <div>
      <p className="label-cayla mb-3 text-[11px] text-tinta/65">{esLider ? "Hoy" : "Tu día"}</p>
      {/* En celular la líder ve «Ventas» a todo lo ancho y, debajo, valor medio y meta lado a lado: así «Por atender» y
          «Vender» caben en la primera pantalla. Desde `sm` vuelven las tres en fila. */}
      <div className={`grid grid-cols-2 gap-3 ${esLider ? "sm:grid-cols-3" : ""}`}>
        <Tarjeta
          etiqueta={esLider ? "Ventas" : "Tus ventas"}
          valor={formatoSoles(r.importe)}
          className={esLider ? "col-span-2 sm:col-span-1" : ""}
        >
          {esLider && r.comparativo ? (
            <span className={r.comparativo.positivo ? "text-verde-profundo" : "text-ambar-profundo"}>{r.comparativo.texto}</span>
          ) : esLider ? (
            // Sin comparativo: la semana pasada fue cero a esta hora o no se pudo leer. Se dice, no se calla.
            `Sin base para comparar con el ${hoy.nombreDia} pasado`
          ) : (
            `${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`
          )}
        </Tarjeta>
        {esLider ? (
          <>
            <Tarjeta etiqueta="Valor medio" valor={r.valorMedio === null ? "—" : formatoSoles(r.valorMedio)}>
              {r.ventas === 0 ? "Aún sin ventas" : `${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`}
            </Tarjeta>
            {r.meta ? (
              <Tarjeta etiqueta="Meta del día" valor={`${r.meta.pct} %`}>
                Faltan {formatoSoles(r.meta.falta)} de {formatoSoles(r.meta.meta)}
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-tinta/10" aria-hidden>
                  <span className="block h-full rounded-full bg-verde" style={{ width: `${r.meta.barra}%` }} />
                </span>
              </Tarjeta>
            ) : (
              <Tarjeta etiqueta="Meta del día" valor="—">
                Esta sede no tiene meta diaria configurada
              </Tarjeta>
            )}
          </>
        ) : (
          <Tarjeta etiqueta="Caja" valor={hoy.cajaAbierta === null ? "—" : hoy.cajaAbierta ? "Abierta" : "Cerrada"}>
            {hoy.cajaAbierta === null ? "No se pudo leer la caja" : hoy.cajaAbierta ? "Puedes vender" : "Ábrela en Caja para vender"}
          </Tarjeta>
        )}
      </div>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  className = "",
  children,
}: {
  etiqueta: string;
  valor: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`card-cayla p-4 sm:p-5 ${className}`}>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-1.5 text-2xl text-tinta sm:mt-2 sm:text-3xl">{valor}</p>
      {children && <p className="mt-1 text-xs text-tinta/65">{children}</p>}
    </div>
  );
}
