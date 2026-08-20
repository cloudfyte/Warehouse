from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("warehouse", "0018_add_age_group"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="payment_method",
            field=models.CharField(
                choices=[("CASH", "Cash"), ("UPI", "UPI"), ("NEFT", "NEFT / IMPS"), ("CHEQUE", "Cheque"), ("OTHER", "Other")],
                default="CASH",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="expense",
            name="proof_image",
            field=models.TextField(blank=True, help_text="Base64-encoded proof / receipt photo"),
        ),
    ]
