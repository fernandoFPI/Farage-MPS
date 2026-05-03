ALTER TABLE contract_printers
ADD COLUMN IF NOT EXISTS override_min_bw_pages INTEGER,
ADD COLUMN IF NOT EXISTS override_min_color_pages INTEGER;
