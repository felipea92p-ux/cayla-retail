"use client";

import { useState, type ReactNode } from "react";
import { Cake, Hash, IdCard, Lock, Mail, Phone, ShoppingBag } from "lucide-react";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BotonCopiar } from "@/components/ui/BotonCopiar";
import { BotonFiltro } from "@/components/ui/BotonFiltro";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import {
  ETIQUETA_MOVIMIENTO,
  agruparPorMes,
  diaYMesDe,
  filtrosDeLaLinea,
  type FiltroLinea,
  type Movimiento,
  type TipoMovimiento,
} from "@/lib/clienta-actividad-reglas";
import { suSedeLegible } from "@/lib/clientas-lista-reglas";

// La ficha de un cliente, diseño B (Felipe 2026-10-20, docs/maquetas/fichas-b-2026-10/): el perfil a la izquierda, lo que vive el
// cliente a la derecha. Aquí viven las tres piezas que son solo lectura —su perfil con el contacto, las tres cifras de arriba y el
// historial en línea de tiempo—; la hoja (`ClientaFichaModal.tsx`) las arma y decide qué ve cada cuenta. Cada pieza recibe ya lo
// que se muestra (con el DNI y el celular a medias para quien no es líder): ninguna calcula ni pide nada a la base.

/** Una fila del contacto: su ícono, su título chiquito, el dato y, si se puede, «copiar». `copiable` es el valor COMPLETO: una
 *  cuenta que ve el dato a medias no copia nada (copiaría «71••••82»). */
function FilaDeContacto({ icono, titulo, valor, copiable, que }: { icono: ReactNode; titulo: string; valor: string | null; copiable?: string | null; que: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 border-t border-sand py-2 first:border-t-0">
      <span aria-hidden className="text-taupe [&>svg]:h-4 [&>svg]:w-4">
        {icono}
      </span>
      <div className="min-w-0 flex-1">
        <p className="label-cayla text-[10px] leading-tight text-tinta/60">{titulo}</p>
        <p className="break-words text-[13.5px] leading-snug text-tinta">{valor ?? <span className="text-tinta/60">Sin dato</span>}</p>
      </div>
      {valor && copiable && <BotonCopiar texto={copiable} que={que} forma="icono" />}
    </div>
  );
}

export type DatosDelPerfil = {
  nombre: string;
  /** El estado frente al club, ya en palabras («Miembro frecuente», «Solo ficha», «Archivado»), y su tono. */
  estado: { texto: string; tono: TonoChip };
  /** «Recibe novedades» / «No recibe novedades» (solo una miembro activa lo tiene). */
  novedades: { texto: string; recibe: boolean } | null;
  /** Documento y celular tal como los ve esta cuenta (completos para un líder, a medias para los demás). */
  documento: string | null;
  celular: string | null;
  correo: string | null;
  cumple: string | null;
  codigo: string | null;
  /** Los valores completos para «copiar»; `null` cuando esta cuenta los ve a medias. */
  completos: { documento: string | null; celular: string | null; correo: string | null; codigo: string | null } | null;
};

/** La columna izquierda: su cara, su nombre, su estado y su contacto. `children` va debajo (Editar, Archivar…). */
export function PerfilDelCliente({ d, children }: { d: DatosDelPerfil; children?: ReactNode }) {
  return (
    <aside className="flex flex-col gap-3.5 bg-hueso p-5 sm:p-6 lg:min-h-full" data-guia="clientas.ficha-datos">
      {/* Sobre el fondo hueso del perfil, la cara y la insignia gris van en papel: en arena se perdían. */}
      <AvatarPersona personaId={null} nombre={d.nombre} tamano={80} className="mt-1 !bg-papel" />
      <div>
        <p className="font-display text-[27px] leading-[1.1] text-tinta">{d.nombre}</p>
        <div className="mt-2.5 flex flex-col items-start gap-1.5">
          <Chip tono={d.estado.tono} tachado={false} className={d.estado.tono === "neutro" ? "!bg-papel" : ""}>
            {d.estado.texto}
          </Chip>
          {d.novedades && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-tinta/80">
              <span aria-hidden className={`h-[7px] w-[7px] rounded-full border-[1.5px] ${d.novedades.recibe ? "border-verde bg-verde" : "border-taupe bg-transparent"}`} />
              {d.novedades.texto}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-papel px-3.5 py-1">
        <FilaDeContacto icono={<IdCard />} titulo="Documento" valor={d.documento} copiable={d.completos?.documento} que="el documento" />
        <FilaDeContacto icono={<Phone />} titulo="Celular" valor={d.celular} copiable={d.completos?.celular} que="el celular" />
        <FilaDeContacto icono={<Mail />} titulo="Correo" valor={d.correo} copiable={d.completos?.correo} que="el correo" />
        <FilaDeContacto icono={<Cake />} titulo="Cumpleaños" valor={d.cumple} que="el cumpleaños" />
        {d.codigo && <FilaDeContacto icono={<Hash />} titulo="Código de miembro" valor={d.codigo} copiable={d.completos?.codigo} que="el código de miembro" />}
      </div>
      {!d.completos && (
        <p className="flex items-start gap-2 text-xs leading-snug text-tinta/65">
          <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Los datos salen a medias. Un líder los ve completos.
        </p>
      )}
      {children}
    </aside>
  );
}

/** Una de las tres cifras de arriba: lo que importa de un vistazo. */
export function CifraDeLaFicha({ titulo, valor, detalle }: { titulo: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-sand p-3.5">
      <p className="label-cayla text-[10px] text-tinta/60">{titulo}</p>
      <p className="mt-0.5 font-display text-[28px] leading-[1.1] tabular-nums text-tinta">{valor}</p>
      {detalle && <p className="text-xs leading-snug text-tinta/65">{detalle}</p>}
    </div>
  );
}

const TONO_DEL_TIPO: Record<TipoMovimiento, TonoChip> = { compra: "neutro", cambio: "pizarra", devolucion: "apagado", apartado: "ambar" };
const FILAS_VISIBLES = 5;

/** El historial: «Todo / Compras / Cambios…» y, debajo, una línea de tiempo por mes con las 5 más recientes (el resto, a un toque).
 *  Sin nada que mostrar dice qué pasará cuando haya. */
export function HistorialDelCliente({ movimientos }: { movimientos: readonly Movimiento[] }) {
  const [filtro, setFiltro] = useState<FiltroLinea>("todo");
  const [todas, setTodas] = useState(false);
  if (movimientos.length === 0) {
    return (
      <Vacio tamano="chico" icono={<ShoppingBag />}>
        Todavía no compró. Cuando compre, cambie algo o aparte una prenda, lo verás aquí.
      </Vacio>
    );
  }
  const filtros = filtrosDeLaLinea(movimientos);
  const filtrados = filtro === "todo" ? movimientos : movimientos.filter((m) => m.tipo === filtro);
  const primeros = filtrados.slice(0, FILAS_VISIBLES);
  const resto = filtrados.slice(FILAS_VISIBLES);
  return (
    <div className="space-y-4">
      {filtros.length > 2 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Qué ver del historial">
          {filtros.map((f) => (
            <BotonFiltro
              key={f.valor}
              activo={filtro === f.valor}
              cuenta={f.cuenta}
              onClick={() => {
                setFiltro(f.valor);
                setTodas(false);
              }}
            >
              {f.texto}
            </BotonFiltro>
          ))}
        </div>
      )}
      <LineaDelMes grupos={agruparPorMes(primeros)} />
      {resto.length > 0 && (
        <>
          <FilasDeMas abierto={todas}>
            <LineaDelMes grupos={agruparPorMes(resto)} sinPrimerMes={ultimoMes(primeros)} />
          </FilasDeMas>
          <BotonVerMas forma="enlace" abierto={todas} onCambiar={setTodas} texto={`Ver las ${filtrados.length}`} />
        </>
      )}
    </div>
  );
}

/** El mes del último movimiento de una tanda: si la siguiente sigue en el mismo mes, no repite su título. */
function ultimoMes(movs: readonly Movimiento[]): string | null {
  const g = agruparPorMes(movs);
  return g.length ? g[g.length - 1].mes : null;
}

function LineaDelMes({ grupos, sinPrimerMes = null }: { grupos: { mes: string; movimientos: Movimiento[] }[]; sinPrimerMes?: string | null }) {
  return (
    <div className="space-y-4">
      {grupos.map((g, i) => (
        <section key={g.mes}>
          {!(i === 0 && g.mes === sinPrimerMes) && <p className="label-cayla mb-1.5 text-[10.5px] text-tinta/60">{g.mes}</p>}
          <ol>
            {g.movimientos.map((m, j) => (
              <MovimientoDelHistorial key={m.clave} m={m} ultimo={j === g.movimientos.length - 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const SOLES = (n: number) => `S/\u00a0${n.toFixed(2)}`;

function MovimientoDelHistorial({ m, ultimo }: { m: Movimiento; ultimo: boolean }) {
  const { dia, mes } = diaYMesDe(m.fecha);
  return (
    <li className="relative grid grid-cols-[46px_minmax(0,1fr)] gap-3.5 py-1.5">
      {/* El hilo que une un movimiento con el siguiente: se corta en el último de su mes. */}
      {!ultimo && <span aria-hidden className="absolute bottom-[-6px] left-[22px] top-[52px] w-0.5 bg-sand" />}
      <div className="relative z-[1] grid h-[46px] w-[46px] place-content-center rounded-full bg-hueso text-center">
        <b className="font-display text-[19px] font-medium leading-none tabular-nums">{dia}</b>
        <span className="text-[9.5px] uppercase leading-tight tracking-[0.08em] text-tinta/65">{mes}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 rounded-xl border border-sand px-3.5 py-2.5 transition-colors hover:border-taupe motion-reduce:transition-none">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tono={TONO_DEL_TIPO[m.tipo]} tachado={false}>
            {ETIQUETA_MOVIMIENTO[m.tipo]}
          </Chip>
          {m.estado && (
            <Chip tono={m.tipo === "apartado" ? "verde" : "pizarra"} versalitas tachado={false}>
              {m.estado}
            </Chip>
          )}
          {m.sede && <span className="text-xs text-tinta/65">{suSedeLegible(m.sede)}</span>}
        </div>
        {m.monto !== null && <span className="row-span-2 col-start-2 row-start-1 whitespace-nowrap text-[17px] font-medium tabular-nums text-tinta">{m.tipo === "devolucion" ? "−" : ""}{SOLES(m.monto)}</span>}
        <p className="col-start-1 break-words text-sm text-tinta">{m.detalle}</p>
      </div>
    </li>
  );
}
