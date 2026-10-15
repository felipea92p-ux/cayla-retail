// Ronda 13 de /unificar: los «−/+» de la barra y del anillo, «Copiar» (copia un texto de ejemplo) y el menú «Más». Nada guarda.
(() => {
  document.addEventListener("click", async (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    // La barra de avance y el anillo: la cifra cambia y la pieza se desliza (o no, si es la quieta).
    const paso = t.closest("[data-r13-mas], [data-r13-menos]");
    if (paso) {
      const bloque = paso.closest("[data-r13-avance], [data-r13-anillo]");
      const total = Number(bloque.dataset.total);
      const v = Math.max(0, Math.min(total, Number(bloque.dataset.valor) + (paso.hasAttribute("data-r13-mas") ? 1 : -1)));
      bloque.dataset.valor = String(v);
      const pieza = bloque.querySelector(".r13-av, .r13-an");
      if (pieza.classList.contains("r13-av")) {
        pieza.style.setProperty("--p", String(v / total));
        pieza.setAttribute("aria-valuenow", String(Math.round((v / total) * 100)));
        const cifra = bloque.querySelector("[data-r13-cifra]");
        if (cifra) cifra.textContent = String(v);
      } else {
        pieza.style.setProperty("--p", String((v / total) * 100));
        const centro = pieza.querySelector(".r13-an-centro");
        if (centro) centro.firstChild.textContent = bloque.dataset.centro === "pct" ? `${Math.round((v / total) * 100)}%` : String(v);
      }
      // La barra quieta se queda en tinta aunque se complete (lo dice su CSS); el anillo quieto es verde siempre.
      if (v >= total || pieza.hasAttribute("data-quieto")) pieza.setAttribute("data-completo", "");
      else pieza.removeAttribute("data-completo");
      return;
    }

    // Copiar: el ícono se vuelve ✓ y dice «Copiado» 1,8 s; el botón cambia su palabra sin cambiar de ancho.
    const cp = t.closest("[data-r13-copiar]");
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.r13Copiar); } catch { /* en la demo da igual */ }
      cp.setAttribute("data-copiado", "");
      const dicho = cp.nextElementSibling?.classList.contains("r13-cp-dicho") ? cp.nextElementSibling : null;
      if (dicho) { dicho.textContent = "Copiado"; dicho.setAttribute("data-visto", ""); }
      clearTimeout(cp._r13);
      cp._r13 = setTimeout(() => { cp.removeAttribute("data-copiado"); if (dicho) { dicho.removeAttribute("data-visto"); } }, 1800);
      return;
    }

    // El menú: abre su lista; tocar afuera o elegir la cierra.
    const boton = t.closest("[data-r13-menu]");
    document.querySelectorAll("[data-r13-menu][aria-expanded='true']").forEach((b) => {
      if (b !== boton) { b.setAttribute("aria-expanded", "false"); b.nextElementSibling.hidden = true; }
    });
    if (boton) {
      const abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", String(!abierto));
      boton.nextElementSibling.hidden = abierto;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll("[data-r13-menu][aria-expanded='true']").forEach((b) => { b.setAttribute("aria-expanded", "false"); b.nextElementSibling.hidden = true; });
  });
})();
