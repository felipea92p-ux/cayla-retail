/* =====================================================================
   «Copiar mi selección» — para toda maqueta de docs/maquetas/ (Felipe 2026-11-01).
   Pone un botón al final de la barra de la maqueta (.spk) que copia lo que está marcado, listo para pegarlo en el chat:
     Mi selección · <título> (docs/maquetas/<carpeta>/)
     - <grupo>: <opción marcada>
     Visto en: <tema> · <ancho>
   No sabe nada de cada maqueta: lee la barra tal como está. Un grupo es un `.seg-m` o `.seg` (su opción marcada lleva `.on` o
   `aria-pressed="true"`) y su nombre es la `.tag` que lo antecede; las casillas y los botones de acción encendidos se juntan bajo su `.tag`.
   Tema, ancho y vista van aparte: dicen cómo se miró, no qué se eligió. marco.js lo carga solo; una maqueta sin la base lo suma con
   <script src="../vidrio-base-2026-10/copiar-seleccion.js"></script>. Si la maqueta rehace su barra, el botón vuelve solo.
   ===================================================================== */
(() => {
  const VISTA = /^(tema|ancho|vista|tamaño|momento)$/i;
  // lo que dice cómo se mira, aunque su grupo no tenga etiqueta propia
  const PARECE_VISTA = /^(claro|oscuro)\b|^\d{3,4}( px)?$|ventana|escritorio|todo el ancho|tableta|celular|móvil|lado a lado/i;
  const limpio = (t) => (t || '').replace(/\s+/g, ' ').replace(/\s*✓\s*$/, '').trim();

  function seleccion() {
    const spk = document.querySelector('.spk'); if (!spk) return '';
    const filas = [], vista = [], extras = new Map();
    let etiqueta = '', fresca = false, titulo = limpio(spk.querySelector('.titulo')?.textContent) || limpio(document.title);
    for (const el of spk.children) {
      if (el.classList.contains('copiar-sel') || el.classList.contains('titulo')) continue;
      if (el.classList.contains('tag')) { etiqueta = limpio(el.textContent); fresca = true; continue; }
      if (el.matches('.seg-m, .seg')) {
        const on = el.querySelector('button.on, button[aria-pressed="true"]'); if (!on) continue;
        const valor = limpio(on.textContent), nombre = fresca ? etiqueta : '';
        fresca = false;
        // un grupo sin su propia etiqueta (la de antes ya se usó): si dice cómo se mira, va a «Visto en»; si no, a «Además»
        if (VISTA.test(nombre) || (!nombre && PARECE_VISTA.test(valor))) vista.push(valor);
        else filas.push(`- ${nombre || el.dataset.ctl || 'Además'}: ${valor}`);
        continue;
      }
      const casillas = el.matches('label') ? [el] : [...el.querySelectorAll('label')];
      const grupo = fresca ? etiqueta : 'Además';
      for (const l of casillas) {
        const c = l.querySelector('input[type="checkbox"]'); if (!c) continue;
        const lista = extras.get(grupo) || []; if (c.checked) lista.push(limpio(l.textContent)); extras.set(grupo, lista);
      }
      if (el.matches('button.accion.on')) { const lista = extras.get(grupo) || []; lista.push(limpio(el.textContent)); extras.set(grupo, lista); }
    }
    for (const [n, l] of extras) filas.push(`- ${n}: ${l.length ? l.join(', ') : 'ninguno'}`);
    // la carpeta de la maqueta, para que se sepa de dónde vino
    const partes = location.pathname.split('/').filter(Boolean), i = partes.indexOf('maquetas');
    const carpeta = i >= 0 && partes[i + 1] ? `docs/maquetas/${partes[i + 1]}/` : partes.length > 1 ? `docs/maquetas/${partes[partes.length - 2]}/` : '';
    return [`Mi selección · ${titulo}${carpeta ? ` (${carpeta})` : ''}`, ...filas, ...(vista.length ? [`Visto en: ${vista.join(' · ')}`] : [])].join('\n');
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (_) {}
    // el camino viejo, por si el navegador no deja (archivo abierto sin servidor)
    const t = document.createElement('textarea'); t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok;
  }

  const estilo = document.createElement('style');
  estilo.textContent = `.spk .copiar-sel{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:8px;cursor:pointer;
    border:1px solid rgba(245,240,232,.35);background:rgba(245,240,232,.08);color:#f5f0e8;font:600 12px/1 'DM Sans',system-ui,sans-serif;transition:background .2s,color .2s} /* tema-fijo: barra de la maqueta */
    .spk .copiar-sel svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    @media (hover:hover){.spk .copiar-sel:hover{background:rgba(245,240,232,.18)}} /* tema-fijo: barra de la maqueta */
    .spk .copiar-sel[data-copiado]{background:#f5f0e8;color:#1a1a18} /* tema-fijo: barra de la maqueta */`;
  document.head.appendChild(estilo);

  const COPIA = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>';
  const VISTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  function poner() {
    const spk = document.querySelector('.spk'); if (!spk || spk.querySelector('.copiar-sel')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'copiar-sel';
    b.title = 'Copia las opciones que tienes marcadas, para pegarlas en el chat'; b.innerHTML = `${COPIA}<span>Copiar mi selección</span>`;
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const ok = await copiar(seleccion());
      b.toggleAttribute('data-copiado', ok); b.innerHTML = ok ? `${VISTO}<span>Copiado</span>` : `${COPIA}<span>No se pudo copiar</span>`;
      clearTimeout(b._t); b._t = setTimeout(() => { b.removeAttribute('data-copiado'); b.innerHTML = `${COPIA}<span>Copiar mi selección</span>`; }, 1800);
    });
    spk.appendChild(b);
  }
  window.copiarSeleccion = { texto: seleccion };
  const iniciar = () => { poner(); const spk = document.querySelector('.spk'); if (spk) new MutationObserver(poner).observe(spk, { childList: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
