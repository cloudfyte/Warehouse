from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("warehouse", "0014_print_layout_settings"),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomRole",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(help_text="Slug key — auto-uppercased", max_length=50, unique=True)),
                ("display_name", models.CharField(max_length=100)),
                ("color", models.CharField(default="#6366f1", help_text="#RRGGBB", max_length=7)),
                ("backend_level", models.CharField(default="STORE_KEEPER", help_text="Inherits backend permissions from this system role", max_length=50)),
                ("tab_permissions", models.JSONField(default=dict)),
                ("is_system", models.BooleanField(default=False, help_text="System roles cannot be deleted")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["display_name"]},
        ),
        migrations.AddField(
            model_name="employeeprofile",
            name="custom_role",
            field=models.ForeignKey(
                blank=True, null=True,
                help_text="If set, overrides tab visibility and role badge display",
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="employees",
                to="warehouse.customrole",
            ),
        ),
    ]
