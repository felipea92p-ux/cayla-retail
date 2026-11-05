# Finanzas ▸ Resumen · v3 (2026-10-23)

Pedido de Felipe (23-oct): rediseñar Finanzas submódulo por submódulo. Dijo que «todo está muy básico y poco entendible», que «hay filtros
que no funcionan bien» y que en algunas vistas «no hay botones para regresar». Pidió también que siempre se pueda separar por sede.
Este documento cubre solo el **Resumen** (`/finanzas` y `/finanzas/resumen`). Las otras cinco sesiones trabajan en sus propias carpetas.

- **Las maquetas:** `index.html` (este directorio; publicadas para Felipe en https://claude.ai/artifact/6wVCuXGYKgDnPoNiKbAbPs, privado). Arriba tiene el selector **A · B · C** (también `#a`, `#b`, `#c`) y el botón de tema
  claro/oscuro.
- **Las cifras son de ejemplo.** Son las de la v2 (octubre al jueves 15) y cuadran por sede: TRU +6,120 · AQP +2,480 · LIM −1,450 ·
  Taller −620 · Empresa −2,680 = **S/ 3,850**.
- **No se tocó** código de la app, migraciones ni producción. Se construye con `/construir` cuando Felipe elija.

## 1 · Auditoría (local, 2026-10-23, `felipe@cayla.local`, 1440 px y 375 px)

La base local tiene pocos datos: Lima 12 ventas, Trujillo 1, Arequipa ninguna. Además le faltan dos funciones de producción,
`fn_finanzas_confianza` y `fn_sobrantes_por_revisar`. Eso dejó a la vista el hallazgo 4. Los números de línea son del commit `cd7263fcc`.

### Grave: el número dice algo falso

1. **«¿Cada tienda cubre sus costos?» marca 100 % cuando la tienda no tiene gastos registrados.** `puntoDeEquilibrio` devuelve
   `cubre: 1` si `pe = 0`, en `apps/web/lib/resultados-reglas.ts:494`. En local, Lima y Trujillo salen «100 % = cubre sus costos justos»,
   y el motivo real es que no hay gastos cargados en septiembre. Una tienda sin alquiler registrado parece sana.
2. **La misma tienda se contradice en dos tarjetas.** En la vista de Lima, «Utilidad de septiembre» muestra S/ 37 con margen de 28,3 %.
   «Camino al punto de equilibrio» dice «Sin ventas con margen en septiembre», porque `caminoEquilibrio` descarta `pe <= 0`
   (`lib/resumen-finanzas-reglas.ts:966`) y el texto de `components/finanzas/ResumenFinanzas.tsx:377` culpa a las ventas. Tiene la misma
   causa raíz que el hallazgo 1: «sin gastos» no se distingue de «sin ventas».
3. **La cascada pinta en verde una pérdida.** En el «¿Por qué S/ 396?», la fila «Te falta S/ 396» sale verde, porque
   `app/estilos/finanzas.css:2209` le da `--color-verde` a todo tramo `queda`, sin mirar el signo.

### Alto: la sede y los filtros

4. **Un error de la base sale crudo y en inglés.** La tarjeta «Qué tan seguro es este número» muestra «Could not find the function
   retail.fn_finanzas_confianza(p_mes, p_ubicacion_id) in the schema cache» (`ResumenFinanzas.tsx:92`, que imprime `confianza.falla`
   tal cual). Viola la ley 9 de Formidable: un error se dice en tres líneas y en lenguaje de tienda.
5. **Hay dos selectores de sede y no se ponen de acuerdo.** La cabecera del ERP dice «TIENDA LIMA» y el Resumen, al lado, dice «Ver: Todas
   las tiendas». Ninguno nombra al otro. En el celular se ven uno encima del otro.
6. **«Todas las tiendas» incluye al Taller y a la empresa.** El combo (`components/finanzas/PorPagarAcciones.tsx:33`) y la frase
   (`resumen-finanzas-reglas.ts:1005`) dicen «tiendas». La regla de vocabulario dice «sede».
7. **Una sede elegida no se ve como filtro puesto ni se quita con ✕.** Solo queda el valor dentro del combo, y para volver la frase pide
   «elige «Todas las tiendas»». No hay `<Volver>` en la prop `volver` ni un `<FiltroPuesto>`.
8. **Cambiar de sede abre el loader de pantalla completa unos 8 s en dev.** Pasa porque navega con `router.push`
   (`PorPagarAcciones.tsx:23`). Es un filtro por clic, así que el loader es correcto según ADR-0149. Lo que falla es que la página entera
   se vuelve a pedir.
9. **Las filas de «Qué deja cada lugar» no se pueden tocar** (`ResumenFinanzas.tsx:258`). Son el reparto por sede, el lugar natural
   para entrar a una sede, y no llevan a ninguna parte.
10. **Algunos enlaces de «Para decidir hoy» pierden la sede.** Escenarios, Campañas, Impuestos y Dinero llevan a CAYLA entera aunque
    estés mirando Lima. Están en `resumen-finanzas-reglas.ts:647, 670, 768, 848` (`?ver=todas` fijo) y en `870, 893`.
11. **El flujo de caja de 6 semanas desaparece al elegir una sede**, y nada dice por qué. Su cifra «Plata disponible» pasa a
    «Efectivo en la tienda».

### Medio: se entiende en más de 5 segundos

12. **La cifra grande sale «S/ 396.00», con punto y decimales.** Las demás dicen «S/ 396», y «38,8 %» va con coma. `CifraAnimada`
    usa el `soles` de `lib/compras-reglas` (`components/ui/CifraAnimada.tsx:4`) y el resto de la pantalla usa el de `flujo-caja-reglas`.
13. **Las cinco cifras mezclan tres períodos sin decirlo:** «Vendido en el mes» (octubre), «Utilidad de septiembre» e «IGV estimado
    de oct.», y este último vale «S/ 0 · Saldo a favor S/ 7,997». No se entiende si 0 es bueno.
14. **Los faltantes de caja (S/ 680) van dentro de «Alquileres, servicios y otros gastos».** Una diferencia de caja no es un gasto que
    se decida, y escondida ahí no se ve.
15. **«Saldo de las próximas 6 semanas» dibuja seis barras rojas casi iguales** (de −41,888 a −41,039). No cuenta nada que el aviso de
    arriba no diga ya.
16. **El ancho está topado.** `/finanzas` está en `CON_TOPE_DE_ANCHO` (`components/AppShell.tsx:655`). Es deuda de ADR-0462: a 1440 px
    la pantalla queda en una columna de 64 rem.

### Bien (se conserva)

- La pregunta y la respuesta grande, con «Provisional» cuando la confianza es baja.
- Los avisos ordenados por cuánto cuestan, cada uno con su origen y su botón.
- La cascada a un toque.
- 375 px sin scroll lateral.

## 2 · Qué datos ya traen sede (base local, solo lectura)

| Pieza del Resumen | ¿Sede? | Cómo |
|---|---|---|
| Ventas, costo, margen, gastos, «deja» | **Sí** | `fn_estado_resultados(p_desde, p_hasta, p_ubicacion_id)` y `fn_resumen_finanzas(p_ubicacion_id, p_solo_empresa)`. `gastos`, `ventas`, `movimientos_dinero`, `presupuestos` y `cajas` tienen `ubicacion_id` |
| Efectivo (cajón, caja fuerte) | **Sí** | `cuentas_dinero.ubicacion_id` (7 cuentas, 1 sin sede) |
| Bancos | **No, y está bien** | Son de CAYLA entera. La maqueta lo dice en vez de esconderlo |
| Confianza | **Sí** | `fn_finanzas_confianza(p_mes, p_ubicacion_id)`, pero en local no está aplicada |
| **Flujo de caja (6 semanas)** | **No** | `fn_flujo_caja_proyeccion(p_semanas)` y `fn_flujo_caja_real(p_desde, p_hasta)` no reciben sede |
| **Egresos de caja sin clasificar** | **Indirecto** | `egresos_no_gasto` no tiene `ubicacion_id`: la sede sale por `caja_movimiento_id → cajas` |
| **Conciliación, depósitos de tarjeta** | **Indirecto** | Por la cuenta (`conciliaciones` → `cuentas_dinero.ubicacion_id`) o por la máquina, que ADR-0417 anota en cada cobro |
| **Ritmo por día y «cierras con»** | **Sí, calculable** | Sale de las ventas por sede. Hoy solo se calcula para lo que se mira |

## 3 · Las tres maquetas

Las tres parten del camino A de la v2. Las tres tienen lo que Felipe pidió:

- la sede a la vista, con «Todas las sedes» y su reparto;
- los filtros puestos que se quitan con ✕;
- la flecha de vuelta en toda vista interna;
- el orden del ERP: cabecera → cifras → tabla o lista en una tarjeta → nota en hueso;
- el ancho completo, revisado a 1440 y 375 px, en claro y en oscuro.

| | Camino | La idea | Resuelve |
|---|---|---|---|
| **A** | **La respuesta por sede** | La v2 A, con una **tira de sedes** bajo la cabecera. Cada sede muestra lo que deja y lo que vendió, y debajo va el reparto de lo vendido. Toca una sede (en la tira o en «Qué deja cada sede») y toda la pantalla pasa a esa sede: sale la flecha de vuelta y el filtro «Sede: Arequipa ✕». Lleva la cascada de verdad, con cada tramo flotando donde terminó el anterior y el resultado en verde o rojo según el signo. | 1–3 · 5–7 · 9 · 12 · 16 |
| **B** | **La mesa por sede** | El estado del mes como una **tabla con una columna por sede** y el total. Al tocar el nombre de una columna, la tabla queda en esa sede. Los filtros van en píldora («Sede», «Comparar con septiembre») y se ven puestos. «Servicios y otros» se abre en su detalle. Cada cifra trae una mini barra con el reparto por sede. Un aviso abre un cajón lateral en vez de sacarte de la pantalla. | 5–7 · 10 · 13 · 14 · 16 |
| **C** | **Cada sede, su tarjeta** | Arriba, la respuesta de CAYLA y «quién suma y quién resta». Debajo, **una tarjeta por sede** con su estado («Cubre el mes», «Abre el 20», «No vende»), lo que deja, su ritmo y cuántas cosas tiene por decidir. Al entrar a una sede ves su página interna, con la flecha, la cascada y «Comparar con…» otra sede lado a lado. | 1–3 · 5–7 · 9 · 11 · 16 |

**Mi recomendación es A.** Es la v2 que Felipe ya eligió con una sola pieza nueva, la tira de sedes. Responde «¿cómo voy?» y «¿cuál sede
me carga?» en la misma mirada. B le sirve más al contador, como pestaña de Reportes. C es la mejor para comparar sedes, pero mueve la
respuesta de CAYLA a un segundo plano.

**Lo que se arregla igual, sea cual sea el camino** (no es diseño, es corrección):

- el hallazgo 1 («sin gastos» no es «cubre 100 %»);
- el 3 (el color sigue al signo);
- el 4 (el error en tres líneas, sin el texto de la base);
- el 12 (un solo `soles`).

## 4 · Decisiones de Felipe (antes de construir)

1. **El camino:** A, B o C, o una pieza de una llevada a otra.
2. **Los dos selectores de sede (hallazgo 5).** Hay dos opciones:
   - **(a) recomendada:** el Resumen arranca en «Todas las sedes» y la sede de la cabecera no lo cambia. Si eliges otra en el Resumen,
     se ve como filtro puesto.
   - **(b):** el Resumen sigue a la sede de la cabecera.

   Con (a), quien maneja una tienda ve CAYLA entera y toca su sede. Con (b), ve su tienda y tiene que acordarse de cambiar arriba.
3. **El flujo de caja por sede (hallazgo 11) necesita base.** `fn_flujo_caja_*` no recibe `p_ubicacion_id`. Esas funciones son de la
   sesión de ADR-0433 y aquí no se tocan. Mientras no exista, la maqueta muestra «los bancos son de CAYLA entera» en vez de esconderlo.
   ¿Se pide como trabajo de base?
4. **Los faltantes de caja (hallazgo 14):** ¿van como línea aparte en la cascada («Diferencias de caja»), fuera de los gastos? Toca cómo
   se presenta la plata, así que lo decide Felipe.
5. **Quitar `/finanzas` de `CON_TOPE_DE_ANCHO`** afecta a los seis submódulos. Lo hace la sesión que construya primero, avisando a las
   demás.
