alter table politics_monitor.pm_items
  add column if not exists home_visible boolean not null default true;

create index if not exists idx_pm_items_home_visible
  on politics_monitor.pm_items (home_visible, updated_at desc);
