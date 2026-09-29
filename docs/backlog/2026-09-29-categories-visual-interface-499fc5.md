## 🧾 Categorías: ícono por prenda + tarjeta de Atributos (2026-09-29, ADR-0287) — solo web, sin migración; rama `claude/categories-visual-interface-499fc5`, independiente del PR #600

- [x] 42 íconos por prefijo (`lib/icono-categoria-reglas.ts`, con `icono-categoria-reglas.test.ts`: las 42 activas tienen ícono, ninguno repite dibujo, categoría nueva → `null`).
- [x] Tonos por familia (`lib/categoria-tonos.ts` + prueba): los de Etiquetas/Temporadas, nunca rojo; familia desconocida → neutro. `TONO_PIZARRA` sube a `MuestraEtiqueta.tsx`.
- [x] `IconoFamilia` expone `formasDeFamilia`; `IconoCategoria` (ícono suelto, cae al de la familia) y `MuestraCategoria` (banner sobre `MuestraIcono`).
- [x] `CategoriasLista.tsx` con `BarraAtributos` + `BotonFiltro` (píldoras por familia) + `TituloGrupo` + `TarjetaAtributo`; Vista rápida con el ícono en el tono de su familia.
- [x] Verificado en el navegador (1440 y 375 px, sesión de Líder; lo esencial repetido sobre `main` limpio), incluido el fallback (se quitó y se restauró el ícono de `BOD`).
- [ ] **Al fusionar #600 (ADR-0262) y esta rama, el segundo agrega el pie `PieTarjeta` + `DesactivarTarjeta` a `TarjetaCategoria`** (las dos tocan `CategoriasLista.tsx`).
- [ ] **#600 hoy no puede fusionarse contra `main`:** `DetalleMuestraModal.tsx` usa `responsable` (que `main` quitó), sus modales no están en `lib/guia-de-foco-pantallas.ts` y su ADR-0262 repite número (chip lanzado; no es de esta rama).
- [ ] **Deuda:** `MuestraEtiqueta.tsx:26-31` guarda ámbar y verde con los hex de antes del 2026-09-22; unificar con los tokens (cambia un poco Etiquetas, Temporadas y Categorías).
- [ ] **Sin hacer (no era visual):** el ícono también en `alta-producto/ArbolCategoria.tsx:196-205` (botones de solo texto en el alta de producto).
- [ ] **Sin hacer:** la prueba `Solo íconos` con 5 colaboradoras (abrigo, casaca, blazer, chompa y polera se parecen); elegir el ícono de una categoría nueva desde «Editar» (pide una columna).
