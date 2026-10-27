-- Póliza registry data (Mina de Oro de Seguros Monterrey / plantilla LifeOps):
-- insured person, ramo, plan classification, end of coverage and amounts converted to pesos
-- (so totals work across UDI / dólares). Client marital status from the same report.

ALTER TABLE public.contract
    ADD COLUMN IF NOT EXISTS insured_name text,
    ADD COLUMN IF NOT EXISTS line_code text REFERENCES public.line_of_business (code),
    ADD COLUMN IF NOT EXISTS plan_classification text,
    ADD COLUMN IF NOT EXISTS end_date date,
    ADD COLUMN IF NOT EXISTS annual_premium_mxn numeric(16, 2),
    ADD COLUMN IF NOT EXISTS insured_amount_mxn numeric(18, 2),
    ADD COLUMN IF NOT EXISTS deductible_mxn numeric(16, 2);

ALTER TABLE public.contract DROP CONSTRAINT IF EXISTS contract_insured_name_check;
ALTER TABLE public.contract
    ADD CONSTRAINT contract_insured_name_check CHECK (insured_name IS NULL OR char_length(insured_name) <= 120);

ALTER TABLE public.contract DROP CONSTRAINT IF EXISTS contract_plan_classification_check;
ALTER TABLE public.contract
    ADD CONSTRAINT contract_plan_classification_check CHECK (plan_classification IS NULL OR char_length(plan_classification) <= 40);

ALTER TABLE public.contract DROP CONSTRAINT IF EXISTS contract_mxn_amounts_check;
ALTER TABLE public.contract
    ADD CONSTRAINT contract_mxn_amounts_check CHECK (
        (annual_premium_mxn IS NULL OR annual_premium_mxn >= 0)
        AND (insured_amount_mxn IS NULL OR insured_amount_mxn >= 0)
        AND (deductible_mxn IS NULL OR deductible_mxn >= 0)
    );

COMMENT ON COLUMN public.contract.insured_name IS 'Persona asegurada principal (may differ from the contratante / client).';
COMMENT ON COLUMN public.contract.line_code IS 'Ramo (line_of_business): LIFE for vida, HEALTH for gastos médicos.';
COMMENT ON COLUMN public.contract.plan_classification IS 'Clasificación del plan from the insurer (TRADICIONAL, FLEXIBLE, GMM…).';
COMMENT ON COLUMN public.contract.end_date IS 'Fecha de terminación del contrato (end of coverage / plazo).';
COMMENT ON COLUMN public.contract.annual_premium_mxn IS 'Prima anual converted to pesos by the insurer (Mina de Oro "Convertido").';
COMMENT ON COLUMN public.contract.insured_amount_mxn IS 'Suma asegurada converted to pesos.';
COMMENT ON COLUMN public.contract.deductible_mxn IS 'Deducible (GMM) in pesos.';

CREATE INDEX IF NOT EXISTS idx_contract_end_date ON public.contract (end_date) WHERE end_date IS NOT NULL;

ALTER TABLE public.client
    ADD COLUMN IF NOT EXISTS marital_status text;

ALTER TABLE public.client DROP CONSTRAINT IF EXISTS client_marital_status_check;
ALTER TABLE public.client
    ADD CONSTRAINT client_marital_status_check CHECK (marital_status IS NULL OR char_length(marital_status) <= 40);

COMMENT ON COLUMN public.client.marital_status IS 'Estado civil as reported by the insurer (Soltero, Casado, Unión…).';
