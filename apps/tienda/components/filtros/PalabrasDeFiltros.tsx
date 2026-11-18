"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { Faceta } from "@/lib/filtros-color-talla";
import { PanelDeFiltro } from "./PanelDeFiltro";
import { textoDeQuitar, useFiltros } from "./ProveedorFiltros";

// La fila COLOR · TALLA de la barra de la lista y los dos paneles que abre (maqueta «Opción 1 · Filtros que se abren», ADR-0512 actividad 4).
// Va como una fila más de la barra pegada (`.t-filtros-niveles`); los paneles cuelgan de la barra (`.t-filtros`, que es posicionada): se
// pegan a su borde de abajo, bajan y suben con ella, y nunca se cortan: si no caben bajo la barra, la página sube lo justo y, en último caso,
// el panel se desplaza por dentro. TALLA se esconde (suave) donde la lista no pide talla: bolsos, bisutería.

const Caret = () => (
  <svg className="fp-caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    <path d="M1.75 3.75 5 7l3.25-3.25" />
  </svg>
);

const FACETAS: readonly Faceta[] = ["color", "talla"];

export function PalabrasDeFiltros() {
  const f = useFiltros();
  // Next guarda ocultas las páginas anteriores: la misma lista puede estar dos veces en el documento, y un `id` fijo se repetiría.
  const uid = useId().replace(/:/g, "");
  const fila = useRef<HTMLDivElement>(null);
  const palabras = useRef<Record<Faceta, HTMLButtonElement | null>>({ color: null, talla: null });
  const paneles = useRef<Record<Faceta, HTMLElement | null>>({ color: null, talla: null });
  const abierto = f?.abierto ?? null;
  const abrir = f?.abrir;

  const barra = useCallback(() => fila.current?.closest<HTMLElement>(".t-filtros") ?? null, []);

  // Dónde cae el panel: bajo su palabra, sin salirse de la barra, y de un alto que cabe en lo que queda de pantalla. Se escribe directo en el
  // panel (es medir y acomodar el DOM, no estado de la pantalla): así seguir a la barra al desplazar no vuelve a dibujar nada.
  const colocar = useCallback(() => {
    const b = barra();
    const p = abierto ? palabras.current[abierto] : null;
    const el = abierto ? paneles.current[abierto] : null;
    if (!b || !p || !el) return;
    const rb = b.getBoundingClientRect();
    const ancho = Math.min(420, rb.width);
    el.style.width = `${ancho}px`;
    el.style.left = `${Math.max(0, Math.min(p.getBoundingClientRect().left - rb.left, rb.width - ancho))}px`;
    el.style.maxHeight = `${Math.max(200, window.innerHeight - rb.bottom - 12)}px`;
    // Lo que el panel abierto deja debajo (las fichas y el «N prendas en Trujillo») se esconde entero: así no asoma un pedazo cortado en su borde.
    const pr = el.getBoundingClientRect();
    for (const x of document.querySelectorAll<HTMLElement>(".fp-ficha, .t-conteo")) {
      const r = x.getBoundingClientRect();
      x.toggleAttribute("data-tapada", r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom);
    }
  }, [abierto, barra]);

  // Al abrir: se coloca, y si debajo de la barra no cabe, la página sube lo justo (sin animación: con scroll suave el panel iba un cuadro
  // detrás de la barra y se despegaba mientras la página subía). Después, el foco pasa a la primera opción (o a la elegida).
  useLayoutEffect(() => {
    if (!abierto) return;
    colocar();
    const b = barra();
    const el = paneles.current[abierto];
    if (b && el) {
      const cuerpo = el.querySelector<HTMLElement>(".fp-p-cuerpo");
      const pie = el.querySelector<HTMLElement>(".fp-p-pie");
      const natural = (cuerpo?.scrollHeight ?? 0) + (pie?.offsetHeight ?? 0) + 2;
      const rb = b.getBoundingClientRect();
      const falta = rb.bottom + natural + 16 - window.innerHeight;
      if (falta > 0 && rb.top > 0) window.scrollBy({ top: Math.min(falta, rb.top), behavior: "auto" });
    }
    const t = requestAnimationFrame(() => {
      const el2 = paneles.current[abierto];
      const primera = el2?.querySelector<HTMLElement>('.fp-op[aria-pressed="true"], .fp-op[aria-disabled="false"], .fp-op') ?? el2;
      primera?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(t);
  }, [abierto, barra, colocar]);

  // Mientras está abierto: sigue a la barra al desplazar o cambiar de tamaño; Escape cierra y devuelve el foco; Tab no se escapa del panel;
  // un toque fuera lo cierra (el toque se atiende: cambiar de grupo suelta lo que no existe y avisa).
  useEffect(() => {
    if (!abierto || !abrir) return;
    let raf = 0;
    const pronto = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; colocar(); });
    };
    const cerrar = (devolverFoco: boolean) => {
      abrir(null);
      if (devolverFoco) palabras.current[abierto]?.focus({ preventScroll: true });
    };
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar(true);
        return;
      }
      if (e.key !== "Tab") return;
      const el = paneles.current[abierto];
      if (!el) return;
      const foc = Array.from(el.querySelectorAll<HTMLElement>("button, [tabindex='0']")).filter((x) => !x.hidden && x.offsetParent !== null);
      if (foc.length === 0) return;
      const primero = foc[0];
      const ultimo = foc[foc.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === el)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    const alTocarFuera = (e: PointerEvent) => {
      const dentro = e.target instanceof Node && (paneles.current[abierto]?.contains(e.target) || fila.current?.contains(e.target));
      if (!dentro) abrir(null);
    };
    window.addEventListener("scroll", pronto, { passive: true });
    window.addEventListener("resize", pronto);
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alTocarFuera, true);
    return () => {
      cancelAnimationFrame(raf);
      for (const x of document.querySelectorAll("[data-tapada]")) x.removeAttribute("data-tapada");
      window.removeEventListener("scroll", pronto);
      window.removeEventListener("resize", pronto);
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("pointerdown", alTocarFuera, true);
    };
  }, [abierto, abrir, colocar]);

  // Con el panel abierto, lo que se elige cambia lo que queda debajo (una ficha nueva): se vuelve a acomodar.
  const elegidoAhora = f?.elegido;
  useEffect(() => {
    if (abierto) colocar();
  }, [abierto, colocar, elegidoAhora]);

  // Si TALLA se va (otro grupo sin tallas) con su panel abierto, el panel se cierra y el foco pasa a COLOR.
  const nC = f?.elegido.color.length ?? 0;
  const nT = f?.elegido.talla.length ?? 0;
  const verTalla = f?.vivo ? f.vivo.opciones.tallaRelevante || nT > 0 : nT > 0;
  useEffect(() => {
    if (verTalla || abierto !== "talla" || !abrir) return;
    const dentro = paneles.current.talla?.contains(document.activeElement);
    abrir(null);
    if (dentro) palabras.current.color?.focus({ preventScroll: true });
  }, [verTalla, abierto, abrir]);

  if (!f) return null;
  const hay = nC + nT > 0;

  function alTeclearPalabra(e: KeyboardEvent<HTMLButtonElement>, faceta: Faceta) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (abierto !== faceta) f?.abrir(faceta);
    }
  }

  return (
    <div ref={fila} className="fp-fila" role="group" aria-label="Filtrar por color y talla">
      {FACETAS.map((faceta) => {
        const n = faceta === "color" ? nC : nT;
        const nombre = faceta === "color" ? "Color" : "Talla";
        return (
          <button
            key={faceta}
            ref={(el) => {
              palabras.current[faceta] = el;
              if (faceta === "color") f.registrar("color", el);
            }}
            type="button"
            className="t-pildora fp-pal"
            data-faceta={faceta}
            data-hay={n > 0 ? "" : undefined}
            data-fuera={faceta === "talla" && !verTalla ? "true" : undefined}
            inert={faceta === "talla" && !verTalla}
            aria-haspopup="dialog"
            aria-expanded={abierto === faceta}
            aria-controls={`fp-p-${faceta}-${uid}`}
            aria-label={`${nombre}${n ? `, ${n} ${faceta === "color" ? (n === 1 ? "elegido" : "elegidos") : n === 1 ? "elegida" : "elegidas"}` : ""}`}
            onPointerEnter={f.cargar}
            onFocus={f.cargar}
            onClick={() => {
              f.cargar();
              if (abierto === faceta) {
                f.abrir(null);
                palabras.current[faceta]?.focus({ preventScroll: true });
              } else f.abrir(faceta);
            }}
            onKeyDown={(e) => alTeclearPalabra(e, faceta)}
          >
            <span>{nombre}</span>
            {n > 0 && <span className="fp-globo">{n}</span>}
            <Caret />
          </button>
        );
      })}
      <button
        type="button"
        className="fp-qt fp-etq"
        hidden={!hay}
        onClick={() => {
          f.abrir(null);
          f.quitar();
          palabras.current.color?.focus({ preventScroll: true }); // el botón se oculta: el foco no se queda en el aire
        }}
      >
        {textoDeQuitar(f.elegido)}
      </button>
      {FACETAS.map((faceta) => (
        <PanelDeFiltro
          key={faceta}
          faceta={faceta}
          id={`fp-p-${faceta}-${uid}`}
          ref={(el) => {
            paneles.current[faceta] = el;
          }}
          cerrar={(devolverFoco) => {
            f.abrir(null);
            if (devolverFoco) palabras.current[faceta]?.focus({ preventScroll: true });
          }}
        />
      ))}
    </div>
  );
}
