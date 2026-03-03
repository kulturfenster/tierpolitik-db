-- Review persistence for manual moderation workflow

alter table politics_monitor.pm_items
  add column if not exists review_status text not null default 'queued'
    check (review_status in ('queued','approved','rejected')),
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_pm_items_review_status
  on politics_monitor.pm_items (review_status, last_seen_at desc);
