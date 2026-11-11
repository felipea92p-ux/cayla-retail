# Ingresos — pendientes (2026-11-11)

- [ ] **Pegar en producción `supabase/migrations/20261111171000_ingresos_valor_del_ingreso.sql`** (Felipe). Es solo lectura: un `create or replace` de `retail.fn_ingresos_por_modelo` con la misma firma, sin políticas ni `alter`. Hasta que se pegue, la columna y la cifra «Valor» no aparecen. Después, refrescar el diccionario (`pnpm datos:generar:produccion`).
- [ ] **Ver la columna Valor con una cuenta que vea el dinero.** En local solo se probó con la cuenta de una colaboradora: la de líder hubiera pedido cerrar su sesión en el navegador. Lo cubren las pruebas de la base y de la web.
- [ ] **Probar el filtro de las cifras «Nuevos» y «Reingresos» con datos reales.** En la semilla local todos los modelos son nuevos, y con una sola clase la cifra informa pero no filtra.
- [ ] Idea que quedó fuera de esta tanda: «cuánto se vendió de lo que entró» (entró / vendidas / quedan por modelo). Lleva migración de solo lectura.
