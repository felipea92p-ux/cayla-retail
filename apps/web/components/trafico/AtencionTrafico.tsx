"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { PackageCheck, PackageOpen, Sparkles, Store } from "lucide-react";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { Pestanas } from "@/components/ui/Pestanas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import {
  diasDeStockTexto,
  esperaDelPedido,
  miles,
  paraEmpujar,
  paraReponer,
  personas,
  type AtencionTrafico as Atencion,
  type PrendaAtencion,
} from "@/lib/trafico-reglas";

type Vista = "reponer" | "recoger" | "empujar";

/**
 * «Necesita tu atención» (actividad 8; maqueta `docs/maquetas/trafico-decisiones-2026-10/`): el tráfico cruzado con el stock y los
 * pedidos, de las últimas 4 semanas hasta hoy. Reponer: las que miran y se agotan en menos de 14 días (pedirlas antes de empujarlas).
 * Recoger: los pedidos pagados que nadie recoge (su prenda está guardada y no se puede vender). Empujar: las que miran y no salen, con
 * stock para más de 40 días (revisar precio y fotos). Solo lee: lo que se hace, se hace en su pantalla.
 */
export function AtencionTrafico({ atencion, hoy }: { atencion: Atencion; hoy: string }) {
  const reponer = paraReponer(atencion.prendas);
  const empujar = paraEmpujar(atencion.prendas);
  const pedidos = atencion.recoger.map((w) => ({ ...w, ...esperaDelPedido(w, atencion.diasAviso, hoy) }));
  const atrasados = pedidos.filter((w) => w.atrasado).length;
  const [vista, setVista] = useState<Vista>(reponer.length ? "reponer" : atencion.recogerTotal ? "recoger" : "empujar");

  return (
    <section className="anim-sube min-w-0" style={{ "--i": 11 } as CSSProperties} aria-labelledby="trafico-atencion" data-guia="trafico.atencion">
      <TituloSeccion id="trafico-atencion" dato="Tráfico cruzado con stock y pedidos">
        Necesita tu atención
      </TituloSeccion>
      <div className="card-cayla mt-2 flex flex-col px-5 pb-4 pt-3">
        <Pestanas
          etiquetaAccesible="Qué atender"
          idIndicador="trafico-atencion"
          activa={vista}
          onCambio={(c) => setVista(c as Vista)}
          items={[
            { clave: "reponer", etiqueta: "Reponer", conteo: reponer.length, ...(reponer.length ? { pide: "por reponer" } : { tono: "neutro" as const, pide: "por reponer" }) },
            {
              clave: "recoger",
              etiqueta: "Recoger",
              conteo: atencion.recogerTotal,
              ...(atrasados ? { pide: "esperan hace días" } : { tono: "neutro" as const, pide: "esperan" }),
            },
            { clave: "empujar", etiqueta: "Empujar", conteo: empujar.length, tono: "neutro", pide: "por empujar" },
          ]}
        />
        <ul className="mt-2">
          {vista === "reponer" &&
            (reponer.length ? (
              reponer.map((p) => (
                <Fila
                  key={p.id}
                  marca={<Miniatura p={p} />}
                  titulo={p.nombre}
                  detalle={`La miran ${personas(p.miraron)} · quedan ${miles(p.quedan)} ${p.quedan === 1 ? "unidad" : "unidades"}`}
                  cifra={diasDeStockTexto(p.dias)}
                  urgente={p.dias < 5}
                  pie={p.dias < 1 ? "sin stock" : "de stock"}
                />
              ))
            ) : (
              <Vacio icono={<PackageOpen />} titulo="Nada se está por agotar" tamano="chico">
                Ninguna prenda que miren se acaba en las próximas 2 semanas.
              </Vacio>
            ))}
          {vista === "recoger" &&
            (pedidos.length ? (
              pedidos.map((w) => (
                <Fila
                  key={w.id}
                  marca={
                    <span aria-hidden className="grid h-12 w-10 place-items-center rounded-lg bg-hueso text-taupe">
                      <PackageCheck className="h-5 w-5" />
                    </span>
                  }
                  titulo={`Pedido ${w.codigo ?? w.numero ?? ""}${w.prenda ? ` · ${w.prenda}${w.talla ? ` (${w.talla})` : ""}` : ""}${w.prendas > 1 ? ` y ${w.prendas - 1} más` : ""}`}
                  detalle={`Para recoger en la tienda de ${w.sede}`}
                  cifra={w.dias === 0 ? "hoy" : `hace ${w.dias} d`}
                  urgente={w.atrasado}
                  pie={w.atrasado ? "avísale ya" : "pagado"}
                />
              ))
            ) : (
              <Vacio icono={<Store />} titulo="Ningún pedido espera" tamano="chico">
                Todos los pedidos pagados ya se recogieron.
              </Vacio>
            ))}
          {vista === "empujar" &&
            (empujar.length ? (
              empujar.map((p) => (
                <Fila
                  key={p.id}
                  marca={<Miniatura p={p} />}
                  titulo={p.nombre}
                  detalle={`La miran ${personas(p.miraron)} y ${p.separaron ? `solo ${miles(p.separaron)} la separaron` : "nadie la separó"} · quedan ${miles(p.quedan)}`}
                  cifra={diasDeStockTexto(p.dias)}
                  pie={p.dias === null ? "en 4 semanas" : "de stock"}
                />
              ))
            ) : (
              <Vacio icono={<Sparkles />} titulo="Nada sobra" tamano="chico">
                Las prendas que miran se están llevando a buen ritmo.
              </Vacio>
            ))}
        </ul>
        <p className="nota-cayla sin-i mt-auto text-[13px]">
          {vista === "reponer" ? (
            <>
              Al ritmo de las últimas 4 semanas, estas se agotan primero. <b className="font-semibold">Pide reponerlas antes</b> de empujarlas en redes.
            </>
          ) : vista === "recoger" ? (
            <>
              Separar no es vender: <b className="font-semibold">{atencion.recogerTotal === 1 ? "1 pedido espera" : `${atencion.recogerTotal} pedidos esperan`}</b> que
              los recojan. Mientras esperan, esas prendas no se pueden vender a otra persona.{" "}
              <EnlaceVer href="/tienda-web/pedidos?pestana=entregar">Ver pedidos</EnlaceVer>
            </>
          ) : (
            <>
              Hay stock y poca salida. <b className="font-semibold">Revisa precio y fotos</b>, o ponlas primero en la portada.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

function Miniatura({ p }: { p: PrendaAtencion }) {
  return <MiniaturaPrenda tamano="md" fotoUrl={p.foto} colorHex={p.hex} prefijo={p.prefijo} familia={p.familia} categoria={p.categoria} />;
}

function Fila({ marca, titulo, detalle, cifra, pie, urgente = false }: { marca: ReactNode; titulo: string; detalle: string; cifra: string; pie: string; urgente?: boolean }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-sand py-3 first:border-t-0">
      {marca}
      <span className="min-w-0">
        <b className="block truncate text-[14px] font-semibold">{titulo}</b>
        <small className="block text-[12.5px] text-tinta/70">{detalle}</small>
      </span>
      <span className="text-right">
        <b className={`block font-display text-[22px] leading-tight tabular-nums ${urgente ? "text-ambar" : ""}`}>{cifra}</b>
        <small className="block text-[12px] text-tinta/70">{pie}</small>
      </span>
    </li>
  );
}
