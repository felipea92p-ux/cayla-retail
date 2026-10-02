## 2026-10-02 (Avisos del club sin elegir «Quién envía»)
**Qué hice:**
- En Clientes ▸ Avisos, con la cuenta de una persona ya no aparece el combo «Quién envía». «Enviar», «Deshacer» y «Pidió BAJA»
  firman a su nombre.
- Con la cuenta de la tienda (terminal), el combo sigue.
- La migración `20261002170000` suma las tres acciones a `acciones_sin_responsable` (ADR-0288 act. l).

**Por qué así:** la base guarda quién envió cada aviso y ese dato es obligatorio. Una persona lo da sola; una terminal no tiene a
quién anotar. Es el mismo patrón que «Apartar prenda».

**Felipe se lleva:** un toque menos por aviso.
