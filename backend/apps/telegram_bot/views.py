from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import TelegramAccount
from .serializers import TelegramLinkCodeSerializer, TelegramStatusSerializer


class TelegramLinkCodeView(APIView):
    """Issue a fresh one-time code the user types into the bot as `/start <code>`."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        link_code = services.generate_link_code(request.user)
        return Response(TelegramLinkCodeSerializer(link_code).data)


class TelegramStatusView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        account = TelegramAccount.objects.filter(user=request.user).first()
        data = {
            "linked": account is not None,
            "telegram_username": account.telegram_username if account else None,
        }
        return Response(TelegramStatusSerializer(data).data)


class TelegramUnlinkView(APIView):
    permission_classes = (IsAuthenticated,)

    def delete(self, request):
        TelegramAccount.objects.filter(user=request.user).delete()
        return Response(status=204)
