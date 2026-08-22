-- RX_EVIDENCE_1.0
-- Desenvolvimento: não aplicar em produção antes da homologação.

create extension if not exists pgcrypto;

create table if not exists public.raiox_evidence (
  id uuid primary key default gen_random_uuid(),
  intake_ref text not null,
  intake_id uuid null,
  channel text not null,
  source_url text null,
  storage_provider text not null default 'supabase_storage',
  storage_file_id text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  width integer null,
  height integer null,
  sha256 text null,
  upload_status text not null default 'uploaded',
  vision_version text null,
  vision_analysis jsonb null,
  vision_confidence numeric null,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz null,
  deleted_at timestamptz null,
  retention_until timestamptz null,
  constraint raiox_evidence_channel_chk check (channel in ('Instagram','LinkedIn','Google Perfil da Empresa','Site / landing page','WhatsApp Business','YouTube','TikTok','E-mail','Outro')),
  constraint raiox_evidence_provider_chk check (storage_provider in ('google_drive','supabase_storage')),
  constraint raiox_evidence_mime_chk check (mime_type in ('image/jpeg','image/png','image/webp')),
  constraint raiox_evidence_size_chk check (size_bytes > 0 and size_bytes <= 8000000),
  constraint raiox_evidence_status_chk check (upload_status in ('uploaded','analyzing','analyzed','failed','deleted')),
  constraint raiox_evidence_confidence_chk check (vision_confidence is null or (vision_confidence >= 0 and vision_confidence <= 1))
);

create index if not exists raiox_evidence_ref_idx on public.raiox_evidence(intake_ref, created_at desc);
create index if not exists raiox_evidence_status_idx on public.raiox_evidence(upload_status) where deleted_at is null;

alter table public.raiox_evidence enable row level security;

-- Nenhuma policy pública. Apenas service-role / Edge Functions internas acessam a tabela.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'raiox-evidencias',
  'raiox-evidencias',
  false,
  8000000,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Também não são criadas policies públicas em storage.objects.
-- O upload será executado pela Edge Function com service role após validar token curto assinado pelo backend Vercel.
