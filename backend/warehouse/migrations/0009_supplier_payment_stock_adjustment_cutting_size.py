import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warehouse', '0008_expense_model'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Feature 1: size on CuttingAssignment
        migrations.AddField(
            model_name='cuttingassignment',
            name='size',
            field=models.CharField(
                blank=True, max_length=30,
                help_text='Garment size being cut e.g. S / M / L / XL / Free Size',
            ),
        ),

        # Feature 2: SupplierPayment model
        migrations.CreateModel(
            name='SupplierPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('payment_number', models.CharField(editable=False, max_length=40, unique=True)),
                ('amount', models.DecimalField(
                    decimal_places=2, max_digits=14,
                    validators=[django.core.validators.MinValueValidator(Decimal('0.01'))],
                )),
                ('payment_date', models.DateField()),
                ('payment_mode', models.CharField(
                    choices=[
                        ('CASH', 'Cash'), ('BANK_TRANSFER', 'Bank Transfer / NEFT'),
                        ('UPI', 'UPI'), ('CHEQUE', 'Cheque'),
                    ],
                    default='CASH', max_length=20,
                )),
                ('reference', models.CharField(blank=True, max_length=100,
                    help_text='UTR / cheque number / transaction ID')),
                ('notes', models.CharField(blank=True, max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('bill', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='supplier_payments',
                    to='warehouse.purchasebill',
                )),
                ('created_by', models.ForeignKey(
                    null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='supplier_payments',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-payment_date', '-created_at']},
        ),

        # Feature 3: StockAdjustment model
        migrations.CreateModel(
            name='StockAdjustment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('adjustment_number', models.CharField(editable=False, max_length=40, unique=True)),
                ('item_kind', models.CharField(
                    choices=[
                        ('RAW_CLOTH', 'Raw Cloth (meters)'),
                        ('FINISHED_PRODUCT', 'Finished Product (pieces)'),
                    ],
                    max_length=20,
                )),
                ('quantity_change', models.DecimalField(
                    decimal_places=2, max_digits=10,
                    help_text='Positive to add stock, negative to remove',
                )),
                ('adjustment_type', models.CharField(
                    choices=[
                        ('DAMAGE', 'Damage / Write-off'), ('LOSS', 'Loss / Theft'),
                        ('QC_REJECT', 'QC Rejection'), ('CORRECTION', 'Stock Correction'),
                        ('FOUND', 'Found / Surplus'),
                    ],
                    default='DAMAGE', max_length=20,
                )),
                ('reason', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(
                    null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='stock_adjustments',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('finished_product', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                    related_name='stock_adjustments',
                    to='warehouse.finishedproduct',
                )),
                ('raw_cloth_batch', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                    related_name='stock_adjustments',
                    to='warehouse.rawclothbatch',
                )),
                ('warehouse', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='stock_adjustments',
                    to='warehouse.warehouselocation',
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
