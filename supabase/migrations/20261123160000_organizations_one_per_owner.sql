-- Jedna organizacja na konto (owner_user_id). Domyka wyścig podwójnego wysłania formularza
-- onboardingu: drugi zapis dostaje 23505 i aplikacja wraca do /admin zamiast tworzyć duplikat.
--
-- Jeśli w bazie są już konta z kilkoma organizacjami, indeksu NIE zakładamy (migracja nie
-- może się wywrócić) — wypisujemy NOTICE z liczbą takich kont. Aplikacja i tak wybiera
-- wtedy deterministycznie najstarszą organizację; duplikaty trzeba uporządkować ręcznie
-- i uruchomić migrację ponownie (jest idempotentna).

do $$
declare
  dup_owners integer;
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'organizations_owner_user_id_unique'
  ) then
    return;
  end if;

  select count(*) into dup_owners
  from (
    select owner_user_id
    from public.organizations
    group by owner_user_id
    having count(*) > 1
  ) d;

  if dup_owners > 0 then
    raise notice 'organizations: % kont(a) z więcej niż jedną organizacją — pomijam unikalny indeks owner_user_id', dup_owners;
    return;
  end if;

  create unique index organizations_owner_user_id_unique
    on public.organizations (owner_user_id);
end
$$;
