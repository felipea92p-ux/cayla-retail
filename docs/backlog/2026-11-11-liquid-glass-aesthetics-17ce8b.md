# Ingresos — pendientes (2026-11-11)

- [x] ~~**Pegar en producción `supabase/migrations/20261111171000_ingresos_valor_del_ingreso.sql`**~~ — pegada el 2026-11-11, con el OK de Felipe. Antes de pegar, la función viva tenía la misma huella que la original del repo (`md5(prosrc)` 2640a6ef…). El texto subió como archivo, con su SHA-256 comprobado. Después, la huella es la de la migración (31d54a6f…) y los permisos no cambiaron. Falta refrescar el diccionario (`pnpm datos:generar:produccion`) con el próximo volcado.
- [ ] **Ver la columna Valor con una cuenta que vea el dinero.** En local solo se probó con la cuenta de una colaboradora: la de líder hubiera pedido cerrar su sesión en el navegador. Lo cubren las pruebas de la base y de la web.
- [ ] **Probar el filtro de las cifras «Nuevos» y «Reingresos» con datos reales.** En la semilla local todos los modelos son nuevos, y con una sola clase la cifra informa pero no filtra.
- [ ] Idea que quedó fuera de esta tanda: «cuánto se vendió de lo que entró» (entró / vendidas / quedan por modelo). Lleva migración de solo lectura.
