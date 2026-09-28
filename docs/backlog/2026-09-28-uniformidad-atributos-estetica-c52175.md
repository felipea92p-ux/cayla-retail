## 🎨 Atributos uniforme en las seis pestañas (2026-09-28, ADR-0261) — solo web, sin migración; rama `claude/uniformidad-atributos-estetica-c52175`

- [x] `components/atributos/kit.tsx`: `BarraAtributos`, `TituloGrupo`, `TarjetaAtributo`, `BotonesPendiente`, `PieTarjeta`/`AccionTarjeta`/`DesactivarTarjeta`, `BotonReactivar`, `SinCoincidencias`, `VocabularioVacio`, `GRILLA_ATRIBUTOS`. Etiquetas y Tallas pasaron sin cambio visible (salvo el pie de Etiquetas, que ya no parte «Configurar campaña»).
- [x] Colores: píldoras por familia, muestra 3:1 (antes 48 px), desactivados con la familia en palabras («Neutro», no «neutro»).
- [x] Tejidos y Patrones: píldoras «En uso · Sin prendas» (`usoDe`, con pruebas), «Desactivar» discreto al pie, sin sombra; vocabulario vacío lo dice.
- [x] Temporadas: abre en «Las nueve» en grilla con `MuestraTemporada` (molde `MuestraIcono` de Etiquetas; `estacionesDe`, `grupoDeTemporada`, `tonoDeTemporada` con pruebas); franja «Completar › · Por categoría › · Calendario ›»; «← Las nueve temporadas» en cada vista de trabajo. ADR-0246, «Actualización 2026-09-28 (b)».
- [x] La ayuda de Temporadas ya no dice «comparar verano con verano» (dejó de ser cierto con 3d7ed85f).
- [x] Verificado en el navegador contra la base local, 1440 y 375 px (ver ADR-0261, «Cómo se verificó»). `tsc`, `eslint` y la suite web (215 archivos) en verde.
- [ ] **Sin probar en producción:** Temporadas con datos reales (31 prendas sin temporada, 6 de 44 categorías con temporada): que la franja diga esas cifras y que «Completar ›» lleve a los 11 grupos.
- [ ] **Mirar en unas semanas:** si «Por completar» no baja con la grilla como entrada, volver a abrir en «Por completar» (una línea en `vistaTemporadas`).
- [ ] **Deuda anotada:** `TejidosLista.tsx` y `PatronesLista.tsx` son el mismo archivo con otro sustantivo (374 líneas cada uno); juntarlos en uno parametrizado evitaría que vuelvan a derivar.
- [ ] **Si Colores sigue creciendo:** con 10 píldoras, a 1440 px el buscador baja a una segunda fila; pasar las familias a un `DesplegablePildora` cuando moleste.
- Cómo verificas: Catálogo ▸ Atributos ▸ pasa por las seis pestañas: arriba siempre píldoras a la izquierda y (menos en Temporadas) buscador y «+ Agregar» a la derecha; tarjetas del mismo alto de imagen. En Temporadas: nueve tarjetas con dibujo; «Clásicos» deja tres; «Completar ›» abre la lista y «← Las nueve temporadas» vuelve.
