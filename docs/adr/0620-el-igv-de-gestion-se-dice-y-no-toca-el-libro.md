# ADR-0620 — El IGV de gestión: Ganancias muestra las ventas con IGV y resta lo que el líder dice que paga, sin tocar el libro

- Estado: construido en la rama `claude/excluir-igv-compras-66846a`, **sin aplicar en producción**. Decisiones de Felipe, 2026-11-06.
- Migraciones: `supabase/migrations/20261107034000_igv_de_gestion.sql` (la capa) y
  `supabase/migrations/20261107035000_arranque_igv_contra_el_credito.sql` (el arranque del Balance).
- Pruebas: `pnpm pruebas:igv-gestion`, `pnpm pruebas:arranque-igv`, `apps/web/lib/igv-gestion-reglas.test.ts`, `apps/web/lib/igv-gestion-uso.test.ts`.
- Relacionados: ADR-0453 (los sueldos estimados, el molde de esta capa), ADR-0618 (el arranque del Balance, cuyas cifras cambian aquí),
  ADR-0433 (el costo de la carga inicial trae IGV), ADR-0417 d.2 (el arreglo del costo, que sigue pendiente).

## El problema primero

Finanzas muestra las ventas sin IGV y les resta la mercadería y los gastos. Esa cuenta supone que todo el IGV de lo vendido sale de la caja. Hoy no
es cierto: CAYLA arrancó con S/ 62,035 de saldo a favor, así que octubre no paga IGV. El libro decía −26,488.05 y Felipe quiere leer el mes como lo vive:
lo que entró con IGV, menos el IGV que de verdad paga, menos lo que costaron las prendas y los gastos.

Además, el Balance y Impuestos se contradecían: el primero decía S/ 20,157 por pagar a SUNAT y creciendo; el segundo partía de 62,035 a favor.

## DECIDÍ

1. **Una capa de lectura, como los sueldos estimados.** Es lo único que no reemplaza funciones vivas: `fn_asientos`, `fn_estado_resultados`, el cierre, la renta,
   Impuestos y el archivo del contador no cambian. Lo que dice el líder no pasa por el diario.

   ```
   IGV incluido      = 4011 de: haber de venta, −debe de anulación, haber − debe de devolución y de cambio (sin adelantos)
   IGV del mes       = lo dicho, repartido por IGV incluido; sin monto dicho, todo el IGV incluido
   Ventas con IGV    = ventas_netas + IGV incluido
   Resultado gestión = Ventas con IGV − IGV del mes − mercadería − gastos (con sueldos estimados)
   Según el libro    = Resultado gestión − IGV incluido + IGV del mes + sueldos estimados
   ```

   El reparto vive en SQL (columna `igv_parte`), no en TypeScript: así la suite prueba que las partes suman lo dicho. Un mes a medias toma
   `monto × IGV del tramo ÷ IGV del mes`, y varios meses se suman mes a mes. El resto de céntimos va a la unidad con más IGV.
2. **Mes sin monto dicho (Felipe, decisión 1):** se resta todo el IGV incluido, con aviso, y no frena el cierre. Sin monto, la cifra es el libro: olvidarlo no daña nada.
3. **Balance (Felipe, decisión 2):** el arranque resta el saldo a favor contra lo que se debía. Octubre no paga IGV.
   - 4011: 20,157.00 por pagar − 62,035.00 de crédito = **41,878.00 a favor** (debe). El Balance la muestra como activo, en su propio grupo «Saldo a favor de IGV»:
     SUNAT lo descuenta y no lo paga en plata, así que no entra a «Si te cobraran todo hoy, cubres X %» (`medidores`). Con esos saldos el medidor da 129 % (13,687.68 contra 10,582.85), no 525 %.
   - 50 Capital: 139,723.78 + 62,035.00 = **201,758.78**: ese crédito ya era de CAYLA antes de empezar, no es ganancia de octubre.
   - 591 no cambia, ni el Estado de resultados.
   - Patrimonio: 110,423.63 → **172,458.63**. El plan decía unos 130,600, pero esa cifra solo borraba la deuda y no reconocía el crédito que sobra.
   - Debe = haber = 224,321.08. Ninguna función cambia: `fn_conciliacion_contable` pone el arranque en sus dos lados, y nadie suma `saldo_favor_igv` con `saldos_iniciales`.
4. **Finanzas ▸ Resumen (Felipe, decisión 3):** se rotula «Según el libro» ahora y pasa a gestión en otro PR.
5. **Quién dice el monto (Felipe, decisión 4):** solo el líder, con `fn_es_lider()`, porque cambia el resultado de toda CAYLA. Lo lee quien tiene `fn_ve_diario_de_todo()`;
   quien no ve toda CAYLA recibe el IGV sin el monto, y su aviso se lo dice.
6. **`retail.igv_del_mes` solo agrega filas**, gana el `id` mayor, con RLS sin políticas. Un mes con cualquier unidad cerrada rechaza decir el monto
   (`fn_exigir_igv_mes_abierto`, en la RPC y en el disparador): con ubicación nula, `fn_exigir_mes_abierto` solo mira el alcance empresa y una tienda cerrada cambiaría su columna.
7. **Ganancias, la línea de meses y «Ganaste» del Flujo pasan a gestión juntos.** Si falla una lectura del IGV, todas las columnas caen a netas con aviso,
   para no comparar netas contra brutas. La cabecera de Ganancias espera la lectura de la línea (`getIgvDelHilo`, con `cache`: es una sola por pantalla), y la línea sigue a la cabecera (`enLibro`):
   caen juntas y un solo aviso lo dice por las dos. Las barritas del calendario no llevan aviso, así que sin IGV no se dibujan. Un mes estimado se dibuja con punto hueco.
8. **Sigue en el libro, rotulado:** cuadro por sede, cuadre de ventas, Resumen, Balance, Patrimonio y CSV. Sin rótulo nuevo: renta, Impuestos, Flujo proyectado, «¿Me alcanza?», campañas, presupuesto.
   «¿Y si…?» sigue neto, con la columna «Utilidad al mes · parte del libro». `igv-gestion-uso.test.ts` falla si la renta, el contador, el Balance o Patrimonio leen esta capa.

### Criterios míos, no decididos por Felipe

- Un mes con IGV incluido en 0 o menos manda el monto entero a «De la empresa», también en un tramo parcial: no hay con qué prorratear.
- Una sede con IGV negativo reparte en la misma proporción: 9 dichos con +18 y −9 dan 18 y −9.
- Un mes cerrado rechaza también repetir el mismo monto.
- Los S/ 85.12 de IGV de boletas de CLAURE quedan en las ventas con IGV de octubre: ese IGV sí está en la 4011 de CAYLA, y excluirlo obligaría a leer `fn_claure_ventas`, que no se congela al cerrar.
- «Lo que dejó cada sede» y sus recomendaciones usan gestión: con 0 dicho, una tienda que perdía puede dejar de salir como «pierde».
- El Taller, que no vende, no lleva fila de IGV aunque el mes tenga monto dicho (origen `sin_igv`).
- **El mes en curso con monto dicho se resta entero, y no se compara.** Su IGV del mes llega solo hasta hoy, así que `monto × tramo ÷ mes` no prorratea: da el monto completo, mientras su mes pasado
  «a esta fecha» lleva solo su parte. `fn_igv_de_gestion` lo marca (`mes_en_curso`) y `mismaBaseDeIgv` apaga el chip; abrir la fila lo explica. Con 0 dicho, o sin decir, se sigue comparando: ahí
  las dos columnas sí están en la misma base. **Prorratear el mes en curso por días es decisión de Felipe:** cambiaría cuánto se resta, y él dijo «el monto del mes».
- Quien no ve toda CAYLA recibe `ve_dicho` falso. Su texto no afirma que el líder lo dijo ni que falta: no lo sabe.

## DESCARTÉ

- **La recomendación contraria sobre el Balance, que Felipe descartó.** Recomendé no tocar el arranque y aclararlo con el contador: octubre podía cerrarse igual, y los 62,035 no
  están confirmados contra el PDT 621. Ganaba no cambiar cifras aplicadas el mismo día. Felipe prefirió que el Balance deje de decir una deuda que no existe, y aceptó el costo: si el
  PDT dice otra cifra, hay que corregir dos lugares.
- **Asentar el IGV dicho en el diario.** El monto no es un hecho contable, y moverlo cambiaría un mes por lo que dice una persona.
- **Usar lo que calcula Impuestos para un mes sin monto.** Saldría 0 sin entrar cada mes, pero la cifra se mueve sola y podría cambiar un mes ya cerrado.
- **Frenar el cierre si falta el monto.** Trabaría cada cierre y arrastraría los meses siguientes si cierra alguien que no es líder.
- **Dejar el Resumen siempre neto, o moverlo aquí.** Lo primero deja dos cifras para siempre. Lo segundo toca punto de equilibrio y restas repartidas en varias pantallas.
- **Que también lo diga quien tiene Configuración.** Delega el trabajo, pero más gente movería el resultado de toda CAYLA.
- **Calcular ventas con IGV como netas × 1.18.** No cuadra con el diario; se lee la 4011.

## SE ROMPE SI

- **Una regla nueva de `fn_asientos` mueve la 7011 y la 4011 sin entrar a la lista de `fn_igv_de_gestion`:** las ventas quedan cortas sin error. Lo vigila `pruebas:igv-gestion`.
- **Se corrige `saldo_favor_igv` en Configuración:** Impuestos cambia y el arranque no. Esa corrección lleva la suya en el modal de Saldos de arranque.
- **Se conecta la renta o el archivo del contador a esta capa:** una cifra legal dependería de un monto que dice una persona. Lo vigila `igv-gestion-uso.test.ts`.
- **La web sale antes que la migración:** no se cae, cae a netas con aviso.
- **Se pega el arranque con los saldos movidos:** la migración avisa y no toca nada, y lanza un error si debe <> haber.

## Riesgos que quedan

- **Dos resultados conviven a propósito.** «Según el libro» los puentea, pero ninguna comprobación automática compara Ganancias con el Balance. Octubre diría −26,488.05 en el Resumen y
  −5,986.79 en Ganancias hasta el PR del Resumen.
- **Se puede sobrestimar la ganancia.** Con IGV 0, el crédito de cada factura nueva queda como ganancia. La carga inicial trae IGV en el costo y las facturas nuevas no, así que el margen mezcla bases.
- **Dos cifras de IGV.** Impuestos y el Flujo proyectado siguen con `a_pagar` por comprobantes aunque se diga otro monto. El IGV del diario y el de comprobantes ya difieren en S/ 285.50 en octubre.
- **Fechas viejas.** Lo registrado con fecha de octubre después de decir el monto cambia el libro, y la 591, que es un literal, no se entera.
- **El medidor «Si te cobraran todo hoy» se calla igual, y esta vez con razón:** la deuda sí bajó 20,157 por la decisión 2. Pasa de 45 % a 129 % aunque no entró un sol; lo que cambió es que ya no se cuenta como deuda.
- **El noviembre de gestión con un monto dicho sale más bajo los primeros días,** porque resta el mes entero contra pocos días de ventas. La fila lo dice y el chip se apaga, pero la cifra es esa hasta que Felipe decida si se prorratea.
- **Patrimonio de octubre podría mostrar 172,458.63 «sin explicar»,** porque el arranque es del 1-nov. Sin medir en vivo.
- **Sin verificar con datos reales:** lo probado corre sobre una pila aparte. Las cifras 133,922.31, −5,986.79 y 41,878.00 faltan confirmarse en producción con la sesión de Felipe.

## Cómo se aplica en producción

1. OK de Felipe: la primera es un cambio de esquema y la segunda escribe filas en `saldos_iniciales`.
2. Pegar cada migración entera, en una sola ejecución y en cualquier orden entre ellas, **antes** de publicar la web. Ninguna lleva políticas, `alter` de tablas en uso, `drop trigger` ni `select … into` en un texto citado.
3. Comprobar con `SELECT` que existen la tabla, el disparador y las funciones, y que el debe y el haber vigentes dan 224,321.08.
4. Con la sesión de Felipe, leer octubre y confirmar 133,922.31.
5. Fusionar y publicar la web.
6. Refrescar el volcado (`pnpm datos:generar:produccion`, ver `docs/datos/generado/COMO-REFRESCAR.md`): `igv_del_mes` entra al diccionario recién ahí.
7. Decir octubre antes de cerrarlo.

## Cómo deshacerlo

- **La capa:** `drop function` de las cuatro funciones y `drop table retail.igv_del_mes`. El libro no se entera.
- **El arranque:** desde el modal de Saldos de arranque, 4011 = 20,157.00 y 50 = 139,723.78, con motivo. Agrega filas, no borra.
