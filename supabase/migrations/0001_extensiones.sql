-- CAYLA V2 — baseline limpio (reemplaza los 53 archivos de V1, archivados en
-- backups/cayla-v1/ y recuperables con `git checkout cayla-v1-pre-retail-v2`).
create extension if not exists pgcrypto;

create schema if not exists retail;
