
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attendance": {
                  Row: {
                    "created_at": string,"id": string,"lesson_id": string,"marked_at": string,"marked_by": string | null,"note": string | null,"status": Database["public"]['Enums']["attendance_status"],"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"lesson_id": string,"marked_at"?: string,"marked_by"?: string | null,"note"?: string | null,"status": Database["public"]['Enums']["attendance_status"],"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"lesson_id"?: string,"marked_at"?: string,"marked_by"?: string | null,"note"?: string | null,"status"?: Database["public"]['Enums']["attendance_status"],"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"centre_settings": {
                  Row: {
                    "billing_day": number,"centre_name": string,"created_at": string,"due_day": number,"id": string,"lesson_reminder_hours": number,"quiet_from": string,"quiet_to": string,"reminders_enabled": boolean,"singleton": boolean,"telegram_bot_username": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_day"?: number,"centre_name": string,"created_at"?: string,"due_day"?: number,"id"?: string,"lesson_reminder_hours"?: number,"quiet_from"?: string,"quiet_to"?: string,"reminders_enabled"?: boolean,"singleton"?: boolean,"telegram_bot_username"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "billing_day"?: number,"centre_name"?: string,"created_at"?: string,"due_day"?: number,"id"?: string,"lesson_reminder_hours"?: number,"quiet_from"?: string,"quiet_to"?: string,"reminders_enabled"?: boolean,"singleton"?: boolean,"telegram_bot_username"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"charges": {
                  Row: {
                    "amount": number,"base_amount": number,"billing_month": string,"created_at": string,"created_by": string | null,"discount_amount": number,"enrollment_id": string | null,"group_id": string | null,"id": string,"is_prorated": boolean,"lessons_counted": number | null,"lessons_in_month": number | null,"note": string | null,"student_id": string,"type": Database["public"]['Enums']["charge_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"base_amount"?: number,"billing_month": string,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"enrollment_id"?: string | null,"group_id"?: string | null,"id"?: string,"is_prorated"?: boolean,"lessons_counted"?: number | null,"lessons_in_month"?: number | null,"note"?: string | null,"student_id": string,"type": Database["public"]['Enums']["charge_type"]
                  }
                  Update: {
                    "amount"?: number,"base_amount"?: number,"billing_month"?: string,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"enrollment_id"?: string | null,"group_id"?: string | null,"id"?: string,"is_prorated"?: boolean,"lessons_counted"?: number | null,"lessons_in_month"?: number | null,"note"?: string | null,"student_id"?: string,"type"?: Database["public"]['Enums']["charge_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "created_at": string,"discount_kind": string | null,"discount_value": number | null,"group_id": string,"id": string,"joined_on": string,"left_on": string | null,"note": string | null,"status": Database["public"]['Enums']["enrollment_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discount_kind"?: string | null,"discount_value"?: number | null,"group_id": string,"id"?: string,"joined_on": string,"left_on"?: string | null,"note"?: string | null,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"discount_kind"?: string | null,"discount_value"?: number | null,"group_id"?: string,"id"?: string,"joined_on"?: string,"left_on"?: string | null,"note"?: string | null,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"archived_at": string | null,"category": Database["public"]['Enums']["expense_category"],"created_at": string,"created_by": string | null,"id": string,"note": string | null,"spent_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"archived_at"?: string | null,"category": Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"spent_on": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"archived_at"?: string | null,"category"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"spent_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"capacity": number | null,"created_at": string,"days": (number)[],"duration_min": number,"end_date": string | null,"id": string,"level": string | null,"monthly_fee": number,"name": string,"room": string | null,"start_date": string,"start_time": string,"status": Database["public"]['Enums']["group_status"],"subject": string,"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"days": (number)[],"duration_min"?: number,"end_date"?: string | null,"id"?: string,"level"?: string | null,"monthly_fee": number,"name": string,"room"?: string | null,"start_date": string,"start_time": string,"status"?: Database["public"]['Enums']["group_status"],"subject": string,"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"days"?: (number)[],"duration_min"?: number,"end_date"?: string | null,"id"?: string,"level"?: string | null,"monthly_fee"?: number,"name"?: string,"room"?: string | null,"start_date"?: string,"start_time"?: string,"status"?: Database["public"]['Enums']["group_status"],"subject"?: string,"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_activities": {
                  Row: {
                    "body": string | null,"created_at": string,"created_by": string | null,"from_status": Database["public"]['Enums']["lead_status"] | null,"id": string,"kind": string,"lead_id": string,"to_status": Database["public"]['Enums']["lead_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_status"?: Database["public"]['Enums']["lead_status"] | null,"id"?: string,"kind": string,"lead_id": string,"to_status"?: Database["public"]['Enums']["lead_status"] | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_status"?: Database["public"]['Enums']["lead_status"] | null,"id"?: string,"kind"?: string,"lead_id"?: string,"to_status"?: Database["public"]['Enums']["lead_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "archived_at": string | null,"assigned_to": string | null,"converted_student_id": string | null,"created_at": string,"created_by": string | null,"full_name": string,"id": string,"lost_reason": string | null,"next_contact_at": string | null,"notes": string | null,"phone": string,"preferred_time": string | null,"source": Database["public"]['Enums']["lead_source"],"status": Database["public"]['Enums']["lead_status"],"subject_interest": string | null,"trial_date": string | null,"trial_group_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"assigned_to"?: string | null,"converted_student_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"full_name": string,"id"?: string,"lost_reason"?: string | null,"next_contact_at"?: string | null,"notes"?: string | null,"phone": string,"preferred_time"?: string | null,"source": Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"subject_interest"?: string | null,"trial_date"?: string | null,"trial_group_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"assigned_to"?: string | null,"converted_student_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"full_name"?: string,"id"?: string,"lost_reason"?: string | null,"next_contact_at"?: string | null,"notes"?: string | null,"phone"?: string,"preferred_time"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"subject_interest"?: string | null,"trial_date"?: string | null,"trial_group_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_trial_group_id_fkey"
      columns: ["trial_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "cancel_reason": string | null,"created_at": string,"group_id": string,"id": string,"lesson_date": string,"start_time": string,"status": Database["public"]['Enums']["lesson_status"],"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"lesson_date": string,"start_time": string,"status"?: Database["public"]['Enums']["lesson_status"],"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"lesson_date"?: string,"start_time"?: string,"status"?: Database["public"]['Enums']["lesson_status"],"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"message_templates": {
                  Row: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at": string,"id": string,"language": Database["public"]['Enums']["app_language"],"type": Database["public"]['Enums']["message_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at"?: string,"id"?: string,"language": Database["public"]['Enums']["app_language"],"type": Database["public"]['Enums']["message_type"],"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"type"?: Database["public"]['Enums']["message_type"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at": string,"dedupe_key": string | null,"error": string | null,"id": string,"recipient": string,"sent_at": string | null,"status": Database["public"]['Enums']["message_status"],"student_id": string,"type": Database["public"]['Enums']["message_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: string,"recipient": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"student_id": string,"type": Database["public"]['Enums']["message_type"]
                  }
                  Update: {
                    "body"?: string,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: string,"recipient"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"student_id"?: string,"type"?: Database["public"]['Enums']["message_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"group_id": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"note": string | null,"paid_at": string,"receipt_no": number,"received_by": string | null,"student_id": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"group_id": string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"note"?: string | null,"paid_at"?: string,"receipt_no"?: never,"received_by"?: string | null,"student_id": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"group_id"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"note"?: string | null,"paid_at"?: string,"receipt_no"?: never,"received_by"?: string | null,"student_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"is_active": boolean,"language": Database["public"]['Enums']["app_language"],"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string,"is_active"?: boolean,"language"?: Database["public"]['Enums']["app_language"],"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"language"?: Database["public"]['Enums']["app_language"],"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"students": {
                  Row: {
                    "archived_at": string | null,"birth_date": string | null,"created_at": string,"full_name": string,"id": string,"language": Database["public"]['Enums']["app_language"],"lead_id": string | null,"notes": string | null,"parent_name": string | null,"parent_phone": string | null,"phone": string,"status": Database["public"]['Enums']["student_status"],"telegram_chat_id": number | null,"telegram_link_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"created_at"?: string,"full_name": string,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"lead_id"?: string | null,"notes"?: string | null,"parent_name"?: string | null,"parent_phone"?: string | null,"phone": string,"status"?: Database["public"]['Enums']["student_status"],"telegram_chat_id"?: number | null,"telegram_link_code"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"created_at"?: string,"full_name"?: string,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"lead_id"?: string | null,"notes"?: string | null,"parent_name"?: string | null,"parent_phone"?: string | null,"phone"?: string,"status"?: Database["public"]['Enums']["student_status"],"telegram_chat_id"?: number | null,"telegram_link_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_pay_rates": {
                  Row: {
                    "amount": number | null,"created_at": string,"effective_from": string,"id": string,"pay_type": Database["public"]['Enums']["pay_type"],"percent": number | null,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"effective_from": string,"id"?: string,"pay_type": Database["public"]['Enums']["pay_type"],"percent"?: number | null,"teacher_id": string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"effective_from"?: string,"id"?: string,"pay_type"?: Database["public"]['Enums']["pay_type"],"percent"?: number | null,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_pay_rates_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_payouts": {
                  Row: {
                    "basis": number,"bonus": number,"breakdown": NonNullable<Json>,"calculated": number,"created_at": string,"deduction": number,"final_amount": number,"id": string,"month": string,"note": string | null,"paid_at": string | null,"paid_by": string | null,"pay_type": Database["public"]['Enums']["pay_type"],"rate": number,"status": Database["public"]['Enums']["payout_status"],"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "basis"?: number,"bonus"?: number,"breakdown"?: NonNullable<Json>,"calculated"?: number,"created_at"?: string,"deduction"?: number,"final_amount": number,"id"?: string,"month": string,"note"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"pay_type": Database["public"]['Enums']["pay_type"],"rate": number,"status"?: Database["public"]['Enums']["payout_status"],"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "basis"?: number,"bonus"?: number,"breakdown"?: NonNullable<Json>,"calculated"?: number,"created_at"?: string,"deduction"?: number,"final_amount"?: number,"id"?: string,"month"?: string,"note"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"pay_type"?: Database["public"]['Enums']["pay_type"],"rate"?: number,"status"?: Database["public"]['Enums']["payout_status"],"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_payouts_paid_by_fkey"
      columns: ["paid_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_payouts_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"teachers": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"full_name": string,"hired_on": string | null,"id": string,"is_active": boolean,"notes": string | null,"phone": string,"subjects": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"full_name": string,"hired_on"?: string | null,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"phone": string,"subjects"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"full_name"?: string,"hired_on"?: string | null,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"phone"?: string,"subjects"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "student_balances": {
                  Row: {
                    "balance": number | null,"charged": number | null,"oldest_unpaid_month": string | null,"paid": number | null,"student_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"student_overview": {
                  Row: {
                    "archived_at": string | null,"balance": number | null,"birth_date": string | null,"charged": number | null,"created_at": string,"full_name": string,"id": string,"language": Database["public"]['Enums']["app_language"],"lead_id": string | null,"notes": string | null,"oldest_unpaid_month": string | null,"paid": number | null,"parent_name": string | null,"parent_phone": string | null,"phone": string,"status": Database["public"]['Enums']["student_status"],"telegram_chat_id": number | null,"telegram_link_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "students_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"attendance_is_editable":
{ Args: { "p_lesson_id": string }; Returns: boolean
                           },
"convert_lead_to_student":
{ Args: { "p_birth_date"?: string,"p_full_name": string,"p_language"?: Database["public"]['Enums']["app_language"],"p_lead_id": string,"p_notes"?: string,"p_parent_name"?: string,"p_parent_phone"?: string,"p_phone": string }; Returns: string
                           },
"generate_link_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"is_api_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_student_left":
{ Args: { "p_student_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "app_language": "uz"|"ru"|"en","attendance_status": "present"|"late"|"absent"|"excused","charge_type": "monthly_fee"|"adjustment","enrollment_status": "active"|"left","expense_category": "rent"|"utilities"|"marketing"|"supplies"|"other","group_status": "forming"|"active"|"finished","lead_source": "instagram"|"telegram"|"phone_call"|"walk_in"|"referral"|"website"|"other","lead_status": "new"|"contacted"|"trial"|"won"|"lost","lesson_status": "scheduled"|"held"|"cancelled","message_channel": "telegram"|"sms","message_status": "queued"|"sent"|"failed"|"skipped","message_type": "payment_due"|"payment_overdue"|"lesson_reminder"|"custom","pay_type": "fixed_monthly"|"percent_of_revenue"|"per_lesson","payment_method": "cash"|"card"|"transfer","payout_status": "draft"|"paid","student_status": "active"|"paused"|"left","user_role": "owner"|"manager"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_language": ["uz", "ru", "en"],"attendance_status": ["present", "late", "absent", "excused"],"charge_type": ["monthly_fee", "adjustment"],"enrollment_status": ["active", "left"],"expense_category": ["rent", "utilities", "marketing", "supplies", "other"],"group_status": ["forming", "active", "finished"],"lead_source": ["instagram", "telegram", "phone_call", "walk_in", "referral", "website", "other"],"lead_status": ["new", "contacted", "trial", "won", "lost"],"lesson_status": ["scheduled", "held", "cancelled"],"message_channel": ["telegram", "sms"],"message_status": ["queued", "sent", "failed", "skipped"],"message_type": ["payment_due", "payment_overdue", "lesson_reminder", "custom"],"pay_type": ["fixed_monthly", "percent_of_revenue", "per_lesson"],"payment_method": ["cash", "card", "transfer"],"payout_status": ["draft", "paid"],"student_status": ["active", "paused", "left"],"user_role": ["owner", "manager"]
          }
        }
} as const
