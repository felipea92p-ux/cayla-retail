# Maqueta · Puntos del Club (2026-10-19)

> **Estado: en revisión con Felipe.** Solo maqueta: no hay migración, ni código del ERP, ni cambio en producción.
> Todos los datos (nombre, DNI, boletas, saldos, códigos) son **inventados**.

`index.html`: un solo archivo, se abre con doble clic. Barra negra de arriba: **Tienda web / Caja / Líder**, escritorio o
celular, claro u oscuro. La fila de pasos recorre la historia completa (1 Mi Club → 6 Saldo nuevo). Las tres pantallas
comparten el mismo estado: si canjeas en la tienda, el código existe en la caja; si cobras en la caja, el saldo cambia en la tienda.

## Lo que decidió Felipe (2026-10-19)

- **1 punto por cada S/ 1 pagado; 100 puntos = S/ 5.** Los puntos **no vencen mientras el cliente compre**: a los **3 años sin compras se eliminan sus datos y sus puntos**, y los Términos lo dicen.
- **El retorno es configurable** en un módulo nuevo, **Clientes ▸ Beneficios del club** (solo líder al nacer), que reemplaza la hoja «Beneficios del club» que hoy vive dentro de Avisos. Pantalla «Líder» de la maqueta.
- El cliente **canjea en la tienda web** y recibe un **cupón con código**. La **caja tiene una opción para escribir el código**.

## Lo que propone la maqueta (a confirmar)

| Tema | Propuesta | Por qué |
|---|---|---|
| Canje | Múltiplos de 100 puntos, **mínimo 200 (S/ 10)** | Evita cupones de monedas |
| Compra mínima | El cupón pide una compra de **3 veces su valor** | Nunca cubre la compra entera (hoy un vale así se rechaza) |
| Vigencia | **7 días** (decidido por Felipe, 2026-10-19); si vence, **los puntos vuelven** al saldo | No se pierde nada, pero el cupón no queda abierto |
| Sin cupones duplicados | Código único (índice único + reintento al generarlo); **una sola creación por toque** (clave de la operación: doble toque, reintento o dos pestañas devuelven el mismo cupón y descuentan los puntos una vez); **un solo uso** (el cupón se bloquea al usarlo, dos cajas a la vez no lo usan dos veces) | El estado imposible se cierra en la base, no en la pantalla |
| Un cupón por compra | **Un solo cupón** por compra (no se juntan dos) | Evita acumular descuentos |
| Puntos de la compra | Sobre **lo que de verdad paga**, y **solo con cliente identificado** | Una rebaja gana menos; protege el margen |
| Dos caminos, un mecanismo | «Usar puntos» (cliente presente) y «Código de cupón» (viene de la web) crean y aplican el **mismo cupón** | Una sola regla que mantener |
| Códigos | `CAY-XXXX-XXXX`, sin 0/O/1/I; QR para el escáner | Se dicta o se escanea sin errores |
| Intentos | 5 códigos inexistentes bloquean códigos 5 min en esa caja | Nadie adivina cupones probando |
| Cumpleaños | **100 puntos de regalo** (decidido por Felipe, 2026-10-19), **una vez al año**, y reemplazan al 10 % de descuento. **Decidido: se suman con su primera compra del mes de su cumpleaños** (con DNI), en tienda o en la web, no el día 1; el mensaje invita a comprar en ese mes («compra y gana 100 puntos adicionales»). Si esa venta se anula, se revierten | Sin botón ni cálculo en caja, un solo mecanismo (puntos); la base lo impide dos veces el mismo año |
| Aniversario | **No hay bono por aniversario** (decidido por Felipe, 2026-10-19). El vale de aniversario actual (S/ 20 a 60) se retira cuando entren los puntos | Los puntos por compra ya premian la constancia |

## Decisiones abiertas de Felipe

1. ~~**¿El cupón es «al portador» o ligado al DNI?**~~ **Decidido por Felipe (2026-10-19): al portador.** Lo puede usar
   cualquier persona (un familiar, una amiga) y se consume una sola vez. **Dos cosas distintas:** el *cupón* es de quien lo
   trae; los *puntos de la compra* son de quien se identifica con su DNI (si no se identifica, el cupón vale igual y esa
   compra no suma puntos). A la dueña se le avisa «tu cupón se usó» y queda anotado el uso, pero no se le quitan puntos
   otra vez: ya se descontaron al crear el cupón. La maqueta lo muestra con «Quién compra: Lucía / Ana / Sin identificar».
2. **Retorno nominal 5 %** (100 puntos = S/ 5 con 1 punto por sol) contra el **tope de 2 %** que tenía el Club. El Líder lo
   ve y lo cambia sin deploy (pantalla «Líder»), pero hay que fijarlo.
3. ~~**Los puntos no vencen**~~ **Decidido por Felipe (2026-10-19):** a los 3 años sin compras se eliminan los datos y los puntos, y consta en los Términos (5.7) y en la Política (2.6). Los puntos pendientes siguen siendo una deuda hasta entonces.
4. **Abogado y contador: PENDIENTES.** El texto legal está en `docs/club/texto-legal-puntos-v1-borrador.md` y **no puede publicarse hasta que un abogado lo revise**. Cómo se registran los puntos pendientes lo dice el contador.
5. **Transición:** qué pasa con quien iba avanzando hacia su vale de aniversario.

## Lo que esta maqueta NO resuelve todavía

- No está conectada a la base: cada pieza que aquí es un botón será una función con candados (movimientos de puntos
  que solo se agregan, saldo derivado, un puntaje por venta, cupón de un solo uso).
- Las reversas (devolución o anulación de venta devuelven los puntos ganados) se muestran como regla, no se pueden simular.
  El vencimiento a los 7 días sí se simula con «Probar: pasan 8 días».
- La cabecera de la tienda y el logo son aproximados; las tarjetas y los tokens salen del código.

## Cómo verificarla

Abre `index.html`. Pasos 1 a 6; en la barra negra prueba «Probar: doble toque» (3 toques = 1 cupón) y «Probar: pasan 8 días» (el cupón vence y los puntos vuelven); luego en «Caja» abre «Código de cupón» y prueba los cuatro casos de abajo (válido, vencido,
ya usado, no existe) y cambia a **1 prenda** para ver el mínimo de compra. En «Líder», cambia «100 puntos valen» y vuelve a la tienda.
