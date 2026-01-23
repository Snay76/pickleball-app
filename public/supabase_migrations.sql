
-- =========================================================
-- Supabase migration (Option 2) - roles, memberships, stats, billing
-- Exécute dans l’ordre. Ajuste les noms si ton schéma diverge.
-- =========================================================

-- 1) PROFILES: global_role + skill_level (si tu avais déjà profiles.level pour le niveau de jeu)
alter table public.profiles
  add column if not exists skill_level text;

alter table public.profiles
  add column if not exists level text; -- on réutilise "level" comme global_role: user | admin_full

-- Si tu as déjà profiles.level utilisé pour le niveau de jeu, copie-le dans skill_level une fois:
-- update public.profiles set skill_level = level where skill_level is null and level is not null;
-- puis tu peux forcer level='user' par défaut:
update public.profiles set level = coalesce(nullif(level,''),'user');

-- 2) LOCATIONS: code partage
alter table public.locations
  add column if not exists share_code text;

-- Génère un code si absent (6 chars). Tu peux le faire au cas par cas.
-- Exemple simple: (à exécuter une seule fois)
update public.locations
set share_code = upper(substr(md5(random()::text),1,6))
where share_code is null;

create unique index if not exists locations_share_code_uq
on public.locations (share_code);

-- 3) MEMBERSHIP: location_members (rôle par lieu)
create table if not exists public.location_members (
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player', -- player | organiser | admin
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (location_id, user_id)
);

-- 4) PLAYERS: lier un player à un compte, ou “ajout manuel”
alter table public.players
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists email text,
  add column if not exists created_by_user_id uuid references auth.users(id);

create index if not exists players_user_id_idx on public.players(user_id);

-- 5) LOCATION_PLAYERS: présence + lien au lieu
alter table public.location_players
  add column if not exists present boolean not null default true;

-- 6) MATCHES: fin + traçabilité + score
alter table public.matches
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by_user_id uuid references auth.users(id),
  add column if not exists score_a int,
  add column if not exists score_b int;

-- 7) MATCH_PLAYERS: normalisation (recommandé)
create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team text not null,      -- 'A' | 'B'
  position int not null,   -- 1 | 2
  primary key (match_id, player_id)
);

create index if not exists match_players_player_idx on public.match_players(player_id);

-- 8) Billing / credits (simple)
create table if not exists public.credit_ledger (
  id bigserial primary key,
  location_id uuid not null references public.locations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  qty numeric not null, -- ex: -0.25
  reason text not null,
  created_at timestamptz not null default now()
);

-- 9) Vue: stats membres (par lieu) + matchs à vie
create or replace view public.venue_member_stats as
select
  lm.location_id,
  lm.user_id,
  lm.role,
  case
    when p.user_id is not null then 'account'
    else 'manual'
  end as source,
  coalesce(pr.full_name, p.name, '(?)') as full_name,
  coalesce(pr.email, p.email) as email,
  coalesce(pr.level, 'user') as global_role,
  p.id as player_id,
  coalesce(mp.matches_played,0) as matches_played,
  case lm.role
    when 'admin' then 0
    when 'organiser' then 1
    else 2
  end as role_sort
from public.location_members lm
left join public.profiles pr on pr.user_id = lm.user_id
left join public.players p on p.user_id = lm.user_id
left join (
  select player_id, count(distinct match_id) as matches_played
  from public.match_players
  group by player_id
) mp on mp.player_id = p.id;

-- 10) RPC: création de match atomique + match_players + débit crédits
-- NOTE: adapte le prix (0.25) et la logique (par semaine vs par match).
create or replace function public.create_match_with_billing(
  location_id uuid,
  court int,
  status text,
  a1 uuid,
  a2 uuid,
  b1 uuid,
  b2 uuid
)
returns public.matches
language plpgsql
security definer
as $$
declare
  m public.matches;
begin
  insert into public.matches(location_id,court,status,a1,a2,b1,b2)
  values (location_id,court,status,a1,a2,b1,b2)
  returning * into m;

  -- match_players
  insert into public.match_players(match_id,player_id,team,position)
  values
    (m.id, a1, 'A', 1),
    (m.id, b1, 'B', 1);

  if a2 is not null then
    insert into public.match_players(match_id,player_id,team,position) values (m.id,a2,'A',2);
  end if;
  if b2 is not null then
    insert into public.match_players(match_id,player_id,team,position) values (m.id,b2,'B',2);
  end if;

  -- Débit crédits (exemple: -0.25 par joueur par match)
  insert into public.credit_ledger(location_id,player_id,match_id,qty,reason)
  select location_id, x.pid, m.id, -0.25, 'match_fee'
  from (values (a1),(a2),(b1),(b2)) as x(pid)
  where x.pid is not null;

  return m;
end;
$$;

-- =========================================================
-- RLS (squelette) - à adapter à ta stratégie
-- =========================================================
alter table public.location_members enable row level security;
alter table public.locations enable row level security;
alter table public.players enable row level security;
alter table public.location_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.credit_ledger enable row level security;

-- Exemple: read membership
create policy if not exists "members can read their memberships"
on public.location_members for select
to authenticated
using (user_id = auth.uid());

-- Exemple: join by code nécessite insert location_members (player)
create policy if not exists "members can join"
on public.location_members for insert
to authenticated
with check (user_id = auth.uid());

-- Exemple: seuls admin_full ou admin/organiser du lieu peuvent modifier roles
-- (à finaliser avec une fonction is_location_admin)
