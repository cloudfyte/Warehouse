"""P&L report and aging report computation."""
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import F, Q, Sum


def get_profit_loss(user, year: int, month: int | None = None):
    """
    Returns P&L dict for the given year (or year+month).
    Revenue = SalesOrder.total_amount (non-cancelled)
    COGS    = SalesOrderItem.quantity × FinishedProduct.cost_price at time of sale
              (we use current cost_price as best approximation)
    Expenses = Expense.amount
    """
    from warehouse.models import Expense, SalesOrder, SalesOrderItem
    from warehouse.permissions import accessible_warehouses

    warehouses = accessible_warehouses(user)

    so_qs = SalesOrder.objects.filter(
        warehouse__in=warehouses,
        order_date__year=year,
    ).exclude(status=SalesOrder.Status.CANCELLED)

    expense_qs = Expense.objects.filter(
        warehouse__in=warehouses,
        expense_date__year=year,
    )

    if month:
        so_qs = so_qs.filter(order_date__month=month)
        expense_qs = expense_qs.filter(expense_date__month=month)

    revenue = float(so_qs.aggregate(t=Sum("total_amount"))["t"] or 0)
    expenses = float(expense_qs.aggregate(t=Sum("amount"))["t"] or 0)

    # COGS: join through items → finished_product.cost_price
    item_qs = SalesOrderItem.objects.filter(sales_order__in=so_qs)
    cogs = float(
        item_qs.aggregate(
            t=Sum(F("quantity") * F("finished_product__cost_price"))
        )["t"] or 0
    )

    gross_profit = revenue - cogs
    net_profit = gross_profit - expenses
    gross_margin = (gross_profit / revenue * 100) if revenue else 0.0
    net_margin = (net_profit / revenue * 100) if revenue else 0.0

    # Monthly breakdown (only when fetching full year)
    monthly = []
    if not month:
        for m in range(1, 13):
            m_so = so_qs.filter(order_date__month=m)
            m_exp = expense_qs.filter(expense_date__month=m)
            m_rev = float(m_so.aggregate(t=Sum("total_amount"))["t"] or 0)
            m_exp_amt = float(m_exp.aggregate(t=Sum("amount"))["t"] or 0)
            m_items = SalesOrderItem.objects.filter(sales_order__in=m_so)
            m_cogs = float(
                m_items.aggregate(t=Sum(F("quantity") * F("finished_product__cost_price")))["t"] or 0
            )
            m_gross = m_rev - m_cogs
            monthly.append({
                "month": date(year, m, 1).strftime("%b %Y"),
                "revenue": m_rev,
                "cogs": m_cogs,
                "gross_profit": m_gross,
                "expenses": m_exp_amt,
                "net_profit": m_gross - m_exp_amt,
            })

    return {
        "period_label": f"{date(year, month, 1).strftime('%B %Y') if month else str(year)}",
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "expenses": expenses,
        "net_profit": net_profit,
        "gross_margin_pct": gross_margin,
        "net_margin_pct": net_margin,
        "monthly": monthly,
    }


def get_aging_report(user):
    """
    Buyer aging: CreditTransactions not SETTLED, bucketed by days overdue.
    Supplier aging: PurchaseBills with amount_pending > 0, bucketed by bill age.
    """
    from warehouse.models import CreditTransaction, PurchaseBill
    from warehouse.permissions import accessible_warehouses

    warehouses = accessible_warehouses(user)
    today = date.today()

    # ── Buyer aging ───────────────────────────────────────────────────────────
    credits = CreditTransaction.objects.filter(
        sales_order__warehouse__in=warehouses,
    ).exclude(status=CreditTransaction.Status.SETTLED).select_related("buyer")

    buyer_map: dict[str, dict] = {}
    for ct in credits:
        name = ct.buyer.name
        if name not in buyer_map:
            buyer_map[name] = {"buyer_name": name, "0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "91_plus": 0.0}
        age = (today - ct.created_at.date()).days
        due = float(ct.amount_due)
        if age <= 30:
            buyer_map[name]["0_30"] += due
        elif age <= 60:
            buyer_map[name]["31_60"] += due
        elif age <= 90:
            buyer_map[name]["61_90"] += due
        else:
            buyer_map[name]["91_plus"] += due

    buyer_rows = []
    for row in sorted(buyer_map.values(), key=lambda r: -(r["0_30"]+r["31_60"]+r["61_90"]+r["91_plus"])):
        row["total"] = row["0_30"] + row["31_60"] + row["61_90"] + row["91_plus"]
        buyer_rows.append(row)

    # ── Supplier aging ────────────────────────────────────────────────────────
    bills = PurchaseBill.objects.filter(
        warehouse__in=warehouses,
        amount_pending__gt=0,
    ).select_related("supplier")

    supplier_map: dict[str, dict] = {}
    for bill in bills:
        name = bill.supplier.name
        if name not in supplier_map:
            supplier_map[name] = {"supplier_name": name, "0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "91_plus": 0.0}
        age = (today - bill.bill_date).days
        due = float(bill.amount_pending)
        if age <= 30:
            supplier_map[name]["0_30"] += due
        elif age <= 60:
            supplier_map[name]["31_60"] += due
        elif age <= 90:
            supplier_map[name]["61_90"] += due
        else:
            supplier_map[name]["91_plus"] += due

    supplier_rows = []
    for row in sorted(supplier_map.values(), key=lambda r: -(r["0_30"]+r["31_60"]+r["61_90"]+r["91_plus"])):
        row["total"] = row["0_30"] + row["31_60"] + row["61_90"] + row["91_plus"]
        supplier_rows.append(row)

    return {
        "buyer_rows": buyer_rows,
        "supplier_rows": supplier_rows,
        "total_buyer_outstanding": sum(r["total"] for r in buyer_rows),
        "total_supplier_outstanding": sum(r["total"] for r in supplier_rows),
    }
