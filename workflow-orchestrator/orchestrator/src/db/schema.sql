-- PostgreSQL schema for workflow orchestrator

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums for statuses
CREATE TYPE workflow_status AS ENUM ('PENDING','RUNNING','PAUSED','COMPLETED','FAILED');
CREATE TYPE task_status AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED');

-- Table: workflow_instances
CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name VARCHAR NOT NULL,
  status workflow_status NOT NULL DEFAULT 'PENDING',
  input_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table: task_instances
CREATE TABLE IF NOT EXISTS task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  task_id VARCHAR NOT NULL,
  status task_status NOT NULL DEFAULT 'PENDING',
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Table: task_logs
CREATE TABLE IF NOT EXISTS task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_instance_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
  log_level VARCHAR NOT NULL DEFAULT 'INFO',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table: workflow_events
CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  event_type VARCHAR NOT NULL,
  task_id VARCHAR,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

