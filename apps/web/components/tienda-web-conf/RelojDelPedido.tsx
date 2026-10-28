"use client";

import { CheckCircle2, ShoppingBag, Store, Wallet } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { RANGOS_PARAMETROS, moverParametro, parametroFueraDeRango, queVeElCliente, type BorradorParametros, type ParametrosTiendaWeb } from "@/lib/tienda-web-reglas";

type PlazoEditable = Exclude<keyof ParametrosTiendaWeb, "quedanPocasDesde">;

/** Los cuatro pasos de la vida de un pedido web. Cada plazo tiene su paso (cuánto sube o baja con un toque), su unidad y la frase corta que lo
 *  explica; la explicación larga va en `title` (al pasar el mouse) y en lo que oye el lector de pantalla. */
const PASOS: {
  icono: ReactNode;
  nombre: string;
  plazo: PlazoEditable | null;
  unidad?: string;
  paso?: number;
  nota: string;
  ayuda?: string;
}[] = [
  { icono: <ShoppingBag />, nombre: "Separa", plazo: null, nota: "El cliente, en la web" },
  {
    icono: <CheckCircle2 />,
    nombre: "Confirmas",
    plazo: "horasParaConfirmar",
    unidad: "h",
    paso: 1,
    nota: "o se cierra solo",
    ayuda: "Si la tienda no confirma el pedido en ese tiempo, se cierra solo y el cliente puede volver a separarlo.",
  },
  {
    icono: <Wallet />,
    nombre: "Paga",
    plazo: "horasAvisoSinPagar",
    unidad: "h",
    paso: 6,
    nota: "o se anula si no pagó nada",
    ayuda: "Desde que la tienda lo confirma. Si no pagó nada, se anula solo y sus prendas vuelven a estar disponibles; si pagó una parte, sale con aviso y la tienda decide.",
  },
  {
    icono: <Store />,
    nombre: "Recoge",
    plazo: "diasAvisoSinRecoger",
    unidad: "d",
    paso: 1,
    nota: "con su código",
    ayuda: "Desde que paga. Pasado ese plazo, se le recuerda al cliente y la tienda decide.",
  },
];

/**
 * La vida de un pedido web, con sus plazos a la mano (Tienda web ▸ Conf. Tienda, maqueta de 2026-10-26): separa → confirmas → paga → recoge, y bajo
 * cada paso el número de horas o días que se sube y baja con − y + (o se escribe). Reemplaza a la línea que solo mostraba y las cuatro cajas de abajo:
 * el número está donde se lee. No guarda nada: avisa cada cambio y el guardado es del botón de la tarjeta.
 */
export function RelojDelPedido({ valor, onCambiar, onRevertir }: { valor: BorradorParametros; onCambiar: (clave: PlazoEditable, texto: string) => void; onRevertir: (clave: PlazoEditable) => void }) {
  return (
    <ol className="tw tw-linea" aria-label="La vida de un pedido web y sus plazos">
      {PASOS.map((p, i) => (
        <li key={p.nombre} className="tw-linea-paso" style={{ "--i": i } as CSSProperties} title={p.ayuda}>
          <span aria-hidden className="tw-linea-nodo">
            {p.icono}
          </span>
          <span className="tw-linea-nombre">{p.nombre}</span>
          {p.plazo ? (
            <PasoCantidad
              tamano="fila"
              sufijo={p.unidad}
              tono={parametroFueraDeRango(p.plazo, valor[p.plazo]) ? "error" : undefined}
              menos={{ onClick: () => onCambiar(p.plazo!, moverParametro(p.plazo!, valor[p.plazo!], -(p.paso ?? 1))), deshabilitado: Number(valor[p.plazo]) <= RANGOS_PARAMETROS[p.plazo][0], etiqueta: `Menos: ${p.nombre}` }}
              mas={{ onClick: () => onCambiar(p.plazo!, moverParametro(p.plazo!, valor[p.plazo!], p.paso ?? 1)), deshabilitado: Number(valor[p.plazo]) >= RANGOS_PARAMETROS[p.plazo][1], etiqueta: `Más: ${p.nombre}` }}
              campo={{
                value: valor[p.plazo],
                inputMode: "numeric",
                "aria-label": `${p.nombre}: ${p.unidad === "d" ? "días" : "horas"}. ${p.ayuda ?? ""}`.trim(),
                style: { width: `${Math.max(2, valor[p.plazo].length)}ch` },
                onChange: (e) => onCambiar(p.plazo!, e.target.value.replace(/[^\d-]/g, "")),
                onKeyDown: (e) => {
                  if (e.key === "Escape") onRevertir(p.plazo!);
                },
              }}
            />
          ) : (
            <Chip tono="neutro" versalitas={false}>
              Cliente
            </Chip>
          )}
          <span className="tw-linea-plazo">{p.nota}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * «Stock en la web»: desde cuántas unidades el cliente ve el número en vez de «Hay». Arriba, las unidades que quedan; abajo, lo que lee el cliente
 * con cada una. Se toca hasta dónde avisar (1, 2 o 3); «4+» siempre dice «Hay» y no se toca: la cifra exacta de 4 o más nunca sale a la web
 * (ADR-0408, DECIDÍ 6). Flechas ← → entre las opciones, como un grupo de opciones.
 */
export function EscalaDeStock({ valor, onValor }: { valor: number; onValor: (n: 1 | 2 | 3) => void }) {
  const opciones = [1, 2, 3] as const;
  return (
    <div className="twc-escala-bloque">
      <div className="flex flex-wrap items-center gap-2">
        <span className="campo-etiqueta" id="twc-escala-titulo">
          Stock en la web
        </span>
        <Chip tono="neutro" versalitas={false}>
          Toca hasta dónde avisar
        </Chip>
      </div>
      <div className="twc-escala">
        <span className="twc-escala-t" style={{ gridRow: 1 }}>
          Quedan
        </span>
        <span className="twc-escala-t" style={{ gridRow: 2 }}>
          Cliente ve
        </span>
        <div role="radiogroup" aria-labelledby="twc-escala-titulo" className="twc-escala-opciones">
          {opciones.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === valor}
              tabIndex={n === valor ? 0 : -1}
              className="twc-celda"
              data-poco={n <= valor ? "" : undefined}
              data-tope={n === valor ? "" : undefined}
              onClick={() => onValor(n)}
              onKeyDown={(e) => {
                const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!paso) return;
                e.preventDefault();
                const sig = Math.min(3, Math.max(1, n + paso)) as 1 | 2 | 3;
                onValor(sig);
                (e.currentTarget.parentElement?.children[sig - 1] as HTMLElement | undefined)?.focus();
              }}
            >
              <b>{n}</b>
              <span>{queVeElCliente(n, valor)}</span>
            </button>
          ))}
          <span className="twc-celda twc-celda-fija" title="Con 4 o más, siempre dice «Hay»">
            <b>4+</b>
            <span>Hay</span>
          </span>
        </div>
      </div>
    </div>
  );
}
