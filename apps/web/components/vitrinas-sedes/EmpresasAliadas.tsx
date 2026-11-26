"use client";

import { useRef, useState, type MouseEvent } from "react";
import { FileText, Plus, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { fechaCorta } from "@/lib/carga-inicial-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Ayuda } from "@/components/Ayuda";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { HojaEmpresaAliada } from "@/components/vitrinas-sedes/HojaEmpresaAliada";
import { HojaComprobantesAliada } from "@/components/vitrinas-sedes/HojaComprobantesAliada";
import type { useResponsable } from "@/lib/useResponsable";
import { borradorDeAliada, chipLucode, fraseDeAliada, rotuloDeAliada, etiquetaCuenta, REGIMENES, type BorradorAliada, type EmpresaAliada, type LecturaAliadas } from "@/lib/empresas-aliadas-reglas";

// «Empresas aliadas» (ADR-0683, opción D que eligió Felipe el 2026-11-21): bajo la banda de CAYLA, que sigue como está, una tarjeta por cada empresa
// que vende en las tiendas con su propio RUC. El botón para agregar vive solo aquí, a un lado del título; las tiendas no muestran quién vende en ellas.
// Solo el Admin agrega o edita: los demás ven las tarjetas.

export function EmpresasAliadas({
  lectura,
  tiendas,
  rucDeCasa,
  responsable,
}: {
  lectura: LecturaAliadas;
  tiendas: readonly { id: string; nombre: string }[];
  rucDeCasa: string | null;
  responsable: ReturnType<typeof useResponsable>;
}) {
  const router = useRouter();
  const [hoja, setHoja] = useState<{
    inicial: BorradorAliada | null;
    bajaPedida: boolean;
  } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
  // «Comprobantes» de una aliada (20261122213000): su domicilio fiscal y su llave de Lucode. Solo el Admin, y solo si la base ya la tiene.
  const [comprobantes, setComprobantes] = useState<EmpresaAliada | null>(null);
  // El botón que abrió la hoja: al cerrarla, el foco vuelve ahí y no al principio de la página (/chaos 2026-11-21, TEC-06).
  const origen = useRef<HTMLElement | null>(null);
  const { aliadas, puedeEditar } = lectura;
  const otrosRuc = (id: string | null) => aliadas.filter((a) => a.id !== id && a.ruc).map((a) => a.ruc as string);
  const agregar = puedeEditar ? (
    <Boton type="button" onClick={(e) => {
        origen.current = e.currentTarget;
        setHoja({ inicial: null, bajaPedida: false });
      }} data-guia="config.aliadas-agregar">
      <span className="inline-flex items-center gap-1.5">
        <Plus className="mas h-4 w-4" aria-hidden /> Agregar empresa aliada
      </span>
    </Boton>
  ) : null;

  // Deshacer la baja pedida, durante su semana: un toque, sin otra confirmación (perdonar antes que preguntar).
  // ADR-0683: si las prendas de una aliada pueden entrar a las campañas de CAYLA. Se guarda al tocarlo, como un ajuste; nace apagado.
  async function cambiarCampanas(id: string, nombre: string, entra: boolean) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setDeshaciendo(id);
    const { error } = (await firmar(createClient().rpc("fijar_aliada_en_campanas" as never, { p_id: id, p_entra: entra } as never) as never, responsable.firma())) as {
      error: unknown;
    };
    setDeshaciendo(null);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "cambiar si entra a las campañas"));
      return;
    }
    avisar.exito(entra ? `Las prendas de ${nombre} ya pueden entrar a una campaña que las incluya.` : `Las prendas de ${nombre} quedan fuera de las campañas.`);
    router.refresh();
  }

  async function deshacerBaja(id: string, nombre: string) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setDeshaciendo(id);
    const { error } = (await firmar(createClient().rpc("deshacer_baja_empresa_aliada" as never, { p_id: id } as never) as never, responsable.firma())) as {
      error: unknown;
    };
    setDeshaciendo(null);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "deshacer la baja"));
      return;
    }
    avisar.exito(`${nombre} sigue vendiendo: se deshizo la baja.`);
    router.refresh();
  }

  return (
    <section aria-label="Empresas aliadas" data-guia="config.aliadas">
      <TituloSeccion cuenta={aliadas.length} accion={agregar}>
        Empresas aliadas
      </TituloSeccion>
      {aliadas.length === 0 ? (
        <Vacio tamano="chico" icono={<Store />}>
          Ninguna otra empresa vende en tus tiendas.
        </Vacio>
      ) : (
        <div className="vs-aliadas">
          {aliadas.map((a, e) => {
            const regimen = REGIMENES.find((r) => r.valor === a.regimen)?.nombre;
            const contacto = [a.correo, a.telefono].filter(Boolean).join(" · ");
            return (
              <article key={a.id} className="vs-aliada vs-liquido" data-luz style={{ ["--e" as string]: e }}>
                <header>
                  <div className="min-w-0">
                    <b className="vs-aliada-nombre">{a.nombre}</b>
                    {rotuloDeAliada(a) && <span className="vs-rotulo">{rotuloDeAliada(a)}</span>}
                  </div>
                  {puedeEditar && (
                    <LapizEditar
                      que={a.nombre}
                      onClick={(e?: MouseEvent<HTMLButtonElement>) => {
                        origen.current = e?.currentTarget ?? null;
                        setHoja({
                          inicial: borradorDeAliada(a),
                          bajaPedida: a.bajaEl !== null,
                        });
                      }}
                    />
                  )}
                </header>
                {/* Como las tarjetas de sede: qué le falta, en una frase (/formidable 2026-11-21, cambio 1). */}
                {fraseDeAliada(a) && <p className="vs-frase">{fraseDeAliada(a)}</p>}
                {a.bajaEl && (
                  <div className="vs-aliada-fila items-center">
                    <Chip tono="ambar">Se da de baja el {fechaCorta(a.bajaEl)}</Chip>
                    {puedeEditar && <BotonDeshacer onClick={() => deshacerBaja(a.id, a.nombre)} disabled={deshaciendo === a.id} />}
                  </div>
                )}
                {a.bajaDetenida && (
                  <Aviso tono="atencion" chico titulo="La baja no se aplicó">
                    {a.bajaDetenida}
                  </Aviso>
                )}
                {(regimen || a.sedes.length > 0) && (
                <div className="vs-aliada-fila">
                  {regimen && (
                    <Chip tono="pizarra" versalitas={false}>
                      {a.regimen === "nuevo_rus" ? `${regimen} · solo boleta` : regimen}
                    </Chip>
                  )}
                  {a.sedes.map((s) => (
                    <Chip key={s.id} versalitas={false}>
                      {s.nombre}
                    </Chip>
                  ))}
                </div>
                )}
                {contacto && <span className="vs-dato-e text-sm">{contacto}</span>}
                <div className="vs-aliada-fila">
                  {a.cuentas.length ? (
                    a.cuentas.map((c) => (
                      <Chip key={c.id} versalitas={false} title={c.nombre}>
                        {etiquetaCuenta(c)}
                      </Chip>
                    ))
                  ) : (
                    <span className="vs-rotulo">Sin cuentas para cobrar</span>
                  )}
                </div>
                {a.comprobantes && (
                  <div className="vs-aliada-fila items-center">
                    <Chip tono={chipLucode(a.comprobantes).tono} versalitas={false}>
                      {chipLucode(a.comprobantes).texto}
                    </Chip>
                    <Boton
                      type="button"
                      className="btn-chico"
                      data-guia={e === 0 ? "config.aliadas-comprobantes" : undefined}
                      onClick={(ev) => {
                        origen.current = ev.currentTarget;
                        setComprobantes(a);
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-4 w-4" aria-hidden /> Comprobantes
                      </span>
                    </Boton>
                  </div>
                )}
                {puedeEditar ? (
                  <div className="flex items-center gap-1.5">
                    <Interruptor
                      activo={a.entraACampanas}
                      onActivo={(v) => cambiarCampanas(a.id, a.nombre, v)}
                      disabled={deshaciendo === a.id}
                      etiqueta="Entra a las campañas de CAYLA"
                    />
                    <Ayuda titulo="Entra a las campañas de CAYLA">
                      Encendido, una campaña de CAYLA que incluya a las empresas aliadas también le baja el precio a sus prendas. Apagado, sus prendas
                      quedan siempre fuera. Una aliada nueva nace apagada.
                    </Ayuda>
                  </div>
                ) : (
                  a.entraACampanas && <span className="vs-rotulo">Entra a las campañas de CAYLA</span>
                )}
              </article>
            );
          })}
        </div>
      )}
      {hoja && (
        <HojaEmpresaAliada
          inicial={hoja.inicial}
          bajaPedida={hoja.bajaPedida}
          tiendas={tiendas}
          otrosRuc={otrosRuc(hoja.inicial?.id ?? null)}
          rucDeCasa={rucDeCasa}
          responsable={responsable}
          volverA={origen}
          onClose={() => setHoja(null)}
        />
      )}
      {comprobantes && (
        <HojaComprobantesAliada aliada={comprobantes} responsable={responsable} volverA={origen} onClose={() => setComprobantes(null)} />
      )}
    </section>
  );
}
