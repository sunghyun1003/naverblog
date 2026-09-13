CREATE TABLE dashboard_snapshots (
  team_id text NOT NULL REFERENCES teams(id),
  key text NOT NULL,
  value jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, key)
);
