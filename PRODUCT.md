# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **promotoría** staff running an insurance office (office-wide view of pólizas, cobranza, clientes, asesores). Secondary: **asesores** (consultants) who see only their own contracts, clients, and collections. Spanish product UI; English code and routes.

## Product Purpose

LifeOps is an insurance operations admin: import commission/payment data (HTML extractor), manage contracts (pólizas), collections (cobranza), clients, and consultants under office tenancy (RLS). Success = office can register activity, chase collections, and keep advisors/clients in one place without spreadsheet chaos.

## Positioning

Office-scoped tenancy with role split (promotory vs consultant) plus an HTML commission extractor that maps insurer report tables into structured contracts/payments — not a generic CRM.

## Operating Context

Used at a desk in a Mexican promotoría: dark/light admin screens, PDF/HTML insurer reports, Excel exports, email invites for asesores. Frequent tasks: import data, open pólizas, work cobranza lists, look up clients/asesores.

## Brand Commitments

- Product name: **LifeOps**
- User-visible copy: natural Mexican Spanish; keep industry terms (póliza, asesor, cobranza, promotoría)
- Routes/identifiers: English only

## Visual constraint (user-pinned)

Dashboard shell borrows **layout** from a systems-console mock (left icon rail, expand on hover, icons). **Keep LifeOps colors** and fonts; light mode is a first-class shell variant with a theme toggle. Watermark titles use transparent fill + letter stroke only.

## Open Decisions

- How far themed tokens extend into every hardcoded page surface *(shell + titles first; page cards still use `dark:` utilities)*
