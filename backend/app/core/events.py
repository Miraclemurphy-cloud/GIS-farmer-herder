"""Live event bus (Redis pub/sub) for the dashboard SSE stream."""
import json
import logging

import redis
import redis.asyncio as aredis

from app.core.config import get_settings

CHANNEL = "gis:events"
log = logging.getLogger(__name__)
_client: redis.Redis | None = None


def publish(kind: str, payload: dict) -> None:
    global _client
    try:
        if _client is None:
            _client = redis.Redis.from_url(get_settings().redis_url)
        _client.publish(CHANNEL, json.dumps({"kind": kind, "data": payload}, default=str))
    except redis.RedisError as e:  # live feed is best-effort; never block writes on it
        log.warning("event publish failed: %s", e)


async def subscribe():
    client = aredis.Redis.from_url(get_settings().redis_url)
    pubsub = client.pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                yield msg["data"].decode()
    finally:
        await pubsub.unsubscribe(CHANNEL)
        await client.aclose()
