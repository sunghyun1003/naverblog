-- UI metadata is independent of mirrored draft rows and survives deletion,
-- GitHub reconciliation and server restarts. Revision protects concurrent moves.
CREATE TABLE content_list_layout (
  team_id text PRIMARY KEY REFERENCES teams(id),
  revision integer NOT NULL CHECK (revision > 0),
  value jsonb NOT NULL
);
