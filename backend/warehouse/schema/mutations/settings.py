import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required

from warehouse.models import EmployeeProfile, SystemSettings
from warehouse.permissions import require_role
from warehouse.schema.types import SystemSettingsType
from warehouse.services.uploads import save_data_url

# Settings fields that carry an uploaded image, with the folder each lands in.
_IMAGE_FIELDS = {"logo_url": "branding", "tag_logo_data": "branding"}

# These land directly in CSS, so they are an allowlist rather than free text.
_CHOICES = {
    "tag_align": {"left", "center", "right"},
    "tag_vertical_align": {"top", "center", "bottom"},
}


class UpdateSystemSettings(graphene.Mutation):
    class Arguments:
        app_name = graphene.String()
        app_subtitle = graphene.String()
        company_name = graphene.String()
        company_state = graphene.String()
        currency_symbol = graphene.String()
        tax_percent = graphene.Float()
        logo_url = graphene.String()
        primary_color = graphene.String()
        accent_color = graphene.String()
        default_dark_mode = graphene.Boolean()
        smtp_host = graphene.String()
        smtp_port = graphene.Int()
        smtp_user = graphene.String()
        smtp_password = graphene.String()
        smtp_use_tls = graphene.Boolean()
        smtp_from_email = graphene.String()
        email_enabled = graphene.Boolean()
        twilio_account_sid = graphene.String()
        twilio_auth_token = graphene.String()
        twilio_from_number = graphene.String()
        sms_enabled = graphene.Boolean()
        wa_token = graphene.String()
        wa_phone_number_id = graphene.String()
        wa_enabled = graphene.Boolean()
        firebase_service_account_json = graphene.String()
        fcm_enabled = graphene.Boolean()
        otp_expiry_minutes = graphene.Int()
        allow_otp_login = graphene.Boolean()
        print_company_address = graphene.String()
        print_bank_details = graphene.String()
        print_terms = graphene.String()
        print_signature_label = graphene.String()
        print_show_logo = graphene.Boolean()
        gst_on_purchases = graphene.Boolean()
        gstin = graphene.String()
        tag_brand_name = graphene.String()
        tag_tagline = graphene.String()
        tag_show_barcode = graphene.Boolean()
        tag_show_sku = graphene.Boolean()
        tag_show_color = graphene.Boolean()
        tag_show_age_group = graphene.Boolean()
        tag_show_price = graphene.Boolean()
        tag_show_size = graphene.Boolean()
        tag_footer_text = graphene.String()
        tag_printer_width = graphene.String()
        tag_brand_font_size = graphene.Int()
        tag_logo_size = graphene.Int()
        tag_logo_data = graphene.String()
        tag_component_order = graphene.List(graphene.String)
        tag_height_mm = graphene.Int()
        tag_width_mm = graphene.Int()
        tag_align = graphene.String()
        tag_vertical_align = graphene.String()
        tag_pad_top = graphene.Float()
        tag_pad_right = graphene.Float()
        tag_pad_bottom = graphene.Float()
        tag_pad_left = graphene.Float()
        tag_gap_mm = graphene.Float()
        tag_barcode_height_mm = graphene.Float()
        tag_barcode_text_font_size = graphene.Float()
        tag_name_font_size = graphene.Float()
        tag_desc_font_size = graphene.Float()
        tag_price_font_size = graphene.Float()
        tag_sku_font_size = graphene.Float()
        barcode_prefix_digits = graphene.Int()
        barcode_suffix_digits = graphene.Int()
        barcode_price_source = graphene.String()
        barcode_price_multiplier = graphene.Float()

    settings = graphene.Field(SystemSettingsType)

    @login_required
    def mutate(self, info, **kwargs):
        require_role(info.context.user, EmployeeProfile.Role.ADMIN)
        cfg = SystemSettings.load()
        for key, value in kwargs.items():
            if value is not None:
                if key in _IMAGE_FIELDS:
                    value = save_data_url(value, _IMAGE_FIELDS[key])
                elif key in _CHOICES:
                    value = str(value).strip().lower()
                    if value not in _CHOICES[key]:
                        raise GraphQLError(
                            f"{key} must be one of: {', '.join(sorted(_CHOICES[key]))}."
                        )
                setattr(cfg, key, value)
        cfg.updated_by = info.context.user
        cfg.save()
        return UpdateSystemSettings(settings=cfg)
