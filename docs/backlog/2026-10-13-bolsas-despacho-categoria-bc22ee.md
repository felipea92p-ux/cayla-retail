## 🛍️ La pestaña Grupos del Plan del piso ignora las familias apagadas (2026-10-13, ADR-0377 act. 2026-10-13) — migración `20261013130000` **sin pegar en producción**; rama `claude/bolsas-despacho-categoria-bc22ee`

- [x] `fn_categorias_grupo_mix` no lista la categoría de una familia con `entra_a_motores = false`; `fijar_grupos_de_categorias` la rechaza
      (`grupos_mix_categoria_fuera_del_plan`). Reemplazos anclados, una parte, re-ejecutable; anclas contadas contra producción (1 y 1).
- [x] `pnpm pruebas:motores-familias-apagadas`: casos G1-G3 (lista el polo y no la bolsa; la base no le da grupo y no escribe; al encender vuelve) y
      R1 cuenta las dos funciones nuevas. **No corrida en local** (sin Docker en esta máquina): la corre el CI.
- [ ] **Pegar `20261013130000` en producción** (OK de Felipe). Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] Mirar Plan del piso ▸ Grupos en producción después de pegar: «Categorías 45», tarjeta «Sin grupo» en 0, sin «Siguiente por revisar: Bolsas».
