# «Poner un %» (ADR-0669) · pendientes

- [ ] **La pantalla se rehace (Felipe 2026-11-16: «ese diseño está horrible… parecen 3 tarjetas sueltas al azar»).** Maqueta de todo el
  módulo en `docs/maquetas/campanas-simple-2026-11/`: los descuentos primero, cada uno «Descuento −X %» con sus prendas como una campaña,
  agregar y quitar con deshacer, la cámara en el celular, y la hoja de ofertas en una sola hoja sin texto de más. La pantalla de hoy ya está
  en producción (PR #1898, fusionado el 2026-11-16) y sigue funcionando mientras tanto; la base (cajones) sirve tal cual para la nueva. La
  pantalla nueva espera a que Felipe elija la cara (A · En la lista o B · Etiquetas colgadas) y decida qué pasa con las campañas que hoy
  hacen de descuento.
- [x] Pegadas en producción el 2026-11-16, con el OK de Felipe (las 11 funciones idénticas a la copia local por su md5; la tabla con RLS y sin políticas): `20261116182000_rebaja_rapida_por_prenda` y después `20261116183000_buscar_prenda_para_rebaja`
  (va DESPUÉS de las cinco de `claude/ofertas-promociones-casos-689a3b`). Una tabla nueva con RLS sin políticas y funciones nuevas.
- [ ] Probarlo con una colaboradora en una tienda (la regla «Formidable»: que lo entienda sin explicarle).
- [ ] Regenerar los tipos de la base después de pegarlas y quitar `lib/rebaja-rapida.ts` (las llama sin tipo mientras tanto).
- [ ] Los cajones también salen como campañas en la billetera de abajo: si estorban, esconderlos ahí (ya tienen su lista arriba).
- [ ] La guía interactiva explica el escáner y la lista, no recorre la hoja (necesitaría una prenda a la vista): mirar si vale un ejemplo.
