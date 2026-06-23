-- Adds a saved rotation (degrees) per display so the TV doesn't need ?rotate= in the URL.
-- Safe to re-run.

alter table displays
  add column if not exists rotation integer default 0;

-- Clamp anything weird (a hand-edited row, an integration leak, etc.) to a valid value.
update displays
   set rotation = 0
 where rotation not in (0, 90, 180, 270);
