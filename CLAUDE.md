# Warehouse ERP — Claude Reference

## Project

**Garment ERP** for a clothing warehouse. Tracks the full pipeline:
cloth procurement → raw cloth inventory → cutting → stitching → finished goods → sales → credit → accounting.

Live at `https://sri-warehouse.hms.rest/`

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Django 6 + PostgreSQL, Graphene-Django (GraphQL), JWT auth |
| Frontend | Next.js 16, React 19, TypeScript, Recharts |
| Auth | `graphql_jwt` — header prefix is `JWT ` (not `Bearer`) |
| Infra | Docker Compose, Nginx (SSL termination), Celery + Redis (tasks) |
| Notifications | Firebase FCM (push), Twilio (SMS), WhatsApp API |

---

## Architecture — HackSoft Django Styleguide

Every domain operation lives in exactly one of these layers. **Never bypass them.**

```
schema/mutations/*.py   →  graphene.Mutation classes (thin — just call service)
services/*.py           →  business logic (atomic, validated)
selectors.py            →  read-only ORM queries (returns QuerySets / objects)
permissions.py          →  role + warehouse access checks
models.py               →  data shape only, no business logic
schema/types.py         →  Graphene DjangoObjectType declarations
schema/queries.py       →  Query resolvers (call selectors)
```

**Adding a new feature** — always follow this checklist:
1. `models.py` — add model / field + `_serial()` for numbered entities
2. `python manage.py makemigrations && python manage.py migrate`
3. `services/` — write the service function (atomic, raises `GraphQLError` on bad input)
4. `selectors.py` — add read query
5. `schema/types.py` — add `DjangoObjectType`
6. `schema/queries.py` — add field + resolver
7. `schema/mutations/` — add mutation class, wire into `config/schema.py`
8. `frontend/app/types/index.ts` — add TS interface
9. `frontend/app/lib/graphql.ts` — add field to `DASHBOARD_QUERY`
10. `frontend/app/components/organisms/` — add / update component

---

## Key Gotcha: FK-to-Django-User in Graphene

`fields = "__all__"` does **NOT** auto-expose FK-to-`auth.User` fields (e.g. `created_by`, `received_by`) because no `UserType` is registered. Always add:

```python
class SomeModelType(DjangoObjectType):
    created_by = graphene.Field("warehouse.schema.types.EmployeeProfileType")

    class Meta:
        model = SomeModel
        fields = "__all__"

    def resolve_created_by(self, info):
        if not self.created_by_id:
            return None
        try:
            return EmployeeProfile.objects.get(user_id=self.created_by_id)
        except EmployeeProfile.DoesNotExist:
            return None
```

**EmployeeProfileType** exposes `username` and `email` as extra String resolvers on top of `(id, role, phone, locations, active, created_at)`.

---

## Permissions

```python
# roles (from most to least privileged)
SUPER_ADMIN > ADMIN > MANAGER > STORE_KEEPER / CUTTING_MASTER / TAILOR > AUDITOR

# SUPER_ADMIN bypasses all role checks automatically
require_role(user, Role.ADMIN, Role.MANAGER)       # raises GraphQLError if not allowed
accessible_warehouses(user)                         # SUPER_ADMIN/ADMIN see all; others see assigned only
get_warehouse(user, warehouse_id)                   # raises GraphQLError if not accessible
```

---

## Docker — Port Strategy

| File | Purpose | Ports |
|---|---|---|
| `docker-compose.yml` | Base — **no ports** | — |
| `docker-compose.override.yml` | Local dev (auto-loaded) | `8000:8000`, `3000:3000` |
| `docker-compose.prod.yml` | Production overlay | `8001:8000`, `3001:3000` |

Production deploy: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

**Why no ports in base:** Docker Compose merges port arrays additively across `-f` files. HMS project owns 8000/3000 on the same server, so base must be portless.

Frontend env: `NEXT_PUBLIC_GRAPHQL_URL=http://localhost:8000/graphql/` (local) / `http://103.86.177.246:8001/graphql/` (prod container-internal — set via prod override).

---

## Data Model Overview

```
ClothCategory ─┐
ClothColor    ─┤──► PurchaseOrderItem ─► PurchaseOrder ──► Supplier
ItemType      ─┘         │
                         ▼
                   RawClothBatch ──► CuttingAssignment ──► StitchingJob ──► FinishedProduct
                                          │ (cuttingMaster: Employee)
                                          │ (tailor: Employee)
                                          ▼
                                    SalesOrder ──► Buyer
                                         │
                                         ▼
                                   CreditTransaction ──► CreditPayment

PurchaseBill ──► PurchaseBillItem    (direct walk-in purchase, no PO required)
PurchaseBill ──► SupplierPayment     (payments against the bill)

WarehouseLocation ─── assigned to ── EmployeeProfile
```

---

## Analytics Fields (exact names — case-sensitive)

Backend (`selectors.py`) → Frontend (`Analytics.tsx`):

| Backend snake_case | Frontend camelCase |
|---|---|
| `pieces_cut` | `piecesCut` |
| `pieces_stitched` | `piecesStitched` |
| `cloth_wasted` | `clothWasted` |
| `cloth_wastage_pct` | `clothWastagePct` |
| `supplier_total_pending` | `supplierTotalPending` |
| `monthly_production` | `monthlyProduction` |
| `revenue_vs_expenses` | `revenueVsExpenses` |
| `top_suppliers` | `topSuppliers` |

**No `clothUsed` field in analytics** — only `clothWasted`.

---

## TypeScript Gotchas

- **Object literal indexed by `string` param** → needs `as Record<string, string>` cast or strict TS errors:
  ```tsx
  ({ a: "A", b: "B" } as Record<string, string>)[value] ?? value
  ```
- All GraphQL Float fields that come from `Decimal` models must have explicit `graphene.Float()` + resolver on the DjangoObjectType or they arrive as strings.
- `NEXT_PUBLIC_*` vars are read once at dev-server startup. Restart the container after changing them.

---

## Git Remote

Remote is named `organization` (not `origin`):
```bash
git push organization main
git pull organization main
```

---

## What's Built (Frontend Tabs)

| Tab | Component | Key features |
|---|---|---|
| Dashboard | Dashboard.tsx | KPI tiles, supplier payment summary, credit breakdown |
| Analytics | Analytics.tsx | 6 Recharts charts — monthly revenue, production, revenue vs expenses, stock by category, top buyers, top suppliers |
| Suppliers | Suppliers.tsx | CRUD, supply type filter |
| Buyers | Buyers.tsx | CRUD, buyer type, credit limit |
| Purchase Orders | PurchaseOrders.tsx | Full PO lifecycle, receive flow, ordered-by/received-by display |
| Purchase Bills | PurchaseBills.tsx | Walk-in purchases, payment history, Record Payment modal |
| Raw Cloth | (raw cloth batches) | Batch list, meters, bin location |
| Readymade Stock | — | Direct readymade inventory |
| Cutting | Cutting.tsx | Assignment list, update pieces/cloth used/wasted, cost-per-piece |
| Stitching | Stitching.tsx | Job list, pieces completed/rejected |
| Finished Products | FinishedProducts.tsx | Barcode generation, tag printing, size variants |
| Sales Orders | SalesOrders.tsx | Order lifecycle, items |
| Credit | Credit.tsx | Credit transactions, payment recording |
| Returns | Returns.tsx | Buyer returns + supplier returns |
| Expenses | Expenses.tsx | Operational expense tracking |
| Stock Adjustments | StockAdjustments.tsx | Manual inventory corrections |
| Employees | Employees.tsx | User management, role assignment |
| Warehouses | Warehouses.tsx | Multi-location management |
| Notifications | Notifications.tsx | FCM push notification inbox |
| Audit Log | AuditLogs.tsx | Full action trail (ADMIN/AUDITOR only) |
| Settings | Settings.tsx | App branding, SMTP, SMS, WA, FCM config |

---

## Number Serialisation Pattern

All auto-generated entity numbers use `_serial(prefix, model)`:
```
PO-202506-0042   (Purchase Orders)
PB-202506-0007   (Purchase Bills)
CA-202506-0003   (Cutting Assignments)
SJ-202506-0001   (Stitching Jobs)
ADJ-202506-0002  (Stock Adjustments)
```

---

## What's NOT Yet Built (Known Gaps)

- **Inter-warehouse transfers** — no model for moving stock between locations
- **Low stock / reorder alerts** — no minimum stock levels or auto-notifications
- **GST computation** — `tax_percent` in SystemSettings exists but not applied to bills/invoices
- **PDF/print export** — no purchase order PDF, no delivery challan, no invoice PDF
- **Size-wise analytics** — sizes tracked on products but not in charts
- **Tailor/master productivity metrics** — no per-person output analytics
- **Parcel receiving flow** — client requirement: formal "parcel opened by" step with quantity check against PO
- **Supplier on-time delivery tracking** — no expected vs actual delivery analytics
- **WhatsApp order status notifications** — infrastructure wired, events not yet triggered
