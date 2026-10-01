-- A signed application, its original PDF and public timeline commit together.
-- Only the validated server route may invoke this; anonymous/staff CRUD stays denied.
create or replace function public.submit_platform_onboarding_signed(
  p_submission jsonb, p_pdf bytea, p_pdf_hash text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v public.platform_onboarding_submissions;
  prior public.platform_onboarding_submissions;
begin
  v := jsonb_populate_record(null::public.platform_onboarding_submissions, p_submission);
  if v.request_key is null or v.id is null or p_pdf is null or octet_length(p_pdf) < 100
     or substring(p_pdf from 1 for 5) <> convert_to('%PDF-', 'UTF8') then
    raise exception 'Invalid signed application.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v.request_key::text, 0));
  select * into prior from public.platform_onboarding_submissions where request_key = v.request_key;
  if found then
    if prior.signature_hash is distinct from v.signature_hash or prior.client_data is distinct from v.client_data then
      raise exception 'Submission key already belongs to a different signed application.' using errcode='22023';
    end if;
    if not exists(select 1 from public.platform_onboarding_submission_documents where submission_id=prior.id and document_type='ORIGINAL_SIGNED' and version=1) then
      raise exception 'Original signed document requires recovery.' using errcode='55000';
    end if;
    return jsonb_build_object('id',prior.id,'reference',prior.reference,'duplicate',true);
  end if;
  insert into public.platform_onboarding_submissions(
    id,reference,request_key,form_id,form_version,client_data,selected_services,selected_package,
    pricing_snapshot,terms_snapshot,form_snapshot,signature_data,signature_hash,consent_text,
    consented_at,source_ip_hash,user_agent,pdf_access_token_hash
  ) values (
    v.id,v.reference,v.request_key,v.form_id,v.form_version,v.client_data,v.selected_services,v.selected_package,
    v.pricing_snapshot,v.terms_snapshot,v.form_snapshot,v.signature_data,v.signature_hash,v.consent_text,
    v.consented_at,v.source_ip_hash,v.user_agent,v.pdf_access_token_hash
  );
  insert into public.platform_onboarding_submission_documents(
    submission_id,version,document_type,content,content_sha256,file_name,content_type,is_client_visible
  ) values (v.id,1,'ORIGINAL_SIGNED',p_pdf,p_pdf_hash,v.reference||'-QaziPro-onboarding.pdf','application/pdf',true);
  insert into public.platform_onboarding_submission_activity(submission_id,action,detail,public_label,is_client_visible)
  values(v.id,'PUBLIC_SUBMITTED','Original signed snapshot and PDF version 1 created.','Application submitted',true);
  return jsonb_build_object('id',v.id,'reference',v.reference,'duplicate',false);
end;
$$;
revoke all on function public.submit_platform_onboarding_signed(jsonb,bytea,text) from public,anon,authenticated;
grant execute on function public.submit_platform_onboarding_signed(jsonb,bytea,text) to service_role;
