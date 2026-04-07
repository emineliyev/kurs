from django.utils.translation import gettext_lazy as _
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Custom DRF exception handler that returns translated error messages.
    Respects the Accept-Language header from the client.
    """
    response = exception_handler(exc, context)

    if response is not None:
        # Normalize all errors into { "errors": [...] } format
        errors = []

        if isinstance(response.data, dict):
            for field, messages in response.data.items():
                if isinstance(messages, list):
                    for msg in messages:
                        errors.append({'field': field, 'message': str(msg)})
                else:
                    errors.append({'field': field, 'message': str(messages)})
        elif isinstance(response.data, list):
            for msg in response.data:
                errors.append({'field': 'non_field_errors', 'message': str(msg)})
        else:
            errors.append({'field': 'detail', 'message': str(response.data)})

        response.data = {
            'errors': errors,
            # Keep original format too for compatibility
            **({k: v for k, v in response.data.items()} if isinstance(response.data, dict) else {}),
        }

    return response
