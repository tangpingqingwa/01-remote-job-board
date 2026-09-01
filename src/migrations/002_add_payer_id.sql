-- Keep owner identity across process restarts so raises remain attributable.
ALTER TABLE listings ADD COLUMN payer_id TEXT;
