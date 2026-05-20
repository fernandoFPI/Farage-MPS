ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS invoice_rules JSONB NOT NULL DEFAULT '{
  "fixedChargeFrequency": "monthly",
  "excessFrequency": "monthly",
  "overrideInvoicing": "separate",
  "groupingStrategy": "contract",
  "contractStartDate": null
}';
