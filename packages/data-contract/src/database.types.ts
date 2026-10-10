export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  management_api: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      list_management_features: {
        Args: { p_organization_id: number }
        Returns: {
          enabled: boolean
          feature: Database["public"]["Enums"]["management_feature"]
          updated_at: string
        }[]
      }
      set_management_read_access: {
        Args: {
          p_enabled: boolean
          p_expected_updated_at: string
          p_organization_id: number
          p_reason: string
        }
        Returns: Database["public"]["Tables"]["organization_management_features"]["Row"]
        SetofOptions: {
          from: "*"
          to: "organization_management_features"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent: string
          cost_estimate_cents: number
          error: string | null
          finished_at: string | null
          id: number
          input_tokens: number
          models: string[]
          organization_id: number
          output_tokens: number
          requested_by: string | null
          started_at: string
          status: string
          summary: string | null
          web_searches: number
        }
        Insert: {
          agent: string
          cost_estimate_cents?: number
          error?: string | null
          finished_at?: string | null
          id?: never
          input_tokens?: number
          models?: string[]
          organization_id: number
          output_tokens?: number
          requested_by?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          web_searches?: number
        }
        Update: {
          agent?: string
          cost_estimate_cents?: number
          error?: string | null
          finished_at?: string | null
          id?: never
          input_tokens?: number
          models?: string[]
          organization_id?: number
          output_tokens?: number
          requested_by?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          web_searches?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          organization_id: number | null
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
          organization_id?: number | null
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
          organization_id?: number | null
          request_id?: string | null
          request_method?: string | null
          request_path?: string | null
          request_user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: number
          organization_id: number
          product_id: number
          quantity: number
          sort_order: number
        }
        Insert: {
          bundle_id: number
          organization_id: number
          product_id: number
          quantity?: number
          sort_order?: number
        }
        Update: {
          bundle_id?: number
          organization_id?: number
          product_id?: number
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bundle_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
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
            columns: ["hero_product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "bundles_hero_product_id_fkey"
            columns: ["hero_product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bundles_media_asset_id_fkey"
            columns: ["media_asset_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bundles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
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
            columns: ["media_asset_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
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
        Relationships: [
          {
            foreignKeyName: "content_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_bundles: {
        Row: {
          bundle_id: number
          coupon_id: number
          organization_id: number
        }
        Insert: {
          bundle_id: number
          coupon_id: number
          organization_id: number
        }
        Update: {
          bundle_id?: number
          coupon_id?: number
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_bundles_bundle_id_fkey"
            columns: ["bundle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_bundles_coupon_id_fkey"
            columns: ["coupon_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_bundles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_categories: {
        Row: {
          category_id: number
          coupon_id: number
          organization_id: number
        }
        Insert: {
          category_id: number
          coupon_id: number
          organization_id: number
        }
        Update: {
          category_id?: number
          coupon_id?: number
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_categories_category_id_fkey"
            columns: ["category_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_categories_coupon_id_fkey"
            columns: ["coupon_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_products: {
        Row: {
          coupon_id: number
          organization_id: number
          product_id: number
        }
        Insert: {
          coupon_id: number
          organization_id: number
          product_id: number
        }
        Update: {
          coupon_id?: number
          organization_id?: number
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_products_coupon_id_fkey"
            columns: ["coupon_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_products_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_products_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
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
          organization_id: number
          redeemed_at: string
        }
        Insert: {
          coupon_id: number
          customer_id?: string | null
          discount_cents: number
          email_normalized: string
          id?: never
          order_id: number
          organization_id: number
          redeemed_at?: string
        }
        Update: {
          coupon_id?: number
          customer_id?: string | null
          discount_cents?: number
          email_normalized?: string
          id?: never
          order_id?: number
          organization_id?: number
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "order_profit"
            referencedColumns: ["order_id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          per_customer_limit?: number | null
          starts_at?: string | null
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: number
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          organization_id: number
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          organization_id?: number
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      footer_columns: {
        Row: {
          active: boolean
          column_key: string
          created_at: string
          ends_at: string | null
          id: number
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "footer_columns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: number
          section_id: number
          sort_order: number
        }
        Insert: {
          bundle_id: number
          organization_id: number
          section_id: number
          sort_order: number
        }
        Update: {
          bundle_id?: number
          organization_id?: number
          section_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_bundles_bundle_id_fkey"
            columns: ["bundle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "homepage_section_bundles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_bundles_section_id_fkey"
            columns: ["section_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      homepage_section_categories: {
        Row: {
          category_id: number
          organization_id: number
          section_id: number
          sort_order: number
        }
        Insert: {
          category_id: number
          organization_id: number
          section_id: number
          sort_order: number
        }
        Update: {
          category_id?: number
          organization_id?: number
          section_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_categories_category_id_fkey"
            columns: ["category_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "homepage_section_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_categories_section_id_fkey"
            columns: ["section_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      homepage_section_products: {
        Row: {
          organization_id: number
          product_id: number
          section_id: number
          sort_order: number
        }
        Insert: {
          organization_id: number
          product_id: number
          section_id: number
          sort_order: number
        }
        Update: {
          organization_id?: number
          product_id?: number
          section_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_section_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_section_products_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "homepage_section_products_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "homepage_section_products_section_id_fkey"
            columns: ["section_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id", "organization_id"]
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
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
            columns: ["desktop_media_asset_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "homepage_sections_mobile_media_asset_id_fkey"
            columns: ["mobile_media_asset_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "homepage_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_cost_state: {
        Row: {
          average_cost_cents: number
          last_cost_cents: number | null
          last_receipt_id: number | null
          organization_id: number
          product_id: number
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          average_cost_cents: number
          last_cost_cents?: number | null
          last_receipt_id?: number | null
          organization_id: number
          product_id: number
          source: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          average_cost_cents?: number
          last_cost_cents?: number | null
          last_receipt_id?: number | null
          organization_id?: number
          product_id?: number
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_cost_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_cost_state_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_cost_state_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_cost_state_receipt_fkey"
            columns: ["last_receipt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_receipts"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      inventory_movement_costs: {
        Row: {
          movement_id: number
          source: string
          unit_cost_cents: number
          valued_at: string
        }
        Insert: {
          movement_id: number
          source: string
          unit_cost_cents: number
          valued_at?: string
        }
        Update: {
          movement_id?: number
          source?: string
          unit_cost_cents?: number
          valued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movement_costs_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: true
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_user_id: string | null
          balance_after: number | null
          balance_kind: string
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: number | null
          organization_id: number
          product_id: number
          reason: Database["public"]["Enums"]["inventory_reason"]
          receipt_line_id: number | null
          stock_after: number
        }
        Insert: {
          actor_user_id?: string | null
          balance_after?: number | null
          balance_kind?: string
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          order_id?: number | null
          organization_id: number
          product_id: number
          reason: Database["public"]["Enums"]["inventory_reason"]
          receipt_line_id?: number | null
          stock_after: number
        }
        Update: {
          actor_user_id?: string | null
          balance_after?: number | null
          balance_kind?: string
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          order_id?: number | null
          organization_id?: number
          product_id?: number
          reason?: Database["public"]["Enums"]["inventory_reason"]
          receipt_line_id?: number | null
          stock_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "order_profit"
            referencedColumns: ["order_id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inventory_movements_receipt_line_fkey"
            columns: ["receipt_line_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_receipt_lines"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      market_observations: {
        Row: {
          agent_run_id: number
          availability: string | null
          currency: string
          id: number
          item_condition: string | null
          notes: string | null
          observed_at: string
          organization_id: number
          price_cents: number | null
          product_id: number | null
          source_domain: string
          title: string
          url: string
        }
        Insert: {
          agent_run_id: number
          availability?: string | null
          currency?: string
          id?: never
          item_condition?: string | null
          notes?: string | null
          observed_at?: string
          organization_id: number
          price_cents?: number | null
          product_id?: number | null
          source_domain: string
          title: string
          url: string
        }
        Update: {
          agent_run_id?: number
          availability?: string | null
          currency?: string
          id?: never
          item_condition?: string | null
          notes?: string | null
          observed_at?: string
          organization_id?: number
          price_cents?: number | null
          product_id?: number | null
          source_domain?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_observations_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "market_observations_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "market_observations_run_fkey"
            columns: ["agent_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      market_sources: {
        Row: {
          active: boolean
          created_at: string
          domain: string
          id: number
          kind: string
          name: string
          notes: string | null
          organization_id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain: string
          id?: never
          kind: string
          name: string
          notes?: string | null
          organization_id: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string
          id?: never
          kind?: string
          name?: string
          notes?: string | null
          organization_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          original_filename?: string
          ready_at?: string | null
          status?: Database["public"]["Enums"]["media_asset_status"]
          updated_at?: string
          uploaded_by?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_rankings: {
        Row: {
          archetype: string
          created_at: string
          id: number
          piece_name: string
          product_slug: string | null
          rank: number
          reason: string
          snapshot_id: number
          tier_type: string
          trend: string | null
          video_url: string | null
        }
        Insert: {
          archetype: string
          created_at?: string
          id?: never
          piece_name: string
          product_slug?: string | null
          rank: number
          reason: string
          snapshot_id: number
          tier_type: string
          trend?: string | null
          video_url?: string | null
        }
        Update: {
          archetype?: string
          created_at?: string
          id?: never
          piece_name?: string
          product_slug?: string | null
          rank?: number
          reason?: string
          snapshot_id?: number
          tier_type?: string
          trend?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_rankings_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "meta_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_snapshots: {
        Row: {
          active: boolean
          created_at: string
          id: number
          intro: string | null
          month: string
          organization_id: number
          publication_status: Database["public"]["Enums"]["publication_status"]
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          source_note: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: never
          intro?: string | null
          month: string
          organization_id: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          source_note: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: never
          intro?: string | null
          month?: string
          organization_id?: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          source_note?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_videos: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: number
          organization_id: number
          sort_order: number
          title: string
          updated_at: string
          youtube_url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: never
          organization_id: number
          sort_order?: number
          title: string
          updated_at?: string
          youtube_url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: never
          organization_id?: number
          sort_order?: number
          title?: string
          updated_at?: string
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_videos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_menus_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_enablement_checks: {
        Row: {
          evidence: string | null
          key: string
          label: string
          organization_id: number
          status: Database["public"]["Enums"]["enablement_check_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          evidence?: string | null
          key: string
          label: string
          organization_id: number
          status?: Database["public"]["Enums"]["enablement_check_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          evidence?: string | null
          key?: string
          label?: string
          organization_id?: number
          status?: Database["public"]["Enums"]["enablement_check_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_enablement_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: number
          image_src_snapshot: string
          line_total_cents: number
          order_id: number
          organization_id: number
          preorder_quantity: number
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
          organization_id: number
          preorder_quantity?: number
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
          organization_id?: number
          preorder_quantity?: number
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
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "order_profit"
            referencedColumns: ["order_id", "organization_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
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
            referencedRelation: "order_profit"
            referencedColumns: ["order_id"]
          },
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
            referencedRelation: "order_profit"
            referencedColumns: ["order_id"]
          },
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
          delivery_notified_at: string | null
          discount_cents: number
          email: string
          id: number
          idempotency_key: string
          notes: string | null
          order_number: string
          organization_id: number
          owner_notified_at: string | null
          packaging_cost_cents: number | null
          payment_fee_cents: number | null
          payment_fee_source: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          preorder_ready_notified_at: string | null
          refund_amount_cents: number | null
          refund_prepared_at: string | null
          refund_reason: string | null
          refunded_cents: number
          shipped_at: string | null
          shipping_address_snapshot: Json
          shipping_cents: number
          shipping_cost_cents: number | null
          shipping_method_code: string
          shipping_notified_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          subtotal_cents: number
          total_cents: number
          tracking_carrier: string | null
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string
          vat_rate_bp: number
        }
        Insert: {
          billing_address_snapshot: Json
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          delivery_notified_at?: string | null
          discount_cents?: number
          email: string
          id?: never
          idempotency_key: string
          notes?: string | null
          order_number: string
          organization_id: number
          owner_notified_at?: string | null
          packaging_cost_cents?: number | null
          payment_fee_cents?: number | null
          payment_fee_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          preorder_ready_notified_at?: string | null
          refund_amount_cents?: number | null
          refund_prepared_at?: string | null
          refund_reason?: string | null
          refunded_cents?: number
          shipped_at?: string | null
          shipping_address_snapshot: Json
          shipping_cents: number
          shipping_cost_cents?: number | null
          shipping_method_code: string
          shipping_notified_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subtotal_cents: number
          total_cents: number
          tracking_carrier?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
          vat_rate_bp: number
        }
        Update: {
          billing_address_snapshot?: Json
          coupon_code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          delivered_at?: string | null
          delivery_notified_at?: string | null
          discount_cents?: number
          email?: string
          id?: never
          idempotency_key?: string
          notes?: string | null
          order_number?: string
          organization_id?: number
          owner_notified_at?: string | null
          packaging_cost_cents?: number | null
          payment_fee_cents?: number | null
          payment_fee_source?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          preorder_ready_notified_at?: string | null
          refund_amount_cents?: number | null
          refund_prepared_at?: string | null
          refund_reason?: string | null
          refunded_cents?: number
          shipped_at?: string | null
          shipping_address_snapshot?: Json
          shipping_cents?: number
          shipping_cost_cents?: number | null
          shipping_method_code?: string
          shipping_notified_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          tracking_carrier?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_management_features: {
        Row: {
          enabled: boolean
          feature: Database["public"]["Enums"]["management_feature"]
          organization_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          feature: Database["public"]["Enums"]["management_feature"]
          organization_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature?: Database["public"]["Enums"]["management_feature"]
          organization_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_management_features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          organization_id: number
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          organization_id: number
          role: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          organization_id?: number
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          default_vat_rate_bp: number
          id: number
          legal_name: string | null
          name: string
          order_number_prefix: string
          packaging_cost_cents: number
          slug: string
          storefront_public: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          default_vat_rate_bp?: number
          id?: never
          legal_name?: string | null
          name: string
          order_number_prefix: string
          packaging_cost_cents?: number
          slug: string
          storefront_public?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          default_vat_rate_bp?: number
          id?: never
          legal_name?: string | null
          name?: string
          order_number_prefix?: string
          packaging_cost_cents?: number
          slug?: string
          storefront_public?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pricing_policies: {
        Row: {
          cooldown_days: number
          max_change_bp: number
          min_margin_bp: number
          organization_id: number
          products_per_run: number
          rounding: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cooldown_days?: number
          max_change_bp?: number
          min_margin_bp?: number
          organization_id: number
          products_per_run?: number
          rounding?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cooldown_days?: number
          max_change_bp?: number
          min_margin_bp?: number
          organization_id?: number
          products_per_run?: number
          rounding?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_proposals: {
        Row: {
          agent_run_id: number
          applied_price_cents: number | null
          average_cost_cents: number | null
          confidence: number
          created_at: string
          current_price_cents: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          evidence: Json
          id: number
          organization_id: number
          out_of_policy: boolean
          policy_notes: string[]
          product_id: number
          proposed_price_cents: number
          rationale: string
          status: string
        }
        Insert: {
          agent_run_id: number
          applied_price_cents?: number | null
          average_cost_cents?: number | null
          confidence: number
          created_at?: string
          current_price_cents: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evidence?: Json
          id?: never
          organization_id: number
          out_of_policy?: boolean
          policy_notes?: string[]
          product_id: number
          proposed_price_cents: number
          rationale: string
          status?: string
        }
        Update: {
          agent_run_id?: number
          applied_price_cents?: number | null
          average_cost_cents?: number | null
          confidence?: number
          created_at?: string
          current_price_cents?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evidence?: Json
          id?: never
          organization_id?: number
          out_of_policy?: boolean
          policy_notes?: string[]
          product_id?: number
          proposed_price_cents?: number
          rationale?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_proposals_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "pricing_proposals_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pricing_proposals_run_fkey"
            columns: ["agent_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
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
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id"]
          },
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
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id"]
          },
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          product_id?: number
          published?: boolean
          sort_order?: number
          src?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_media_asset_id_fkey"
            columns: ["media_asset_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "product_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      product_relations: {
        Row: {
          organization_id: number
          product_id: number
          related_product_id: number
          relation_type: Database["public"]["Enums"]["product_relation_type"]
          sort_order: number
        }
        Insert: {
          organization_id: number
          product_id: number
          related_product_id: number
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
        }
        Update: {
          organization_id?: number
          product_id?: number
          related_product_id?: number
          relation_type?: Database["public"]["Enums"]["product_relation_type"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
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
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id"]
          },
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
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id"]
          },
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
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
            columns: ["category_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_bundles: {
        Row: {
          bundle_id: number
          organization_id: number
          promotion_id: number
        }
        Insert: {
          bundle_id: number
          organization_id: number
          promotion_id: number
        }
        Update: {
          bundle_id?: number
          organization_id?: number
          promotion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_bundles_bundle_id_fkey"
            columns: ["bundle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "promotion_bundles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_bundles_promotion_id_fkey"
            columns: ["promotion_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      promotion_categories: {
        Row: {
          category_id: number
          organization_id: number
          promotion_id: number
        }
        Insert: {
          category_id: number
          organization_id: number
          promotion_id: number
        }
        Update: {
          category_id?: number
          organization_id?: number
          promotion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_categories_category_id_fkey"
            columns: ["category_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "promotion_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_categories_promotion_id_fkey"
            columns: ["promotion_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      promotion_products: {
        Row: {
          organization_id: number
          product_id: number
          promotion_id: number
        }
        Insert: {
          organization_id: number
          product_id: number
          promotion_id: number
        }
        Update: {
          organization_id?: number
          product_id?: number
          promotion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_products_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "promotion_products_product_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "promotion_products_promotion_id_fkey"
            columns: ["promotion_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id", "organization_id"]
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
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          priority?: number
          stackable?: boolean
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      restock_requests: {
        Row: {
          created_at: string
          email: string
          id: number
          notified_at: string | null
          organization_id: number
          product_slug: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          notified_at?: string | null
          organization_id: number
          product_slug: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          notified_at?: string | null
          organization_id?: number
          product_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "restock_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          active: boolean
          code: string
          cost_cents: number | null
          description: string | null
          enabled_country_codes: string[]
          estimate_max_days: number
          estimate_min_days: number
          free_from_cents: number | null
          id: number
          name: string
          organization_id: number
          price_cents: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          cost_cents?: number | null
          description?: string | null
          enabled_country_codes?: string[]
          estimate_max_days?: number
          estimate_min_days?: number
          free_from_cents?: number | null
          id?: never
          name: string
          organization_id: number
          price_cents: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          cost_cents?: number | null
          description?: string | null
          enabled_country_codes?: string[]
          estimate_max_days?: number
          estimate_min_days?: number
          free_from_cents?: number | null
          id?: never
          name?: string
          organization_id?: number
          price_cents?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipping_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: number
          postal_code: string | null
          singleton: boolean | null
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
          organization_id: number
          postal_code?: string | null
          singleton?: boolean | null
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
          organization_id?: number
          postal_code?: string | null
          singleton?: boolean | null
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
        Relationships: [
          {
            foreignKeyName: "site_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_links: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          href: string
          id: number
          label: string
          organization_id: number
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
          organization_id: number
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
          organization_id?: number
          platform_key?: string
          publication_status?: Database["public"]["Enums"]["publication_status"]
          published_at?: string | null
          sort_order?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      storefront_daily_events: {
        Row: {
          count: number
          day: string
          event: string
          organization_id: number
        }
        Insert: {
          count?: number
          day: string
          event: string
          organization_id: number
        }
        Update: {
          count?: number
          day?: string
          event?: string
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "storefront_daily_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_receipt_lines: {
        Row: {
          allocated_costs_cents: number | null
          id: number
          landed_total_cents: number | null
          landed_unit_cost_cents: number | null
          organization_id: number
          product_id: number
          quantity: number
          receipt_id: number
          sort_order: number
          unit_cost_cents: number
        }
        Insert: {
          allocated_costs_cents?: number | null
          id?: never
          landed_total_cents?: number | null
          landed_unit_cost_cents?: number | null
          organization_id: number
          product_id: number
          quantity: number
          receipt_id: number
          sort_order?: number
          unit_cost_cents: number
        }
        Update: {
          allocated_costs_cents?: number | null
          id?: never
          landed_total_cents?: number | null
          landed_unit_cost_cents?: number | null
          organization_id?: number
          product_id?: number
          quantity?: number
          receipt_id?: number
          sort_order?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_receipt_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_receipt_lines_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["product_id", "organization_id"]
          },
          {
            foreignKeyName: "supplier_receipt_lines_product_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "supplier_receipt_lines_receipt_fkey"
            columns: ["receipt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_receipts"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      supplier_receipts: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          document_date: string
          document_kind: Database["public"]["Enums"]["supplier_document_kind"]
          document_number: string
          duties_cents: number
          freight_cents: number
          id: number
          notes: string | null
          organization_id: number
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: Database["public"]["Enums"]["supplier_receipt_status"]
          supplier_id: number
          updated_at: string
          vat_regime: Database["public"]["Enums"]["vat_regime"]
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date: string
          document_kind: Database["public"]["Enums"]["supplier_document_kind"]
          document_number: string
          duties_cents?: number
          freight_cents?: number
          id?: never
          notes?: string | null
          organization_id: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: Database["public"]["Enums"]["supplier_receipt_status"]
          supplier_id: number
          updated_at?: string
          vat_regime: Database["public"]["Enums"]["vat_regime"]
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string
          document_kind?: Database["public"]["Enums"]["supplier_document_kind"]
          document_number?: string
          duties_cents?: number
          freight_cents?: number
          id?: never
          notes?: string | null
          organization_id?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: Database["public"]["Enums"]["supplier_receipt_status"]
          supplier_id?: number
          updated_at?: string
          vat_regime?: Database["public"]["Enums"]["vat_regime"]
        }
        Relationships: [
          {
            foreignKeyName: "supplier_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_receipts_supplier_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          email: string | null
          id: number
          name: string
          notes: string | null
          organization_id: number
          updated_at: string
          vat_number: string | null
          vat_regime: Database["public"]["Enums"]["vat_regime"]
        }
        Insert: {
          active?: boolean
          country_code: string
          created_at?: string
          email?: string | null
          id?: never
          name: string
          notes?: string | null
          organization_id: number
          updated_at?: string
          vat_number?: string | null
          vat_regime: Database["public"]["Enums"]["vat_regime"]
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          email?: string | null
          id?: never
          name?: string
          notes?: string | null
          organization_id?: number
          updated_at?: string
          vat_number?: string | null
          vat_regime?: Database["public"]["Enums"]["vat_regime"]
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_valuation: {
        Row: {
          average_cost_cents: number | null
          cost_source: string | null
          cost_updated_at: string | null
          last_cost_cents: number | null
          name: string | null
          organization_id: number | null
          product_id: number | null
          sku: string | null
          stock_quantity: number | null
          unlimited_stock: boolean | null
          value_cents: number | null
          valued_quantity: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_profit: {
        Row: {
          cost_of_goods_cents: number | null
          created_at: string | null
          missing: string[] | null
          order_id: number | null
          order_number: string | null
          organization_id: number | null
          packaging_cost_cents: number | null
          payment_fee_cents: number | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          profit_cents: number | null
          revenue_gross_cents: number | null
          revenue_net_cents: number | null
          shipping_cost_cents: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          vat_rate_bp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_order_note: {
        Args: { p_note: string; p_order_id: number }
        Returns: number
      }
      adjust_inventory:
        | {
            Args: {
              p_delta: number
              p_note?: string
              p_organization_id: number
              p_reason: Database["public"]["Enums"]["inventory_reason"]
              p_sku: string
            }
            Returns: number
          }
        | {
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
      change_staff_role:
        | {
            Args: {
              p_organization_id: number
              p_role: Database["public"]["Enums"]["staff_role"]
              p_user_id: string
            }
            Returns: undefined
          }
        | {
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
      complete_order: {
        Args: { p_note?: string; p_order_id: number }
        Returns: undefined
      }
      confirm_supplier_receipt: {
        Args: { p_receipt_id: number }
        Returns: Json
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
      decide_pricing_proposal: {
        Args: {
          p_decision: string
          p_note?: string
          p_price_cents?: number
          p_proposal_id: number
        }
        Returns: number
      }
      delete_product_permanently: {
        Args: { p_expected_name: string; p_product_id: number }
        Returns: undefined
      }
      duplicate_coupon_with_targets: {
        Args: { p_coupon_id: number }
        Returns: number
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
      finish_agent_run: {
        Args: { p_outcome: Json; p_run_id: number }
        Returns: undefined
      }
      get_admin_dashboard_metrics:
        | { Args: never; Returns: Json }
        | { Args: { p_organization_id: number }; Returns: Json }
      get_inventory_forecast: {
        Args: {
          p_lead_days?: number
          p_organization_id: number
          p_target_days?: number
        }
        Returns: {
          average_cost_cents: number
          daily_rate: number
          days_of_cover: number
          incoming_quantity: number
          name: string
          preorder_backlog: number
          price_cents: number
          product_id: number
          publication_status: Database["public"]["Enums"]["publication_status"]
          reorder_cost_cents: number
          reorder_point: number
          sku: string
          sold_30: number
          sold_7: number
          sold_90: number
          stock_quantity: number
          stockout_date: string
          suggested_reorder: number
          trend: number
          unlimited_stock: boolean
        }[]
      }
      get_inventory_restock_demand:
        | {
            Args: { p_organization_id: number; p_slugs: string[] }
            Returns: {
              pending_notices: number
              preorder_demand: number
              product_slug: string
            }[]
          }
        | {
            Args: { p_slugs: string[] }
            Returns: {
              pending_notices: number
              preorder_demand: number
              product_slug: string
            }[]
          }
      get_preorder_queue: {
        Args: { p_organization_id: number }
        Returns: {
          covered_units: number
          created_at: string
          email: string
          notified_at: string
          order_id: number
          order_number: string
          preorder_units: number
          ready: boolean
          waiting: Json
        }[]
      }
      get_warehouse_summary: {
        Args: { p_days?: number; p_organization_id: number }
        Returns: Json
      }
      lookup_order_status: {
        Args: { p_email: string; p_order_number: string }
        Returns: {
          created_at: string
          items: Json
          order_number: string
          shipped_at: string
          status: string
          tracking_carrier: string
          tracking_code: string
          tracking_url: string
        }[]
      }
      mark_order_delivery_notified: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      mark_order_shipping_notified: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      mark_preorder_ready_notified: {
        Args: { p_order_id: number }
        Returns: undefined
      }
      mark_restock_notices_sent: {
        Args: { p_request_ids: number[] }
        Returns: undefined
      }
      prepare_order_refund: {
        Args: { p_amount_cents: number; p_order_id: number; p_reason: string }
        Returns: undefined
      }
      product_deletion_impact: { Args: { p_product_id: number }; Returns: Json }
      propose_price: {
        Args: {
          p_confidence: number
          p_evidence: Json
          p_product_id: number
          p_proposed_price_cents: number
          p_rationale: string
          p_run_id: number
        }
        Returns: number
      }
      publish_homepage_section: {
        Args: { p_section_id: number }
        Returns: undefined
      }
      read_funnel_stats:
        | {
            Args: { p_days?: number }
            Returns: {
              count: number
              day: string
              event: string
            }[]
          }
        | {
            Args: { p_days?: number; p_organization_id: number }
            Returns: {
              count: number
              day: string
              event: string
            }[]
          }
      record_completed_media_storage_mutation: {
        Args: { p_object_path: string; p_operation: string }
        Returns: number
      }
      record_market_observation: {
        Args: { p_observation: Json; p_run_id: number }
        Returns: number
      }
      record_order_payment_fee: {
        Args: { p_fee_cents: number; p_order_id: number }
        Returns: undefined
      }
      record_order_refund: {
        Args: {
          p_amount_cents: number
          p_order_id: number
          p_reason: string
          p_stripe_refund_id: string
        }
        Returns: undefined
      }
      record_staff_invite:
        | {
            Args: {
              p_display_name: string
              p_email: string
              p_organization_id: number
              p_role: Database["public"]["Enums"]["staff_role"]
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_display_name: string
              p_email: string
              p_role: Database["public"]["Enums"]["staff_role"]
              p_user_id: string
            }
            Returns: undefined
          }
      record_staff_login: { Args: never; Returns: undefined }
      record_stripe_checkout_order: {
        Args: {
          p_coupon_code?: string
          p_discount_cents?: number
          p_email: string
          p_lines: Json
          p_notes: string
          p_order_number: string
          p_organization_id?: number
          p_payment_intent_id: string
          p_phone: string
          p_session_id: string
          p_shipping_address: Json
          p_shipping_cents: number
        }
        Returns: {
          created: boolean
          order_id: number
          order_number: string
        }[]
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
      request_restock_notice: {
        Args: { p_email: string; p_organization_id?: number; p_slug: string }
        Returns: undefined
      }
      reverse_supplier_receipt: {
        Args: { p_reason: string; p_receipt_id: number }
        Returns: number
      }
      revoke_staff_access: { Args: { p_user_id: string }; Returns: undefined }
      save_bundle_with_items:
        | { Args: { p_bundle: Json; p_items: Json }; Returns: number }
        | {
            Args: { p_bundle: Json; p_items: Json; p_organization_id: number }
            Returns: number
          }
      save_coupon_with_targets:
        | {
            Args: {
              p_bundle_ids: number[]
              p_category_ids: number[]
              p_coupon: Json
              p_product_ids: number[]
            }
            Returns: number
          }
        | {
            Args: {
              p_bundle_ids: number[]
              p_category_ids: number[]
              p_coupon: Json
              p_organization_id: number
              p_product_ids: number[]
            }
            Returns: number
          }
      save_footer_configuration:
        | { Args: { p_configuration: Json }; Returns: undefined }
        | {
            Args: { p_configuration: Json; p_organization_id: number }
            Returns: undefined
          }
      save_homepage_section:
        | {
            Args: {
              p_organization_id: number
              p_section: Json
              p_target_ids: number[]
            }
            Returns: number
          }
        | { Args: { p_section: Json; p_target_ids: number[] }; Returns: number }
      save_navigation_tree:
        | { Args: { p_organization_id: number; p_tree: Json }; Returns: number }
        | { Args: { p_tree: Json }; Returns: number }
      save_pricing_policy: {
        Args: { p_organization_id: number; p_policy: Json }
        Returns: undefined
      }
      save_promotion_with_targets:
        | {
            Args: {
              p_bundle_ids: number[]
              p_category_ids: number[]
              p_organization_id: number
              p_product_ids: number[]
              p_promotion: Json
            }
            Returns: number
          }
        | {
            Args: {
              p_bundle_ids: number[]
              p_category_ids: number[]
              p_product_ids: number[]
              p_promotion: Json
            }
            Returns: number
          }
      save_supplier_receipt: {
        Args: { p_lines: Json; p_organization_id: number; p_receipt: Json }
        Returns: number
      }
      set_manual_order_enablement_check:
        | {
            Args: {
              p_evidence: string
              p_key: string
              p_status: Database["public"]["Enums"]["enablement_check_status"]
            }
            Returns: undefined
          }
        | {
            Args: {
              p_evidence: string
              p_key: string
              p_organization_id: number
              p_status: Database["public"]["Enums"]["enablement_check_status"]
            }
            Returns: undefined
          }
      set_order_acceptance:
        | {
            Args: { p_confirmation: string; p_enabled: boolean }
            Returns: undefined
          }
        | {
            Args: {
              p_confirmation: string
              p_enabled: boolean
              p_organization_id: number
            }
            Returns: undefined
          }
      set_order_costs: {
        Args: { p_costs: Json; p_order_id: number }
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
      set_organization_cost_defaults: {
        Args: {
          p_default_vat_rate_bp: number
          p_organization_id: number
          p_packaging_cost_cents: number
        }
        Returns: undefined
      }
      set_primary_product_image: {
        Args: { p_image_id: number; p_product_id: number }
        Returns: undefined
      }
      set_product_cost: {
        Args: {
          p_organization_id: number
          p_product_id: number
          p_reason: string
          p_unit_cost_cents: number
          p_value_unvalued_movements?: boolean
        }
        Returns: number
      }
      set_staff_active:
        | {
            Args: {
              p_active: boolean
              p_organization_id: number
              p_user_id: string
            }
            Returns: undefined
          }
        | { Args: { p_active: boolean; p_user_id: string }; Returns: undefined }
      ship_order: {
        Args: {
          p_carrier: string
          p_code?: string
          p_note?: string
          p_order_id: number
          p_url?: string
        }
        Returns: undefined
      }
      start_agent_run: {
        Args: { p_agent: string; p_models: string[]; p_organization_id: number }
        Returns: number
      }
      swap_media_asset_associations: {
        Args: { p_new_media_asset_id: number; p_old_media_asset_id: number }
        Returns: Json
      }
      track_storefront_event: {
        Args: { p_event: string; p_organization_id?: number }
        Returns: undefined
      }
      transition_order_status: {
        Args: {
          p_note?: string
          p_order_id: number
          p_to_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      update_product_image_metadata: {
        Args: {
          p_alt: string
          p_image_id: number
          p_is_primary: boolean
          p_product_id: number
          p_published: boolean
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
        | "receipt"
        | "receipt_reversal"
      management_feature:
        | "read_access"
        | "inventory_writes"
        | "purchasing_writes"
        | "fulfillment_writes"
        | "pricing_writes"
        | "marketing_writes"
        | "external_effects"
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
      supplier_document_kind: "invoice" | "delivery_note"
      supplier_receipt_status: "draft" | "confirmed" | "reversed"
      vat_regime: "intra_ue" | "nazionale" | "extra_ue"
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
  management_api: {
    Enums: {},
  },
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
        "receipt",
        "receipt_reversal",
      ],
      management_feature: [
        "read_access",
        "inventory_writes",
        "purchasing_writes",
        "fulfillment_writes",
        "pricing_writes",
        "marketing_writes",
        "external_effects",
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
      supplier_document_kind: ["invoice", "delivery_note"],
      supplier_receipt_status: ["draft", "confirmed", "reversed"],
      vat_regime: ["intra_ue", "nazionale", "extra_ue"],
    },
  },
} as const
