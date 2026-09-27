-- Separate from article generation/publication state. CAS prevents two PCs or
-- two browser clicks from claiming the same external side effect.
CREATE TABLE local_writer_state (
  team_id text PRIMARY KEY REFERENCES teams(id),
  revision integer NOT NULL CHECK (revision > 0),
  value jsonb NOT NULL
);
