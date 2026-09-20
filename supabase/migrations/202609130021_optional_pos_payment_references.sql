begin;

update public.pos_payment_methods
set requires_reference=false
where code in ('EASYPAISA','JAZZCASH','CARD','CREDIT_CARD');

commit;
