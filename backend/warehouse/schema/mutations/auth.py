import graphene
import graphql_jwt
from graphql import GraphQLError
from graphql_jwt.shortcuts import get_token

from warehouse.models import FCMToken, OTPCode
from warehouse.services.otp import request_otp, verify_otp_and_login


class RequestOTP(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        purpose = graphene.String(required=True)
        channel = graphene.String()

    email_sent = graphene.Boolean()
    sms_sent = graphene.Boolean()
    wa_sent = graphene.Boolean()
    message = graphene.String()

    def mutate(self, info, username, purpose, channel=OTPCode.Channel.EMAIL):
        result = request_otp(username=username, purpose=purpose.upper(), channel=channel.upper())
        sent = result["email_sent"] or result["sms_sent"] or result.get("wa_sent", False)
        return RequestOTP(
            email_sent=result["email_sent"],
            sms_sent=result["sms_sent"],
            wa_sent=result.get("wa_sent", False),
            message="OTP sent." if sent else "OTP generated (delivery failed — check server settings).",
        )


class VerifyOTPLogin(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        code = graphene.String(required=True)

    token = graphene.String()
    refresh_token = graphene.String()
    message = graphene.String()

    def mutate(self, info, username, code):
        from graphql_jwt.refresh_token.shortcuts import create_refresh_token
        user = verify_otp_and_login(username=username, code=code, purpose=OTPCode.Purpose.LOGIN)
        token = get_token(user)
        try:
            rt = create_refresh_token(user)
            refresh = rt.token
        except Exception:
            refresh = None
        return VerifyOTPLogin(token=token, refresh_token=refresh, message="Login successful.")


class LoginWithCredentials(graphene.Mutation):
    """Password login using username, email, or phone number as identifier."""

    class Arguments:
        identifier = graphene.String(required=True)
        password = graphene.String(required=True)

    token = graphene.String()
    refresh_token = graphene.String()
    message = graphene.String()

    def mutate(self, info, identifier, password):
        from graphql_jwt.refresh_token.shortcuts import create_refresh_token
        from warehouse.services.auth import resolve_identifier

        user = resolve_identifier(identifier)
        if not user.check_password(password):
            raise GraphQLError("Incorrect password.")
        if not user.is_active:
            raise GraphQLError("This account is disabled.")

        token = get_token(user)
        try:
            rt = create_refresh_token(user)
            refresh = rt.token
        except Exception:
            refresh = None
        return LoginWithCredentials(token=token, refresh_token=refresh, message="Login successful.")


class SaveFcmToken(graphene.Mutation):
    class Arguments:
        token = graphene.String(required=True)

    success = graphene.Boolean()

    def mutate(self, info, token):
        if not info.context.user.is_authenticated:
            return SaveFcmToken(success=False)
        FCMToken.objects.update_or_create(
            token=token, user=info.context.user,
            defaults={"user": info.context.user},
        )
        return SaveFcmToken(success=True)


class DeleteFcmToken(graphene.Mutation):
    class Arguments:
        token = graphene.String(required=True)

    success = graphene.Boolean()

    def mutate(self, info, token):
        if not info.context.user.is_authenticated:
            return DeleteFcmToken(success=False)
        FCMToken.objects.filter(token=token, user=info.context.user).delete()
        return DeleteFcmToken(success=True)
