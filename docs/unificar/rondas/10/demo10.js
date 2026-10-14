// Ronda 10 de /unificar: lo que se mueve en las demos (abrir el panel de filtros, «armar» un archivo). Nada guarda ni descarga.
(() => {
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const filtros = t.closest("[data-r10-filtros]");
    if (filtros) {
      const caja = filtros.closest(".dz-papel");
      const panel = caja?.querySelector("[data-r10-panel]");
      const boton = filtros.matches("button") ? filtros : filtros.querySelector("button");
      const abrir = panel?.hidden;
      if (panel) panel.hidden = !abrir;
      boton?.setAttribute("aria-expanded", String(!!abrir));
      if (filtros.classList.contains("pildora-filtro")) filtros.toggleAttribute("data-abierta", !!abrir);
    }
    const descarga = t.closest("[data-r10-descarga]");
    if (descarga && !descarga.hasAttribute("data-trabajando")) {
      descarga.setAttribute("data-trabajando", "");
      setTimeout(() => {
        descarga.removeAttribute("data-trabajando");
        const listo = document.createElement("span");
        listo.className = "r10-listo";
        listo.textContent = "✓ Listo (en la demo no se descarga nada)";
        descarga.after(listo);
        setTimeout(() => listo.remove(), 1800);
      }, 1200);
    }
  });
})();
