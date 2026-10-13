// Ronda 6 de /unificar: el comportamiento de las demos vivas (todo delegado; sobrevive a «Repetir»).
// Combos que se abren, eligen y buscan; campos que se encienden, consultan y avisan; casillas e interruptores; tablas que se
// ordenan y abren su fila; títulos que entran. Nada guarda ni navega.
(() => {
  const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const abiertoAhora = () => document.querySelector("[data-combo].abierto");

  function cerrar(combo, devolverFoco = false) {
    if (!combo || !combo.classList.contains("abierto")) return;
    combo.classList.remove("abierto");
    combo.classList.add("cierra");
    const disp = combo.querySelector("[data-disparador]");
    disp?.setAttribute("aria-expanded", "false");
    setTimeout(() => combo.classList.remove("cierra"), 170);
    if (devolverFoco) disp?.focus();
  }

  function abrir(combo) {
    const otro = abiertoAhora();
    if (otro && otro !== combo) cerrar(otro);
    combo.classList.remove("cierra");
    combo.classList.add("abierto");
    combo.querySelector("[data-disparador]")?.setAttribute("aria-expanded", "true");
    const lista = combo.querySelector(".pf-lista, .h-lista");
    // La cascada vuelve a correr cada vez que se abre (como en el ERP: la lista se monta de nuevo)
    if (lista) { const c = lista.cloneNode(true); lista.replaceWith(c); }
    const ops = opciones(combo);
    const elegida = ops.findIndex((o) => o.getAttribute("aria-selected") === "true");
    marcarActiva(combo, elegida >= 0 ? elegida : 0);
    const busca = combo.querySelector(".pf-lista .busca input");
    if (busca) { busca.value = ""; filtrar(combo, ""); setTimeout(() => busca.focus(), 20); }
  }

  const opciones = (combo) => [...combo.querySelectorAll(".opc:not([hidden])")];

  function marcarActiva(combo, i) {
    const ops = opciones(combo);
    ops.forEach((o, k) => o.classList.toggle("activa", k === i));
    ops[i]?.scrollIntoView({ block: "nearest" });
  }

  function elegir(combo, op) {
    if (!op || op.getAttribute("aria-disabled") === "true") return;
    combo.querySelectorAll(".opc").forEach((o) => o.setAttribute("aria-selected", String(o === op)));
    const texto = op.dataset.texto ?? op.querySelector(".t")?.textContent ?? op.textContent.trim();
    const valor = combo.querySelector(".pf-valor, .val-combo");
    if (valor) {
      valor.textContent = texto;
      valor.classList.remove("marcador");
      valor.classList.remove("entra"); void valor.offsetWidth; valor.classList.add("entra");
    }
    const ava = combo.querySelector("[data-disparador] .ava");
    if (ava && op.querySelector(".ava")) { ava.textContent = op.querySelector(".ava").textContent; }
    const input = combo.querySelector("[data-disparador] input");
    if (input) input.value = texto;
    // Píldora de filtro: queda puesta con su valor, salvo que se elija «Todas»
    const pildora = combo.querySelector(".pp, .pp2");
    if (pildora) {
      const todas = op.dataset.todas === "1";
      pildora.classList.toggle("puesta", !todas);
      const v = pildora.querySelector(".val");
      if (v) { v.textContent = todas ? (v.dataset.base ?? "") : texto; v.classList.remove("entra"); void v.offsetWidth; v.classList.add("entra"); }
      const dos = pildora.querySelector(".dos"); if (dos) dos.hidden = todas;
    }
    // Una elección hecha deja el campo «hecho» en la guía de foco (si la demo la trae)
    const campo = combo.closest(".pf");
    campo?.querySelector(".pf-marca.falta")?.replaceWith(Object.assign(document.createElement("span"), { className: "pf-marca hecho", innerHTML: VISTO + "listo" }));
    cerrar(combo, true);
  }

  function filtrar(combo, q) {
    const ops = [...combo.querySelectorAll(".opc")];
    const nq = sinTildes(q.trim());
    let n = 0;
    ops.forEach((o) => { const ver = !nq || sinTildes(o.textContent).includes(nq); o.hidden = !ver; if (ver) n++; });
    combo.querySelectorAll(".og").forEach((g) => {
      let s = g.nextElementSibling, alguna = false;
      while (s && !s.classList.contains("og")) { if (s.classList.contains("opc") && !s.hidden) alguna = true; s = s.nextElementSibling; }
      g.hidden = !alguna;
    });
    const vacio = combo.querySelector(".vacio");
    if (vacio) { vacio.hidden = n > 0; const b = vacio.querySelector("b"); if (b) b.textContent = `«${q.trim()}»`; }
    const crear = combo.querySelector(".crear");
    if (crear) {
      crear.hidden = !nq;
      const b = crear.querySelector("b"); if (b) b.textContent = `«${q.trim()}»`;
    }
    marcarActiva(combo, 0);
  }

  const VISTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" pathLength="1"/></svg>';

  document.addEventListener("click", (e) => {
    const t = e.target;
    // Quitar el filtro de una píldora puesta (la ✕), sin abrir la lista
    const quitar = t.closest?.(".pp .quitar");
    if (quitar) {
      e.preventDefault(); e.stopPropagation();
      const combo = quitar.closest("[data-combo]");
      const todas = combo.querySelector('.opc[data-todas="1"]');
      if (todas) { combo.classList.add("abierto"); elegir(combo, todas); }
      return;
    }
    const disp = t.closest?.("[data-disparador]");
    if (disp) {
      const combo = disp.closest("[data-combo]");
      if (disp.matches("button")) { e.preventDefault(); combo.classList.contains("abierto") ? cerrar(combo) : abrir(combo); }
      else if (!combo.classList.contains("abierto")) abrir(combo);
      return;
    }
    const op = t.closest?.("[data-combo] .opc");
    if (op) { e.preventDefault(); elegir(op.closest("[data-combo]"), op); return; }
    const crear = t.closest?.("[data-combo] .crear");
    if (crear) { e.preventDefault(); cerrar(crear.closest("[data-combo]"), true); return; }
    if (!t.closest?.("[data-combo]")) { const a = abiertoAhora(); if (a) cerrar(a); }

    // Tocar la caja (no el texto) pone el cursor adentro, como un <label>
    const caja = t.closest?.(".pf-caja, .pf-hilo, .h-hilo, .h-caja, .h-busc, .h-monto, .dz-busq");
    if (caja && !t.closest("input, textarea, button")) { caja.querySelector("input, textarea")?.focus(); }
    // Una fila de casilla: tocar el texto marca la casilla (o mueve el interruptor)
    const fc = t.closest?.(".fila-cas");
    if (fc && !t.closest("input, button")) { const c = fc.querySelector("input, button"); if (c?.matches("input")) c.checked = !c.checked; else c?.click(); return; }
    // Interruptores
    const sw = t.closest?.(".pi, .h-int");
    if (sw) { e.preventDefault(); sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")); return; }

    // Tablas: ordenar por una columna (la flecha gira; las filas entran en cascada en el nuevo orden)
    const orden = t.closest?.(".pt .cab button[data-campo]");
    if (orden) {
      e.preventDefault();
      const tabla = orden.closest(".pt");
      const antes = orden.getAttribute("aria-sort");
      const dir = antes === "descending" ? "ascending" : "descending";
      tabla.querySelectorAll(".cab button[data-campo]").forEach((b) => b.setAttribute("aria-sort", b === orden ? dir : "none"));
      const campo = orden.dataset.campo;
      const filas = [...tabla.querySelectorAll(".fila")];
      const padre = filas[0].parentElement;
      const val = (f) => { const v = f.dataset[campo]; return v != null && !isNaN(+v) ? +v : (v ?? ""); };
      filas.sort((a, b) => { const x = val(a), y = val(b); const r = x > y ? 1 : x < y ? -1 : 0; return dir === "ascending" ? r : -r; });
      const pie = tabla.querySelector(".pie-t");
      filas.forEach((f, i) => { f.style.setProperty("--i", i); f.classList.remove("entra"); void f.offsetWidth; f.classList.add("entra"); padre.insertBefore(f, pie); });
      return;
    }
    // Tablas: una fila que lleva a su detalle queda marcada mientras su cajón está abierto
    const fila = t.closest?.(".pt.clic .fila");
    if (fila) {
      e.preventDefault();
      const ya = fila.getAttribute("aria-current") === "true";
      fila.closest(".pt").querySelectorAll(".fila").forEach((f) => f.removeAttribute("aria-current"));
      if (!ya) fila.setAttribute("aria-current", "true");
      const cajon = fila.closest(".dz")?.querySelector(".dz-cajon");
      if (cajon) { cajon.hidden = ya; if (!ya) { cajon.querySelector(".nom").textContent = fila.dataset.nombre ?? ""; reiniciar(cajon); } }
      return;
    }
    // Demo de «guardar» un formulario: marca lo que falta (sin guardar nada)
    const guardar = t.closest?.("[data-probar-guardar]");
    if (guardar) {
      e.preventDefault();
      const hoja = guardar.closest(".dz-hoja");
      let falta = false;
      hoja.querySelectorAll("[data-obligatorio]").forEach((c) => {
        const caja = c.querySelector(".pf-caja, .pf-hilo, .h-hilo, .h-caja, .h-busc");
        const input = c.querySelector("input");
        const combo = c.querySelector("[data-combo]");
        const vacio = input ? !input.value.trim() : combo ? !combo.querySelector('.opc[aria-selected="true"]') : false;
        const pie = c.querySelector(".pie");
        caja?.classList.toggle("mal", vacio);
        if (pie) {
          pie.className = vacio ? "pie err" : "pie";
          pie.innerHTML = vacio ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" pathLength="1"/><path d="M12 8v4" pathLength="1"/><path d="M12 16h.01" pathLength="1"/></svg>${c.dataset.obligatorio}` : "";
        }
        if (vacio) falta = true;
      });
      if (!falta) { guardar.classList.add("listo"); setTimeout(() => guardar.classList.remove("listo"), 1200); }
      return;
    }
    // Elegir un estado / escena
    const sel = t.closest?.("[data-ver]");
    if (sel) {
      e.preventDefault();
      const dz = sel.closest(".dz");
      dz.querySelectorAll("[data-ver]").forEach((b) => b.setAttribute("aria-pressed", String(b === sel)));
      dz.querySelectorAll("[data-escena]").forEach((s) => { const ver = s.dataset.escena === sel.dataset.ver; s.hidden = !ver; if (ver) reiniciar(s); });
      return;
    }
    // Repetir: vuelve a correr las animaciones de entrada
    const rep = t.closest?.(".dz-repetir");
    if (rep) { e.preventDefault(); rep.closest(".dz").querySelectorAll("[data-escena]:not([hidden]), .dz-repite").forEach(reiniciar); return; }
    if (t.closest?.(".dz a, .dz button")) e.preventDefault();
  });

  // Un campo que se quita la marca de error en cuanto se escribe (la persona ya lo está arreglando)
  document.addEventListener("input", (e) => {
    const input = e.target;
    const combo = input.closest?.("[data-combo]");
    if (combo) {
      if (!combo.classList.contains("abierto")) abrir(combo);
      filtrar(combo, input.value);
      if (input.closest(".pf-lista")) return;
    }
    const campo = input.closest?.("[data-obligatorio]");
    if (campo && input.value.trim()) {
      campo.querySelector(".mal")?.classList.remove("mal");
      const pie = campo.querySelector(".pie.err"); if (pie) { pie.className = "pie"; pie.innerHTML = ""; }
    }
    // RUC: con 11 dígitos «consulta al padrón» (el hilo barre) y queda bien (verde)
    const ruc = input.closest?.("[data-ruc]");
    if (ruc) {
      const caja = ruc.querySelector(".pf-caja, .pf-hilo, .h-hilo, .h-caja");
      const pie = ruc.querySelector(".pie");
      caja?.classList.remove("bien", "trabaja");
      if (pie) { pie.className = "pie"; pie.textContent = ""; }
      clearTimeout(ruc._t);
      if (/^\d{11}$/.test(input.value)) {
        caja?.classList.add("trabaja");
        if (pie) pie.textContent = "Buscando en SUNAT…";
        ruc._t = setTimeout(() => { caja?.classList.remove("trabaja"); caja?.classList.add("bien"); if (pie) pie.textContent = "Textiles Andinos S.A.C. · activo y habido"; }, 1300);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    const combo = e.target.closest?.("[data-combo]");
    if (!combo) return;
    const abierto = combo.classList.contains("abierto");
    if (!abierto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) && e.target.matches("button")) { e.preventDefault(); abrir(combo); }
      return;
    }
    const ops = opciones(combo);
    const i = ops.findIndex((o) => o.classList.contains("activa"));
    if (e.key === "ArrowDown") { e.preventDefault(); marcarActiva(combo, Math.min(ops.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarActiva(combo, Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(combo, ops[i]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(combo, true); }
    else if (e.key === "Tab") cerrar(combo);
  });
  document.addEventListener("mouseover", (e) => {
    const op = e.target.closest?.("[data-combo] .opc");
    if (!op) return;
    const combo = op.closest("[data-combo]");
    marcarActiva(combo, opciones(combo).indexOf(op));
  });
  // Fila de tabla con teclado: Enter la abre
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const fila = e.target.closest?.(".pt.clic .fila");
    if (fila) { e.preventDefault(); fila.click(); }
  });

  function reiniciar(nodo) { const copia = nodo.cloneNode(true); nodo.replaceWith(copia); }
})();

// La onda que nace donde tocas un btn-cayla (copia de components/ui/OndaBotones.tsx, ronda 4).
document.addEventListener("pointerdown", (e) => {
  const boton = e.target.closest?.(".mov-boton, .btn-cayla:not(.btn-enlace)");
  if (!boton) return;
  const r = boton.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  boton.style.setProperty("--onda-x", x + "px"); boton.style.setProperty("--onda-y", y + "px");
  boton.style.setProperty("--onda-d", 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) + "px");
  boton.removeAttribute("data-onda"); void boton.offsetWidth; boton.setAttribute("data-onda", "");
  setTimeout(() => boton.removeAttribute("data-onda"), 500);
}, { capture: true, passive: true });
