# «Poner un %» (ADR-0669) · pendientes

- [ ] Pegar en producción, con el OK de Felipe, `20261116182000_rebaja_rapida_por_prenda` y después `20261116183000_buscar_prenda_para_rebaja`
  (va DESPUÉS de las cinco de `claude/ofertas-promociones-casos-689a3b`). Una tabla nueva con RLS sin políticas y funciones nuevas.
- [ ] Probarlo con una colaboradora en una tienda (la regla «Formidable»: que lo entienda sin explicarle).
- [ ] Regenerar los tipos de la base después de pegarlas y quitar `lib/rebaja-rapida.ts` (las llama sin tipo mientras tanto).
- [ ] Los cajones también salen como campañas en la billetera de abajo: si estorban, esconderlos ahí (ya tienen su lista arriba).
- [ ] La guía interactiva explica el escáner y la lista, no recorre la hoja (necesitaría una prenda a la vista): mirar si vale un ejemplo.
