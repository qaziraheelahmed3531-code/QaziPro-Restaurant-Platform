begin;

insert into public.businesses (id, slug, name, short_description, city, currency, timezone)
values ('11111111-1111-4111-8111-111111111111', 'italian-pizza', 'Italian Pizza', 'Premium pizza and practical ordering for Tarbela Ghazi.', 'Tarbela Ghazi', 'PKR', 'Asia/Karachi')
on conflict (id) do update set name = excluded.name, short_description = excluded.short_description, city = excluded.city, currency = excluded.currency, timezone = excluded.timezone;

insert into public.business_branding (business_id, display_name, footer_description)
values ('11111111-1111-4111-8111-111111111111', 'ITALIAN PIZZA', 'Premium pizza and practical ordering for Tarbela Ghazi.')
on conflict (business_id) do update set display_name = excluded.display_name, footer_description = excluded.footer_description;

insert into public.site_settings (business_id, announcement_enabled, announcement_text, reviews_enabled, reviews_title, reviews_business_name, reviews_widget_id)
values ('11111111-1111-4111-8111-111111111111', true, 'Free delivery up to 5 km · Additional distance may carry a delivery fee', true, 'Google Reviews', 'AMS ISLAMIC EDUCATION SYSTEM', 'eb6881d51a4e6dee5191a77cc2ef6223d8fa3e60')
on conflict (business_id) do update set announcement_text = excluded.announcement_text;

insert into public.branches (id, business_id, code, slug, name, city, pickup_enabled, delivery_enabled)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'tarbela-ghazi', 'tarbela-ghazi', 'Italian Pizza — Tarbela Ghazi', 'Tarbela Ghazi', true, true)
on conflict (id) do update set name = excluded.name, city = excluded.city;

insert into public.delivery_rules (branch_id, free_distance_km, extra_km_rate, rounding_mode)
values ('22222222-2222-4222-8222-222222222222', 5, 100, 'CEIL')
on conflict (branch_id) do update set free_distance_km = excluded.free_distance_km, extra_km_rate = excluded.extra_km_rate;

insert into public.business_hours (branch_id, day_of_week, opens_at, closes_at, is_closed)
select '22222222-2222-4222-8222-222222222222', day_number, '11:00'::time, '23:00'::time, false
from generate_series(0, 6) day_number
on conflict (branch_id, day_of_week) do nothing;

with area_data as (
  select * from jsonb_to_recordset($areas$
  [
    {"slug":"ghazi","name":"Ghazi","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"hamlet-colony","name":"Hamlet Colony","aliases":["Hamlet"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"sobra-city","name":"Sobra City","aliases":["Subra City","Subra","Sobra"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"essa","name":"Essa","aliases":["Isa"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"qazipur","name":"Qazipur","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"khalo","name":"Khalo","aliases":["Khalu"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"bhai","name":"Bhai","aliases":["Bai"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"jammun","name":"Jammun","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"jalu","name":"Jalu","aliases":["Jolu"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"hassanpur","name":"Hassanpur","aliases":["Hasanpur"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"bharwasa","name":"Bharwasa","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"gahara","name":"Gahara","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"khairbara","name":"Khairbara","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"kohtehra","name":"Kohtehra","aliases":["Katehra"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"pipliala","name":"Pipliala","aliases":["Pipliwala"],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"salam-khand","name":"Salam Khand","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"dhok-dustom","name":"Dhok Dustom","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"dhok-dakmarai","name":"Dhok Dakmarai","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"aldo","name":"Aldo","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"jabbi","name":"Jabbi","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"mian-dheri","name":"Mian Dheri","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"nakarchi","name":"Nakarchi","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"pontiya","name":"Pontiya","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"garhi","name":"Garhi","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"sheikh-chuhr","name":"Sheikh Chuhr","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"gwari","name":"Gwari","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"sokra","name":"Sokra","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"qutb-bandi","name":"Qutb Bandi","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"shahid-baba","name":"Shahid Baba","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"tms-colony","name":"TMS Colony","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"tro-colony","name":"TRO Colony","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"preparation-for-life-colony","name":"Preparation For Life Colony","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"sobra-city-colony","name":"Sobra City Colony","aliases":[],"group_name":"Ghazi & Tarbela nearby"},
    {"slug":"tarbela-dam","name":"Tarbela Dam","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"bara","name":"Bara","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"dal","name":"Dal","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"mehran-colony","name":"Mehran Colony","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"mohat-nawan","name":"Mohat Nawan","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"mohat-purana","name":"Mohat Purana","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"dhen-baba","name":"Dhen Baba","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"gandaf","name":"Gandaf","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"gandaf-camp","name":"Gandaf Camp","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"adalat-colony","name":"Adalat Colony","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"subra-colony","name":"Subra Colony","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"bul-dheri","name":"Bul Dheri","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"kukukh-choha","name":"Kukukh Choha","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"gari-maira","name":"Gari Maira","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"kiara","name":"Kiara","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"right-bank-colony","name":"Right Bank Colony","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"batakara","name":"Batakara","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"pehur","name":"Pehur","aliases":["Pehure"],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"labadam","name":"Labadam","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"balongi","name":"Balongi","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"galla","name":"Galla","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"kabbal","name":"Kabbal","aliases":[],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"kalabat","name":"Kalabat","aliases":["Khalabat"],"group_name":"Tarbela Dam & reservoir side"},
    {"slug":"zarobi","name":"Zarobi","aliases":["Zarobai"],"group_name":"Nearby & extended belt"},
    {"slug":"topi","name":"Topi","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"kangra-colony","name":"Kangra Colony","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"khalabat-township","name":"Khalabat Township","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"sirikot","name":"Sirikot","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"julahri","name":"Julahri","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"bandi","name":"Bandi","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"baghdara","name":"Baghdara","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"bhada","name":"Bhada","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"khari-gali","name":"Khari Gali","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"ladha","name":"Ladha","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"bhera","name":"Bhera","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"darwaza-gali","name":"Darwaza Gali","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"kheri","name":"Kheri","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"suraj","name":"Suraj","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"niamat-khan","name":"Niamat Khan","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"kakotri","name":"Kakotri","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"nurpur","name":"Nurpur","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"pirani","name":"Pirani","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"band-pir-dad","name":"Band Pir Dad","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"makhan","name":"Makhan","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"baladhar","name":"Baladhar","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"rehana","name":"Rehana","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"bhuti","name":"Bhuti","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"mohri","name":"Mohri","aliases":[],"group_name":"Nearby & extended belt"},
    {"slug":"bagra","name":"Bagra","aliases":[],"group_name":"Nearby & extended belt"}
  ]
  $areas$::jsonb) as area(slug text, name text, aliases text[], group_name text)
)
insert into public.delivery_areas(branch_id, slug, name, aliases, group_name, sort_order)
select '22222222-2222-4222-8222-222222222222', slug, name, aliases, group_name, row_number() over ()
from area_data
on conflict (branch_id, slug) do update set name = excluded.name, aliases = excluded.aliases, group_name = excluded.group_name;

insert into public.categories(id, business_id, slug, name, description, image_url, section_banner_url, sort_order) values
  ('30000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','deals','Deals','Easy bundles for solo orders and family tables.','/images/categories/deals-placeholder.svg','/images/section-banners/deals-placeholder.svg',1),
  ('30000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','pizzas','Pizzas','Stone-baked signatures with your choice of size, crust and extras.','/images/categories/pizza-placeholder.svg','/images/section-banners/pizzas-placeholder.svg',2),
  ('30000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','burgers','Burgers','Crispy, satisfying favorites made for a quick order.','/images/categories/burgers-placeholder.svg','/images/section-banners/burgers-placeholder.svg',3),
  ('30000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','beverages','Beverages','Cold drinks to complete your meal.','/images/categories/beverages-placeholder.svg','/images/section-banners/beverages-placeholder.svg',4),
  ('30000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','addons','Add-ons','Sauces, cheese, toppings and dips.','/images/categories/addons-placeholder.svg','/images/section-banners/addons-placeholder.svg',5),
  ('30000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','fries','Fries','Crisp sides prepared for sharing.','/images/categories/fries-placeholder.svg','/images/section-banners/fries-placeholder.svg',6),
  ('30000000-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','bbq','BBQ / Chicken','Chicken pieces and barbecue selections.','/images/categories/bbq-placeholder.svg','/images/section-banners/bbq-placeholder.svg',7),
  ('30000000-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','sides','Sides','Simple extras that round out every order.','/images/categories/sides-placeholder.svg','/images/section-banners/sides-placeholder.svg',8)
on conflict (id) do update set name=excluded.name, description=excluded.description, image_url=excluded.image_url, section_banner_url=excluded.section_banner_url, sort_order=excluded.sort_order;

insert into public.products(id,business_id,category_id,slug,name,description,base_price,sale_price,old_price,badge,is_available,is_featured,sort_order) values
  ('40000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','30000000-0000-4000-8000-000000000002','chicken-fajita','Chicken Fajita Pizza','Stone-baked with mozzarella, peppers and our signature sauce.',1249,null,null,'Popular',true,true,1),
  ('40000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','30000000-0000-4000-8000-000000000002','chicken-tikka','Chicken Tikka Pizza','Smoky tikka chicken, mozzarella and a bright tomato base.',1299,null,null,'Popular',true,true,2),
  ('40000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','30000000-0000-4000-8000-000000000002','italian-special','Italian Special Pizza','A generous signature pizza with chicken, vegetables and cheese.',1399,null,1749,'20% OFF',true,true,3),
  ('40000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','30000000-0000-4000-8000-000000000003','zinger-burger','Zinger Burger','Crispy chicken, fresh slaw and our house sauce.',699,null,null,null,true,false,1)
on conflict (id) do update set name=excluded.name, description=excluded.description, base_price=excluded.base_price, old_price=excluded.old_price, badge=excluded.badge;

insert into public.product_images(product_id,url,alt_text,sort_order,is_primary) values
  ('40000000-0000-4000-8000-000000000001','/images/products/pizza-placeholder.svg','Chicken Fajita Pizza',0,true),
  ('40000000-0000-4000-8000-000000000002','/images/products/pizza-placeholder.svg','Chicken Tikka Pizza',0,true),
  ('40000000-0000-4000-8000-000000000003','/images/products/pizza-placeholder.svg','Italian Special Pizza',0,true),
  ('40000000-0000-4000-8000-000000000004','/images/products/burger-placeholder.svg','Zinger Burger',0,true)
on conflict (product_id) where is_primary do update set url=excluded.url, alt_text=excluded.alt_text;

insert into public.modifier_groups(id,business_id,name,selection_type,is_required,min_selections,max_selections,sort_order) values
  ('50000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Choose size','SINGLE',true,1,1,1),
  ('50000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Choose crust','SINGLE',true,1,1,2),
  ('50000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Add extras','MULTIPLE',false,0,4,3)
on conflict (id) do update set name=excluded.name, selection_type=excluded.selection_type, is_required=excluded.is_required, min_selections=excluded.min_selections, max_selections=excluded.max_selections;

insert into public.modifier_options(id,modifier_group_id,name,price_adjustment,is_default,sort_order) values
  ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','Small',0,false,1),
  ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','Medium',300,true,2),
  ('51000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001','Large',650,false,3),
  ('51000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000001','Family',1050,false,4),
  ('52000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','Regular',0,true,1),
  ('52000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','Thin',0,false,2),
  ('52000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002','Stuffed',250,false,3),
  ('52000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000002','Crown',350,false,4),
  ('53000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','Extra cheese',180,false,1),
  ('53000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003','Olives',90,false,2),
  ('53000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','Jalapeños',80,false,3),
  ('53000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000003','Extra chicken',220,false,4)
on conflict (id) do update set name=excluded.name, price_adjustment=excluded.price_adjustment, is_default=excluded.is_default, sort_order=excluded.sort_order;

insert into public.product_modifier_groups(product_id,modifier_group_id,sort_order)
select product_id, group_id, group_order from (values
  ('40000000-0000-4000-8000-000000000001'::uuid,'50000000-0000-4000-8000-000000000001'::uuid,1),
  ('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',2),
  ('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',3),
  ('40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',1),
  ('40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',2),
  ('40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003',3),
  ('40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',1),
  ('40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002',2),
  ('40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003',3)
) values_to_insert(product_id,group_id,group_order)
on conflict (product_id,modifier_group_id) do update set sort_order=excluded.sort_order;

insert into public.deals(id,business_id,slug,name,description,image_url,deal_price,old_price,sort_order) values
  ('60000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','family-feast','Family Feast','2 Large Pizzas + Drink','/images/products/deal-placeholder.svg',2499,3199,1),
  ('60000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','pizza-duo','Pizza Duo','2 Medium Pizzas','/images/products/deal-placeholder.svg',1799,2249,2),
  ('60000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','solo-meal','Solo Meal','Small Pizza + Fries + Drink','/images/products/deal-placeholder.svg',899,1139,3)
on conflict (id) do update set name=excluded.name,description=excluded.description,image_url=excluded.image_url,deal_price=excluded.deal_price,old_price=excluded.old_price;

insert into public.hero_banners(id,business_id,internal_name,image_url,alt_text,sort_order) values
  ('70000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Hero 01','/images/hero/hero-01-placeholder.svg','Italian Pizza promotion',1),
  ('70000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Hero 02','/images/hero/hero-02-placeholder.svg','Italian Pizza pizza offer',2),
  ('70000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Hero 03','/images/hero/hero-03-placeholder.svg','Italian Pizza family meal',3),
  ('70000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Hero 04','/images/hero/hero-04-placeholder.svg','Italian Pizza sides and drinks',4)
on conflict (id) do update set internal_name=excluded.internal_name,image_url=excluded.image_url,alt_text=excluded.alt_text,sort_order=excluded.sort_order;

insert into public.promotions(business_id,code,discount_type,discount_value,maximum_discount,is_active)
values ('11111111-1111-4111-8111-111111111111','PIZZA200','FIXED',200,200,true)
on conflict (business_id,code) do nothing;

insert into public.business_operating_settings(business_id,tax_rate_bps,new_order_sound,prep_warning_minutes,prep_late_minutes)
values ('11111111-1111-4111-8111-111111111111',0,true,15,25)
on conflict (business_id) do nothing;

insert into public.print_settings(business_id,receipt_width_mm,auto_print_receipt,print_kitchen_ticket,show_prices_on_kitchen_ticket,receipt_footer,copies)
values ('11111111-1111-4111-8111-111111111111',80,false,true,false,'Thank you for ordering from Italian Pizza.',1)
on conflict (business_id) do nothing;

insert into public.payment_provider_settings(business_id,provider,environment,is_enabled,public_label)
values ('11111111-1111-4111-8111-111111111111','CASH','LIVE',true,'Cash / Cash on Delivery')
on conflict (business_id,provider) do update set is_enabled=true,public_label=excluded.public_label;

commit;
