"""Shared Fixie-proxied httpx client for payment gateways (e.g. Paystack).

Routes outbound requests through the Fixie proxy (`NOMBA_PROXY_URL`) so the
gateway sees a stable, whitelisted outbound IP — the same IP masking Nomba
already uses. Each outbound request bumps the Fixie usage counter.

Falls back to a direct (unproxied) client if no proxy env var is configured,
so a missing proxy never breaks the call.
"""
import os
import httpx

from fixie_counter import bump_async as _fixie_bump


async def _on_request_through_fixie(request):  # noqa: ARG001
    _fixie_bump(1)


def fixie_client(timeout: int = 20) -> httpx.AsyncClient:
    proxy = os.environ.get("NOMBA_PROXY_URL") or os.environ.get("FIXIE_URL") or None
    if proxy:
        return httpx.AsyncClient(
            timeout=timeout,
            proxy=proxy,
            event_hooks={"request": [_on_request_through_fixie]},
        )
    return httpx.AsyncClient(timeout=timeout)
