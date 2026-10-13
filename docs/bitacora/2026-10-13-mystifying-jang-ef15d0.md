## 2026-10-13 (/unificar: ronda 9, las seis que dejaron abiertas las rondas 6–8, decididas y migradas)
Qué hice: traje las herramientas de migración (`unificar:ver`, `unificar:rellenar`, `MIGRAR.md`) y armé una página de elegir con las seis
preguntas que la migración de las rondas 6–8 no podía decidir por regla, con lo de hoy copiado del DOM real del ERP (para que se viera y se
moviera igual) y las propuestas con las clases reales, todo vivo. Felipe eligió P1 · P1 · P1 · P1 · P2 · P2. Construí `ListaSugerencias`
(la lista de todo combo con su fila rica y la tecla «Enter»), los apartados con título en `DesplegablePildora` y el globito de cuántos hay
en los títulos (`cuenta`), y migré: Llegó mercadería, Recibir contra factura y Registrar nota de crédito (la prenda sin foto con
`MiniaturaPrenda`), la planilla de Contar con la cara de la tabla del sistema (y la talla recién contada que respira en verde), Frescura
con píldoras, «Desactivar color» rojo en el pie (y, por pedido de Felipe, la hoja de Proveedor sin su «Desactivar», que ninguna
pantalla mostraba), ocho acciones chicas a botón y doce títulos con su número en el
globito. Deuda de `/unificar`: 4 → 0 en todas las familias. Dos firmas nuevas (desactivar como enlace; un conteo puesto como dato).
Por qué así: «una función, una pieza» (ADR-0358) se decide mirando y tocando, y migrar cambia cómo se ve, nunca qué hace: el Enter de la
pistola sigue tomando la primera, «Desactivar» sigue pidiendo dos toques, la planilla sigue siendo un `<table>` para que cada talla se
redibuje sola con 800 en pantalla. Contar se verificó en una página de ensayo con datos en memoria (la base local no tenía un conteo
abierto y no se crean datos en la base compartida para una foto), borrada antes del commit.
Felipe se lleva: el ERP sin deuda de `/unificar`, las fotos de después en claro y oscuro (`docs/unificar/capturas/*.ronda9.jpg`) y la
suite entera en verde (449 archivos, 158 150 pruebas). Y una alerta de disco: el `next dev` de esta worktree servía un CSS de hace una
semana (Turbopack) y su `.next` creció 4 GB en media hora; Felipe lo borró (18 GB).
