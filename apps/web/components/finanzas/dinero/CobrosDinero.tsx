"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Globito } from "@/components/ui/Globito";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { PieDePaginas } from "@/components/finanzas/dinero/PieDePaginas";
import { paginar, type TamanoPagina } from "@/lib/dinero-estados-reglas";
import { cobrosParaVer, filtrarCobros, FILTRO_COBROS_INICIAL, TEXTO_TIPO_COBRO, type FilaCobro, type FiltroCobros, type TipoCobro } from "@/lib/dinero-dueno-cobros-reglas";

// Cuentas y dinero ▸ Dónde está ▸ «A qué cuenta entra cada cobro» (rediseño Felipe 2026-10-31): una lista corta con lo que falta elegir arriba y, en una
// ventana, todas las combinaciones con filtros (sede, medio, estado) y páginas de 30 o 40. Lee lo mismo que la tabla de antes (`fn_medios_cobro`); lo
// que se cambia sigue siendo en Configuración. Solo el líder y solo con todas las sedes.

const PLANTILLA = "sm:grid-cols-[8rem_7rem_minmax(0,1fr)_11.5rem]";
const COLUMNAS = [{ titulo: "Sede" }, { titulo: "Medio" }, { titulo: "Va a la cuenta" }, { titulo: "Dónde llega" }];
const TONO_TIPO: Record<TipoCobro, TonoChip> = { banco: "pizarra", maquina: "pizarra", caja: "pizarra", sin: "ambar" };
const CUANTOS_EN_PANTALLA = 6;

export function CobrosDinero({ filas }: { filas: FilaCobro[] }) {
  const [abierta, setAbierta] = useState(false);
  const [filtro, setFiltro] = useState<FiltroCobros>(FILTRO_COBROS_INICIAL);
  const [tamano, setTamano] = useState<TamanoPagina>(30);
  const [pagina, setPagina] = useState(1);
  if (filas.length === 0) return null;

  const sedes = [...new Set(filas.map((f) => f.sede))];
  const medios = [...new Set(filas.map((f) => f.medio))];
  const tipos = (Object.keys(TEXTO_TIPO_COBRO) as TipoCobro[]).filter((t) => filas.some((f) => f.tipo === t));
  const sinCuenta = filas.filter((f) => f.tipo === "sin").length;
  const visibles = filtrarCobros(filas, filtro);
  const pag = paginar(visibles, pagina, tamano);
  const poner = (c: Partial<FiltroCobros>) => {
    setFiltro((f) => ({ ...f, ...c }));
    setPagina(1);
  };

  const filaDe = (f: FilaCobro) => (
    <div key={f.clave} className={fila(PLANTILLA)}>
      <span className={celda("izq", "font-semibold text-tinta")}>{f.sede}</span>
      <span className={celda()}>{f.medio}</span>
      <span className={celda("izq", "!whitespace-normal")}>{f.cuenta ?? <span className="text-tinta/65">Falta elegir la cuenta</span>}</span>
      <span className={celda()}>
        <Chip tono={TONO_TIPO[f.tipo]}>{TEXTO_TIPO_COBRO[f.tipo]}</Chip>
      </span>
    </div>
  );

  const grupo = (titulo: string, claves: { clave: string; texto: string; n: number }[], actual: string, alElegir: (c: string) => void) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="dp-versalita" style={{ minWidth: "3.5rem" }}>
        {titulo}
      </span>
      {claves.map((c) => (
        <button key={c.clave} type="button" className="pildora-cayla" aria-pressed={actual === c.clave} onClick={() => alElegir(c.clave)}>
          {c.texto}
          <Globito n={c.n} />
        </button>
      ))}
    </div>
  );

  return (
    <section className="card-cayla dp-cobros" aria-label="A qué cuenta entra cada cobro" data-guia="fin-dinero.medios">
      <header className="dp-dueno-cab">
        <div>
          <TituloSeccion cuenta={sinCuenta > 0 ? sinCuenta : undefined}>A qué cuenta entra cada cobro</TituloSeccion>
          <p className="dp-tenue">Por eso Vender no cambia: el cobro guarda el medio y Finanzas sabe a qué cuenta llegó.</p>
        </div>
        <Link href="/configuracion?tab=cuentas" className="btn-cayla btn-sutil btn-chico">
          Cambiar en Configuración
        </Link>
      </header>
      <Tabla className="@container">
        <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} />
        {cobrosParaVer(filas, CUANTOS_EN_PANTALLA).map(filaDe)}
      </Tabla>
      <p className="dp-cobros-pie dp-tenue">
        Primeras {Math.min(CUANTOS_EN_PANTALLA, filas.length)} de {filas.length}
        {sinCuenta > 0 ? ", con lo que falta elegir arriba" : ""}.{" "}
        <button type="button" className="btn-cayla btn-enlace" aria-haspopup="dialog" onClick={() => setAbierta(true)} data-guia="fin-dinero.medios-todos">
          Ver todas con filtros
        </button>
      </p>

      {abierta && (
        <Modal
          titulo="A qué cuenta entra cada cobro"
          subtitulo="Por eso Vender no cambia: el cobro guarda el medio y Finanzas sabe a qué cuenta llegó. Una sede que no cobra a clientes (el Taller) solo lleva sus transferencias."
          onClose={() => setAbierta(false)}
          conCerrar
          ancho="max-w-[72rem]" /* unificar-fijo: la ventana de los cobros es de diseño propio, con tabla de 4 columnas, tres filtros y páginas (Felipe 2026-10-31) */
        >
          <div className="space-y-3" data-sin-cascada>
            {grupo("Sede", [{ clave: "todas", texto: "Todas", n: filas.length }, ...sedes.map((s) => ({ clave: s, texto: s, n: filas.filter((f) => f.sede === s).length }))], filtro.sede, (c) => poner({ sede: c }))}
            {grupo("Medio", [{ clave: "todos", texto: "Todos", n: filas.length }, ...medios.map((m) => ({ clave: m, texto: m, n: filas.filter((f) => f.medio === m).length }))], filtro.medio, (c) => poner({ medio: c }))}
            {grupo("Estado", [{ clave: "todos", texto: "Todos", n: filas.length }, ...tipos.map((t) => ({ clave: t, texto: TEXTO_TIPO_COBRO[t], n: filas.filter((f) => f.tipo === t).length }))], filtro.tipo, (c) => poner({ tipo: c as FiltroCobros["tipo"] }))}
            {visibles.length === 0 ? (
              <Vacio tamano="chico" icono={<SearchX />}>
                Ningún cobro con esos filtros.
              </Vacio>
            ) : (
              <Tabla className="@container">
                <Encabezado plantilla={PLANTILLA} columnas={COLUMNAS} />
                {pag.visibles.map(filaDe)}
              </Tabla>
            )}
            <PieDePaginas
              texto={`${pag.desde}–${pag.hasta} de ${pag.total}`}
              tamano={tamano}
              onTamano={(t) => {
                setTamano(t);
                setPagina(1);
              }}
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              onPagina={setPagina}
            />
          </div>
        </Modal>
      )}
    </section>
  );
}
