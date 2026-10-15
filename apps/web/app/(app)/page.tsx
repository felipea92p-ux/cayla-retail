import { Suspense } from "react";
import { BarraAvance } from "@/components/ui/BarraAvance";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { getNumeroDelMenuTraslados } from "@/lib/traslados";
import { getAperturasPorRevisar } from "@/lib/caja";
import { getEquipoDeHoy, getFuentesAvisos, getHoyDeLaSede, getMiMeta, type HoyDeLaSede } from "@/lib/inicio";
import { mostrarHoy, resumirHoy } from "@/lib/inicio-reglas";
import { pisoQueSeVe } from "@/lib/inicio-piso-reglas";
import type { MiMeta } from "@/lib/mi-meta-reglas";
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
import { ICONO_DEL_ACCESO, TRAZOS_MENU } from "@/lib/menu-iconos";
import { formatoSoles } from "@/lib/resumen-formato";
import { contarVencidas } from "@/lib/por-regularizar";
import { contarComprobantesAtascados } from "@/lib/comprobantes";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { AjustarInicio } from "@/components/inicio/AjustarInicio";
import { InicioAlmacen } from "@/components/inicio-almacen/InicioAlmacen";
import { accesosAlmacen, esPerfilAlmacen, fuentesDeAlmacen } from "@/lib/inicio-almacen-reglas";
import { getInicioAlmacen } from "@/lib/inicio-almacen";
import { getAvisosObservatorio, getDatosObservatorio, getDatosTienda, getTallerObservatorio } from "@/lib/observatorio";
import { Observatorio } from "@/components/observatorio/Observatorio";
import { Etiqueta } from "@/components/inicio/TarjetasInicio";
import { EsqueletoPiso, PisoDelInicio } from "@/components/inicio/PisoDelInicio";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { SeccionLoQueVaBien, SeccionMiMeta, SeccionTuMes } from "@/components/inicio/MiMeta";
import { TuFondoConRendir } from "@/components/fondos/TuFondoConRendir";
import { getResumenMiFondo } from "@/lib/fondos";
import { hrefTuFondo, mostrarTuFondo } from "@/lib/fondos-reglas";

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
//
// La cuenta de ALMACÉN (la que recibe y registra mercadería y no vende: `esPerfilAlmacen`) tiene su propio Inicio, con la
// cabina «Nuevo producto» (Felipe, 2026-09-30, ADR-0292; maqueta docs/maquetas/inicio-almacen-2026-09/). Usa los mismos
// avisos, el mismo filtro «Ajustar» y las mismas reglas de arriba: solo cambia cómo se dibuja y qué más lee.
//
// «Tu fondo» (ADR-0362, fase 6 · actividad 4): quien tiene plata de CAYLA para comprar ve cuánto le queda, después de sus cifras del día
// (es una cifra suya) y antes de «Te toca»; en el Inicio de almacén, arriba de su columna derecha. Lleva a Órdenes de compra (o a Por
// pagar) si ve esa pantalla. El Observatorio del Admin no la lleva: su diseño es una decisión (ADR-0322); un Admin con fondo lo ve en
// Órdenes de compra.
//
// La cuenta ADMIN (no vende: mira cómo va el negocio) tiene el Observatorio (Felipe, 2026-10-03, ADR-0322; maqueta
// docs/maquetas/inicio-admin-v3-2026-10/): el mapa de las tiendas, cuánto vendió cada una contra su meta y lo que hay por
// revisar. Es el único Inicio que se abre en CAYLA Global (mira toda la empresa); con una tienda elegida arriba, abre
// acercado a esa tienda. Si su lectura falla (la función no está en la base todavía), el Admin ve el Inicio de siempre.

export default async function InicioPage() {
  const persona = await requirePersonaActualV2();
  // Una terminal cuyo ROL ve el Punto de Venta aterriza ahí (pedido de Felipe, 2026-09-21; sin tipo desde 2026-09-22): su
  // menú no tiene «Inicio», su casa es el mostrador. Una persona aterriza en la pantalla principal de su rol, o en la
  // primera que ve (20260925220000); en CAYLA Global, en el tablero, salvo el Admin. Es un aterrizaje, no un candado. La
  // regla vive en `aterrizajeDe`, la misma que usa el login para entrar directo (2026-10-13): esta redirección queda para
  // quien abre `/` a mano o desde el menú.
  const modulos = persona.modulos.map((m) => m.clave);
  const destino = aterrizajeDe({
    terminal: persona.terminal,
    modulos,
    pantallaPrincipal: persona.pantallaPrincipal,
    esAdmin: persona.esAdmin,
    vista: persona.vista,
  });
  if (destino !== "/") redirect(destino);
  if (persona.esAdmin) {
    const datos = await getDatosObservatorio();
    if (datos) {
      const focoInicial =
        persona.vista === "sede" && persona.ubicacionTipo === "tienda" && datos.tiendas.some((t) => t.id === persona.ubicacionId)
          ? persona.ubicacionId
          : "TODAS";
      const [avisosObs, taller, tiendaInicial] = await Promise.all([
        getAvisosObservatorio(datos.tiendas),
        getTallerObservatorio(),
        focoInicial === "TODAS" ? Promise.resolve(undefined) : getDatosTienda(focoInicial),
      ]);
      return <Observatorio datosIniciales={datos} avisos={avisosObs} taller={taller} focoInicial={focoInicial} tiendaInicial={tiendaInicial} />;
    }
  }
  // En CAYLA Global el Inicio de una sede no tiene sentido (mostraría la sede donde trabaja bajo «CAYLA Global»): al tablero.
  // A quien no es Admin ya lo mandó `aterrizajeDe`; aquí llega solo el Admin cuyo Observatorio no se pudo leer.
  if (persona.vista === "global") redirect("/global");
  const esLider = persona.rol === "lider";
  const ve = (m: (typeof modulos)[number]) => modulos.includes(m);
  const perfil = { rol: persona.rol, ubicacionTipo: persona.ubicacionTipo, terminal: persona.terminal, modulos };
  const vende = persona.ubicacionTipo === "tienda" && ve("vender") && !persona.terminal;
  const puedeEditarCatalogo = puede(persona, "editarCatalogo");
  // «Tu piso» (ADR-0395): solo en una tienda y a quien ve Frescura o el Plan del piso; cada mitad, solo si ve SU módulo (`pisoQueSeVe`, con su prueba). No va
  // en el `Promise.all` de abajo: leer Frescura es lo más lento del Inicio y va en un `Suspense`, para que «Hoy» y «Te toca» no esperen en una carga en frío
  // (en una navegación interna el velo del loader espera la respuesta completa: ver `PisoDelInicio.tsx`).
  const piso = pisoQueSeVe({ ubicacionTipo: persona.ubicacionTipo, terminal: persona.terminal, modulos });
  const esAlmacen = esPerfilAlmacen({ ubicacionTipo: persona.ubicacionTipo, modulos, puedeEditarCatalogo });

  const [hoy, miMeta, traslados, prendasVencidas, aperturas, comprobantesAtascados, equipo, datosAlmacen, fondo] = await Promise.all([
    mostrarHoy(perfil) ? getHoyDeLaSede(persona.ubicacionId, esLider) : Promise.resolve(null),
    // Su meta (ADR-0325): solo de una integrante de tienda; la líder tiene Rendimiento. `null` = sin meta: el Inicio queda como estaba.
    !esLider && mostrarHoy(perfil) ? getMiMeta() : Promise.resolve(null),
    // Total (nunca lanza): la misma cifra del número del menú (lo que llega + lo que otras sedes te piden, ADR-0328 act. 17).
    ve("traslados") ? getNumeroDelMenuTraslados(persona.ubicacionId, puede(persona, "ajustarInventario")) : Promise.resolve(undefined),
    // Las tres colas del líder (ADR-0179, ADR-0186, PL-114): no son de quien no lo es.
    esLider ? contarVencidas() : Promise.resolve(undefined),
    esLider ? getAperturasPorRevisar() : Promise.resolve(undefined),
    esLider ? contarComprobantesAtascados() : Promise.resolve(undefined),
    persona.ubicacionTipo === "tienda" && !persona.terminal ? getEquipoDeHoy(persona.ubicacionId, ve("actividad")) : Promise.resolve(undefined),
    // Lo que solo lee la cuenta de almacén. El piso de la sede sale del motor del piso (una lectura), ya no de Existencias
    // entera: no hace falta la lista de sedes.
    esAlmacen ? getInicioAlmacen({ ubicacionId: persona.ubicacionId, ve }) : Promise.resolve(null),
    // Una terminal no tiene fondo (es un aparato, ADR-0162): ni se pregunta.
    persona.terminal ? Promise.resolve(null) : getResumenMiFondo(),
  ]);
  const tuFondo = mostrarTuFondo(fondo) ? fondo : null;
  const hrefFondo = hrefTuFondo((m) => ve(m));
  const fuentes = await getFuentesAvisos(
    { ubicacionId: persona.ubicacionId, sedePropiaId: persona.sedePropiaId, esLider, esTerminal: persona.terminal, ve, pagaCompras: puede(persona, "verDineroCompras") },
    {
      traslados,
      prendasVencidas,
      aperturas: aperturas === undefined ? undefined : (aperturas?.length ?? null),
      comprobantesAtascados,
    }
  );
  const avisos = avisosInicio(datosAlmacen ? { ...fuentes, ...fuentesDeAlmacen(datosAlmacen) } : fuentes);
  const cookie = cookieEleccion(persona.personaId);
  const eleccion = leerEleccion((await cookies()).get(cookie)?.value);
  const visibles = avisosVisibles(avisos, eleccion, esLider);
  const accesos = accesosRapidos({ esLider, ubicacionTipo: persona.ubicacionTipo, modulos, permisos: persona.permisos });

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

  const ajustar =
    avisos.length > 0 ? (
      <AjustarInicio
        avisos={avisos.map(({ clave, grupo, titulo, ocultable, urgenteSi }) => ({ clave, grupo, titulo, ocultable, urgenteSi }))}
        eleccionInicial={eleccion}
        esLider={esLider}
        etiquetaRol={etiquetaRol.toLowerCase()}
      />
    ) : null;

  // La cuenta de almacén: su cabina, su «Te toca» y sus bloques (el botón fijo de celular es el suyo, `DockAlmacen`).
  if (datosAlmacen) {
    return (
      <div className="space-y-6 pb-24 sm:pb-0">
        <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo={saludo} subtitulo={etiquetaRol} />
        <InicioAlmacen
          datos={datosAlmacen}
          visibles={visibles}
          ajustar={ajustar}
          tuFondo={tuFondo ? <TuFondoConRendir fondo={tuFondo} href={hrefFondo} guia="inicio.tu-fondo" /> : null}
          accesos={accesosAlmacen(modulos)}
          veRecibir={ve("recibir")}
          puedeEditarCatalogo={puedeEditarCatalogo}
        />
      </div>
    );
  }

  // El botón fijo del celular: vender en una tienda; recibir en el almacén y en la trastienda de una tienda (la terminal de
  // almacén, un rol que no vende: Felipe, 2026-09-29). Quien vende, o no ve Recibir, no lo necesita.
  const trastienda = persona.ubicacionTipo === "tienda" && !ve("vender");
  const fijo = vende
    ? { href: "/vender", etiqueta: "Vender", icono: "vender" as const }
    : (persona.ubicacionTipo === "almacen" || trastienda) && ve("recibir")
      ? { href: "/recibir", etiqueta: "Recibir mercadería", icono: "recibir" as const }
      : null;

  return (
    <div className={`space-y-6 ${fijo ? "pb-24 sm:pb-0" : ""}`}>
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14): la sede y la fecha arriba, el saludo de título. */}
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo={saludo}
        subtitulo={etiquetaRol}
        acciones={
          vende ? (
            <Link href="/vender" className="btn-cayla btn-primario hidden items-center gap-2 sm:inline-flex" data-guia="inicio.vender">
              <Icono clave="vender" /> Vender
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {hoy && <SeccionHoy hoy={hoy} esLider={esLider} miMeta={miMeta} />}
          {miMeta && !esLider && (
            <>
              <SeccionLoQueVaBien miMeta={miMeta} />
              <SeccionTuMes miMeta={miMeta} />
            </>
          )}
          {tuFondo && (
            // En la misma grilla que las cifras de «Tu día»: una cifra más, no una franja a todo el ancho.
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <TuFondoConRendir fondo={tuFondo} href={hrefFondo} guia="inicio.tu-fondo" className="col-span-2 sm:col-span-1" />
            </div>
          )}
          <TeToca visibles={visibles} ajustar={ajustar} />
          {piso.alguno && (
            // Es un estado, no una urgencia: va DESPUÉS de «Te toca», que trae plazos legales y lo que no puede esperar.
            <Suspense fallback={<EsqueletoPiso mitades={Number(piso.frescura) + Number(piso.plan)} />}>
              <PisoDelInicio
                ubicacionId={persona.ubicacionId}
                ubicacionEtiqueta={persona.ubicacionEtiqueta}
                ubicacionTipo={persona.ubicacionTipo}
                terminal={persona.terminal}
                modulos={modulos}
              />
            </Suspense>
          )}
        </div>
        <div className="space-y-6">
          {accesos.length > 0 && <Accesos accesos={accesos} />}
          {equipo !== undefined && <EquipoDeHoy equipo={equipo} esLider={esLider} />}
        </div>
      </div>

      {fijo && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
          <Link href={fijo.href} className="flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema" data-guia="inicio.fijo">
            <Icono clave={fijo.icono} /> {fijo.etiqueta}
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Cifras del día ───────────────────────────────────────────────────────────────────────────────

function SeccionHoy({ hoy, esLider, miMeta }: { hoy: HoyDeLaSede; esLider: boolean; miMeta: MiMeta | null }) {
  const titulo = esLider ? "Hoy" : "Tu día";
  // Una integrante con meta (ADR-0325) ve SU meta de hoy y de su mes en vez de las cifras sueltas: lo que necesita saber es cómo va.
  if (!esLider && miMeta) return <SeccionMiMeta miMeta={miMeta} cajaAbierta={hoy.cajaAbierta} titulo={titulo} />;
  if (hoy.totales === null) {
    return (
      <section data-guia="inicio.hoy">
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
      <section data-guia="inicio.hoy">
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
    <section data-guia="inicio.hoy">
      <Etiqueta>{titulo}</Etiqueta>
      {/* En celular la primera cifra va a todo lo ancho y las otras dos lado a lado; desde `sm`, las tres en fila. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* La pieza única de cifra (TarjetaCifra, ADR-0358): antes era la receta propia del Inicio, con el nombre en la
            misma letra que «Tu día» (el título de la sección). Sin meta es «sin dato»; la caja sin leer, «no se pudo leer». */}
        <TarjetaCifra etiqueta={esLider ? "Ventas" : "Tus ventas"} valor={formatoSoles(r.importe)} className="col-span-2 sm:col-span-1">
          {esLider && r.comparativo ? (
            <span className={r.comparativo.positivo ? "text-verde-profundo" : "text-ambar-profundo"}>{r.comparativo.texto}</span>
          ) : esLider ? (
            `Sin base para comparar con el ${hoy.nombreDia} pasado`
          ) : (
            `${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`
          )}
        </TarjetaCifra>
        <TarjetaCifra etiqueta={esLider ? "Valor medio" : "Tu ticket"} valor={r.valorMedio === null ? null : formatoSoles(r.valorMedio)}>
          {`${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`}
        </TarjetaCifra>
        {esLider ? (
          r.meta ? (
            <TarjetaCifra etiqueta="Meta del día" valor={`${r.meta.pct} %`}>
              Faltan {formatoSoles(r.meta.falta)} de {formatoSoles(r.meta.meta)}
              <BarraAvance pct={r.meta.barra} decorativa className="mt-2" />
            </TarjetaCifra>
          ) : (
            <TarjetaCifra etiqueta="Meta del día" valor={null}>
              Esta sede no tiene meta diaria configurada
            </TarjetaCifra>
          )
        ) : (
          <TarjetaCifra etiqueta="Caja" valor={hoy.cajaAbierta === null ? null : hoy.cajaAbierta ? "Abierta" : "Cerrada"} noSePudoLeer={hoy.cajaAbierta === null}>
            {hoy.cajaAbierta === null ? "No se pudo leer la caja" : hoy.cajaAbierta ? "Puedes vender" : "Ábrela en Caja para vender"}
          </TarjetaCifra>
        )}
      </div>
    </section>
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
    <section data-guia="inicio.te-toca">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="label-cayla text-[11px] text-tinta/65">Te toca</p>
        <span data-guia="inicio.ajustar">{ajustar}</span>
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
    <section data-guia="inicio.accesos">
      <Etiqueta>Accesos</Etiqueta>
      <div className={`grid gap-2 ${columnas}`}>
        {accesos.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="card-cayla flex flex-col items-center gap-1.5 px-1.5 py-3 text-center text-xs text-tinta transition-colors hover:bg-tinta/5 hover:text-rojo"
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
    <section data-guia="inicio.equipo">
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

// ── Íconos (trazo 1.6) ───────────────────────────────────────────────────────────────────────────────────────────────
// Un acceso que lleva a una pantalla del menú dibuja el MISMO ícono que esa pantalla en el lateral (`ICONO_DEL_ACCESO`,
// lib/menu-iconos.ts; 2026-10-13, Felipe: «alinea los otros dos lugares de íconos»). «Buscar» y «Nuevo producto» son acciones,
// no pantallas: conservan su trazo propio.

const TRAZOS: Record<ClaveAccesoIcono | "vender" | "chevron" | "check", string> = {
  vender: TRAZOS_MENU[ICONO_DEL_ACCESO.vender],
  caja: TRAZOS_MENU[ICONO_DEL_ACCESO.caja],
  apartados: TRAZOS_MENU[ICONO_DEL_ACCESO.apartados],
  stock: TRAZOS_MENU[ICONO_DEL_ACCESO.stock],
  traslados: TRAZOS_MENU[ICONO_DEL_ACCESO.traslados],
  cambios: TRAZOS_MENU[ICONO_DEL_ACCESO.cambios],
  recibir: TRAZOS_MENU[ICONO_DEL_ACCESO.recibir],
  conteo: TRAZOS_MENU[ICONO_DEL_ACCESO.conteo],
  produccion: TRAZOS_MENU[ICONO_DEL_ACCESO.produccion],
  buscar: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12M20 20l-4.5-4.5",
  nuevoProducto: "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 8v8M8 12h8",
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
