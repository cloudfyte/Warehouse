"""The old shelf goes."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [("warehouse", "0075_readymade_stock_becomes_garments")]

    operations = [
        migrations.RemoveField(model_name="finishedproduct", name="readymade_stock"),
        migrations.RemoveField(model_name="supplierreturn", name="readymade_stock"),
        migrations.DeleteModel(name="ReadymadeStock"),
    ]
