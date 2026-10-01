-- Management access may update workflow metadata, never the signed agreement or ownership email.
create or replace function public.guard_platform_onboarding_snapshot()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if row(new.id,new.reference,new.request_key,new.form_id,new.form_version,new.client_data,
    new.selected_services,new.selected_package,new.pricing_snapshot,new.terms_snapshot,new.form_snapshot,
    new.signature_data,new.signature_hash,new.consent_text,new.consented_at,new.portal_email,new.created_at)
    is distinct from row(old.id,old.reference,old.request_key,old.form_id,old.form_version,old.client_data,
    old.selected_services,old.selected_package,old.pricing_snapshot,old.terms_snapshot,old.form_snapshot,
    old.signature_data,old.signature_hash,old.consent_text,old.consented_at,old.portal_email,old.created_at) then
    raise exception 'The original signed application cannot be changed.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger platform_onboarding_signed_snapshot before update on public.platform_onboarding_submissions
for each row execute function public.guard_platform_onboarding_snapshot();

create or replace function public.guard_platform_original_signed_document()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.document_type='ORIGINAL_SIGNED' and row(new.submission_id,new.version,new.document_type,new.content,new.content_sha256)
    is distinct from row(old.submission_id,old.version,old.document_type,old.content,old.content_sha256) then
    raise exception 'The original signed PDF cannot be overwritten. Create a new document version.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger platform_onboarding_original_pdf before update on public.platform_onboarding_submission_documents
for each row execute function public.guard_platform_original_signed_document();
revoke all on function public.guard_platform_onboarding_snapshot(),public.guard_platform_original_signed_document() from public,anon,authenticated;
