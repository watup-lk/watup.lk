-- Create schemas for microservice isolation
CREATE SCHEMA IF NOT EXISTS identity_schema;
CREATE SCHEMA IF NOT EXISTS salary_schema;
CREATE SCHEMA IF NOT EXISTS community_schema;

-- Provide a function to generate UUID v7 natively in Postgres globally
-- By placing this in the public schema, all microservice schemas can reuse it
CREATE OR REPLACE FUNCTION public.generate_uuid_v7() 
RETURNS uuid 
AS $$
DECLARE
  v_time timestamp with time zone := null;
  v_secs bigint := null;
  v_msec bigint := null;
  v_timestamp bigint := null;
  v_timestamp_hex varchar := null;
  v_random bytea;
  v_bytes bytea;
BEGIN
  v_time := clock_timestamp();
  v_secs := EXTRACT(EPOCH FROM v_time);
  v_msec := MOD(EXTRACT(MILLISECONDS FROM v_time)::numeric, 1000::numeric)::bigint;
  
  v_timestamp := (v_secs * 1000) + v_msec;
  v_timestamp_hex := lpad(to_hex(v_timestamp), 12, '0');
  
  v_bytes := decode(v_timestamp_hex, 'hex');
  v_random := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  
  -- Append 10 random bytes from the native gen_random_uuid()
  v_bytes := v_bytes || substring(v_random from 7 for 10);
  
  -- Set UUID version 7 (0111)
  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 112);
  
  -- Set UUID variant to 1xx (RFC4122)
  v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);
  
  RETURN encode(v_bytes, 'hex')::uuid;
END $$ LANGUAGE plpgsql;