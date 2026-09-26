export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  retail: {
    Tables: {
      activos_fijos: {
        Row: {
          costo: number
          created_at: string
          cuenta_codigo: string | null
          depreciacion_apertura: number
          descripcion: string | null
          estado: string
          fecha_adquisicion: string
          id: string
          nombre: string
          nota: string | null
          serie: string | null
          tasa_anual: number
          ubicacion_id: string
          updated_at: string
          valor_residual: number
          vida_util_meses: number
        }
        Insert: {
          costo: number
          created_at?: string
          cuenta_codigo?: string | null
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion: string
          id?: string
          nombre: string
          nota?: string | null
          serie?: string | null
          tasa_anual: number
          ubicacion_id: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses: number
        }
        Update: {
          costo?: number
          created_at?: string
          cuenta_codigo?: string | null
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion?: string
          id?: string
          nombre?: string
          nota?: string | null
          serie?: string | null
          tasa_anual?: number
          ubicacion_id?: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "activos_fijos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      apartados: {
        Row: {
          adelanto_caja_movimiento_id: string | null
          adelanto_medio: string | null
          adelanto_monto: number | null
          cantidad: number
          cerrado_en: string | null
          cerrado_por: string | null
          cierre_motivo: string | null
          clienta_contacto: string
          clienta_nombre: string
          creado_por: string | null
          created_at: string
          estado: string
          id: string
          movimiento_cierre_id: string | null
          movimiento_id: string
          nota: string | null
          sububicacion_id: string | null
          ubicacion_id: string
          variante_id: string
          vence_el: string
          venta_id: string | null
        }
        Insert: {
          adelanto_caja_movimiento_id?: string | null
          adelanto_medio?: string | null
          adelanto_monto?: number | null
          cantidad: number
          cerrado_en?: string | null
          cerrado_por?: string | null
          cierre_motivo?: string | null
          clienta_contacto: string
          clienta_nombre: string
          creado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          movimiento_cierre_id?: string | null
          movimiento_id: string
          nota?: string | null
          sububicacion_id?: string | null
          ubicacion_id: string
          variante_id: string
          vence_el: string
          venta_id?: string | null
        }
        Update: {
          adelanto_caja_movimiento_id?: string | null
          adelanto_medio?: string | null
          adelanto_monto?: number | null
          cantidad?: number
          cerrado_en?: string | null
          cerrado_por?: string | null
          cierre_motivo?: string | null
          clienta_contacto?: string
          clienta_nombre?: string
          creado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          movimiento_cierre_id?: string | null
          movimiento_id?: string
          nota?: string | null
          sububicacion_id?: string | null
          ubicacion_id?: string
          variante_id?: string
          vence_el?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apartados_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartados_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartados_movimiento_cierre_id_fkey"
            columns: ["movimiento_cierre_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartados_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartados_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "apartados_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartados_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_movimientos: {
        Row: {
          caja_id: string
          created_at: string
          es_ajuste: boolean
          id: string
          monto: number
          motivo: string
          nota: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          caja_id: string
          created_at?: string
          es_ajuste?: boolean
          id?: string
          monto: number
          motivo: string
          nota?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string
          created_at?: string
          es_ajuste?: boolean
          id?: string
          monto?: number
          motivo?: string
          nota?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_traslados: {
        Row: {
          caja_id: string
          creado_en: string
          destino: string
          id: string
          monto: number
          referencia: string | null
          registrado_por: string | null
        }
        Insert: {
          caja_id: string
          creado_en?: string
          destino: string
          id?: string
          monto: number
          referencia?: string | null
          registrado_por?: string | null
        }
        Update: {
          caja_id?: string
          creado_en?: string
          destino?: string
          id?: string
          monto?: number
          referencia?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_traslados_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          abierta_en: string
          apertura_revisada_en: string | null
          apertura_revisada_por: string | null
          abierta_por: string | null
          cerrada_en: string | null
          cerrada_por: string | null
          diferencia: number | null
          es_prueba: boolean
          estado: string
          id: string
          monto_apertura: number
          monto_apertura_esperado: number | null
          monto_cierre_real: number | null
          monto_cierre_sistema: number | null
          monto_fondo: number | null
          motivo_diferencia_apertura: string | null
          nota: string | null
          ubicacion_id: string
        }
        Insert: {
          abierta_en?: string
          apertura_revisada_en?: string | null
          apertura_revisada_por?: string | null
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          es_prueba?: boolean
          estado?: string
          id?: string
          monto_apertura: number
          monto_apertura_esperado?: number | null
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          monto_fondo?: number | null
          motivo_diferencia_apertura?: string | null
          nota?: string | null
          ubicacion_id: string
        }
        Update: {
          abierta_en?: string
          apertura_revisada_en?: string | null
          apertura_revisada_por?: string | null
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          es_prueba?: boolean
          estado?: string
          id?: string
          monto_apertura?: number
          monto_apertura_esperado?: number | null
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          monto_fondo?: number | null
          motivo_diferencia_apertura?: string | null
          nota?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cambios: {
        Row: {
          caja_id: string | null
          cantidad: number
          condicion: string
          created_at: string
          diferencia: number
          id: string
          metodo_pago_diferencia: string | null
          motivo: string | null
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
          variante_nueva_id: string
          venta_item_id: string
        }
        Insert: {
          caja_id?: string | null
          cantidad: number
          condicion?: string
          created_at?: string
          diferencia?: number
          id?: string
          metodo_pago_diferencia?: string | null
          motivo?: string | null
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
          variante_nueva_id: string
          venta_item_id: string
        }
        Update: {
          caja_id?: string | null
          cantidad?: number
          condicion?: string
          created_at?: string
          diferencia?: number
          id?: string
          metodo_pago_diferencia?: string | null
          motivo?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
          variante_nueva_id?: string
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_variante_nueva_id_fkey"
            columns: ["variante_nueva_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_patrones: {
        Row: {
          categoria_id: string
          created_at: string
          patron_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          patron_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          patron_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_patrones_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_patrones_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "patrones"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_tallas: {
        Row: {
          categoria_id: string
          created_at: string
          habitual: boolean
          talla_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          habitual?: boolean
          talla_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          habitual?: boolean
          talla_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_tallas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_tallas_talla_id_fkey"
            columns: ["talla_id"]
            isOneToOne: false
            referencedRelation: "tallas"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_tejidos: {
        Row: {
          categoria_id: string
          created_at: string
          tejido_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          tejido_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          tejido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categoria_tejidos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_tejidos_tejido_id_fkey"
            columns: ["tejido_id"]
            isOneToOne: false
            referencedRelation: "tejidos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activo: boolean
          categoria_padre_id: string | null
          familia: string | null
          id: string
          nombre: string
          notas: string | null
          prefijo: string | null
        }
        Insert: {
          activo?: boolean
          categoria_padre_id?: string | null
          familia?: string | null
          id?: string
          nombre: string
          notas?: string | null
          prefijo?: string | null
        }
        Update: {
          activo?: boolean
          categoria_padre_id?: string | null
          familia?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          prefijo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_categoria_padre_id_fkey"
            columns: ["categoria_padre_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_familia_fk"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["codigo"]
          },
        ]
      }
      clientas: {
        Row: {
          created_at: string
          created_por: string | null
          cumple_dia: number | null
          cumple_mes: number | null
          dni: string | null
          id: string
          nombre: string | null
          tallas: Json | null
          telefono_whatsapp: string | null
          whatsapp_consentimiento_en: string | null
        }
        Insert: {
          created_at?: string
          created_por?: string | null
          cumple_dia?: number | null
          cumple_mes?: number | null
          dni?: string | null
          id?: string
          nombre?: string | null
          tallas?: Json | null
          telefono_whatsapp?: string | null
          whatsapp_consentimiento_en?: string | null
        }
        Update: {
          created_at?: string
          created_por?: string | null
          cumple_dia?: number | null
          cumple_mes?: number | null
          dni?: string | null
          id?: string
          nombre?: string | null
          tallas?: Json | null
          telefono_whatsapp?: string | null
          whatsapp_consentimiento_en?: string | null
        }
        Relationships: []
      }
      codigos_barras: {
        Row: {
          codigo: string
          created_at: string
          id: string
          origen: string
          variante_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          origen?: string
          variante_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          origen?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigos_barras_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_correlativos: {
        Row: {
          prefijo: string
          ultimo: number
          updated_at: string
        }
        Insert: {
          prefijo: string
          ultimo?: number
          updated_at?: string
        }
        Update: {
          prefijo?: string
          ultimo?: number
          updated_at?: string
        }
        Relationships: []
      }
      codigos_descuento: {
        Row: {
          activo: boolean
          codigo: string
          creado_por: string | null
          created_at: string
          porcentaje: number
          ubicacion_id: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_por?: string | null
          created_at?: string
          porcentaje: number
          ubicacion_id?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_por?: string | null
          created_at?: string
          porcentaje?: number
          ubicacion_id?: string | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codigos_descuento_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          agregado_por: string | null
          created_at: string
          persona_id: string
          rol: string
          terminal: string | null
          ubicacion_asignada_id: string | null
        }
        Insert: {
          agregado_por?: string | null
          created_at?: string
          persona_id: string
          rol?: string
          terminal?: string | null
          ubicacion_asignada_id?: string | null
        }
        Update: {
          agregado_por?: string | null
          created_at?: string
          persona_id?: string
          rol?: string
          terminal?: string | null
          ubicacion_asignada_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_ubicacion_asignada_id_fkey"
            columns: ["ubicacion_asignada_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      colores: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          codigo: string
          estado: string
          familia_color: string | null
          hex: string | null
          imagen_muestra_url: string | null
          nombre: string
          notas: string | null
          orden: number
          propuesto_por: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          codigo: string
          estado?: string
          familia_color?: string | null
          hex?: string | null
          imagen_muestra_url?: string | null
          nombre: string
          notas?: string | null
          orden?: number
          propuesto_por?: string | null
          tipo?: string
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          codigo?: string
          estado?: string
          familia_color?: string | null
          hex?: string | null
          imagen_muestra_url?: string | null
          nombre?: string
          notas?: string | null
          orden?: number
          propuesto_por?: string | null
          tipo?: string
        }
        Relationships: []
      }
      compra_adjuntos: {
        Row: {
          archivado_en: string | null
          archivado_por: string | null
          bytes: number
          compra_id: string
          created_at: string
          id: string
          nombre: string
          ruta: string
          subido_por: string | null
          tipo: string
        }
        Insert: {
          archivado_en?: string | null
          archivado_por?: string | null
          bytes: number
          compra_id: string
          created_at?: string
          id?: string
          nombre: string
          ruta: string
          subido_por?: string | null
          tipo: string
        }
        Update: {
          archivado_en?: string | null
          archivado_por?: string | null
          bytes?: number
          compra_id?: string
          created_at?: string
          id?: string
          nombre?: string
          ruta?: string
          subido_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_adjuntos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_adjuntos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_item_cierres: {
        Row: {
          cantidad: number
          compra_item_id: string
          created_at: string
          id: string
          motivo: string
          nota: string | null
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          compra_item_id: string
          created_at?: string
          id?: string
          motivo: string
          nota?: string | null
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          compra_item_id?: string
          created_at?: string
          id?: string
          motivo?: string
          nota?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_item_cierres_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_cierres_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_cierres_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_item_destinos: {
        Row: {
          cantidad: number
          compra_item_id: string
          created_at: string
          ubicacion_id: string
        }
        Insert: {
          cantidad: number
          compra_item_id: string
          created_at?: string
          ubicacion_id: string
        }
        Update: {
          cantidad?: number
          compra_item_id?: string
          created_at?: string
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_item_destinos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_destinos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_destinos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_items: {
        Row: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          descripcion: string | null
          id: string
          producto_id: string
          subtotal: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          descripcion?: string | null
          id?: string
          producto_id: string
          subtotal?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          compra_id?: string
          costo_unitario?: number
          descripcion?: string | null
          id?: string
          producto_id?: string
          subtotal?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_notas_credito: {
        Row: {
          aplicado: number
          cierre_id: string | null
          compra_id: string
          created_at: string
          fecha: string
          id: string
          igv: number
          monto: number
          motivo: string
          nota: string | null
          serie_numero: string
          subtotal: number
          usuario_id: string | null
        }
        Insert: {
          aplicado: number
          cierre_id?: string | null
          compra_id: string
          created_at?: string
          fecha: string
          id?: string
          igv: number
          monto: number
          motivo: string
          nota?: string | null
          serie_numero: string
          subtotal: number
          usuario_id?: string | null
        }
        Update: {
          aplicado?: number
          cierre_id?: string | null
          compra_id?: string
          created_at?: string
          fecha?: string
          id?: string
          igv?: number
          monto?: number
          motivo?: string
          nota?: string | null
          serie_numero?: string
          subtotal?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_notas_credito_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: false
            referencedRelation: "compra_item_cierres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_notas_credito_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_notas_credito_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_pagos: {
        Row: {
          compra_id: string
          created_at: string
          fecha: string
          id: string
          metodo: string
          monto: number
          pago_grupo_id: string | null
          referencia: string | null
          usuario_id: string | null
          ubicacion_id: string | null
        }
        Insert: {
          compra_id: string
          created_at?: string
          fecha?: string
          id?: string
          metodo: string
          monto: number
          pago_grupo_id?: string | null
          referencia?: string | null
          usuario_id?: string | null
          ubicacion_id?: string | null
        }
        Update: {
          compra_id?: string
          created_at?: string
          fecha?: string
          id?: string
          metodo?: string
          monto?: number
          pago_grupo_id?: string | null
          referencia?: string | null
          usuario_id?: string | null
          ubicacion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_pagos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_pagos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_reasignaciones: {
        Row: {
          cantidad: number
          compra_item_id: string
          created_at: string
          desde_ubicacion_id: string
          hacia_ubicacion_id: string
          id: string
          motivo: string
          nota: string | null
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          compra_item_id: string
          created_at?: string
          desde_ubicacion_id: string
          hacia_ubicacion_id: string
          id?: string
          motivo: string
          nota?: string | null
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          compra_item_id?: string
          created_at?: string
          desde_ubicacion_id?: string
          hacia_ubicacion_id?: string
          id?: string
          motivo?: string
          nota?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_reasignaciones_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_reasignaciones_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_reasignaciones_desde_ubicacion_id_fkey"
            columns: ["desde_ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_reasignaciones_hacia_ubicacion_id_fkey"
            columns: ["hacia_ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          cerrado_cantidad: number
          condicion: string
          created_at: string
          documento: string | null
          estado: string
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number
          fecha_emision: string
          fecha_estimada_llegada: string | null
          fecha_vencimiento: string | null
          id: string
          igv: number
          motivo_anulacion: string | null
          nota: string | null
          notas_credito: number
          numero: string
          pagado: number
          proveedor_id: string
          recibido_cantidad: number
          saldo: number | null
          serie: string
          subtotal: number
          tipo: string
          token_cliente: string | null
          ubicacion_gestion_id: string | null
          total: number
          usuario_id: string | null
        }
        Insert: {
          cerrado_cantidad?: number
          condicion: string
          created_at?: string
          documento?: string | null
          estado?: string
          estado_pago?: string | null
          estado_recepcion?: string | null
          facturado_cantidad?: number
          fecha_emision?: string
          fecha_estimada_llegada?: string | null
          fecha_vencimiento?: string | null
          id?: string
          igv: number
          motivo_anulacion?: string | null
          nota?: string | null
          notas_credito?: number
          numero: string
          pagado?: number
          proveedor_id: string
          recibido_cantidad?: number
          saldo?: number | null
          serie: string
          subtotal: number
          tipo?: string
          token_cliente?: string | null
          ubicacion_gestion_id?: string | null
          total: number
          usuario_id?: string | null
        }
        Update: {
          cerrado_cantidad?: number
          condicion?: string
          created_at?: string
          documento?: string | null
          estado?: string
          estado_pago?: string | null
          estado_recepcion?: string | null
          facturado_cantidad?: number
          fecha_emision?: string
          fecha_estimada_llegada?: string | null
          fecha_vencimiento?: string | null
          id?: string
          igv?: number
          motivo_anulacion?: string | null
          nota?: string | null
          notas_credito?: number
          numero?: string
          pagado?: number
          proveedor_id?: string
          recibido_cantidad?: number
          saldo?: number | null
          serie?: string
          subtotal?: number
          tipo?: string
          token_cliente?: string | null
          ubicacion_gestion_id?: string | null
          total?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes: {
        Row: {
          anulacion_solicitada_at: string | null
          anulado_at: string | null
          anulado_por: string | null
          cliente_nombre: string | null
          cliente_num_doc: string | null
          cliente_tipo_doc: string
          comprobante_original_id: string | null
          created_at: string
          entorno_transmision: string | null
          enviado_at: string | null
          estado: string
          id: string
          igv: number
          items: Json | null
          marcado_no_emitido_at: string | null
          marcado_no_emitido_por: string | null
          moneda: string
          motivo: string | null
          motivo_anulacion: string | null
          motivo_no_emitido: string | null
          motivo_rechazo: string | null
          numero: number
          respuesta_anulacion: Json | null
          respuesta_sunat: Json | null
          serie: string
          subtotal: number
          tipo: string
          token_cliente: string | null
          total: number
          ubicacion_id: string
          usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          marcado_no_emitido_at?: string | null
          marcado_no_emitido_por?: string | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_no_emitido?: string | null
          motivo_rechazo?: string | null
          numero: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          serie: string
          subtotal?: number
          tipo: string
          token_cliente?: string | null
          total: number
          ubicacion_id: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          marcado_no_emitido_at?: string | null
          marcado_no_emitido_por?: string | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_no_emitido?: string | null
          motivo_rechazo?: string | null
          numero?: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          serie?: string
          subtotal?: number
          tipo?: string
          token_cliente?: string | null
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_comprobante_original_id_fkey"
            columns: ["comprobante_original_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_empresa: {
        Row: {
          email: string | null
          id: boolean
          nombre_comercial: string | null
          razon_social: string
          resolucion_autorizacion: string | null
          ruc: string
          telefono: string | null
          updated_at: string
          web: string | null
        }
        Insert: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social: string
          resolucion_autorizacion?: string | null
          ruc: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social?: string
          resolucion_autorizacion?: string | null
          ruc?: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      conteo_items: {
        Row: {
          cantidad_contada: number
          cantidad_sistema: number
          conteo_id: string
          diferencia: number | null
          id: string
          movimiento_id: string | null
          variante_id: string
        }
        Insert: {
          cantidad_contada: number
          cantidad_sistema: number
          conteo_id: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          variante_id: string
        }
        Update: {
          cantidad_contada?: number
          cantidad_sistema?: number
          conteo_id?: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      conteos: {
        Row: {
          abierto_por: string | null
          alcance: string
          alcance_categoria_id: string | null
          cerrado_en: string | null
          cerrado_por: string | null
          created_at: string
          es_prueba: boolean
          estado: string
          id: string
          numero: number
          sububicacion_id: string | null
          ubicacion_id: string
        }
        Insert: {
          abierto_por?: string | null
          alcance?: string
          alcance_categoria_id?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          created_at?: string
          es_prueba?: boolean
          estado?: string
          id?: string
          numero?: number
          sububicacion_id?: string | null
          ubicacion_id: string
        }
        Update: {
          abierto_por?: string | null
          alcance?: string
          alcance_categoria_id?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          created_at?: string
          es_prueba?: boolean
          estado?: string
          id?: string
          numero?: number
          sububicacion_id?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteos_alcance_categoria_id_fkey"
            columns: ["alcance_categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "conteos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      costo_historial: {
        Row: {
          cantidad_nueva: number
          costo_anterior: number
          costo_resultante: number
          costo_unitario_nuevo: number
          created_at: string
          id: string
          movimiento_id: string
          origen: string
          stock_previo: number
          usuario_id: string | null
          variante_id: string
        }
        Insert: {
          cantidad_nueva: number
          costo_anterior: number
          costo_resultante: number
          costo_unitario_nuevo: number
          created_at?: string
          id?: string
          movimiento_id: string
          origen: string
          stock_previo: number
          usuario_id?: string | null
          variante_id: string
        }
        Update: {
          cantidad_nueva?: number
          costo_anterior?: number
          costo_resultante?: number
          costo_unitario_nuevo?: number
          created_at?: string
          id?: string
          movimiento_id?: string
          origen?: string
          stock_previo?: number
          usuario_id?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "costo_historial_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costo_historial_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones_maquila: {
        Row: {
          categoria_id: string
          creado_por: string | null
          created_at: string
          fecha_cotizacion: string
          id: string
          precio_maquila: number
          proveedor_referencia: string | null
          vigente_hasta: string
        }
        Insert: {
          categoria_id: string
          creado_por?: string | null
          created_at?: string
          fecha_cotizacion: string
          id?: string
          precio_maquila: number
          proveedor_referencia?: string | null
          vigente_hasta: string
        }
        Update: {
          categoria_id?: string
          creado_por?: string | null
          created_at?: string
          fecha_cotizacion?: string
          id?: string
          precio_maquila?: number
          proveedor_referencia?: string | null
          vigente_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_maquila_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucion_items: {
        Row: {
          cantidad: number
          condicion: string
          devolucion_id: string
          id: string
          movimiento_id: string | null
          venta_item_id: string
        }
        Insert: {
          cantidad: number
          condicion: string
          devolucion_id: string
          id?: string
          movimiento_id?: string | null
          venta_item_id: string
        }
        Update: {
          cantidad?: number
          condicion?: string
          devolucion_id?: string
          id?: string
          movimiento_id?: string | null
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          aprobado_en: string | null
          aprobado_por: string | null
          caja_id: string | null
          created_at: string
          estado: string
          id: string
          motivo: string
          motivo_codigo: string | null
          nota_credito_id: string | null
          reembolso_metodo: string | null
          reembolso_monto: number | null
          solicitado_por: string | null
          ubicacion_id: string
          venta_id: string
        }
        Insert: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          caja_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo: string
          motivo_codigo?: string | null
          nota_credito_id?: string | null
          reembolso_metodo?: string | null
          reembolso_monto?: number | null
          solicitado_por?: string | null
          ubicacion_id: string
          venta_id: string
        }
        Update: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          caja_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo?: string
          motivo_codigo?: string | null
          nota_credito_id?: string | null
          reembolso_metodo?: string | null
          reembolso_monto?: number | null
          solicitado_por?: string | null
          ubicacion_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_extras: {
        Row: {
          envio_id: string
          es_regalo: boolean
          movimiento_id: string
          nota: string | null
          proveedor_id: string
        }
        Insert: {
          envio_id: string
          es_regalo?: boolean
          movimiento_id: string
          nota?: string | null
          proveedor_id: string
        }
        Update: {
          envio_id?: string
          es_regalo?: boolean
          movimiento_id?: string
          nota?: string | null
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "envio_extras_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_extras_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: true
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_extras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_traslados: {
        Row: {
          envio_id: string
          transferencia_id: string
        }
        Insert: {
          envio_id: string
          transferencia_id: string
        }
        Update: {
          envio_id?: string
          transferencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "envio_traslados_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_traslados_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
        ]
      }
      envios: {
        Row: {
          fecha_recepcion: string
          id: string
          nota: string | null
          numero_guia: string | null
          recibido_por: string | null
          token_cliente: string | null
          ubicacion_id: string
        }
        Insert: {
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          recibido_por?: string | null
          token_cliente?: string | null
          ubicacion_id: string
        }
        Update: {
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          recibido_por?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "envios_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      etiqueta_categorias: {
        Row: {
          categoria_id: string
          created_at: string
          etiqueta_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          etiqueta_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          etiqueta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etiqueta_categorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiqueta_categorias_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      etiquetas: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          descuento_pct: number | null
          estado: string
          estilo: string
          id: string
          nombre: string
          notas: string | null
          propuesto_por: string | null
          sedes_permitidas: string[] | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          descuento_pct?: number | null
          estado?: string
          estilo?: string
          id?: string
          nombre: string
          notas?: string | null
          propuesto_por?: string | null
          sedes_permitidas?: string[] | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          descuento_pct?: number | null
          estado?: string
          estilo?: string
          id?: string
          nombre?: string
          notas?: string | null
          propuesto_por?: string | null
          sedes_permitidas?: string[] | null
          vigente_desde?: string | null
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      familias: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          exige_tejido_patron: boolean
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          exige_tejido_patron?: boolean
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          exige_tejido_patron?: boolean
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      historial_producto_cambios: {
        Row: {
          campo: string
          created_at: string
          entidad: string
          entidad_id: string
          id: string
          usuario_id: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          created_at?: string
          entidad: string
          entidad_id: string
          id?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          created_at?: string
          entidad?: string
          entidad_id?: string
          id?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: []
      }
      insumo_lotes: {
        Row: {
          cantidad_ingresada: number
          comprobante_item_id: string | null
          codigo_lote: string | null
          costo_unitario: number
          created_at: string
          documento: string | null
          fecha_ingreso: string
          id: string
          insumo_id: string
          nota: string | null
          origen: string
          proveedor_id: string | null
          recepcion_id: string | null
          ubicacion_id: string
        }
        Insert: {
          cantidad_ingresada: number
          comprobante_item_id?: string | null
          codigo_lote?: string | null
          costo_unitario: number
          created_at?: string
          documento?: string | null
          fecha_ingreso?: string
          id?: string
          insumo_id: string
          nota?: string | null
          origen?: string
          proveedor_id?: string | null
          recepcion_id?: string | null
          ubicacion_id: string
        }
        Update: {
          cantidad_ingresada?: number
          comprobante_item_id?: string | null
          codigo_lote?: string | null
          costo_unitario?: number
          created_at?: string
          documento?: string | null
          fecha_ingreso?: string
          id?: string
          insumo_id?: string
          nota?: string | null
          origen?: string
          proveedor_id?: string | null
          recepcion_id?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumo_lotes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_lotes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_insumo_saldos"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "insumo_lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_lotes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          archivado_at: string | null
          codigo: string
          created_at: string
          id: string
          merma_pct: number
          nombre: string
          nota: string | null
          proveedor_id: string | null
          stock_minimo: number | null
          tipo: string
          unidad_medida: string
          updated_at: string
        }
        Insert: {
          archivado_at?: string | null
          codigo: string
          created_at?: string
          id?: string
          merma_pct?: number
          nombre: string
          nota?: string | null
          proveedor_id?: string | null
          stock_minimo?: number | null
          tipo: string
          unidad_medida: string
          updated_at?: string
        }
        Update: {
          archivado_at?: string | null
          codigo?: string
          created_at?: string
          id?: string
          merma_pct?: number
          nombre?: string
          nota?: string | null
          proveedor_id?: string | null
          stock_minimo?: number | null
          tipo?: string
          unidad_medida?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          envio_id: string | null
          fecha_recepcion: string
          id: string
          nota: string | null
          numero_guia: string | null
          proveedor_id: string
          recibido_por: string | null
          ubicacion_id: string
        }
        Insert: {
          envio_id?: string | null
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          proveedor_id: string
          recibido_por?: string | null
          ubicacion_id: string
        }
        Update: {
          envio_id?: string | null
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          proveedor_id?: string
          recibido_por?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      marca_proveedores: {
        Row: {
          created_at: string
          marca_id: string
          proveedor_id: string
        }
        Insert: {
          created_at?: string
          marca_id: string
          proveedor_id: string
        }
        Update: {
          created_at?: string
          marca_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marca_proveedores_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marca_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      movimientos: {
        Row: {
          cambio_id: string | null
          cantidad: number
          compra_item_id: string | null
          conteo_item_id: string | null
          created_at: string
          devolucion_item_id: string | null
          id: string
          lote_id: string | null
          motivo: string | null
          nota: string | null
          produccion_id: string | null
          sububicacion_destino_id: string | null
          sububicacion_id: string | null
          tipo: string
          transferencia_item_id: string | null
          transferencia_recepcion_id: string | null
          ubicacion_destino_id: string | null
          ubicacion_id: string
          usuario_id: string | null
          variante_id: string
          venta_item_id: string | null
        }
        Insert: {
          cambio_id?: string | null
          cantidad: number
          compra_item_id?: string | null
          conteo_item_id?: string | null
          created_at?: string
          devolucion_item_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          produccion_id?: string | null
          sububicacion_destino_id?: string | null
          sububicacion_id?: string | null
          tipo: string
          transferencia_item_id?: string | null
          transferencia_recepcion_id?: string | null
          ubicacion_destino_id?: string | null
          ubicacion_id: string
          usuario_id?: string | null
          variante_id: string
          venta_item_id?: string | null
        }
        Update: {
          cambio_id?: string | null
          cantidad?: number
          compra_item_id?: string | null
          conteo_item_id?: string | null
          created_at?: string
          devolucion_item_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          produccion_id?: string | null
          sububicacion_destino_id?: string | null
          sububicacion_id?: string | null
          tipo?: string
          transferencia_item_id?: string | null
          transferencia_recepcion_id?: string | null
          ubicacion_destino_id?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
          variante_id?: string
          venta_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_cambio_id_fkey"
            columns: ["cambio_id"]
            isOneToOne: false
            referencedRelation: "cambios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_conteo_item_fkey"
            columns: ["conteo_item_id"]
            isOneToOne: false
            referencedRelation: "conteo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_devolucion_item_fkey"
            columns: ["devolucion_item_id"]
            isOneToOne: false
            referencedRelation: "devolucion_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_produccion_id_fkey"
            columns: ["produccion_id"]
            isOneToOne: false
            referencedRelation: "producciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sububicacion_destino_pertenece_fk"
            columns: ["sububicacion_destino_id", "ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "movimientos_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "movimientos_transferencia_item_fkey"
            columns: ["transferencia_item_id"]
            isOneToOne: false
            referencedRelation: "transferencia_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_transferencia_recepcion_fkey"
            columns: ["transferencia_recepcion_id"]
            isOneToOne: false
            referencedRelation: "transferencia_recepciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_venta_item_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_insumo: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          id: string
          insumo_id: string
          insumo_lote_id: string | null
          motivo: string | null
          nota: string | null
          produccion_id: string | null
          tipo: string
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          costo_unitario?: number
          created_at?: string
          id?: string
          insumo_id: string
          insumo_lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          produccion_id?: string | null
          tipo: string
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          insumo_id?: string
          insumo_lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          produccion_id?: string | null
          tipo?: string
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_insumo_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "v_insumo_saldos"
            referencedColumns: ["insumo_id"]
          },
          {
            foreignKeyName: "movimientos_insumo_insumo_lote_id_fkey"
            columns: ["insumo_lote_id"]
            isOneToOne: false
            referencedRelation: "insumo_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_insumo_produccion_id_fkey"
            columns: ["produccion_id"]
            isOneToOne: false
            referencedRelation: "producciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_insumo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      patrones: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          estado: string
          id: string
          imagen_muestra_url: string | null
          nombre: string
          notas: string | null
          propuesto_por: string | null
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          imagen_muestra_url?: string | null
          nombre: string
          notas?: string | null
          propuesto_por?: string | null
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          imagen_muestra_url?: string | null
          nombre?: string
          notas?: string | null
          propuesto_por?: string | null
        }
        Relationships: []
      }
      pedidos_no_atendidos: {
        Row: {
          atendido_por: string | null
          clienta_id: string | null
          created_at: string
          descripcion_libre: string | null
          id: string
          producto_id: string | null
          resuelto: boolean
          resuelto_en: string | null
          talla: string | null
          ubicacion_id: string
        }
        Insert: {
          atendido_por?: string | null
          clienta_id?: string | null
          created_at?: string
          descripcion_libre?: string | null
          id?: string
          producto_id?: string | null
          resuelto?: boolean
          resuelto_en?: string | null
          talla?: string | null
          ubicacion_id: string
        }
        Update: {
          atendido_por?: string | null
          clienta_id?: string | null
          created_at?: string
          descripcion_libre?: string | null
          id?: string
          producto_id?: string | null
          resuelto?: boolean
          resuelto_en?: string | null
          talla?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_no_atendidos_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_no_atendidos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_no_atendidos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      prendas_danadas: {
        Row: {
          cambio_id: string | null
          cantidad: number
          created_at: string
          devolucion_item_id: string | null
          estado: string
          id: string
          movimiento_entrada_id: string
          movimiento_salida_id: string | null
          nota: string | null
          proveedor_id: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          ubicacion_id: string
          variante_id: string
        }
        Insert: {
          cambio_id?: string | null
          cantidad: number
          created_at?: string
          devolucion_item_id?: string | null
          estado?: string
          id?: string
          movimiento_entrada_id: string
          movimiento_salida_id?: string | null
          nota?: string | null
          proveedor_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          ubicacion_id: string
          variante_id: string
        }
        Update: {
          cambio_id?: string | null
          cantidad?: number
          created_at?: string
          devolucion_item_id?: string | null
          estado?: string
          id?: string
          movimiento_entrada_id?: string
          movimiento_salida_id?: string | null
          nota?: string | null
          proveedor_id?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          ubicacion_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prendas_danadas_cambio_id_fkey"
            columns: ["cambio_id"]
            isOneToOne: true
            referencedRelation: "cambios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prendas_danadas_devolucion_item_id_fkey"
            columns: ["devolucion_item_id"]
            isOneToOne: true
            referencedRelation: "devolucion_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prendas_danadas_movimiento_entrada_id_fkey"
            columns: ["movimiento_entrada_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prendas_danadas_movimiento_salida_id_fkey"
            columns: ["movimiento_salida_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prendas_danadas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prendas_danadas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prendas_danadas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      produccion_lineas: {
        Row: {
          cantidad_buenas: number | null
          cantidad_plan: number
          created_at: string
          id: string
          produccion_id: string
          variante_id: string
        }
        Insert: {
          cantidad_buenas?: number | null
          cantidad_plan: number
          created_at?: string
          id?: string
          produccion_id: string
          variante_id: string
        }
        Update: {
          cantidad_buenas?: number | null
          cantidad_plan?: number
          created_at?: string
          id?: string
          produccion_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produccion_lineas_produccion_id_fkey"
            columns: ["produccion_id"]
            isOneToOne: false
            referencedRelation: "producciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produccion_lineas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      producciones: {
        Row: {
          cantidad_buenas: number | null
          cantidad_plan: number
          costo_avios: number
          costo_maquila: number
          costo_tela: number
          costo_unitario: number | null
          creado_por: string | null
          created_at: string
          es_muestra: boolean
          estado: string
          etapas: Json
          fecha_entrega: string | null
          id: string
          inventariado_at: string | null
          nota: string | null
          producto_id: string
          token_cliente: string | null
          ubicacion_id: string
        }
        Insert: {
          cantidad_buenas?: number | null
          cantidad_plan: number
          costo_avios?: number
          costo_maquila?: number
          costo_tela?: number
          costo_unitario?: number | null
          creado_por?: string | null
          created_at?: string
          es_muestra?: boolean
          estado?: string
          etapas?: Json
          fecha_entrega?: string | null
          id?: string
          inventariado_at?: string | null
          nota?: string | null
          producto_id: string
          token_cliente?: string | null
          ubicacion_id: string
        }
        Update: {
          cantidad_buenas?: number | null
          cantidad_plan?: number
          costo_avios?: number
          costo_maquila?: number
          costo_tela?: number
          costo_unitario?: number | null
          creado_por?: string | null
          created_at?: string
          es_muestra?: boolean
          estado?: string
          etapas?: Json
          fecha_entrega?: string | null
          id?: string
          inventariado_at?: string | null
          nota?: string | null
          producto_id?: string
          token_cliente?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_fotos: {
        Row: {
          color_codigo: string | null
          created_at: string
          es_principal: boolean
          id: string
          orden: number
          producto_id: string
          url: string
        }
        Insert: {
          color_codigo?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          orden?: number
          producto_id: string
          url: string
        }
        Update: {
          color_codigo?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          orden?: number
          producto_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_fotos_color_codigo_fkey"
            columns: ["color_codigo"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "producto_fotos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      // 20260923161700 (ADR-0179): prendas vendidas en caja antes de estar en el sistema.
      prendas_por_regularizar: {
        Row: {
          categoria_id: string
          color_codigo: string
          descripcion: string
          diferencia: number | null
          estado: string
          forma: string | null
          id: string
          precio_cobrado: number
          precio_oficial: number | null
          regularizado_en: string | null
          regularizado_por: string | null
          talla_id: string
          ubicacion_id: string
          variante_id: string | null
          vendido_en: string
          vendido_por: string | null
          venta_item_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "prendas_por_regularizar_categoria_id_fkey"; columns: ["categoria_id"]; isOneToOne: false; referencedRelation: "categorias"; referencedColumns: ["id"] },
          { foreignKeyName: "prendas_por_regularizar_color_codigo_fkey"; columns: ["color_codigo"]; isOneToOne: false; referencedRelation: "colores"; referencedColumns: ["codigo"] },
          { foreignKeyName: "prendas_por_regularizar_talla_id_fkey"; columns: ["talla_id"]; isOneToOne: false; referencedRelation: "tallas"; referencedColumns: ["id"] },
          { foreignKeyName: "prendas_por_regularizar_ubicacion_id_fkey"; columns: ["ubicacion_id"]; isOneToOne: false; referencedRelation: "ubicaciones"; referencedColumns: ["id"] },
          { foreignKeyName: "prendas_por_regularizar_variante_id_fkey"; columns: ["variante_id"]; isOneToOne: false; referencedRelation: "variantes"; referencedColumns: ["id"] },
          { foreignKeyName: "prendas_por_regularizar_venta_item_id_fkey"; columns: ["venta_item_id"]; isOneToOne: true; referencedRelation: "venta_items"; referencedColumns: ["id"] },
        ]
      }
      productos: {
        Row: {
          aprobado_en: string | null
          aprobado_por: string | null
          categoria_id: string | null
          codigo: string | null
          created_at: string
          descripcion: string | null
          es_prueba: boolean
          estado: string
          estado_alta: string
          id: string
          marca_id: string
          patron_id: string | null
          permitir_venta_sin_stock: boolean
          propuesto_por: string | null
          proveedor_id: string
          referencia: string
          stock_minimo: number | null
          tejido_id: string | null
          temporada: string | null
          token_cliente: string | null
          version: number
        }
        Insert: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          es_prueba?: boolean
          estado?: string
          estado_alta?: string
          id?: string
          marca_id: string
          patron_id?: string | null
          permitir_venta_sin_stock?: boolean
          propuesto_por?: string | null
          proveedor_id: string
          referencia: string
          stock_minimo?: number | null
          tejido_id?: string | null
          temporada?: string | null
          token_cliente?: string | null
          version?: number
        }
        Update: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          es_prueba?: boolean
          estado?: string
          estado_alta?: string
          id?: string
          marca_id?: string
          patron_id?: string | null
          permitir_venta_sin_stock?: boolean
          propuesto_por?: string | null
          proveedor_id?: string
          referencia?: string
          stock_minimo?: number | null
          tejido_id?: string | null
          temporada?: string | null
          token_cliente?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_marca_fk"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_marca_proveedor_fk"
            columns: ["marca_id", "proveedor_id"]
            isOneToOne: false
            referencedRelation: "marca_proveedores"
            referencedColumns: ["marca_id", "proveedor_id"]
          },
          {
            foreignKeyName: "productos_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "patrones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_fk"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tejido_id_fkey"
            columns: ["tejido_id"]
            isOneToOne: false
            referencedRelation: "tejidos"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          cliente_nombre: string | null
          cliente_num_doc: string | null
          comprobante_id: string | null
          created_at: string
          estado: string
          id: string
          igv: number
          items: Json
          nota: string | null
          numero: number
          subtotal: number
          total: number
          ubicacion_id: string
          usuario_id: string | null
          vence_at: string | null
          venta_id: string | null
        }
        Insert: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items: Json
          nota?: string | null
          numero?: number
          subtotal?: number
          total: number
          ubicacion_id: string
          usuario_id?: string | null
          vence_at?: string | null
          venta_id?: string | null
        }
        Update: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items?: Json
          nota?: string | null
          numero?: number
          subtotal?: number
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
          vence_at?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proformas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedor_creditos: {
        Row: {
          compra_id: string | null
          compra_pago_id: string | null
          created_at: string
          fecha: string
          id: string
          metodo: string | null
          monto: number
          nota: string | null
          nota_credito_id: string | null
          proveedor_id: string
          referencia: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          compra_id?: string | null
          compra_pago_id?: string | null
          created_at?: string
          fecha: string
          id?: string
          metodo?: string | null
          monto: number
          nota?: string | null
          nota_credito_id?: string | null
          proveedor_id: string
          referencia?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          compra_id?: string | null
          compra_pago_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          metodo?: string | null
          monto?: number
          nota?: string | null
          nota_credito_id?: string | null
          proveedor_id?: string
          referencia?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedor_creditos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedor_creditos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedor_creditos_compra_pago_id_fkey"
            columns: ["compra_pago_id"]
            isOneToOne: false
            referencedRelation: "compra_pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedor_creditos_nota_credito_id_fkey"
            columns: ["nota_credito_id"]
            isOneToOne: false
            referencedRelation: "compra_notas_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedor_creditos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          banco: string | null
          billeteras: string[] | null
          cci: string | null
          celular_billetera: string | null
          contacto: string | null
          created_at: string
          cuenta_bancaria: string | null
          forma_pago_preferida: string | null
          id: string
          nombre: string
          plazo_credito_dias: number | null
          rubros: string[]
          ruc: string | null
          telefono: string | null
          titular_cuenta: string | null
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          billeteras?: string[] | null
          cci?: string | null
          celular_billetera?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          forma_pago_preferida?: string | null
          id?: string
          nombre: string
          plazo_credito_dias?: number | null
          rubros?: string[]
          ruc?: string | null
          telefono?: string | null
          titular_cuenta?: string | null
        }
        Update: {
          activo?: boolean
          banco?: string | null
          billeteras?: string[] | null
          cci?: string | null
          celular_billetera?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          forma_pago_preferida?: string | null
          id?: string
          nombre?: string
          plazo_credito_dias?: number | null
          rubros?: string[]
          ruc?: string | null
          telefono?: string | null
          titular_cuenta?: string | null
        }
        Relationships: []
      }
      comprobantes_produccion: {
        Row: {
          condicion: string
          created_at: string
          estado: string
          fecha_emision: string
          fecha_vencimiento: string | null
          id: string
          igv: number
          motivo_anulacion: string | null
          nota: string | null
          numero: string
          proveedor_id: string
          serie: string
          subtotal: number
          tipo: string
          token_cliente: string | null
          total: number
          usuario_id: string | null
        }
        Insert: {
          condicion: string
          created_at?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          igv: number
          motivo_anulacion?: string | null
          nota?: string | null
          numero: string
          proveedor_id: string
          serie: string
          subtotal: number
          tipo?: string
          token_cliente?: string | null
          total: number
          usuario_id?: string | null
        }
        Update: {
          condicion?: string
          created_at?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          igv?: number
          motivo_anulacion?: string | null
          nota?: string | null
          numero?: string
          proveedor_id?: string
          serie?: string
          subtotal?: number
          tipo?: string
          token_cliente?: string | null
          total?: number
          usuario_id?: string | null
        }
        Relationships: []
      }
      comprobantes_produccion_items: {
        Row: {
          cantidad: number
          comprobante_id: string
          costo_unitario: number
          descripcion: string | null
          id: string
          insumo_id: string | null
          subtotal: number | null
        }
        Insert: {
          cantidad: number
          comprobante_id: string
          costo_unitario: number
          descripcion?: string | null
          id?: string
          insumo_id?: string | null
          subtotal?: never
        }
        Update: {
          cantidad?: number
          comprobante_id?: string
          costo_unitario?: number
          descripcion?: string | null
          id?: string
          insumo_id?: string | null
          subtotal?: never
        }
        Relationships: []
      }
      comprobantes_produccion_recepciones: {
        Row: {
          comprobante_id: string
          created_at: string
          id: string
          nota: string | null
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          comprobante_id: string
          created_at?: string
          id?: string
          nota?: string | null
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          comprobante_id?: string
          created_at?: string
          id?: string
          nota?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      comprobantes_produccion_cierres: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          item_id: string
          motivo: string
          nota: string | null
          recepcion_id: string | null
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          item_id: string
          motivo: string
          nota?: string | null
          recepcion_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          item_id?: string
          motivo?: string
          nota?: string | null
          recepcion_id?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      comprobantes_produccion_pagos: {
        Row: {
          comprobante_id: string
          created_at: string
          fecha: string
          grupo_id: string | null
          id: string
          metodo: string
          monto: number
          referencia: string | null
          usuario_id: string | null
        }
        Insert: {
          comprobante_id: string
          created_at?: string
          fecha?: string
          grupo_id?: string | null
          id?: string
          metodo: string
          monto: number
          referencia?: string | null
          usuario_id?: string | null
        }
        Update: {
          comprobante_id?: string
          created_at?: string
          fecha?: string
          grupo_id?: string | null
          id?: string
          metodo?: string
          monto?: number
          referencia?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      proveedores_produccion: {
        Row: {
          activo: boolean
          banco: string | null
          billeteras: string[] | null
          cci: string | null
          celular_billetera: string | null
          contacto: string | null
          created_at: string
          cuenta_bancaria: string | null
          forma_pago_preferida: string | null
          id: string
          nombre: string
          plazo_credito_dias: number | null
          rubro: string
          ruc: string | null
          telefono: string | null
          titular_cuenta: string | null
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          billeteras?: string[] | null
          cci?: string | null
          celular_billetera?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          forma_pago_preferida?: string | null
          id?: string
          nombre: string
          plazo_credito_dias?: number | null
          rubro: string
          ruc?: string | null
          telefono?: string | null
          titular_cuenta?: string | null
        }
        Update: {
          activo?: boolean
          banco?: string | null
          billeteras?: string[] | null
          cci?: string | null
          celular_billetera?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          forma_pago_preferida?: string | null
          id?: string
          nombre?: string
          plazo_credito_dias?: number | null
          rubro?: string
          ruc?: string | null
          telefono?: string | null
          titular_cuenta?: string | null
        }
        Relationships: []
      }
      series_comprobantes: {
        Row: {
          archivada_at: string | null
          archivada_por: string | null
          id: string
          motivo_archivo: string | null
          serie: string
          siguiente_numero: number
          tipo: string
          ubicacion_id: string
        }
        Insert: {
          archivada_at?: string | null
          archivada_por?: string | null
          id?: string
          motivo_archivo?: string | null
          serie: string
          siguiente_numero?: number
          tipo: string
          ubicacion_id: string
        }
        Update: {
          id?: string
          serie?: string
          siguiente_numero?: number
          tipo?: string
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_comprobantes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          cantidad: number
          cantidad_apartada: number
          sububicacion_id: string | null
          ubicacion_id: string
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          cantidad_apartada?: number
          sububicacion_id?: string | null
          ubicacion_id: string
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          cantidad_apartada?: number
          sububicacion_id?: string | null
          ubicacion_id?: string
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sububicacion_pertenece_fk"
            columns: ["sububicacion_id", "ubicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id", "ubicacion_id"]
          },
          {
            foreignKeyName: "stock_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      sububicaciones: {
        Row: {
          created_at: string
          id: string
          nombre: string
          tipo: string | null
          ubicacion_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          tipo?: string | null
          ubicacion_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sububicaciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      tallas: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          estado: string
          id: string
          notas: string | null
          propuesto_por: string | null
          valor: string
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          notas?: string | null
          propuesto_por?: string | null
          valor: string
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          notas?: string | null
          propuesto_por?: string | null
          valor?: string
        }
        Relationships: []
      }
      tejidos: {
        Row: {
          activo: boolean
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          estado: string
          id: string
          imagen_muestra_url: string | null
          nombre: string
          notas: string | null
          propuesto_por: string | null
        }
        Insert: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          imagen_muestra_url?: string | null
          nombre: string
          notas?: string | null
          propuesto_por?: string | null
        }
        Update: {
          activo?: boolean
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          imagen_muestra_url?: string | null
          nombre?: string
          notas?: string | null
          propuesto_por?: string | null
        }
        Relationships: []
      }
      modulos: {
        Row: {
          clave: string
          delegable: boolean
          grupo: string
          incluye: string
          nombre: string
          orden: number
          solo_lider: boolean
        }
        Insert: {
          clave: string
          delegable?: boolean
          grupo: string
          incluye: string
          nombre: string
          orden: number
          solo_lider?: boolean
        }
        Update: {
          clave?: string
          delegable?: boolean
          grupo?: string
          incluye?: string
          nombre?: string
          orden?: number
          solo_lider?: boolean
        }
        Relationships: []
      }
      rol_modulos: {
        Row: { modulo: string; rol_id: string }
        Insert: { modulo: string; rol_id: string }
        Update: { modulo?: string; rol_id?: string }
        Relationships: []
      }
      roles: {
        Row: {
          archivado_at: string | null
          archivado_por: string | null
          clave: string | null
          creado_at: string
          creado_por: string | null
          descripcion: string | null
          es_sistema: boolean
          fijo: boolean
          id: string
          limitado_como_hoy: boolean
          nombre: string
          version: number
        }
        Insert: {
          archivado_at?: string | null
          archivado_por?: string | null
          clave?: string | null
          creado_at?: string
          creado_por?: string | null
          descripcion?: string | null
          es_sistema?: boolean
          fijo?: boolean
          id?: string
          limitado_como_hoy?: boolean
          nombre: string
          version?: number
        }
        Update: {
          archivado_at?: string | null
          archivado_por?: string | null
          clave?: string | null
          creado_at?: string
          creado_por?: string | null
          descripcion?: string | null
          es_sistema?: boolean
          fijo?: boolean
          id?: string
          limitado_como_hoy?: boolean
          nombre?: string
          version?: number
        }
        Relationships: []
      }
      roles_historial: {
        Row: {
          accion: string
          detalle: Json
          hecho_at: string
          hecho_por: string | null
          id: number
          rol_id: string
        }
        Insert: {
          accion: string
          detalle?: Json
          hecho_at?: string
          hecho_por?: string | null
          id?: never
          rol_id: string
        }
        Update: {
          accion?: string
          detalle?: Json
          hecho_at?: string
          hecho_por?: string | null
          id?: never
          rol_id?: string
        }
        Relationships: []
      }
      terminales: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          creada_at: string
          creada_por: string | null
          desactivada_at: string | null
          desactivada_por: string | null
          id: string
          nombre: string
          rol_id: string
          tipo: string | null
          ubicacion_id: string
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          creada_at?: string
          creada_por?: string | null
          desactivada_at?: string | null
          desactivada_por?: string | null
          id?: string
          nombre: string
          rol_id?: string
          tipo?: string | null
          ubicacion_id: string
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          creada_at?: string
          creada_por?: string | null
          desactivada_at?: string | null
          desactivada_por?: string | null
          id?: string
          nombre?: string
          rol_id?: string
          tipo?: string | null
          ubicacion_id?: string
        }
        Relationships: []
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: string
          movimiento_id: string | null
          transferencia_id: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          movimiento_id?: string | null
          transferencia_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          movimiento_id?: string | null
          transferencia_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_recepciones: {
        Row: {
          cantidad_recibida: number
          created_at: string
          id: string
          movimiento_id: string | null
          registrado_por: string | null
          transferencia_id: string
          variante_id: string
        }
        Insert: {
          cantidad_recibida: number
          created_at?: string
          id?: string
          movimiento_id?: string | null
          registrado_por?: string | null
          transferencia_id: string
          variante_id: string
        }
        Update: {
          cantidad_recibida?: number
          created_at?: string
          id?: string
          movimiento_id?: string | null
          registrado_por?: string | null
          transferencia_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_recepciones_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_recepciones_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_recepciones_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          cerrado_en: string | null
          cerrado_por: string | null
          confirmado_en: string | null
          confirmado_por: string | null
          creado_por: string | null
          created_at: string
          estado: string
          fecha_estimada_llegada: string | null
          id: string
          nota: string | null
          nota_cierre: string | null
          numero: number
          ubicacion_destino_id: string
          ubicacion_origen_id: string
        }
        Insert: {
          cerrado_en?: string | null
          cerrado_por?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          fecha_estimada_llegada?: string | null
          id?: string
          nota?: string | null
          nota_cierre?: string | null
          numero?: number
          ubicacion_destino_id: string
          ubicacion_origen_id: string
        }
        Update: {
          cerrado_en?: string | null
          cerrado_por?: string | null
          confirmado_en?: string | null
          confirmado_por?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          fecha_estimada_llegada?: string | null
          id?: string
          nota?: string | null
          nota_cierre?: string | null
          numero?: number
          ubicacion_destino_id?: string
          ubicacion_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicacion_datos_fiscales: {
        Row: {
          departamento: string | null
          direccion: string | null
          distrito: string | null
          provincia: string | null
          telefono: string | null
          ubicacion_id: string
          ubigeo: string | null
          updated_at: string
        }
        Insert: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          telefono?: string | null
          ubicacion_id: string
          ubigeo?: string | null
          updated_at?: string
        }
        Update: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          telefono?: string | null
          ubicacion_id?: string
          ubigeo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ubicacion_datos_fiscales_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: true
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicaciones: {
        Row: {
          activo: boolean
          created_at: string
          hora_cierre: string | null
          id: string
          meta_venta_diaria: number | null
          nombre: string
          sede_dynamic_id: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          hora_cierre?: string | null
          id?: string
          meta_venta_diaria?: number | null
          nombre: string
          sede_dynamic_id?: string | null
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          hora_cierre?: string | null
          id?: string
          meta_venta_diaria?: number | null
          nombre?: string
          sede_dynamic_id?: string | null
          tipo?: string
        }
        Relationships: []
      }
      variante_etiquetas: {
        Row: {
          created_at: string
          etiqueta_id: string
          variante_id: string
        }
        Insert: {
          created_at?: string
          etiqueta_id: string
          variante_id: string
        }
        Update: {
          created_at?: string
          etiqueta_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variante_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variante_etiquetas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      variantes: {
        Row: {
          activo: boolean
          codigo: string | null
          color_codigo: string | null
          costo: number
          created_at: string
          id: string
          precio: number
          producto_id: string
          sku: string | null
          talla_id: string | null
        }
        Insert: {
          activo?: boolean
          codigo?: string | null
          color_codigo?: string | null
          costo?: number
          created_at?: string
          id?: string
          precio: number
          producto_id: string
          sku?: string | null
          talla_id?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string | null
          color_codigo?: string | null
          costo?: number
          created_at?: string
          id?: string
          precio?: number
          producto_id?: string
          sku?: string | null
          talla_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variantes_color_codigo_fkey"
            columns: ["color_codigo"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variantes_talla_id_fkey"
            columns: ["talla_id"]
            isOneToOne: false
            referencedRelation: "tallas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_anulacion_items: {
        Row: {
          condicion: string
          created_at: string
          id: string
          movimiento_id: string | null
          venta_id: string
          venta_item_id: string
        }
        Insert: {
          condicion: string
          created_at?: string
          id?: string
          movimiento_id?: string | null
          venta_id: string
          venta_item_id: string
        }
        Update: {
          condicion?: string
          created_at?: string
          id?: string
          movimiento_id?: string | null
          venta_id?: string
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_anulacion_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_anulacion_items_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: true
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          argumento_descuento: string | null
          cantidad: number
          costo_unitario: number
          descuento_etiqueta_id: string | null
          descuento_unitario: number
          id: string
          motivo_descuento: string | null
          motivo_descuento_detalle: string | null
          precio_unitario: number
          subtotal: number | null
          variante_id: string
          venta_id: string
        }
        Insert: {
          argumento_descuento?: string | null
          cantidad: number
          costo_unitario: number
          descuento_etiqueta_id?: string | null
          descuento_unitario?: number
          id?: string
          motivo_descuento?: string | null
          motivo_descuento_detalle?: string | null
          precio_unitario: number
          subtotal?: number | null
          variante_id: string
          venta_id: string
        }
        Update: {
          argumento_descuento?: string | null
          cantidad?: number
          costo_unitario?: number
          descuento_etiqueta_id?: string | null
          descuento_unitario?: number
          id?: string
          motivo_descuento?: string | null
          motivo_descuento_detalle?: string | null
          precio_unitario?: number
          subtotal?: number | null
          variante_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_descuento_etiqueta_id_fkey"
            columns: ["descuento_etiqueta_id"]
            isOneToOne: false
            referencedRelation: "etiquetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_pagos: {
        Row: {
          id: string
          metodo: string
          monto: number
          recibido: number | null
          venta_id: string
        }
        Insert: {
          id?: string
          metodo: string
          monto: number
          recibido?: number | null
          venta_id: string
        }
        Update: {
          id?: string
          metodo?: string
          monto?: number
          recibido?: number | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          anulado_en: string | null
          anulado_por: string | null
          asesora_id: string | null
          boleta_alegra_numero: string | null
          caja_id: string | null
          cliente_id: string | null
          created_at: string
          descuento_autorizado_por: string | null
          descuento_motivo: string | null
          descuento_pct: number
          emisor: string
          es_prueba: boolean
          estado: string
          id: string
          motivo_anulacion: string | null
          nota: string | null
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          anulado_en?: string | null
          anulado_por?: string | null
          asesora_id?: string | null
          boleta_alegra_numero?: string | null
          caja_id?: string | null
          cliente_id?: string | null
          created_at?: string
          descuento_autorizado_por?: string | null
          descuento_motivo?: string | null
          descuento_pct?: number
          emisor?: string
          es_prueba?: boolean
          estado?: string
          id?: string
          motivo_anulacion?: string | null
          nota?: string | null
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          anulado_en?: string | null
          anulado_por?: string | null
          asesora_id?: string | null
          boleta_alegra_numero?: string | null
          caja_id?: string | null
          cliente_id?: string | null
          created_at?: string
          descuento_autorizado_por?: string | null
          descuento_motivo?: string | null
          descuento_pct?: number
          emisor?: string
          es_prueba?: boolean
          estado?: string
          id?: string
          motivo_anulacion?: string | null
          nota?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_clienta_fk"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      planilla_por_sede: {
        Row: {
          costo_total: number | null
          fecha_fin: string | null
          fecha_ini: string | null
          pagado: number | null
          periodo_id: string | null
          personas: number | null
          provisiones: number | null
          sede_codigo: string | null
          sede_tipo: string | null
        }
        Relationships: []
      }
      compra_item_reparto_resumen: {
        Row: {
          asignado: number | null
          cerrado: number | null
          compra_id: string | null
          compra_item_id: string | null
          pendiente: number | null
          recibido: number | null
          ubicacion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_item_destinos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_destinos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_item_destinos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_items_resumen: {
        Row: {
          cantidad: number | null
          cerrado: number | null
          compra_id: string | null
          costo_unitario: number | null
          descripcion: string | null
          id: string | null
          pendiente: number | null
          producto_id: string | null
          recibido: number | null
          subtotal: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad?: number | null
          cerrado?: never
          compra_id?: string | null
          costo_unitario?: number | null
          descripcion?: string | null
          id?: string | null
          pendiente?: never
          producto_id?: string | null
          recibido?: never
          subtotal?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number | null
          cerrado?: never
          compra_id?: string | null
          costo_unitario?: number | null
          descripcion?: string | null
          id?: string | null
          pendiente?: never
          producto_id?: string | null
          recibido?: never
          subtotal?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_resumen: {
        Row: {
          cerrado_cantidad: number | null
          condicion: string | null
          created_at: string | null
          documento: string | null
          estado: string | null
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number | null
          fecha_emision: string | null
          fecha_estimada_llegada: string | null
          fecha_vencimiento: string | null
          id: string | null
          igv: number | null
          nota: string | null
          notas_credito: number | null
          numero: string | null
          pagado: number | null
          proveedor_banco: string | null
          proveedor_cuenta_bancaria: string | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          proveedor_ruc: string | null
          proveedor_telefono: string | null
          recepcion_atrasada: boolean | null
          recibido_cantidad: number | null
          saldo: number | null
          serie: string | null
          subtotal: number | null
          tipo: string | null
          total: number | null
          naturaleza: string | null
          ubicaciones_destino: string[] | null
          vencida: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_insumo_saldos: {
        Row: {
          codigo: string | null
          fisico: number | null
          insumo_id: string | null
          nombre: string | null
          tipo: string | null
          ubicacion_id: string | null
          unidad_medida: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_insumo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_caja: {
        Args: {
          p_monto_apertura: number
          p_motivo_diferencia?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      abrir_conteo: {
        Args: {
          p_alcance?: string
          p_alcance_categoria_id?: string
          p_sububicacion_id?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      abrir_produccion: {
        Args: {
          p_costo_avios?: number
          p_costo_maquila?: number
          p_costo_tela?: number
          p_es_muestra?: boolean
          p_fecha_entrega?: string
          p_lineas: Json
          p_nota?: string
          p_producto_id: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      actualizar_campana_etiqueta: {
        Args: {
          p_categoria_ids: string[]
          p_descuento_pct: number
          p_etiqueta_id: string
          p_vigente_desde: string
          p_vigente_hasta: string
        }
        Returns: undefined
      }
      actualizar_categoria: {
        Args: {
          p_categoria_id: string
          p_familia: string
          p_nombre: string
          p_notas?: string
          p_prefijo: string
        }
        Returns: undefined
      }
      actualizar_categoria_ejes: {
        Args: {
          p_categoria_id: string
          p_patron_ids: string[]
          p_talla_habitual_ids?: string[]
          p_talla_ids: string[]
          p_tejido_ids: string[]
        }
        Returns: undefined
      }
      actualizar_mi_foto_perfil: {
        Args: { p_foto_url: string }
        Returns: undefined
      }
      actualizar_proveedor: {
        Args: {
          p_banco?: string
          p_contacto?: string
          p_cuenta_bancaria?: string
          p_forma_pago_preferida?: string
          p_nombre: string
          p_plazo_credito_dias?: number
          p_proveedor_id: string
          p_rubros?: string[]
          p_ruc?: string
          p_telefono?: string
        }
        Returns: undefined
      }
      actualizar_transmision_comprobante: {
        Args: {
          p_comprobante_id: string
          p_entorno: string
          p_estado: string
          p_motivo_rechazo?: string
          p_respuesta_sunat?: Json
        }
        Returns: undefined
      }
      actualizar_variantes_etiquetas: {
        Args: { p_asignaciones: Json }
        Returns: undefined
      }
      agregar_colaborador: {
        Args: { p_persona_id: string; p_ubicacion_id: string }
        Returns: undefined
      }
      agregar_colaboradores: {
        Args: { p_personas: string[]; p_ubicacion_id: string }
        Returns: number
      }
      agregar_terminal: {
        Args: { p_persona_id: string; p_terminal: string; p_ubicacion_id: string }
        Returns: undefined
      }
      ajustar_insumo_por_conteo: {
        Args: {
          p_cantidad_contada: number
          p_insumo_id: string
          p_motivo: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      anular_compra: {
        Args: { p_compra_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_comprobante: {
        Args: {
          p_comprobante_id: string
          p_confirmada: boolean
          p_motivo: string
          p_respuesta?: Json
        }
        Returns: undefined
      }
      anular_conteo: { Args: { p_conteo_id: string }; Returns: undefined }
      anular_produccion: {
        Args: { p_motivo?: string; p_produccion_id: string }
        Returns: undefined
      }
      anular_venta: {
        Args: { p_items: Json; p_motivo: string; p_venta_id: string }
        Returns: undefined
      }
      apartar_stock: {
        Args: {
          p_cantidad: number
          p_clienta_contacto: string
          p_clienta_nombre: string
          p_nota?: string
          p_sububicacion_id?: string
          p_token?: string
          p_ubicacion_id: string
          p_variante_id: string
          p_vence_el: string
        }
        Returns: string
      }
      // Apartados con adelanto (ADR-0166, 20260923090000_separaciones.sql). Escritos a mano con la forma que da
      // `supabase gen types` (esta sesión no pudo levantar el stack): regenerar al pegar la migración en producción.
      buscar_separaciones: {
        Args: { p_estados?: string[]; p_texto?: string; p_ubicacion_id: string }
        Returns: {
          adelanto: number
          asesora: string | null
          clienta_apellidos: string
          clienta_celular: string
          clienta_dni: string | null
          clienta_nombres: string
          codigo: string
          comprobante_anticipo: string | null
          comprobante_final: string | null
          creada_en: string
          devolucion_cci_final: string | null
          devolucion_medio: string
          devolucion_numero: string | null
          estado: string
          extensiones: number
          id: string
          items: Json
          liberada_sola: boolean
          nota_credito: string | null
          pagos: Json
          saldo: number
          total: number
          vence_el: string
        }[]
      }
      entregar_separacion: {
        Args: { p_pagos?: Json; p_separacion_id: string; p_token?: string }
        Returns: string
      }
      extender_separacion: {
        Args: { p_separacion_id: string }
        Returns: string
      }

      fn_costos_variantes_json: { Args: { p_ids?: string[] }; Returns: Json }
      fn_soles_diferencia_conteo: { Args: { p_conteo_id: string }; Returns: number }
      fn_catalogo_version: { Args: never; Returns: number }
      fn_vencer_separaciones: {
        Args: { p_ubicacion_id: string }
        Returns: number
      }
      liberar_separacion: {
        Args: { p_motivo: string; p_separacion_id: string }
        Returns: undefined
      }
      registrar_devolucion_separacion: {
        Args: { p_cci?: string; p_medio: string; p_operacion?: string; p_separacion_id: string }
        Returns: Json
      }
      resumen_separaciones: {
        Args: { p_ubicacion_id: string }
        Returns: {
          en_custodia: number
          en_custodia_efectivo: number
          monto_por_devolver: number
          por_devolver: number
          por_recoger: number
          prendas_guardadas: number
          vencen_pronto: number
          vencidas: number
        }[]
      }
      separar_prendas: {
        Args: {
          p_asesora_id?: string
          p_cliente_razon_social?: string
          p_cliente_ruc?: string
          p_clienta_apellidos: string
          p_clienta_celular: string
          p_clienta_dni?: string
          p_clienta_id?: string
          p_clienta_nombres: string
          p_comprobante_tipo?: string
          p_devolucion_cci?: string
          p_devolucion_medio: string
          p_devolucion_numero?: string
          p_items: Json
          p_nota?: string
          p_pagos: Json
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      aprobar_devolucion: {
        Args: {
          p_devolucion_id: string
          p_reembolso_metodo?: string
          p_reembolso_monto?: number
        }
        Returns: {
          nota_credito_id: string
          nota_credito_numero: number
          nota_credito_serie: string
        }[]
      }
      archivar_adjunto_compra: {
        Args: { p_adjunto_id: string }
        Returns: undefined
      }
      anular_comprobante_produccion: {
        Args: { p_comprobante_id: string; p_motivo: string }
        Returns: undefined
      }
      buscar_clienta: {
        Args: { p_termino: string }
        Returns: {
          created_at: string
          created_por: string | null
          cumple_dia: number | null
          cumple_mes: number | null
          dni: string | null
          id: string
          nombre: string | null
          tallas: Json | null
          telefono_whatsapp: string | null
          whatsapp_consentimiento_en: string | null
        }[]
      }
      buscar_productos_parecidos: {
        Args: { p_excluir_id?: string; p_referencia: string }
        Returns: {
          categoria: string
          categoria_id: string
          id: string
          nivel: string
          referencia: string
          similitud: number
        }[]
      }
      campanas_vigentes: {
        Args: never
        Returns: {
          descuento_pct: number
          etiqueta_id: string
          etiqueta_nombre: string
          variante_id: string
        }[]
      }
      catalogo_actualizar_producto: {
        Args: {
          p_categoria_id?: string
          p_confirmo_distinto?: boolean
          p_descripcion?: string
          p_estado: string
          p_fotos?: Json
          p_marca_id?: string
          p_patron_id?: string
          p_permitir_venta_sin_stock?: boolean
          p_producto_id: string
          p_proveedor_id?: string
          p_referencia: string
          p_stock_minimo?: number
          p_tejido_id?: string
          p_temporada?: string
          p_variantes: Json
          p_version_esperada?: number
        }
        Returns: number
      }
      catalogo_crear_producto: {
        Args: {
          p_categoria_id?: string
          p_descripcion?: string
          p_fotos?: Json
          p_patron_id?: string
          p_permitir_venta_sin_stock?: boolean
          p_referencia: string
          p_stock_minimo?: number
          p_tejido_id?: string
          p_temporada?: string
          p_variantes: Json
        }
        Returns: string
      }
      censo_crear_variante: {
        Args: {
          p_categoria_id: string
          p_codigo_barras: string
          p_color_codigo?: string
          p_costo?: number
          p_marca_id?: string
          p_precio?: number
          p_proveedor_id?: string
          p_referencia: string
          p_talla_id?: string
        }
        Returns: {
          codigo_barras: string
          color: string
          costo: number
          referencia: string
          reutilizado: boolean
          sku: string
          talla: string
          variante_id: string
        }[]
      }
      cerrar_caja: {
        Args: {
          p_caja_id: string
          p_monto_real: number
          p_traslado_destino?: string
          p_traslado_monto?: number
          p_traslado_referencia?: string
        }
        Returns: {
          diferencia: number
          monto_fondo: number
          monto_real: number
          monto_sistema: number
          monto_trasladado: number
        }[]
      }
      cerrar_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          lineas_ajustadas: number
          unidades_faltantes: number
          unidades_sobrantes: number
        }[]
      }
      cerrar_linea_compra: {
        Args: {
          p_cantidad: number
          p_compra_item_id: string
          p_motivo: string
          p_nota?: string
          p_ubicacion_id?: string
        }
        Returns: string
      }
      cerrar_produccion: {
        Args: {
          p_buenas: Json
          p_costo_avios: number
          p_costo_maquila: number
          p_costo_tela: number
          p_produccion_id: string
        }
        Returns: undefined
      }
      cerrar_traslado_con_diferencia: {
        Args: { p_nota?: string; p_transferencia_id: string }
        Returns: {
          lineas_recibidas: number
          unidades_recibidas: number
        }[]
      }
      compras_nota_pendiente: {
        Args: { p_compra_ids: string[] }
        Returns: {
          compra_id: string
          monto_esperado: number
          resuelto: boolean
          unidades_cerradas: number
        }[]
      }
      confirmar_traslado: {
        Args: { p_transferencia_id: string }
        Returns: {
          lineas_con_diferencia: number
          lineas_ok: number
          resultado: string
        }[]
      }
      conteo_contar: {
        Args: {
          p_cantidad_contada: number
          p_conteo_id: string
          p_variante_id: string
        }
        Returns: string
      }
      convertir_proforma_a_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_proforma_id: string
          p_tipo: string
          p_venta_id?: string
        }
        Returns: string
      }
      crear_devolucion: {
        Args: {
          p_items: Json
          p_motivo: string
          p_motivo_codigo: string
          p_ubicacion_id: string
          p_venta_id: string
        }
        Returns: string
      }
      crear_marca: {
        Args: { p_nombre: string; p_proveedor_id: string }
        Returns: string
      }
      crear_producto_con_variantes: {
        Args: {
          p_categoria_id: string
          p_confirmo_distinto?: boolean
          p_descripcion?: string
          p_etiqueta_ids?: string[]
          p_marca_id?: string
          p_patron_id?: string
          p_proveedor_id?: string
          p_referencia: string
          p_tejido_id?: string
          p_token?: string
          p_variantes: Json
        }
        Returns: string
      }
      crear_proforma: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_items: Json
          p_nota?: string
          p_ubicacion_id: string
          p_vence_at?: string
        }
        Returns: string
      }
      cambiar_estado_proveedor_produccion: {
        Args: { p_activo: boolean; p_proveedor_id: string }
        Returns: undefined
      }
      cambiar_ubicacion_colaborador: {
        Args: { p_persona_id: string; p_ubicacion_id: string }
        Returns: undefined
      }
      desactivar_categoria: {
        Args: { p_categoria_id: string }
        Returns: undefined
      }
      desactivar_proveedor: {
        Args: { p_proveedor_id: string }
        Returns: undefined
      }
      desactivar_terminal: { Args: { p_terminal_id: string }; Returns: undefined }
      devolver_insumo_de_produccion: {
        Args: {
          p_cantidad: number
          p_insumo_id: string
          p_nota?: string
          p_produccion_id: string
        }
        Returns: string
      }
      deuda_por_vencimiento: {
        Args: never
        Returns: {
          comprobantes: number
          monto: number
          tramo: string
        }[]
      }
      emitir_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_igv: number
          p_items?: Json
          p_subtotal: number
          p_tipo: string
          p_token?: string
          p_total: number
          p_ubicacion_id: string
          p_venta_id?: string
        }
        Returns: string
      }
      emitir_nota: {
        Args: {
          p_comprobante_original_id: string
          p_igv: number
          p_items?: Json
          p_motivo: string
          p_subtotal: number
          p_tipo: string
          p_total: number
        }
        Returns: string
      }
      etiquetar_variantes: { Args: { p_cambios: Json }; Returns: Json }
      fn_aplicar_candado_de_dinero: { Args: never; Returns: string[] }
      fn_aplicar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      fn_aprobar_alta_colaborador: {
        Args: { p_persona_id: string }
        Returns: undefined
      }
      fn_asesoras_de_turno: {
        Args: { p_ubicacion_id: string }
        Returns: {
          es_de_esta_sede: boolean
          estado_ahora: string
          nombre_corto: string
          persona_id: string
        }[]
      }
      fn_asignar_codigo_producto: {
        Args: { p_producto_id: string }
        Returns: string
      }
      fn_asignar_codigo_variante: {
        Args: { p_variante_id: string }
        Returns: string
      }
      fn_campanas_por_variante: {
        Args: {
          p_hoy: string
          p_tolerancia_dias?: number
          p_variante_ids?: string[]
        }
        Returns: {
          descuento_pct: number
          etiqueta_id: string
          etiqueta_nombre: string
          variante_id: string
        }[]
      }
      fn_calidad: {
        Args: { p_dia?: string; p_dias?: number; p_plazo_dias?: number }
        Returns: {
          clave: string
          cohorte_desde: string
          cohorte_hasta: string
          devueltas_a_proveedor: number
          devueltas_danadas: number
          devueltas_vendibles: number
          etiqueta: string
          nivel: string
          unidades_cambiadas: number
          unidades_devueltas: number
          unidades_vendidas: number
        }[]
      }
      fn_calidad_danadas: {
        Args: { p_dia?: string; p_meses?: number }
        Returns: {
          condicion: string
          mes: string
          origen: string
          ubicacion_id: string
          unidades: number
        }[]
      }
      fn_clave_referencia: { Args: { p: string }; Returns: string }
      fn_clave_texto: { Args: { p: string }; Returns: string }
      fn_colaboradores: {
        Args: never
        Returns: {
          agregado_en: string
          correo: string
          es_yo: boolean
          nombre: string
          persona_id: string
          rol: string
          sede: string
          ubicacion_asignada: string
          ubicacion_id: string
          ultimo_acceso: string
        }[]
      }
      fn_colaboradores_actividad: {
        Args: { p_limite?: number }
        Returns: {
          accion: string
          created_at: string
          id: number
          motivo: string
          persona_nombre: string
          por_nombre: string
          rol: string
          total: number
          ubicacion_anterior: string
          ubicacion_nueva: string
        }[]
      }
      fn_colaboradores_inactivos: {
        Args: never
        Returns: {
          correo: string
          estado_dynamic: string
          nombre: string
          persona_id: string
          rol: string
          sede: string
          suspendida: boolean
        }[]
      }
      fn_colaboradores_pendientes: {
        Args: never
        Returns: {
          correo: string
          nombre: string
          persona_id: string
          propuesto_en: string
          propuesto_por: string
          sede: string
          ubicacion_asignada: string
        }[]
      }
      fn_colaboradores_suspendidos: {
        Args: never
        Returns: {
          correo: string
          motivo: string
          nombre: string
          persona_id: string
          rol: string
          sede: string
          suspendido_en: string
          suspendido_por_nombre: string
          ubicacion_asignada: string
        }[]
      }
      fn_comercial_colaboradoras: {
        Args: { p_dia?: string }
        Returns: {
          bruto_mes: number
          descuento_mes: number
          persona_id: string | null
          tickets_hoy: number
          tickets_mes: number
          ubicacion_id: string
          unidades_mes: number
          ventas_hoy: number
          ventas_mes: number
        }[]
      }
      fn_comercial_horas: {
        Args: { p_dia?: string }
        Returns: {
          hora: number
          tickets: number
          ubicacion_id: string
          ventas: number
        }[]
      }
      fn_comercial_sedes: {
        Args: { p_dia?: string }
        Returns: {
          devuelto_hoy: number
          devuelto_mes: number
          devuelto_semana: number
          meta_venta_diaria: number | null
          nombre: string
          tickets_hoy: number
          tickets_mes: number
          tickets_semana: number
          ubicacion_id: string
          unidades_hoy: number
          unidades_mes: number
          unidades_semana: number
          ventas_hoy: number
          ventas_mes: number
          ventas_semana: number
        }[]
      }
      fn_consumir_saldo_favor: {
        Args: {
          p_compra_id: string
          p_compra_pago_id: string
          p_fecha: string
          p_monto: number
          p_persona: string
          p_proveedor_id: string
        }
        Returns: undefined
      }
      fn_conteos_resumen: {
        Args: { p_limite?: number; p_ubicacion_id: string }
        Returns: {
          abierto_por: string
          alcance: string
          alcance_categoria_nombre: string
          cerrado_en: string
          cerrado_por: string
          contado: number
          created_at: string
          diferencia: number
          estado: string
          id: string
          lineas: number
          lineas_con_diferencia: number
          numero: number
          sistema: number
          soles_diferencia: number
          sububicacion_id: string
          sububicacion_nombre: string
          sububicacion_tipo: string
        }[]
      }
      fn_costo_historial: {
        Args: { p_variante_id: string }
        Returns: {
          cantidad_nueva: number
          compra_documento: string
          costo_anterior: number
          costo_resultante: number
          costo_unitario_nuevo: number
          created_at: string
          id: string
          lote_guia: string
          origen: string
          produccion_referencia: string
          proveedor_nombre: string
          stock_previo: number
          usuario_nombre: string
        }[]
      }
      fn_cotizacion_maquila_vigente: {
        Args: { p_categoria_id: string }
        Returns: {
          categoria_id: string
          creado_por: string | null
          created_at: string
          fecha_cotizacion: string
          id: string
          precio_maquila: number
          proveedor_referencia: string | null
          vigente_hasta: string
        }
      }
      fn_dentro_de_una_edicion: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      fn_dynamic_disponibles: {
        Args: never
        Returns: {
          correo: string
          nombre: string
          persona_id: string
          sede: string
        }[]
      }
      fn_es_lider: { Args: never; Returns: boolean }
      fn_esperado_caja: {
        Args: { p_caja_id: string }
        Returns: {
          apertura: number
          cambios_efectivo: number
          egresos: number
          esperado: number
          ingresos: number
          reembolsos_efectivo: number
          ventas_efectivo: number
        }[]
      }
      fn_actor_persona_id: { Args: { p_de_tienda?: boolean }; Returns: string }
      fn_exige_dinero_de_compras: {
        Args: { p_que?: string }
        Returns: undefined
      }
      fn_historial_producto_cambios: {
        Args: { p_producto_id: string }
        Returns: {
          campo: string
          categoria_anterior_nombre: string
          categoria_nueva_nombre: string
          created_at: string
          entidad: string
          id: string
          usuario_id: string
          usuario_nombre: string
          valor_anterior: string
          valor_nuevo: string
          variante_color: string
          variante_id: string
          variante_sku: string
          variante_talla: string
        }[]
      }
      fn_facturas_para_nota_credito: {
        Args: {
          p_filtro?: string
          p_limite?: number
          p_proveedor_id?: string
          p_texto?: string
        }
        Returns: {
          documento: string
          estado: string
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          notas_monto: number
          pagado: number
          proveedor_id: string
          proveedor_nombre: string
          saldo: number
          tiene_nota: boolean
          total: number
        }[]
      }
      fn_hoy_lima: { Args: never; Returns: string }
      fn_insertar_nota_credito_compra: {
        Args: {
          p_cierre_id: string
          p_compra_id: string
          p_fecha: string
          p_monto: number
          p_motivo: string
          p_nota: string
          p_persona: string
          p_serie_numero: string
        }
        Returns: string
      }
      archivar_serie_comprobante: {
        Args: { p_motivo: string; p_serie_id: string }
        Returns: undefined
      }
      fn_comprobantes_cola_reintento: {
        Args: { p_ubicacion_id?: string }
        Returns: {
          comprobante_id: string
          horas_esperando: number
          intentos_transmision: number
          numero: number
          serie: string
          tipo: string
          ubicacion_id: string
          ultimo_error_transmision: string
          ultimo_intento_transmision_at: string
          venta_id: string
        }[]
      }
      fn_marcar_reintento_transmision: {
        Args: { p_comprobante_id: string; p_error: string }
        Returns: undefined
      }
      fn_tomar_comprobantes_para_reintento: {
        Args: { p_limite?: number; p_ubicacion_id?: string }
        Returns: string[]
      }
      fn_mi_perfil: {
        Args: never
        Returns: {
          apellidos: string
          celular: string
          correo: string
          estado: string
          foto_url: string
          nombres: string
          persona_id: string
          rol: string
          ubicacion_nombre: string
          ultimo_acceso: string
        }[]
      }
      fn_movimientos: {
        Args: {
          p_busqueda?: string
          p_categoria?: string
          p_cursor_creado_en?: string
          p_cursor_id?: string
          p_desde?: string
          p_hasta?: string
          p_limite?: number
          p_motivo?: string
          p_producto_id?: string
          p_sububicacion_id?: string
          p_ubicacion_id: string
          p_usuario_id?: string
        }
        Returns: {
          cambio_diferencia: number
          cambio_id: string
          cantidad: number
          categoria: string
          color: string
          compra_documento: string
          compra_id: string
          comprobante_estado: string
          comprobante_numero: string
          comprobante_tipo: string
          conteo_cantidad_contada: number
          conteo_cantidad_sistema: number
          conteo_id: string
          conteo_numero: number
          created_at: string
          delta: number
          devolucion_estado: string
          devolucion_id: string
          devolucion_motivo: string
          es_sistema: boolean
          fecha_lima: string
          hora: string
          id: string
          lote_guia: string
          lote_id: string
          lote_nota: string
          motivo: string
          nota: string
          proveedor_nombre: string
          referencia: string
          sku: string
          sububicacion_destino_id: string
          sububicacion_destino_nombre: string
          sububicacion_destino_tipo: string
          sububicacion_id: string
          sububicacion_nombre: string
          sububicacion_tipo: string
          talla: string
          tipo: string
          transferencia_estado: string
          transferencia_id: string
          transferencia_nota: string
          transferencia_numero: number
          ubicacion_destino_id: string
          ubicacion_destino_nombre: string
          ubicacion_id: string
          ubicacion_nombre: string
          usuario_id: string
          usuario_nombre: string
          variante_id: string
          venta_id: string
          venta_nota: string
        }[]
      }
      fn_movimientos_busqueda: {
        Args: { p_busqueda: string }
        Returns: {
          movimiento_ids: string[]
          variante_ids: string[]
        }[]
      }
      fn_movimientos_de_comprobante: {
        Args: { p_numero: number; p_serie: string; p_tipos: string[] }
        Returns: string[]
      }
      fn_movimientos_resumen: {
        Args: {
          p_busqueda?: string
          p_desde?: string
          p_hasta?: string
          p_motivo?: string
          p_sububicacion_id?: string
          p_ubicacion_id: string
          p_usuario_id?: string
        }
        Returns: {
          categoria: string
          delta: number
          movimientos: number
          unidades: number
        }[]
      }
      fn_movimientos_variantes: {
        Args: { p_busqueda: string }
        Returns: string[]
      }
      fn_nombres_personas: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          nombre: string
        }[]
      }
      fn_mi_terminal: {
        Args: never
        Returns: string
      }
      fn_persona_actual_resumen: {
        Args: never
        Returns: {
          es_lider: boolean
          nombre: string
          ubicacion_id: string
          ubicacion_nombre: string
          ubicacion_tipo: string
        }[]
      }
      fn_prioridad_conteo: {
        Args: { p_alcance_categoria_id?: string; p_ubicacion_id: string }
        Returns: {
          color: string
          dias_sin_contar: number
          referencia: string
          sku: string
          sububicacion_id: string
          talla: string
          valor_en_riesgo: number
          variante_id: string
        }[]
      }
      fn_productos: {
        Args: {
          p_busqueda?: string
          p_categoria_id?: string
          p_color_codigo?: string
          p_estado?: string
          p_marca_id?: string
          p_orden?: string
          p_pagina?: number
          p_por_pagina?: number
          p_precio_max?: number
          p_precio_min?: number
          p_proveedor_id?: string
          p_stock?: string
        }
        Returns: {
          activo: boolean
          categoria_id: string
          categoria_nombre: string
          codigo: string
          codigos_barras: string[]
          color_codigo: string
          color_hex: string
          color_nombre: string
          costo: number
          demanda_diaria: number
          estado: string
          foto_url: string
          lead_time_dias: number
          marca_id: string
          marca_nombre: string
          precio: number
          producto_id: string
          proveedor_id: string
          proveedor_nombre: string
          punto_reorden: number
          referencia: string
          reponer_de_proveedor: boolean
          sku: string
          stock_minimo: number
          stock_total: number
          talla: string
          total_productos: number
          variante_codigo: string
          variante_id: string
        }[]
      }
      fn_productos_buscar: { Args: { p_busqueda: string }; Returns: string[] }
      fn_productos_resumen: {
        Args: {
          p_busqueda?: string
          p_categoria_id?: string
          p_color_codigo?: string
          p_estado?: string
          p_marca_id?: string
          p_precio_max?: number
          p_precio_min?: number
          p_proveedor_id?: string
        }
        Returns: {
          reponer_de_proveedor: number
          sin_stock: number
          stock_bajo: number
          total_productos: number
          total_variantes: number
        }[]
      }
      fn_proveedor_costo_evolucion: {
        Args: { p_limite?: number; p_proveedor_id: string }
        Returns: {
          compra_id: string
          costo_unitario: number
          documento: string
          fecha: string
          producto_id: string
          referencia: string
        }[]
      }
      fn_proveedor_creditos: {
        Args: { p_limite?: number; p_proveedor_id: string }
        Returns: {
          created_at: string
          documento: string
          fecha: string
          id: string
          metodo: string
          monto: number
          nota: string
          nota_serie_numero: string
          referencia: string
          registrado_por: string
          tipo: string
        }[]
      }
      fn_proveedor_devoluciones: {
        Args: { p_proveedor_id: string }
        Returns: {
          ultima: string
          unidades: number
        }[]
      }
      fn_proveedor_metricas_compras: {
        Args: { p_proveedor_id: string }
        Returns: {
          dias_entrega_muestra: number
          dias_entrega_promedio: number
          dias_pago_muestra: number
          dias_pago_real_promedio: number
          entregado_completo_pct: number
          facturado_12m: number
          facturas_atrasadas: number
          facturas_con_recepcion_pendiente: number
          facturas_recibidas_completas: number
          facturas_vencidas: number
          facturas_vigentes: number
          monto_vencido: number
          saldo: number
          total_facturado: number
          ultima_compra: string
        }[]
      }
      fn_proveedor_metricas_insumos: {
        Args: { p_proveedor_id: string }
        Returns: {
          lotes: number
          total_comprado: number
          ultima_entrega: string
        }[]
      }
      fn_comprobantes_produccion: {
        Args: { p_limite?: number }
        Returns: {
          condicion: string
          created_at: string
          estado: string
          estado_pago: string
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          igv: number
          lineas: number
          motivo_anulacion: string
          nota: string
          numero: string
          pagado: number
          proveedor: string
          proveedor_id: string
          saldo: number
          serie: string
          subtotal: number
          tipo: string
          total: number
          vencido: boolean
        }[]
      }
      fn_costos_insumos_taller: {
        Args: { p_ubicacion_id: string }
        Returns: {
          costo_unitario: number
          lote_id: string
        }[]
      }
      fn_costos_producciones: {
        Args: { p_ubicacion_id: string }
        Returns: {
          costo_avios: number
          costo_maquila: number
          costo_tela: number
          costo_unitario: number
          produccion_id: string
        }[]
      }
      fn_deuda_consolidada: {
        Args: never
        Returns: {
          comprobantes: number
          origen: string
          proveedor: string
          proveedor_id: string
          proximo_vencimiento: string
          saldo: number
          vencido: number
        }[]
      }
      fn_igv_credito_fiscal: {
        Args: { p_mes?: string }
        Returns: {
          igv_compras: number
          igv_neto: number
          igv_notas_credito: number
          igv_produccion: number
          mes: string
        }[]
      }
      fn_lineas_comprobantes_produccion: {
        Args: { p_comprobante_id?: string; p_ubicacion_id: string }
        Returns: {
          cerrado: number
          comprobante_id: string
          facturado: number
          fecha_emision: string
          insumo: string
          insumo_id: string
          item_id: string
          numero: string
          pendiente: number
          proveedor: string
          recibido: number
          serie: string
          tipo: string
          unidad: string
        }[]
      }
      fn_proveedor_produccion_metricas: {
        Args: { p_proveedor_id: string }
        Returns: {
          lotes: number
          total_comprado: number
          ultima_entrega: string
        }[]
      }
      fn_proveedores_produccion: {
        Args: never
        Returns: {
          activo: boolean
          banco: string
          billeteras: string[]
          cci: string
          celular_billetera: string
          contacto: string
          cuenta_bancaria: string
          forma_pago_preferida: string
          id: string
          lotes: number
          nombre: string
          plazo_credito_dias: number
          rubro: string
          ruc: string
          telefono: string
          titular_cuenta: string
          total_comprado: number
          ultima_entrega: string
        }[]
      }
      fn_proveedores: {
        Args: never
        Returns: {
          activo: boolean
          banco: string
          billeteras: string[]
          cci: string
          celular_billetera: string
          contacto: string
          cuenta_bancaria: string
          dias_desde_ultima_compra: number
          entregas_por_recibir: number
          facturado_12m: number
          facturas: number
          facturas_atrasadas: number
          facturas_con_recepcion_pendiente: number
          facturas_recibidas_completas: number
          facturas_vencidas: number
          forma_pago_preferida: string
          id: string
          nombre: string
          plazo_credito_dias: number
          rubros: string[]
          ruc: string
          saldo: number
          saldo_favor: number
          saldo_vencido: number
          telefono: string
          titular_cuenta: string
          total_facturado: number
          ultima_compra: string
        }[]
      }
      fn_proveedores_resumen: {
        Args: never
        Returns: {
          activos: number
          con_saldo: number
          con_saldo_favor: number
          con_vencidas: number
          desactivados: number
          deuda_total: number
          saldo_favor_total: number
          sin_compras_90d: number
          top_pct: number
          top_proveedor_id: string
          top_proveedor_nombre: string
          top3_pct: number
        }[]
      }
      fn_proveedores_serie_12m: {
        Args: never
        Returns: {
          mes: string
          monto: number
          proveedor_id: string
        }[]
      }
      fn_puede_operar_ubicacion: {
        Args: { p_ubicacion_id: string }
        Returns: boolean
      }
      fn_puede_registrar_compras: { Args: never; Returns: boolean }
      fn_puede_ver_compra: { Args: { p_compra_id: string }; Returns: boolean }
      fn_puede_ver_dinero_de_compras: { Args: never; Returns: boolean }
      fn_recalcular_costo_variante: {
        Args: {
          p_cantidad_nueva: number
          p_costo_unitario_nuevo: number
          p_movimiento_id: string
          p_origen: string
          p_variante_id: string
        }
        Returns: number
      }
      fn_reservar_numero_serie: {
        Args: { p_tipo: string; p_ubicacion_id: string }
        Returns: {
          numero: number
          serie: string
        }[]
      }
      fn_resumen_comparacion: {
        Args: {
          p_a_desde: string
          p_a_hasta: string
          p_b_desde: string
          p_b_hasta: string
          p_ubicacion_id: string
        }
        Returns: {
          a_costo_devoluciones: number
          a_costo_ventas: number
          a_devoluciones: number
          a_dias_con_stock: number
          a_entradas: number
          a_importe: number
          a_stock_cierre: number
          a_stock_inicio: number
          a_uds_sin_costo: number
          a_ventas: number
          b_costo_devoluciones: number
          b_costo_ventas: number
          b_devoluciones: number
          b_dias_con_stock: number
          b_entradas: number
          b_importe: number
          b_stock_cierre: number
          b_stock_inicio: number
          b_uds_sin_costo: number
          b_ventas: number
          categoria_id: string
          categoria_nombre: string
          codigo: string
          codigos_barras: string[]
          color_codigo: string
          color_hex: string
          color_nombre: string
          costo: number
          estado_costo: string
          ledger_consistente: boolean
          producto_codigo: string
          producto_estado: string
          producto_id: string
          referencia: string
          sku: string
          talla: string
          variante_id: string
        }[]
      }
      fn_resumen_comparacion_json: {
        Args: {
          p_a_desde: string
          p_a_hasta: string
          p_b_desde: string
          p_b_hasta: string
          p_ubicacion_id: string
        }
        Returns: Json
      }
      fn_resumen_variantes: {
        Args: {
          p_cmp_desde?: string
          p_cmp_hasta?: string
          p_desde?: string
          p_hasta?: string
          p_ubicacion_id: string
          p_ventana_dias?: number
        }
        Returns: {
          almacen: number
          categoria_id: string
          categoria_nombre: string
          codigo: string
          codigos_barras: string[]
          color_codigo: string
          color_hex: string
          color_nombre: string
          costo: number
          cuarentena: number
          devoluciones_cmp: number
          devoluciones_ventana: number
          dias_con_stock: number
          dias_con_stock_cmp: number
          dias_observables: number
          disponible: number
          en_camino: number
          en_camino_a_tiempo: number
          en_camino_atrasado: boolean
          en_red: Json
          entradas_ventana: number
          estado_costo: string
          foto_url: string
          ledger_consistente: boolean
          mermas_ventana: number
          origen_abastecimiento: string
          piso: number
          precio: number
          primer_ingreso: string
          producto_codigo: string
          producto_estado: string
          producto_id: string
          proxima_llegada: string
          proximo_traslado_id: string
          referencia: string
          separa_piso_almacen: boolean
          sin_sububicacion: number
          sku: string
          stock_inicial: number
          stock_minimo: number
          talla: string
          traslados_salida_ventana: number
          ultima_venta: string
          variante_id: string
          ventas_cmp: number
          ventas_ventana: number
        }[]
      }
      fn_resumen_variantes_json: {
        Args: {
          p_cmp_desde?: string
          p_cmp_hasta?: string
          p_desde?: string
          p_hasta?: string
          p_ubicacion_id: string
        }
        Returns: Json
      }
      fn_resumen_caja: { Args: { p_caja_id: string }; Returns: Json }
      fn_rubros_limpios: { Args: { p_rubros: string[] }; Returns: string[] }
      fn_sello_caja: { Args: { p_caja_id: string }; Returns: string }
      fn_totales_historial_ventas: {
        Args: {
          p_comprobante?: string
          p_desde?: string
          p_estado?: string
          p_hasta?: string
          p_ids?: string[]
          p_incluir_prueba?: boolean
          p_pago?: string
          p_sede_id?: string
          p_vendedor_id?: string
        }
        Returns: Json
      }
      fn_saldo_favor_proveedor: {
        Args: { p_proveedor_id: string }
        Returns: number
      }
      fn_siguiente_correlativo: { Args: { p_prefijo: string }; Returns: number }
      fn_stock_por_sede: {
        Args: never
        Returns: {
          cantidad: number
          ubicacion_id: string
          variante_id: string
        }[]
      }
      fn_stock_por_sede_json: { Args: never; Returns: Json }
      fn_sububicacion_por_defecto: {
        Args: { p_ubicacion_id: string; p_uso: string }
        Returns: string
      }
      archivar_rol: { Args: { p_rol_id: string }; Returns: undefined }
      asignar_rol: {
        Args: {
          p_persona_id?: string
          p_rol_id: string
          p_terminal_id?: string
          p_ubicacion_id?: string
        }
        Returns: undefined
      }
      crear_rol: {
        Args: { p_copiar_de?: string; p_descripcion?: string; p_nombre: string }
        Returns: string
      }
      fn_cuentas_con_rol: {
        Args: never
        Returns: {
          es_lider: boolean
          estado: string
          id: string
          nombre: string
          rol_id: string
          tipo: string
          ubicacion_nombre: string | null
        }[]
      }
      fn_mis_modulos: {
        Args: never
        Returns: {
          clave: string
          completo: boolean
        }[]
      }
      fn_ve_modulo: { Args: { p_clave: string }; Returns: boolean }
      // 20260923110000 / 20260923111000: capacidades de los módulos abiertos a los roles.
      fn_puede_editar_etiquetas: { Args: never; Returns: boolean }
      fn_puede_tocar_etiqueta: { Args: { p_etiqueta_id: string; p_descuento_nuevo?: number }; Returns: boolean }
      fn_puede_analizar: { Args: never; Returns: boolean }
      fn_puede_gestionar_colaboradores: { Args: never; Returns: boolean }
      fn_puede_administrar_roles: { Args: never; Returns: boolean }
      // ADR-0184 (Compras por tienda)
      fn_compras_ubicaciones: { Args: never; Returns: string[] }
      fn_puede_comprar_en: { Args: { p_ubicacion_id: string }; Returns: boolean }
      fn_saldo_de_tienda: { Args: { p_compra_id: string; p_ubicacion_id: string }; Returns: number }
      agregar_comprador_de_tienda: { Args: { p_persona_id: string; p_ubicacion_id: string }; Returns: undefined }
      quitar_comprador_de_tienda: { Args: { p_persona_id: string; p_ubicacion_id: string }; Returns: undefined }
      cambiar_tienda_gestora_compra: { Args: { p_compra_id: string; p_ubicacion_id: string }; Returns: undefined }
      fn_compras_visibles: { Args: never; Returns: string[] }
      fn_compra_es_de_mis_tiendas: { Args: { p_compra_id: string }; Returns: boolean }
      fn_mi_parte_de_compra: { Args: { p_compra_id: string }; Returns: Json }
      // 20260924100000 (ADR-0187): lo que debe quien consulta en cada comprobante (líder: el total; tienda: su parte).
      fn_deuda_visible: {
        Args: { p_ids?: string[] }
        Returns: { compra_id: string; total: number; pagado: number; saldo: number; gestionada: boolean }[]
      }
      fn_mis_partes_de_compras: {
        Args: never
        Returns: {
          compra_id: string
          documento: string | null
          tipo: string
          proveedor_id: string
          proveedor_nombre: string
          fecha_emision: string
          fecha_vencimiento: string | null
          estado: string
          gestora_id: string | null
          gestora_nombre: string | null
          ubicacion_id: string
          ubicacion_nombre: string
          unidades: number
          total: number
          pagado: number
          saldo: number
          registrada_en: string
          parte_nueva: boolean
        }[]
      }
      // 20260923163000 (ADR-0178): el escalón Admin, leído de Dynamic, y «solo das lo que tienes».
      fn_es_admin: { Args: never; Returns: boolean }
      fn_admins: { Args: never; Returns: { persona_id: string }[] }
      fn_rol_dentro_de_lo_mio: { Args: { p_rol_id: string }; Returns: boolean }
      // 20260923174500: «solo alcanzas a quien está por debajo de ti».
      fn_fuera_de_mi_alcance: { Args: never; Returns: { persona_id: string }[] }
      // 20260925210000: la foto de perfil de Dynamic (ruta en el bucket fotos-perfil) de cada colaborador pedido.
      fn_fotos_personas: { Args: { p_ids: string[] }; Returns: { persona_id: string; foto_ruta: string }[] }
      guardar_modulos_rol: {
        Args: { p_modulos: string[]; p_rol_id: string; p_version_esperada?: number }
        Returns: number
      }
      renombrar_rol: {
        Args: { p_descripcion?: string; p_nombre: string; p_rol_id: string }
        Returns: undefined
      }
      restaurar_rol: { Args: { p_rol_id: string }; Returns: undefined }
      fn_terminales: {
        Args: never
        Returns: {
          activo: boolean
          correo: string | null
          creada_at: string
          desactivada_at: string | null
          id: string
          nombre: string
          rol_id: string
          rol_nombre: string
          ubicacion_id: string
          ubicacion_nombre: string
          ultimo_acceso: string | null
        }[]
      }
      fn_texto_o_null: { Args: { p: string }; Returns: string }
      fn_tiene_acceso_retail: { Args: never; Returns: boolean }
      fn_titulo_referencia: { Args: { p: string }; Returns: string }
      fn_token_talla: { Args: { p_talla: string }; Returns: string }
      fn_traslado_lineas: {
        Args: { p_transferencia_id: string }
        Returns: {
          cantidad_enviada: number
          cantidad_recibida: number
          color: string
          diferencia: number
          referencia: string
          sku: string
          talla: string
          variante_id: string
        }[]
      }
      fn_ubicacion_actual_persona: { Args: never; Returns: string }
      fn_validar_fecha_pago_compra: {
        Args: { p_documento: string; p_fecha: string; p_fecha_emision: string }
        Returns: undefined
      }
      fn_validar_marca_proveedor: {
        Args: { p_marca_id: string; p_proveedor_id: string }
        Returns: undefined
      }
      fn_variante_permitida_en_sede: {
        Args: { p_ubicacion_id: string; p_variante_id: string }
        Returns: boolean
      }
      fn_ventas_del_dia: {
        Args: { p_ubicacion_id?: string }
        Returns: {
          cliente_nombre: string
          comprobante_estado: string
          comprobante_texto: string
          comprobante_tipo: string
          hora: string
          items: Json
          metodos_pago: string
          nota: string
          total: number
          ubicacion_nombre: string
          vendedor: string
          venta_id: string
        }[]
      }
      fn_verificar_apartados: {
        Args: never
        Returns: {
          en_apartados: number
          en_stock: number
          sububicacion_id: string
          ubicacion_id: string
          variante_id: string
        }[]
      }
      guardar_cuentas_proveedor: {
        Args: {
          p_billeteras?: string[]
          p_cci?: string
          p_celular_billetera?: string
          p_proveedor_id: string
          p_titular_cuenta?: string
        }
        Returns: undefined
      }
      guardar_proveedor_produccion: {
        Args: {
          p_banco?: string
          p_billeteras?: string[]
          p_cci?: string
          p_celular_billetera?: string
          p_contacto?: string
          p_cuenta_bancaria?: string
          p_forma_pago_preferida?: string
          p_nombre: string
          p_plazo_credito_dias?: number
          p_proveedor_id: string
          p_rubro: string
          p_ruc?: string
          p_telefono?: string
          p_titular_cuenta?: string
        }
        Returns: string
      }
      iniciar_traslado: {
        Args: {
          p_fecha_estimada_llegada: string
          p_items: Json
          p_nota?: string
          p_token?: string
          p_ubicacion_destino_id: string
          p_ubicacion_origen_id: string
        }
        Returns: string
      }
      liberar_apartado: {
        Args: { p_apartado_id: string; p_motivo: string }
        Returns: undefined
      }
      lineas_compra_operativo: {
        Args: { p_compra_ids: string[]; p_ubicacion_id?: string }
        Returns: {
          asignado_aqui: number
          cantidad: number
          cantidad_facturada: number
          cerrado: number
          cerrado_aqui: number
          compra_id: string
          descripcion: string
          id: string
          otras_tiendas: Json
          pendiente: number
          pendiente_aqui: number
          producto_id: string
          recibido: number
          recibido_aqui: number
          variante_id: string
        }[]
      }
      liquidar_prenda_danada: {
        Args: {
          p_id: string
          p_metodo_pago: string
          p_nota?: string
          p_precio_unitario: number
        }
        Returns: string
      }
      listar_apartados: {
        Args: { p_ubicacion_id: string }
        Returns: {
          cantidad: number
          clienta_contacto: string
          clienta_nombre: string
          color: string
          creado_por: string
          creado_por_nombre: string
          created_at: string
          id: string
          nota: string
          puede_liberar: boolean
          referencia: string
          sku: string
          sububicacion_id: string
          talla: string
          variante_id: string
          vence_el: string
        }[]
      }
      listar_compras: {
        Args: {
          p_busqueda?: string
          p_con_saldo?: boolean
          p_condicion?: string
          p_cursor_creado_en?: string
          p_cursor_fecha?: string
          p_cursor_id?: string
          p_desde?: string
          p_estado_pago?: string
          p_estado_recepcion?: string
          p_hasta?: string
          p_limite?: number
          p_naturaleza?: string
          p_orden?: string
          p_por_recibir?: boolean
          p_proveedor_id?: string
          p_solo_vencidas?: boolean
          p_solo_vigentes?: boolean
          p_tipo?: string
          p_ubicacion_id?: string
        }
        Returns: {
          cerrado_cantidad: number | null
          condicion: string | null
          created_at: string | null
          documento: string | null
          estado: string | null
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number | null
          fecha_emision: string | null
          fecha_estimada_llegada: string | null
          fecha_vencimiento: string | null
          id: string | null
          igv: number | null
          nota: string | null
          notas_credito: number | null
          numero: string | null
          pagado: number | null
          proveedor_banco: string | null
          proveedor_cuenta_bancaria: string | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          proveedor_ruc: string | null
          proveedor_telefono: string | null
          recepcion_atrasada: boolean | null
          recibido_cantidad: number | null
          saldo: number | null
          serie: string | null
          subtotal: number | null
          tipo: string | null
          total: number | null
          naturaleza: string | null
          ubicaciones_destino: string[] | null
          vencida: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "compras_resumen"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      listar_compras_operativo: {
        Args: {
          p_busqueda?: string
          p_cursor_creado_en?: string
          p_cursor_fecha?: string
          p_cursor_id?: string
          p_desde?: string
          p_estado_recepcion?: string
          p_hasta?: string
          p_limite?: number
          p_por_recibir?: boolean
          p_proveedor_id?: string
          p_tipo?: string
          p_ubicacion_id?: string
        }
        Returns: {
          asignado_aqui: number
          cerrado_aqui: number
          cerrado_cantidad: number
          created_at: string
          documento: string
          estado: string
          estado_recepcion: string
          facturado_cantidad: number
          fecha_emision: string
          fecha_estimada_llegada: string
          id: string
          nota: string
          pendiente_aqui: number
          proveedor_id: string
          proveedor_nombre: string
          proveedor_ruc: string
          recepcion_atrasada: boolean
          recibido_aqui: number
          recibido_cantidad: number
          tipo: string
          ubicaciones_destino: string[]
        }[]
      }
      listar_recepciones_compras: {
        Args: {
          p_busqueda?: string
          p_desde?: string
          p_hasta?: string
          p_limite?: number
          p_proveedor_id?: string
        }
        Returns: {
          compra_id: string
          dias_demora: number
          documento: string
          faltante: number
          fecha_recepcion: string
          lote_id: string
          numero_guia: string
          proveedor_id: string
          proveedor_nombre: string
          recibido_por: string
          ubicacion_nombre: string
          unidades_facturadas: number
          unidades_llegaron: number
        }[]
      }
      marcar_comprobante_no_emitido: {
        Args: { p_comprobante_id: string; p_motivo: string }
        Returns: undefined
      }
      marcar_proforma_cobrada: {
        Args: { p_proforma_id: string; p_venta_id: string }
        Returns: undefined
      }
      marcar_pedido_no_atendido_resuelto: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      mover_interno: {
        Args: {
          p_cantidad: number
          p_nota?: string
          p_sububicacion_destino_id: string
          p_sububicacion_origen_id: string
          p_ubicacion_id: string
          p_variante_id: string
        }
        Returns: string
      }
      por_pagar_tramos: {
        Args: {
          p_busqueda?: string
          p_condicion?: string
          p_desde?: string
          p_hasta?: string
          p_proveedor_id?: string
          p_solo_vencidas?: boolean
          p_tipo?: string
          p_ubicacion_id?: string
        }
        Returns: {
          comprobantes: number
          saldo: number
          tramo: string
        }[]
      }
      previsualizar_cierre_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          codigo: string
          color: string
          contada: number
          diferencia: number
          origen: string
          referencia: string
          sistema: number
          talla: string
          variante_id: string
        }[]
      }
      quitar_colaborador: { Args: { p_persona_id: string }; Returns: undefined }
      reactivar_colaborador: { Args: { p_persona_id: string }; Returns: undefined }
      reactivar_terminal: { Args: { p_terminal_id: string }; Returns: undefined }
      registrar_cambio_clave_terminal: { Args: { p_terminal_id: string }; Returns: undefined }
      suspender_colaborador: { Args: { p_motivo?: string; p_persona_id: string }; Returns: undefined }
      reactivar_categoria: {
        Args: { p_categoria_id: string }
        Returns: undefined
      }
      reactivar_proveedor: {
        Args: { p_proveedor_id: string }
        Returns: undefined
      }
      reasignar_reparto_compra: {
        Args: {
          p_cantidad: number
          p_compra_item_id: string
          p_desde: string
          p_hacia: string
          p_motivo: string
          p_nota?: string
        }
        Returns: string
      }
      recalcular_compras: { Args: never; Returns: undefined }
      recalcular_stock: { Args: never; Returns: undefined }
      recepciones_sin_comprobante: {
        Args: { p_limite?: number; p_ubicacion_id?: string }
        Returns: {
          costo_unitario_promedio: number
          fecha_recepcion: string
          lote_id: string
          nota: string
          numero_guia: string
          proveedor_nombre: string
          recibido_por: string
          sin_costo: boolean
          ubicacion_nombre: string
          unidades: number
        }[]
      }
      rechazar_devolucion: {
        Args: { p_devolucion_id: string; p_motivo?: string }
        Returns: undefined
      }
      recibir_compras: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      recibir_envio: {
        Args: {
          p_cierres?: Json
          p_extras?: Json
          p_items?: Json
          p_nota?: string
          p_notas_credito?: Json
          p_numero_guia?: string
          p_token?: string
          p_traslados?: Json
          p_ubicacion_id: string
        }
        Returns: Json
      }
      recibir_comprobante_produccion: {
        Args: { p_cierres?: Json; p_comprobante_id: string; p_lineas?: Json; p_nota?: string; p_token?: string; p_ubicacion_id: string }
        Returns: string
      }
      recibir_insumo: {
        Args: {
          p_cantidad: number
          p_codigo_lote?: string
          p_costo_total: number
          p_documento?: string
          p_insumo_id: string
          p_nota?: string
          p_origen?: string
          p_proveedor_id?: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      recibir_lote: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_proveedor_id: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      recibir_y_cerrar_compras: {
        Args: {
          p_cierres?: Json
          p_items?: Json
          p_nota?: string
          p_notas_credito?: Json
          p_numero_guia?: string
          p_ubicacion_id: string
        }
        Returns: Json
      }
      notas_credito_tablero: {
        Args: never
        Returns: {
          a_favor: number
          aplicado: number
          cerrado_en: string
          cierre_id: string
          clase: string
          compra_estado: string
          compra_fecha_emision: string
          compra_id: string
          compra_saldo: number
          compra_total: number
          created_at: string
          documento: string
          fecha: string
          id: string
          igv: number
          monto: number
          monto_esperado: number
          motivo: string
          nota: string
          proveedor_id: string
          proveedor_nombre: string
          resuelto: boolean
          serie_numero: string
          unidades_cerradas: number
        }[]
      }
      // 20260923162300 (ADR-0179): almacén une la prenda sin registrar con su variante real.
      regularizar_prenda: {
        Args: { p_forma: string; p_id: string; p_variante_id: string }
        Returns: number
      }
      registrar_adjunto_compra: {
        Args: {
          p_bytes: number
          p_compra_id: string
          p_nombre: string
          p_nota_credito_id?: string
          p_ruta: string
          p_tipo: string
        }
        Returns: string
      }
      registrar_cambio: {
        Args: {
          p_cantidad?: number
          p_condicion?: string
          p_metodo_pago_diferencia?: string
          p_motivo?: string
          p_token?: string
          p_ubicacion_id: string
          p_variante_nueva_id: string
          p_venta_item_id: string
        }
        Returns: string
      }
      registrar_clienta: {
        Args: {
          p_acepta_whatsapp?: boolean
          p_cumple_dia?: number
          p_cumple_mes?: number
          p_dni?: string
          p_nombre?: string
          p_telefono_whatsapp?: string
        }
        Returns: string
      }
      registrar_compra: {
        Args: {
          p_condicion: string
          p_fecha_emision?: string
          p_fecha_estimada_llegada?: string
          p_fecha_vencimiento?: string
          p_igv_porcentaje?: number
          p_items: Json
          p_nota?: string
          p_numero: string
          p_pago?: Json
          p_proveedor_id: string
          p_serie: string
          p_tipo?: string
          p_token?: string
          p_total?: number
          p_ubicacion_destino_id: string
        }
        Returns: string
      }
      registrar_comprobante_produccion: {
        Args: {
          p_condicion: string
          p_fecha_emision?: string
          p_fecha_vencimiento?: string
          p_igv_porcentaje?: number
          p_items: Json
          p_nota?: string
          p_numero: string
          p_pago?: Json
          p_proveedor_id: string
          p_serie: string
          p_tipo?: string
          p_token?: string
          p_total?: number
        }
        Returns: string
      }
      registrar_pago_comprobante_produccion: {
        Args: { p_comprobante_id: string; p_fecha?: string; p_pagos: Json; p_token?: string }
        Returns: string
      }
      registrar_consumo_insumo: {
        Args: {
          p_cantidad: number
          p_insumo_id: string
          p_nota?: string
          p_produccion_id: string
        }
        Returns: string
      }
      registrar_movimiento: {
        Args: {
          p_cantidad: number
          p_motivo?: string
          p_nota?: string
          p_sububicacion_id?: string
          p_tipo: string
          p_ubicacion_id: string
          p_variante_id: string
        }
        Returns: string
      }
      registrar_movimiento_caja: {
        Args: {
          p_caja_id: string
          p_es_ajuste?: boolean
          p_monto: number
          p_motivo: string
          p_nota?: string
          p_tipo: string
          p_token?: string
        }
        Returns: string
      }
      registrar_nota_credito_compra: {
        Args: {
          p_cierre_id?: string
          p_compra_id: string
          p_destino?: string
          p_fecha: string
          p_monto: number
          p_motivo: string
          p_nota?: string
          p_reembolso_fecha?: string
          p_reembolso_metodo?: string
          p_reembolso_referencia?: string
          p_serie_numero: string
        }
        Returns: string
      }
      registrar_pago_compra: {
        Args: {
          p_compra_id: string
          p_fecha?: string
          p_metodo: string
          p_monto: number
          p_referencia?: string
        }
        Returns: string
      }
      registrar_pago_compras: {
        Args: {
          p_aplicaciones: Json
          p_credito?: number
          p_fecha?: string
          p_metodo: string
          p_proveedor_id: string
          p_referencia?: string
          p_token?: string
          p_ubicacion_id?: string
        }
        Returns: string
      }
      registrar_pago_compras_medios: {
        Args: {
          p_aplicaciones: Json
          p_credito?: number
          p_fecha?: string
          p_medios?: Json
          p_proveedor_id: string
          p_token?: string
          p_ubicacion_id?: string
        }
        Returns: string
      }
      registrar_pagos_compra: {
        Args: {
          p_compra_id: string
          p_fecha?: string
          p_pagos: Json
          p_token?: string
          p_ubicacion_id?: string
        }
        Returns: string[]
      }
      registrar_pedido_no_atendido: {
        Args: {
          p_clienta_id?: string
          p_descripcion_libre?: string
          p_producto_id?: string
          p_talla?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_proveedor: {
        Args: {
          p_banco?: string
          p_contacto?: string
          p_cuenta_bancaria?: string
          p_forma_pago_preferida?: string
          p_nombre: string
          p_plazo_credito_dias?: number
          p_rubros?: string[]
          p_ruc?: string
          p_telefono?: string
        }
        Returns: string
      }
      registrar_recepcion_traslado: {
        Args: {
          p_cantidad_recibida: number
          p_transferencia_id: string
          p_variante_id: string
        }
        Returns: string
      }
      registrar_reembolso_proveedor: {
        Args: {
          p_fecha?: string
          p_metodo: string
          p_monto: number
          p_nota?: string
          p_proveedor_id: string
          p_referencia?: string
        }
        Returns: string
      }
      registrar_serie_comprobante: {
        Args: {
          p_serie: string
          p_siguiente_numero?: number
          p_tipo: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_venta: {
        Args: {
          p_asesora_id?: string
          p_autorizado_por?: string
          p_cliente_id?: string
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_codigo_descuento?: string
          p_descuento_pct?: number
          p_emisor?: string
          p_items: Json
          p_motivo_descuento?: string
          p_nota?: string
          p_pagos: Json
          p_tipo_comprobante?: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      resolver_prenda_danada: {
        Args: {
          p_estado: string
          p_id: string
          p_nota?: string
          p_proveedor_id?: string
        }
        Returns: undefined
      }
      resumen_compras: {
        Args: never
        Returns: {
          con_saldo: number
          deuda: number
          por_recibir: number
          por_recibir_atrasadas: number
          por_vencer: number
          por_vencer_monto: number
          registradas: number
          vencidas: number
          vencido: number
          vigentes: number
        }[]
      }
      resumen_compras_extra: {
        Args: never
        Returns: {
          compras_mes: number
          compras_mes_anterior: number
          dias_mas_atrasada: number
          documento_mas_atrasada: string
          igv_mes: number
          proveedor_mas_atrasado: string
          top_proveedor_id: string
          top_proveedor_nombre: string
          top_proveedor_pct: number
          unidades_pendientes: number
          valor_por_recibir: number
        }[]
      }
      resumen_recepciones: {
        Args: { p_desde?: string }
        Returns: {
          comprobantes_recibidos: number
          dias_entrega_promedio: number
          entregas_completas: number
          faltante_comprobantes: number
          faltante_unidades: number
          recepciones: number
          unidades_recibidas: number
        }[]
      }
      resumen_sin_comprobante: {
        Args: { p_ubicacion_id?: string }
        Returns: {
          recepciones_mes: number
          ultima_recepcion: string
          ultima_ubicacion: string
          unidades_mes: number
          unidades_sin_costo_mes: number
        }[]
      }
      revertir_produccion: {
        Args: { p_produccion_id: string }
        Returns: undefined
      }
      revisar_apertura_caja: { Args: { p_caja_id: string }; Returns: undefined }
      revisar_producto_censo: {
        Args: { p_aprobar: boolean; p_producto_id: string }
        Returns: undefined
      }
      salidas_caja_30d: {
        Args: never
        Returns: {
          comprobantes: number
          desde: string
          es_vencido: boolean
          etiqueta: string
          hasta: string
          monto: number
          orden: number
        }[]
      }
      set_etapa_produccion: {
        Args: { p_estado: string; p_etapa: string; p_produccion_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  retail: {
    Enums: {},
  },
} as const

