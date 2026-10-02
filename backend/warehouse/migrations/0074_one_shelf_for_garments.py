"""Room on the garment shelf for bought-in stock.

Columns only: the rows move in the next migration, because Django creates the
new indexes at the end of a migration and Postgres will not do that in a
transaction that has already written rows.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('warehouse', '0073_the_arrival_carries_its_own_condition'),
    ]

    operations = [
        migrations.AddField(
            model_name='finishedproduct',
            name='notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='finishedproduct',
            name='supplier',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='finished_products', to='warehouse.supplier'),
        ),
        migrations.AddField(
            model_name='supplierreturn',
            name='finished_product',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='supplier_returns', to='warehouse.finishedproduct'),
        ),
    ]
