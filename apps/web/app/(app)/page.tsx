import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { getAperturasPorRevisar } from "@/lib/caja";
import { getEquipoDeHoy, getFuentesAvisos, getHoyDeLaSede, type HoyDeLaSede } from "@/lib/inicio";
import { mostrarHoy, resumirHoy } from "@/lib/inicio-reglas";
import {
  accesosRapidos,
  avisosInicio,
  avisosVisibles,
  cookieEleccion,
  corteCelular,
  leerEleccion,
  textoEstado,
  type AccesoRapido,
  type AvisosVisibles,
  type ClaveAccesoIcono,
  type MiembroEquipo,
  type NivelAviso,
} from "@/lib/inicio-avisos";
import { aterrizajeDe } from "@/lib/menu";
import { formatoSoles } from "@/lib/resumen-formato";
import { contarVencidas } from "@/lib/por-regularizar";
import { contarComprobantesAtascados } from "@/lib/comprobantes";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { AjustarInicio } from "@/components/inicio/AjustarInicio";

// Inicio por rol, computadora y celular (spike docs/maquetas/inicio-movil-roles-2026-09/, decisiones de Felipe del
// 2026-09-26, con 5 referentes: Shopify, Square, Toast, Dynamics 365 y Zebra). UN solo orden en todos los tamaños:
// cifras del día → «Te toca» → accesos → «Equipo de hoy». En computadora se reparte en dos columnas (lo que se decide a
// la izquierda, la gente a la derecha); en celular se apila, y «Vender» queda fijo abajo, al alcance del pulgar (es una
// acción de esta pantalla, no una barra de menú: el cajón ☰ del ADR-0206 sigue siendo la navegación).
//
// Reemplaza al Inicio de cuatro capas («Hoy», «Por atender», «Ir a», «Actividad reciente»): «Ir a» pasa a accesos del
// rol y «Actividad reciente» (8 movimientos sin decisión) a «Equipo de hoy». Qué se muestra a quién vive en
// `lib/inicio-reglas.ts` (cifras) y `lib/inicio-avisos.ts` (avisos, filtro, accesos, equipo), ambos con pruebas.
//
// Cada bloque falla por separado: un dato que no se pudo leer se dice, nunca se dibuja como 0.

export default async function InicioPage() {
  const persona = await requirePersonaActualV2();
  // Una terminal cuyo ROL ve el Punto de Venta aterriza ahí (pedido de Felipe, 2026-09-21): su casa es el mostrador.
  const modulos = persona.modulos.map((m) => m.clave);
  const destino = aterrizajeDe({ terminal: persona.terminal, modulos });
  if (destino !== "/") redirect(destino);
  const esLider = persona.rol === "lider";
  const ve = (m: (typeof modulos)[number]) => modulos.includes(m);
  const perfil = { rol: persona.rol, ubicacionTipo: persona.ubicacionTipo, terminal: persona.terminal, modulos };
  const vende = persona.ubicacionTipo === "tienda" && ve("vender") && !persona.terminal;

  const [hoy, traslados, prendasVencidas, aperturas, comprobantesAtascados, equipo] = await Promise.all([
    mostrarHoy(perfil) ? getHoyDeLaSede(persona.ubicacionId, esLider) : Promise.resolve(null),
    // Total (nunca lanza): la misma cifra del número del menú.
    ve("traslados") ? getTrasladosPorAtender(persona.ubicacionId, puede(persona, "ajustarInventario")) : Promise.resolve(undefined),
    // Las tres colas del líder (ADR-0179, ADR-0186, PL-114): no son de quien no lo es.
    esLider ? contarVencidas() : Promise.resolve(undefined),
    esLider ? getAperturasPorRevisar() : Promise.resolve(undefined),
    esLider ? contarComprobantesAtascados() : Promise.resolve(undefined),
    persona.ubicacionTipo === "tienda" && !persona.terminal ? getEquipoDeHoy(persona.ubicacionId, ve("actividad")) : Promise.resolve(undefined),
  ]);
  const fuentes = await getFuentesAvisos(
    { ubicacionId: persona.ubicacionId, esLider, esTerminal: persona.terminal, ve, pagaCompras: puede(persona, "verDineroCompras") },
    {
      traslados,
      prendasVencidas,
      aperturas: aperturas === undefined ? undefined : (aperturas?.length ?? null),
      comprobantesAtascados,
    }
  );
  const avisos = avisosInicio(fuentes);
  const cookie = cookieEleccion(persona.personaId);
  const eleccion = leerEleccion((await cookies()).get(cookie)?.value);
  const visibles = avisosVisibles(avisos, eleccion, esLider);
  const accesos = accesosRapidos({ esLider, ubicacionTipo: persona.ubicacionTipo, modulos });

  // A un APARATO (ADR-0162) no se lo saluda por su «primer nombre»: se lo nombra entero.
  const primerNombre = persona.nombre.trim().split(/\s+/)[0];
  const saludo = persona.terminal ? persona.nombre : primerNombre ? `Hola, ${primerNombre}` : "Hola";
  const etiquetaRol = persona.terminal
    ? "Terminal"
    : esLider
      ? "Líder"
      : persona.ubicacionTipo === "almacen"
        ? "Almacén"
        : persona.ubicacionTipo === "taller"
          ? "Taller"
          : "Integrante";
  const fecha = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" }).format(new Date());

  // El botón fijo del celular: vender en una tienda; recibir en el almacén. Nadie más lo necesita.
  const fijo = vende
    ? { href: "/vender", etiqueta: "Vender", icono: "vender" as const }
    : persona.ubicacionTipo === "almacen" && ve("recibir")
      ? { href: "/recibir", etiqueta: "Recibir mercadería", icono: "recibir" as const }
      : null;

  return (
    <div className={`space-y-6 ${fijo ? "pb-24 sm:pb-0" : ""}`}>
      <CabeceraPantalla
        sobretitulo={fecha}
        titulo={saludo}
        bajada={`${etiquetaRol} · ${persona.ubicacionEtiqueta}`}
        acciones={
          vende ? (
            <Link href="/vender" className="btn-cayla btn-primario hidden items-center gap-2 sm:inline-flex">
              <Icono clave="vender" /> Vender
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {hoy && <SeccionHoy hoy={hoy} esLider={esLider} />}
          <TeToca
            visibles={visibles}
            ajustar={
              avisos.length > 0 ? (
                <AjustarInicio
                  avisos={avisos.map(({ clave, grupo, titulo, ocultable, urgenteSi }) => ({ clave, grupo, titulo, ocultable, urgenteSi }))}
                  eleccionInicial={eleccion}
                  esLider={esLider}
                  etiquetaRol={etiquetaRol.toLowerCase()}
                />
              ) : null
            }
          />
        </div>
        <div className="space-y-6">
          {accesos.length > 0 && <Accesos accesos={accesos} />}
          {equipo !== undefined && <EquipoDeHoy equipo={equipo} esLider={esLider} />}
        </div>
      </div>

      {fijo && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
          <Link href={fijo.href} className="flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema">
            <Icono clave={fijo.icono} /> {fijo.etiqueta}
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Cifras del día ───────────────────────────────────────────────────────────────────────────────

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <p className="label-cayla mb-2.5 text-[11px] text-tinta/65">{children}</p>;
}

function SeccionHoy({ hoy, esLider }: { hoy: HoyDeLaSede; esLider: boolean }) {
  const titulo = esLider ? "Hoy" : "Tu día";
  if (hoy.totales === null) {
    return (
      <section>
        <Etiqueta>{titulo}</Etiqueta>
        <p role="status" className="rounded-xl border border-tinta/12 bg-papel px-5 py-3 text-sm text-tinta/75">
          No se pudieron cargar las ventas de hoy. Lo demás de esta pantalla sí está al día.
        </p>
      </section>
    );
  }
  const r = resumirHoy(hoy.totales, hoy.semanaAnterior, hoy.metaVentaDiaria, hoy.nombreDia);
  const caja = hoy.cajaAbierta === null ? "No se pudo leer la caja" : hoy.cajaAbierta ? "Caja abierta" : "Caja cerrada: ábrela en Caja para vender";

  // Sin ventas todavía (las 9 a. m.): tres tarjetas en «S/ 0 · — · —» no dicen nada. Una línea dice lo útil.
  if (r.ventas === 0) {
    return (
      <section>
        <Etiqueta>{titulo}</Etiqueta>
        <div className="card-cayla flex items-start gap-3 px-4 py-3.5 text-sm text-tinta/80 sm:px-5">
          <Icono clave="caja" className="mt-0.5 size-[18px] text-tinta/60" />
          <p>
            <span className="font-semibold text-tinta">{esLider ? "Aún sin ventas hoy." : "Aún no tienes ventas hoy."}</span> {caja}
            {esLider && r.meta ? ` · meta ${formatoSoles(r.meta.meta)}` : ""}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Etiqueta>{titulo}</Etiqueta>
      {/* En celular la primera cifra va a todo lo ancho y las otras dos lado a lado; desde `sm`, las tres en fila. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tarjeta etiqueta={esLider ? "Ventas" : "Tus ventas"} valor={formatoSoles(r.importe)} className="col-span-2 sm:col-span-1">
          {esLider && r.comparativo ? (
            <span className={r.comparativo.positivo ? "text-verde-profundo" : "text-ambar-profundo"}>{r.comparativo.texto}</span>
          ) : esLider ? (
            `Sin base para comparar con el ${hoy.nombreDia} pasado`
          ) : (
            `${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`
          )}
        </Tarjeta>
        <Tarjeta etiqueta={esLider ? "Valor medio" : "Tu ticket"} valor={r.valorMedio === null ? "—" : formatoSoles(r.valorMedio)}>
          {`${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`}
        </Tarjeta>
        {esLider ? (
          r.meta ? (
            <Tarjeta etiqueta="Meta del día" valor={`${r.meta.pct} %`}>
              Faltan {formatoSoles(r.meta.falta)} de {formatoSoles(r.meta.meta)}
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-tinta/10" aria-hidden>
                <span className="block h-full rounded-full bg-verde" style={{ width: `${r.meta.barra}%` }} />
              </span>
            </Tarjeta>
          ) : (
            <Tarjeta etiqueta="Meta del día" valor="—">
              Esta sede no tiene meta diaria configurada
            </Tarjeta>
          )
        ) : (
          <Tarjeta etiqueta="Caja" valor={hoy.cajaAbierta === null ? "—" : hoy.cajaAbierta ? "Abierta" : "Cerrada"}>
            {hoy.cajaAbierta === null ? "No se pudo leer la caja" : hoy.cajaAbierta ? "Puedes vender" : "Ábrela en Caja para vender"}
          </Tarjeta>
        )}
      </div>
    </section>
  );
}

function Tarjeta({ etiqueta, valor, className = "", children }: { etiqueta: string; valor: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`card-cayla p-4 sm:p-5 ${className}`}>
      <p className="label-cayla text-[11px] text-tinta/65">{etiqueta}</p>
      <p className="font-display mt-1.5 text-2xl text-tinta tabular-nums sm:mt-2 sm:text-3xl">{valor}</p>
      {children && <div className="mt-1 text-xs text-tinta/65">{children}</div>}
    </div>
  );
}

// ── Te toca ──────────────────────────────────────────────────────────────────────────────────────

const PUNTO: Record<NivelAviso, string> = { urgente: "bg-rojo", toca: "bg-ambar", info: "bg-pizarra", sinleer: "bg-tinta/30", aldia: "bg-verde" };
const CANTIDAD: Record<NivelAviso, string> = {
  urgente: "bg-rojo text-crema",
  toca: "bg-ambar text-crema",
  info: "bg-pizarra text-crema",
  sinleer: "bg-tinta/10 text-tinta/75",
  aldia: "bg-verde text-crema",
};

function TeToca({ visibles, ajustar }: { visibles: AvisosVisibles; ajustar: React.ReactNode }) {
  const { activos, alDia, ocultosConAlgo } = visibles;
  const corte = corteCelular(activos);
  if (activos.length === 0 && alDia.length === 0 && ocultosConAlgo === 0) return null;
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="label-cayla text-[11px] text-tinta/65">Te toca</p>
        {ajustar}
      </div>
      {/* «Ver N más» en celular sin JavaScript: una casilla oculta; marcada, el contenedor muestra las filas extra. */}
      <div className="card-cayla divide-y divide-tinta/10 overflow-hidden [&:has(input[data-ver-mas]:checked)_[data-extra]]:flex">
        {activos.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <span className="size-2 shrink-0 rounded-full bg-verde" />
            <div>
              <p className="text-sm font-medium text-tinta">Nada pendiente</p>
              <p className="text-xs text-tinta/65">Todo lo que elegiste ver está al día.</p>
            </div>
          </div>
        ) : (
          activos.map((a, i) => (
            <Link
              key={a.clave}
              href={a.href}
              data-extra={i >= corte ? "" : undefined}
              className={`group items-start gap-3 px-4 py-3.5 transition-colors hover:bg-tinta/5 sm:px-5 ${i >= corte ? "hidden sm:flex" : "flex"}`}
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${PUNTO[a.nivel]}`} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-tinta group-hover:text-rojo">
                  {a.titulo}
                  {a.nivel === "urgente" && <span className="text-[10px] font-bold tracking-[0.1em] text-rojo uppercase">Urgente</span>}
                  {a.forzado && <span className="rounded-md bg-rojo/8 px-1.5 text-[10.5px] font-normal text-rojo-profundo">Lo ocultaste, pero es urgente</span>}
                </p>
                <p className="mt-0.5 text-xs text-tinta/65">{a.detalle}</p>
              </div>
              <span className={`min-w-6 self-center rounded-full px-2 text-center text-xs font-semibold tabular-nums ${CANTIDAD[a.nivel]}`}>
                {a.cantidad === null ? "Sin leer" : a.cantidad}
              </span>
              <Icono clave="chevron" className="size-4 self-center text-tinta/30" />
            </Link>
          ))
        )}
        {activos.length > corte && (
          <label className="block cursor-pointer px-4 py-3 text-center text-[13px] text-taupe has-[:checked]:hidden sm:hidden">
            <input type="checkbox" data-ver-mas className="sr-only" />
            Ver {activos.length - corte} más
          </label>
        )}
        {alDia.length > 0 && (
          <p className="flex items-center gap-2.5 px-4 py-3 text-xs text-tinta/65 sm:px-5">
            <Icono clave="check" className="size-4 text-verde" />
            <span>
              <span className="font-semibold text-verde">Al día:</span> {alDia.map((a) => a.titulo.toLowerCase()).join(" · ")}
            </span>
          </p>
        )}
        {ocultosConAlgo > 0 && (
          <p className="px-4 py-3 text-xs text-taupe sm:px-5">
            {ocultosConAlgo} {ocultosConAlgo === 1 ? "aviso que ocultaste tiene" : "avisos que ocultaste tienen"} algo pendiente.
          </p>
        )}
      </div>
    </section>
  );
}

// ── Accesos y equipo ─────────────────────────────────────────────────────────────────────────────

function Accesos({ accesos }: { accesos: AccesoRapido[] }) {
  const columnas = accesos.length >= 4 ? "grid-cols-4 lg:grid-cols-2" : accesos.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <section>
      <Etiqueta>Accesos</Etiqueta>
      <div className={`grid gap-2 ${columnas}`}>
        {accesos.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card-cayla flex flex-col items-center gap-1.5 px-1.5 py-3 text-xs text-tinta transition-colors hover:bg-tinta/5 hover:text-rojo"
          >
            <Icono clave={a.icono} className="size-[22px]" />
            {a.etiqueta}
          </Link>
        ))}
      </div>
    </section>
  );
}

const hora = new Intl.DateTimeFormat("es-PE", { hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });

function EquipoDeHoy({ equipo, esLider }: { equipo: MiembroEquipo[] | null; esLider: boolean }) {
  return (
    <section>
      <Etiqueta>Equipo de hoy</Etiqueta>
      <div className="card-cayla divide-y divide-tinta/10">
        {equipo === null ? (
          <p role="status" className="px-4 py-3 text-sm text-tinta/75">
            No se pudo leer quién está hoy. Lo demás sí está al día.
          </p>
        ) : equipo.length === 0 ? (
          <p className="px-4 py-3 text-sm text-tinta/65">Nadie marcó asistencia todavía en esta sede.</p>
        ) : (
          equipo.map((m) => (
            <div key={m.personaId} className="flex items-start gap-3 px-4 py-3">
              <span className="font-display relative grid size-[34px] shrink-0 place-items-center rounded-full bg-sand text-[15px] text-tinta">
                {m.nombre.slice(0, 1)}
                {m.estado === "presente" && <span className="absolute -right-px -bottom-px size-2.5 rounded-full border-2 border-papel bg-verde" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tinta">{m.nombre}</p>
                <p className="text-xs text-tinta/65">
                  {textoEstado(m.estado)}
                  {m.ventas ? ` · ${m.ventas} ${m.ventas === 1 ? "venta" : "ventas"}` : ""}
                </p>
                {m.ultima && (
                  <p className="mt-1 rounded-lg bg-hueso px-2 py-1 text-xs text-tinta/80">
                    {m.ultima.texto} · {hora.format(new Date(m.ultima.hora))}
                  </p>
                )}
              </div>
              {m.monto !== null && <span className="shrink-0 text-sm text-tinta tabular-nums">{m.monto > 0 ? formatoSoles(m.monto) : "—"}</span>}
            </div>
          ))
        )}
        {!esLider && equipo && equipo.length > 0 && (
          <p className="px-4 py-2.5 text-xs text-tinta/60">Ves quién está; las cifras de cada una las ve la líder.</p>
        )}
      </div>
    </section>
  );
}

// ── Íconos (trazo 1.6, como el lateral; los de AppShell son privados de ese archivo) ────────────────────────────────

const TRAZOS: Record<ClaveAccesoIcono | "vender" | "chevron" | "check", string> = {
  vender: "M6 7h12l1 14H5zM9 7a3 3 0 0 1 6 0",
  caja: "M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.6 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3",
  apartados: "M7 3h10v18l-5-4-5 4z",
  stock: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  traslados: "M5 12h14M13 6l6 6-6 6",
  cambios: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3",
  recibir: "M3 7h13v10H3zM16 10h3l2 3v4h-5M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M18 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
  conteo: "M9 4h6v3H9zM6 5h3M15 5h3v16H6V5M9 13l2 2 4-4",
  produccion: "M4 20V9l5 3V9l5 3V6l6 3v11z",
  buscar: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12M20 20l-4.5-4.5",
  chevron: "M9 6l6 6-6 6",
  check: "M5 12l4 4 10-10",
};

function Icono({ clave, className = "size-[18px]" }: { clave: keyof typeof TRAZOS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={TRAZOS[clave]} />
    </svg>
  );
}
