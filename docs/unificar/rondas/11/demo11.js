// Ronda 11 de /unificar: lo que se mueve en las demos (quitar un filtro, limpiarlos todos, «imprimir»). Nada guarda ni imprime.
(() => {
  const vuelve = (fila) => setTimeout(() => fila.querySelectorAll("[data-r11-quitar]").forEach((c) => { c.classList.remove("r11-sale"); c.hidden = false; }), 1300);
  const quitar = (c) => { c.classList.add("r11-sale"); setTimeout(() => (c.hidden = true), 220); };
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const chip = t.closest("[data-r11-quitar]");
    if (chip) { quitar(chip); vuelve(chip.closest("[data-r11-fila]")); return; }
    const limpiar = t.closest("[data-r11-limpiar]");
    if (limpiar) {
      const fila = limpiar.closest("[data-r11-fila]");
      if (fila) { [...fila.querySelectorAll("[data-r11-quitar]")].forEach((c, i) => setTimeout(() => quitar(c), i * 55)); vuelve(fila); }
      return;
    }
    const imprimir = t.closest("[data-r11-imprimir]");
    if (imprimir && !imprimir.nextElementSibling?.classList.contains("r11-listo")) {
      const listo = document.createElement("span");
      listo.className = "r11-listo";
      listo.textContent = "✓ Se abriría el cuadro de impresión (en la demo no se imprime)";
      imprimir.after(listo);
      setTimeout(() => listo.remove(), 1800);
    }
  });
})();
