export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          request_id: string | null
          request_method: string | null
          request_path: string | null
          request_user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          request_id?: string | null
          request_method?: string | null
          request_path?: string | null
          request_user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          request_id?: string | null
          request_method?: string | null
          request_path?: string | null
          request_user_agent?: string | null
        }
        Relationships: []
      }
      bundle_items: {
        Row: {
          bundle_id: number
          product_id: number
          quantity: number
          sort_order: number
        }
        Insert: {
          bundle_id: number
          product_id: number
          quantity?: number
          sort_order?: number
        }
        Update: {
          bundle_id?: number
          product_id?: number
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          active: boolean
          availability_override:
            | Database["public"]["Enums"]["availability_override"]
            | null
          compare_at_price_cents: number
          created_at: string
          description: string
          ends_at: string | null
          eyebrow: string
          hero_product_id: number
          id: number
          media_asset_id: number | null
          price_cents: number
          slug: string
          sort_order: number
          starts_at: string | null
          title_line_one: string
          title_line_two: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          availability_override?:
            | Database["public"]["Enums"]["availability_override"]
            | null
          compare_at_price_cents: number
          created_at?: string
          description: string
          ends_at?: string | null
          eyebrow: string
          hero_product_id: number
          id?: never
          media_asset_id?: number | null
          price_cents: number
          slug: string
          sort_order?: number
          starts_at?: string | null
          title_line_one: string
          title_line_two: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          availability_override?:
            | Database["public"]["Enums"]["availability_override"]
            | null
          compare_at_price_cents?: number
          created_at?: string
          description?: string
          ends_at?: string | null
          eyebrow?: string
          hero_product_id?: number
          id?: never
          media_asset_id?: number | null
          price_cents?: number
          slug?: string
          sort_order?: number
          starts_at?: string | null
          title_line_one?: string
          title_line_two?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundles_hero_product_id_fkey"
            columns: ["hero_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: number
          media_asset_id: number | null
          name: string
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          tagline: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          id?: never
          media_asset_id?: number | null
          name: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          tagline: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: never
          media_asset_id?: number | null
          name?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          tagline?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pages: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          excerpt: string | null
          format: Database["public"]["Enums"]["content_format"]
          id: number
          markdown_source: string
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          excerpt?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          id?: never
          markdown_source: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          excerpt?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          id?: never
          markdown_source?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_bundles: {
        Row: {
          bundle_id: number
          coupon_id: number
        }
        Insert: {
          bundle_id: number
          coupon_id: number
        }
        Update: {
          bundle_id?: number
          coupon_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_bundles_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_categories: {
        Row: {
          category_id: number
          coupon_id: number
        }
        Insert: {
          category_id: number
          coupon_id: number
        }
        Update: {
          category_id?: number
          coupon_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_categories_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_products: {
        Row: {
          coupon_id: number
          product_id: number
        }
        Insert: {
          coupon_id: number
          product_id: number
        }
        Update: {
          coupon_id?: number
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_products_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: number
          customer_id: string | null
          discount_cents: number
          email_normalized: string
          id: number
          order_id: number
          redeemed_at: string
        }
        Insert: {
          coupon_id: number
          customer_id?: string | null
          discount_cents: number
          email_normalized: string
          id?: never
          order_id: number
          redeemed_at?: string
        }
        Update: {
          coupon_id?: number
          customer_id?: string | null
          discount_cents?: number
          email_normalized?: string
          id?: never
          order_id?: number
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          disabled_at: string | null
          discount_kind: Database["public"]["Enums"]["discount_kind"]
          discount_value: number
          expires_at: string | null
          first_purchase_only: boolean
          free_shipping: boolean
          id: number
          maximum_discount_cents: number | null
          minimum_subtotal_cents: number
          per_customer_limit: number | null
          starts_at: string | null
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          disabled_at?: string | null
          discount_kind: Database["public"]["Enums"]["discount_kind"]
          discount_value: number
          expires_at?: string | null
          first_purchase_only?: boolean
          free_shipping?: boolean
          id?: never
          maximum_discount_cents?: number | null
          minimum_subtotal_cents?: number
          per_customer_limit?: number | null
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          disabled_at?: string | null
          discount_kind?: Database["public"]["Enums"]["discount_kind"]
          discount_value?: number
          expires_at?: string | null
          first_purchase_only?: boolean
          free_shipping?: boolean
          id?: never
          maximum_discount_cents?: number | null
          minimum_subtotal_cents?: number
          per_customer_limit?: number | null
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          city: string
          country_code: string
          created_at: string
          customer_id: string
          id: number
          is_default: boolean
          label: string
          line_one: string
          line_two: string | null
          postal_code: string
          province: string
          recipient_name: string
          updated_at: string
        }
        Insert: {
          city: string
          country_code?: string
          created_at?: string
          customer_id: string
          id?: never
          is_default?: boolean
          label: string
          line_one: string
          line_two?: string | null
          postal_code: string
          province: string
          recipient_name: string
          updated_at?: string
        }
        Update: {
          city?: string
          country_code?: string
          created_at?: string
          customer_id?: string
          id?: never
          is_default?: boolean
          label?: string
          line_one?: string
          line_two?: string | null
          postal_code?: string
          province?: string
          recipient_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      footer_columns: {
        Row: {
          active: boolean
          column_key: string
          created_at: string
          ends_at: string | null
          id: number
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          column_key: string
          created_at?: string
          ends_at?: string | null
          id?: never
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          sort_order: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          column_key?: string
          created_at?: string
          ends_at?: string | null
          id?: never
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      footer_items: {
        Row: {
          active: boolean
          column_id: number
          created_at: string
          href: string
          id: number
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          column_id: number
          created_at?: string
          href: string
          id?: never
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          column_id?: number
          created_at?: string
          href?: string
          id?: never
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "footer_items_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "footer_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_section_bundles: {
        Row: {
          bundle_id: number
          section_id: number
          sort_order: number
        }
        Insert: {
          bundle_id: number
          section_id: number
          sort_order: number
        }
        Update: {
          bundle_id?: number
          section_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_bundles_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_section_categories: {
        Row: {
          category_id: number
          section_id: number
          sort_order: number
        }
        Insert: {
          category_id: number
          section_id: number
          sort_order: number
        }
        Update: {
          category_id?: number
          section_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_categories_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_section_products: {
        Row: {
          product_id: number
          section_id: number
          sort_order: number
        }
        Insert: {
          product_id: number
          section_id: number
          sort_order: number
        }
        Update: {
          product_id?: number
          section_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_products_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          active: boolean
          created_at: string
          cta_href: string | null
          cta_label: string | null
          description: string | null
          desktop_media_asset_id: number | null
          ends_at: string | null
          eyebrow: string | null
          id: number
          mobile_media_asset_id: number | null
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          section_key: string
          section_type: Database["public"]["Enums"]["homepage_section_type"]
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          description?: string | null
          desktop_media_asset_id?: number | null
          ends_at?: string | null
          eyebrow?: string | null
          id?: never
          mobile_media_asset_id?: number | null
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          section_key: string
          section_type: Database["public"]["Enums"]["homepage_section_type"]
          sort_order: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          description?: string | null
          desktop_media_asset_id?: number | null
          ends_at?: string | null
          eyebrow?: string | null
          id?: never
          mobile_media_asset_id?: number | null
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          section_key?: string
          section_type?: Database["public"]["Enums"]["homepage_section_type"]
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_sections_desktop_media_asset_id_fkey"
            columns: ["desktop_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_sections_mobile_media_asset_id_fkey"
            columns: ["mobile_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: number | null
          product_id: number
          reason: Database["public"]["Enums"]["inventory_reason"]
          stock_after: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          order_id?: number | null
          product_id: number
          reason: Database["public"]["Enums"]["inventory_reason"]
          stock_after: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          order_id?: number | null
          product_id?: number
          reason?: Database["public"]["Enums"]["inventory_reason"]
          stock_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string
          bucket_id: string
          byte_size: number
          created_at: string
          failure_code: string | null
          height: number
          id: number
          mime_type: string
          object_path: string
          original_filename: string
          ready_at: string | null
          status: Database["public"]["Enums"]["media_asset_status"]
          updated_at: string
          uploaded_by: string
          width: number
        }
        Insert: {
          alt_text: string
          bucket_id?: string
          byte_size: number
          created_at?: string
          failure_code?: string | null
          height: number
          id?: never
          mime_type: string
          object_path: string
          original_filename: string
          ready_at?: string | null
          status?: Database["public"]["Enums"]["media_asset_status"]
          updated_at?: string
          uploaded_by: string
          width: number
        }
        Update: {
          alt_text?: string
          bucket_id?: string
          byte_size?: number
          created_at?: string
          failure_code?: string | null
          height?: number
          id?: never
          mime_type?: string
          object_path?: string
          original_filename?: string
          ready_at?: string | null
          status?: Database["public"]["Enums"]["media_asset_status"]
          updated_at?: string
          uploaded_by?: string
          width?: number
        }
        Relationships: []
      }
      navigation_items: {
        Row: {
          active: boolean
          created_at: string
          href: string
          id: number
          label: string
          menu_id: number
          parent_id: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          href: string
          id?: never
          label: string
          menu_id: number
          parent_id?: number | null
          sort_order: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          href?: string
          id?: never
          label?: string
          menu_id?: number
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "navigation_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "navigation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_menus: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          id: number
          label: string
          menu_key: string
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: never
          label: string
          menu_key: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: never
          label?: string
          menu_key?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_enablement_checks: {
        Row: {
          evidence: string | null
          key: string
          label: string
          status: Database["public"]["Enums"]["enablement_check_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          evidence?: string | null
          key: string
          label: string
          status?: Database["public"]["Enums"]["enablement_check_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          evidence?: string | null
          key?: string
          label?: string
          status?: Database["public"]["Enums"]["enablement_check_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: number
          image_src_snapshot: string
          line_total_cents: number
          order_id: number
          product_id: number | null
          product_name_snapshot: string
          quantity: number
          reservation_kind: string
          sku_snapshot: string
          unit_price_cents: number
        }
        Insert: {
          id?: never
          image_src_snapshot: string
          line_total_cents: number
          order_id: number
          product_id?: number | null
          product_name_snapshot: string
          quantity: number
          reservation_kind?: string
          sku_snapshot: string
          unit_price_cents: number
        }
        Update: {
          id?: never
          image_src_snapshot?: string
          line_total_cents?: number
          order_id?: number
          product_id?: number | null
          product_name_snapshot?: string
          quantity?: number
          reservation_kind?: string
          sku_snapshot?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          author_user_id: string | null
          created_at: string
          id: number
          note: string
          order_id: number
        }
        Insert: {
          author_user_id?: string | null
          created_at?: string
          id?: never
          note: string
          order_id: number
        }
        Update: {
          author_user_id?: string | null
          created_at?: string
          id?: never
          note?: string
          order_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          note: string | null
          order_id: number
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          note?: string | null
          order_id: number
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          note?: string | null
          order_id?: number
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address_snapshot: Json
          coupon_code: string | null
          created_at: string
          currency: string
          customer_id: string | null
          delivered_at: string | null
          discount_cents: number
          email: string
          id: number
          idempotency_key: string
          notes: string | null
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          refund_amount_cents: number | null
          refund_prepared_at: string | null
          refund_reason: string | null
          shipped_at: string | null
          shipping_address_snapshot: Json
          shipping_cents: number
          shipping_method_code: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tracking_carrier: string | null
          tracking_code: string | null
          tracking_url: string | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          billing_address_snapshot: Json
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          discount_cents?: number
          email: string
          id?: never
          idempotency_key: string
          notes?: string | null
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          refund_amount_cents?: number | null
          refund_prepared_at?: string | null
          refund_reason?: string | null
          shipped_at?: string | null
          shipping_address_snapshot: Json
          shipping_cents: number
          shipping_method_code: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tracking_carrier?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          total_cents: number
          updated_at?: string
        }
        Update: {
          billing_address_snapshot?: Json
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          discount_cents?: number
          email?: string
          id?: never
          idempotency_key?: string
          notes?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          refund_amount_cents?: number | null
          refund_prepared_at?: string | null
          refund_reason?: string | null
          shipped_at?: string | null
          shipping_address_snapshot?: Json
          shipping_cents?: number
          shipping_method_code?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tracking_carrier?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          total_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_box_contents: {
        Row: {
          content: string
          id: number
          product_id: number
          sort_order: number
        }
        Insert: {
          content: string
          id?: never
          product_id: number
          sort_order?: number
        }
        Update: {
          content?: string
          id?: never
          product_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_box_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          description: string
          id: number
          product_id: number
          sort_order: number
          title: string
        }
        Insert: {
          description: string
          id?: never
          product_id: number
          sort_order?: number
          title: string
        }
        Update: {
          description?: string
          id?: never
          product_id?: number
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string
          height: number
          id: number
          is_primary: boolean
          media_asset_id: number | null
          product_id: number
          published: boolean
          sort_order: number
          src: string
          width: number
        }
        Insert: {
          alt: string
          height: number
          id?: never
          is_primary?: boolean
          media_asset_id?: number | null
          product_id: number
          published?: boolean
          sort_order?: number
          src: string
          width: number
        }
        Update: {
          alt?: string
          height?: number
          id?: never
          is_primary?: boolean
          media_asset_id?: number | null
          product_id?: number
          published?: boolean
          sort_order?: number
          src?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relations: {
        Row: {
          product_id: number
          related_product_id: number
          relation_type: Database["public"]["Enums"]["product_relation_type"]
          sort_order: number
        }
        Insert: {
          product_id: number
          related_product_id: number
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
        }
        Update: {
          product_id?: number
          related_product_id?: number
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_specs: {
        Row: {
          id: number
          label: string
          product_id: number
          sort_order: number
          value: string
        }
        Insert: {
          id?: never
          label: string
          product_id: number
          sort_order?: number
          value: string
        }
        Update: {
          id?: never
          label?: string
          product_id?: number
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_specs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: number
          tag: Database["public"]["Enums"]["promo_tag"]
        }
        Insert: {
          product_id: number
          tag: Database["public"]["Enums"]["promo_tag"]
        }
        Update: {
          product_id?: number
          tag?: Database["public"]["Enums"]["promo_tag"]
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          allow_backorder: boolean
          availability_override:
            | Database["public"]["Enums"]["availability_override"]
            | null
          blade_type: Database["public"]["Enums"]["blade_type"] | null
          category_id: number
          compare_at_price_cents: number | null
          created_at: string
          currency: string
          description: string
          id: number
          is_low_stock: boolean
          is_purchasable: boolean | null
          low_stock_threshold: number
          manage_stock: boolean
          name: string
          preorder_allocation: number
          preorder_release_date: string | null
          price_cents: number
          publication_status: Database["public"]["Enums"]["publication_status"]
          rating: number
          review_count: number
          seo_description: string | null
          seo_title: string | null
          short_name: string | null
          sku: string
          slug: string
          sort_order: number
          stock_quantity: number
          stock_status: Database["public"]["Enums"]["stock_status"]
          tagline: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_backorder?: boolean
          availability_override?:
            | Database["public"]["Enums"]["availability_override"]
            | null
          blade_type?: Database["public"]["Enums"]["blade_type"] | null
          category_id: number
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          description: string
          id?: never
          is_low_stock?: boolean
          is_purchasable?: boolean | null
          low_stock_threshold?: number
          manage_stock?: boolean
          name: string
          preorder_allocation?: number
          preorder_release_date?: string | null
          price_cents: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          rating?: number
          review_count?: number
          seo_description?: string | null
          seo_title?: string | null
          short_name?: string | null
          sku: string
          slug: string
          sort_order?: number
          stock_quantity?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          tagline: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_backorder?: boolean
          availability_override?:
            | Database["public"]["Enums"]["availability_override"]
            | null
          blade_type?: Database["public"]["Enums"]["blade_type"] | null
          category_id?: number
          compare_at_price_cents?: number | null
          created_at?: string
          currency?: string
          description?: string
          id?: never
          is_low_stock?: boolean
          is_purchasable?: boolean | null
          low_stock_threshold?: number
          manage_stock?: boolean
          name?: string
          preorder_allocation?: number
          preorder_release_date?: string | null
          price_cents?: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          rating?: number
          review_count?: number
          seo_description?: string | null
          seo_title?: string | null
          short_name?: string | null
          sku?: string
          slug?: string
          sort_order?: number
          stock_quantity?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          tagline?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_bundles: {
        Row: {
          bundle_id: number
          promotion_id: number
        }
        Insert: {
          bundle_id: number
          promotion_id: number
        }
        Update: {
          bundle_id?: number
          promotion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_bundles_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_categories: {
        Row: {
          category_id: number
          promotion_id: number
        }
        Insert: {
          category_id: number
          promotion_id: number
        }
        Update: {
          category_id?: number
          promotion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_categories_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_products: {
        Row: {
          product_id: number
          promotion_id: number
        }
        Insert: {
          product_id: number
          promotion_id: number
        }
        Update: {
          product_id?: number
          promotion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_products_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          discount_kind: Database["public"]["Enums"]["promotion_discount_kind"]
          discount_value: number
          ends_at: string | null
          id: number
          minimum_quantity: number
          minimum_subtotal_cents: number
          name: string
          priority: number
          stackable: boolean
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_kind: Database["public"]["Enums"]["promotion_discount_kind"]
          discount_value: number
          ends_at?: string | null
          id?: never
          minimum_quantity?: number
          minimum_subtotal_cents?: number
          name: string
          priority?: number
          stackable?: boolean
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          discount_kind?: Database["public"]["Enums"]["promotion_discount_kind"]
          discount_value?: number
          ends_at?: string | null
          id?: never
          minimum_quantity?: number
          minimum_subtotal_cents?: number
          name?: string
          priority?: number
          stackable?: boolean
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shipping_methods: {
        Row: {
          active: boolean
          code: string
          description: string | null
          enabled_country_codes: string[]
          estimate_max_days: number
          estimate_min_days: number
          free_from_cents: number | null
          id: number
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          description?: string | null
          enabled_country_codes?: string[]
          estimate_max_days?: number
          estimate_min_days?: number
          free_from_cents?: number | null
          id?: never
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          description?: string | null
          enabled_country_codes?: string[]
          estimate_max_days?: number
          estimate_min_days?: number
          free_from_cents?: number | null
          id?: never
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          accept_orders: boolean
          city: string | null
          country_code: string
          currency: string
          default_og_image_url: string | null
          default_seo_description: string | null
          default_seo_title: string
          facebook_url: string | null
          instagram_url: string | null
          legal_name: string
          legal_notice: string | null
          maintenance_message: string | null
          maintenance_mode: boolean
          max_quantity_per_line: number
          postal_code: string | null
          singleton: boolean
          store_name: string
          street_address: string | null
          support_email: string | null
          support_phone: string | null
          tax_code: string | null
          tiktok_url: string | null
          updated_at: string
          updated_by: string | null
          upload_max_bytes: number
          vat_number: string | null
          youtube_url: string | null
        }
        Insert: {
          accept_orders?: boolean
          city?: string | null
          country_code?: string
          currency?: string
          default_og_image_url?: string | null
          default_seo_description?: string | null
          default_seo_title?: string
          facebook_url?: string | null
          instagram_url?: string | null
          legal_name?: string
          legal_notice?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          max_quantity_per_line?: number
          postal_code?: string | null
          singleton?: boolean
          store_name?: string
          street_address?: string | null
          support_email?: string | null
          support_phone?: string | null
          tax_code?: string | null
          tiktok_url?: string | null
          updated_at?: string
          updated_by?: string | null
          upload_max_bytes?: number
          vat_number?: string | null
          youtube_url?: string | null
        }
        Update: {
          accept_orders?: boolean
          city?: string | null
          country_code?: string
          currency?: string
          default_og_image_url?: string | null
          default_seo_description?: string | null
          default_seo_title?: string
          facebook_url?: string | null
          instagram_url?: string | null
          legal_name?: string
          legal_notice?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          max_quantity_per_line?: number
          postal_code?: string | null
          singleton?: boolean
          store_name?: string
          street_address?: string | null
          support_email?: string | null
          support_phone?: string | null
          tax_code?: string | null
          tiktok_url?: string | null
          updated_at?: string
          updated_by?: string | null
          upload_max_bytes?: number
          vat_number?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      social_links: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          href: string
          id: number
          label: string
          platform_key: string
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          sort_order: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          href: string
          id?: never
          label: string
          platform_key: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          sort_order: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          href?: string
          id?: never
          label?: string
          platform_key?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          accepted_at: string | null
          active: boolean
          created_at: string
          created_by: string | null
          display_name: string
          invite_email: string | null
          invite_status: Database["public"]["Enums"]["staff_invite_status"]
          invited_at: string | null
          last_login_at: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          display_name: string
          invite_email?: string | null
          invite_status?: Database["public"]["Enums"]["staff_invite_status"]
          invited_at?: string | null
          last_login_at?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string
          invite_email?: string | null
          invite_status?: Database["public"]["Enums"]["staff_invite_status"]
          invited_at?: string | null
          last_login_at?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_order_note: {
        Args: { p_note: string; p_order_id: number }
        Returns: number
      }
      adjust_inventory: {
        Args: {
          p_delta: number
          p_note?: string
          p_reason: Database["public"]["Enums"]["inventory_reason"]
          p_sku: string
        }
        Returns: number
      }
      begin_media_delete: {
        Args: { p_media_asset_id: number }
        Returns: string
      }
      bulk_update_products: {
        Args: {
          p_category_id?: number
          p_operation: string
          p_product_ids: number[]
        }
        Returns: number
      }
      calculate_cart_pricing: {
        Args: {
          p_coupon_code?: string
          p_customer_id?: string
          p_lines: Json
          p_shipping_code?: string
        }
        Returns: Json
      }
      cancel_order_and_restore_stock: {
        Args: { p_note?: string; p_order_id: number }
        Returns: undefined
      }
      change_staff_role: {
        Args: {
          p_role: Database["public"]["Enums"]["staff_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      complete_media_delete: {
        Args: { p_media_asset_id: number }
        Returns: undefined
      }
      create_order: {
        Args: {
          p_billing_address: Json
          p_coupon_code: string
          p_email: string
          p_idempotency_key: string
          p_lines: Json
          p_phone: string
          p_shipping_address: Json
          p_shipping_code: string
        }
        Returns: number
      }
      delete_product_permanently: {
        Args: { p_expected_name: string; p_product_id: number }
        Returns: undefined
      }
      duplicate_product_draft: {
        Args: {
          p_name: string
          p_sku: string
          p_slug: string
          p_source_product_id: number
        }
        Returns: number
      }
      fail_media_upload: {
        Args: { p_failure_code: string; p_media_asset_id: number }
        Returns: undefined
      }
      finalize_media_upload: {
        Args: {
          p_byte_size: number
          p_height: number
          p_media_asset_id: number
          p_mime_type: string
          p_width: number
        }
        Returns: undefined
      }
      get_admin_dashboard_metrics: { Args: never; Returns: Json }
      prepare_order_refund: {
        Args: { p_amount_cents: number; p_order_id: number; p_reason: string }
        Returns: undefined
      }
      product_deletion_impact: { Args: { p_product_id: number }; Returns: Json }
      publish_homepage_section: {
        Args: { p_section_id: number }
        Returns: undefined
      }
      record_completed_media_storage_mutation: {
        Args: { p_object_path: string; p_operation: string }
        Returns: number
      }
      reorder_categories: {
        Args: { p_category_ids: number[] }
        Returns: undefined
      }
      reorder_homepage_sections: {
        Args: { p_section_ids: number[] }
        Returns: undefined
      }
      reorder_product_images: {
        Args: { p_image_ids: number[]; p_product_id: number }
        Returns: undefined
      }
      replace_product_details: {
        Args: {
          p_box_contents: Json
          p_features: Json
          p_product_id: number
          p_specs: Json
        }
        Returns: undefined
      }
      revoke_staff_access: { Args: { p_user_id: string }; Returns: undefined }
      save_bundle_with_items: {
        Args: { p_bundle: Json; p_items: Json }
        Returns: number
      }
      save_homepage_section: {
        Args: { p_section: Json; p_target_ids: number[] }
        Returns: number
      }
      save_navigation_tree: { Args: { p_tree: Json }; Returns: number }
      set_order_acceptance: {
        Args: { p_confirmation: string; p_enabled: boolean }
        Returns: undefined
      }
      set_order_tracking: {
        Args: {
          p_carrier: string
          p_code: string
          p_order_id: number
          p_url?: string
        }
        Returns: undefined
      }
      set_primary_product_image: {
        Args: { p_image_id: number; p_product_id: number }
        Returns: undefined
      }
      set_staff_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: undefined
      }
      swap_media_asset_associations: {
        Args: { p_new_media_asset_id: number; p_old_media_asset_id: number }
        Returns: Json
      }
      transition_order_status: {
        Args: {
          p_note?: string
          p_order_id: number
          p_to_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      availability_override: "preorder" | "incoming"
      blade_type: "attacco" | "difesa" | "stamina" | "bilanciato"
      content_format: "markdown"
      discount_kind: "percentage" | "fixed"
      enablement_check_status: "pending" | "passed" | "failed"
      homepage_section_type:
        | "hero"
        | "announcement"
        | "featured_products"
        | "latest_drops"
        | "categories"
        | "competitive_products"
        | "bestsellers"
        | "new_arrivals"
        | "offers"
        | "bundle"
        | "club"
        | "status_legend"
        | "trust"
        | "newsletter"
        | "promo_banner"
        | "rich_text"
        | "cta"
      inventory_reason:
        | "initial"
        | "manual_adjustment"
        | "order_reserved"
        | "order_cancelled"
        | "return"
        | "damage"
      media_asset_status: "pending" | "ready" | "failed"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "completed"
        | "cancelled"
      payment_status: "pending" | "authorized" | "paid" | "failed" | "refunded"
      product_relation_type: "related" | "upsell" | "cross_sell" | "compatible"
      promo_tag: "novita" | "offerta" | "limited" | "esclusiva"
      promotion_discount_kind: "percentage" | "fixed" | "promotional_price"
      publication_status: "draft" | "published" | "archived"
      staff_invite_status: "invited" | "active" | "revoked"
      staff_role: "owner" | "admin" | "editor"
      stock_status: "disponibile" | "in-arrivo" | "pre-ordine" | "esaurito"
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
  public: {
    Enums: {
      availability_override: ["preorder", "incoming"],
      blade_type: ["attacco", "difesa", "stamina", "bilanciato"],
      content_format: ["markdown"],
      discount_kind: ["percentage", "fixed"],
      enablement_check_status: ["pending", "passed", "failed"],
      homepage_section_type: [
        "hero",
        "announcement",
        "featured_products",
        "latest_drops",
        "categories",
        "competitive_products",
        "bestsellers",
        "new_arrivals",
        "offers",
        "bundle",
        "club",
        "status_legend",
        "trust",
        "newsletter",
        "promo_banner",
        "rich_text",
        "cta",
      ],
      inventory_reason: [
        "initial",
        "manual_adjustment",
        "order_reserved",
        "order_cancelled",
        "return",
        "damage",
      ],
      media_asset_status: ["pending", "ready", "failed"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "completed",
        "cancelled",
      ],
      payment_status: ["pending", "authorized", "paid", "failed", "refunded"],
      product_relation_type: ["related", "upsell", "cross_sell", "compatible"],
      promo_tag: ["novita", "offerta", "limited", "esclusiva"],
      promotion_discount_kind: ["percentage", "fixed", "promotional_price"],
      publication_status: ["draft", "published", "archived"],
      staff_invite_status: ["invited", "active", "revoked"],
      staff_role: ["owner", "admin", "editor"],
      stock_status: ["disponibile", "in-arrivo", "pre-ordine", "esaurito"],
    },
  },
} as const
