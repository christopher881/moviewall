-- Adds a shuffle toggle per display. Safe to re-run.

alter table displays
  add column if not exists shuffle boolean default false;
