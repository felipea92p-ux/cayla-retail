## Análisis: lo que sigue después de #1 a #4 (2026-10-14)
- [ ] **Abrir el PR con `/abrir-pr`** (rama `claude/pantalla-analysis-verification-e61bab`, 7 commits, sin migración). Choques a mirar: el PR #1042 (unificar) toca `components/analisis/FichaPrenda.tsx`; aquí se tocó `lib/frescura.ts`, `lib/frescura-piso.ts` y `pasoParaHablar` (la puerta de Frescura y el Inicio).
- [ ] **Verificar en TRU después del deploy:** «Qué pedir» con «(N sin su prenda)» y Faldas entre las que no llegan; «¿Qué no se mueve?» dice «Todavía no se puede saber» hasta que algún modelo cumpla su umbral; «Registrar N» = las pendientes de Por regularizar.
- [ ] **`/formidable` y `/chaos` sobre Análisis** (tarea #11 del análisis): la hoja «Liquidar desde» sigue siendo la única escritura y ahora es respaldo.
- [ ] **Decide Felipe: «Qué pedir» contra Navidad fija o contra el Plan de campaña** (tarea #5 del análisis, con su Ganas/Pagas en `docs/pantallas/gestion-analisis.md` §8).
- [ ] **La curva de tallas de «Qué pedir» todavía no suma la talla de lo vendido sin registrar** (`curvaDeTallas`, `lib/analisis-pedir.ts`): el dato ya se lee (`leerVendidoSinRegistrar` trae la fila; falta pedir `talla_id`).
- [ ] **Tareas #5 a #12 del análisis** (propuestas, sin aprobar): ver `docs/pantallas/gestion-analisis.md` §11.
